import { execute, query, queryOne } from '@/lib/db'
import { getUserFromSession } from '@/lib/auth/server'
import { isElevated } from '@/lib/roles'
import {
  STAGES,
  canActAt,
  currentStage,
  nextStage,
  previousStage,
  statusForStage,
  type Stage,
} from '@/lib/workflow'
import { createNotification, enqueueStageDigest } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'

type Action = 'approve' | 'send_back' | 'resubmit' | 'reject'

interface RequestRow extends DbRequest {
  sent_back_to: string | null
  return_to_stage: string | null
}

/**
 * Notify everyone who can act at a stage.
 *
 * In-app always lands immediately. The email is either sent at once, or — for
 * a forward approval — queued so everything the reviewer approves in one
 * sitting arrives as a single email rather than one per requisition. Only
 * approved items are ever queued, so what the next stage receives is exactly
 * what is now waiting on them.
 */
async function notifyStage(
  stage: Stage,
  requestId: string,
  title: string,
  message: string,
  {
    type = 'approval',
    email = 'instant',
    approvedBy,
  }: {
    type?: 'info' | 'approval' | 'reminder' | 'warning' | 'success'
    email?: 'instant' | 'bundled'
    approvedBy?: string
  } = {}
) {
  const holders = await query<{ id: string }>(
    `SELECT id FROM public.users
      WHERE role = ANY($1::text[])
        AND COALESCE(is_active, true)
        AND auth_id NOT LIKE 'pending:%'`,
    [STAGES[stage].roles]
  )

  await Promise.all(
    holders.map((h) =>
      createNotification({
        userId: h.id,
        title,
        message,
        type,
        link: STAGES[stage].route(requestId),
        sendEmailAlert: email === 'instant',
      })
    )
  )

  if (email === 'bundled') {
    await enqueueStageDigest(stage, requestId, approvedBy ?? null)
  }

  return holders.length
}

/**
 * Move a requisition along the approval chain.
 *
 * One endpoint for every decision so the rules live in a single place:
 * a send-back always returns to the stage immediately before the one that
 * bounced it, and a resubmission resumes at the stage that bounced it rather
 * than walking the chain again.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const limit = await rateLimit(`transition:${user.id}`, { max: 40, windowSeconds: 60 })
  if (!limit.ok) return tooManyRequests('Too many approvals at once. Give it a moment.', limit.retryAfter)

  const { id } = await params

  let body: { action?: Action; comment?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const action = body.action
  const comment = body.comment?.trim() || null

  if (!action || !['approve', 'send_back', 'resubmit', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'An action is required' }, { status: 400 })
  }

  const existing = await queryOne<RequestRow>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )
  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const stage = currentStage(existing.status, existing.sent_back_to)
  if (!stage) {
    return NextResponse.json(
      { error: 'This requisition is closed — no further action is possible.' },
      { status: 409 }
    )
  }

  const po = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  )

  // The requester stage is held by the person who raised it, not by every
  // engineer; every other stage is held by its role.
  const isHolder =
    stage === 'requester'
      ? existing.created_by === user.id || isElevated(user.role)
      : canActAt(user.role, stage)

  if (!isHolder) {
    return NextResponse.json(
      { error: `This requisition is with ${STAGES[stage].label} — you cannot act on it.` },
      { status: 403 }
    )
  }

  const requesterName = user.name || user.email

  /* ── Approve: hand to the next stage ─────────────────────── */
  if (action === 'approve') {
    if (stage === 'requester') {
      return NextResponse.json(
        { error: 'Submit the requisition rather than approving your own.' },
        { status: 400 }
      )
    }

    // The Administrator's approval *is* the purchase order — there is nothing
    // for Cost Control to review without one.
    if (stage === 'admin' && !po) {
      return NextResponse.json(
        { error: 'Create the purchase order and attach it before sending this on.' },
        { status: 409 }
      )
    }

    const onward = nextStage(stage)
    if (!onward) {
      // Finance is the last stage; approval there means paid and closed.
      await execute(
        `UPDATE public.requests
            SET status = 'completed', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
          WHERE id = $1`,
        [id]
      )
      if (po) {
        await execute(
          `UPDATE public.purchase_orders
              SET status = 'paid', paid_by = $2, paid_at = now(), updated_at = now()
            WHERE id = $1`,
          [po.id, user.id]
        )
      }
      await execute(
        `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
         VALUES ($1, $2, $3, 'paid', $4, $5)`,
        [id, po?.id ?? null, stage, user.id, comment]
      )
      if (existing.created_by) {
        await createNotification({
          userId: existing.created_by,
          title: 'Requisition paid',
          message: `"${existing.purpose}" has been paid and closed by ${requesterName}.${comment ? ` Note: ${comment}` : ''}`,
          type: 'success',
          link: `/minta/requests/${id}`,
          sendEmailAlert: true,
        })

        await dispatchWorkflowEmail({
          eventType: 'payment_complete',
          requestId: id,
          poId: po?.id,
          recipientUserId: existing.created_by,
          performerId: user.id,
          comments: comment,
        })
      }
      return NextResponse.json({ success: true, status: 'completed' })
    }

    await execute(
      `UPDATE public.requests
          SET status = $2, sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id = $1`,
      [id, statusForStage(onward)]
    )

    if (po && onward === 'finance') {
      await execute(
        `UPDATE public.purchase_orders SET status = 'pending_finance', updated_at = now() WHERE id = $1`,
        [po.id]
      )
    }

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, $3, 'approved', $4, $5)`,
      [id, po?.id ?? null, stage, user.id, comment]
    )

    // Forward approvals are the high-volume path — a reviewer clearing their
    // queue would otherwise send the next stage one email per requisition.
    const notified = await notifyStage(
      onward,
      id,
      `Requisition awaiting ${STAGES[onward].label}`,
      `"${existing.purpose}" was approved by ${STAGES[stage].label} (${requesterName}) and is now with you.${comment ? ` Note: ${comment}` : ''}`,
      { email: 'bundled', approvedBy: user.id }
    )

    if (existing.created_by) {
      await createNotification({
        userId: existing.created_by,
        title: `Approved by ${STAGES[stage].label}`,
        message: `"${existing.purpose}" cleared ${STAGES[stage].label} and moved to ${STAGES[onward].label}.${comment ? ` Note: ${comment}` : ''}`,
        type: 'success',
        link: `/minta/requests/${id}`,
      })

      if (po && stage === 'cost_control') {
        await dispatchWorkflowEmail({
          eventType: 'po_approved',
          requestId: id,
          poId: po.id,
          recipientUserId: existing.created_by,
          performerId: user.id,
          comments: comment,
        })
      }
    }

    return NextResponse.json({
      success: true,
      status: statusForStage(onward),
      stage: onward,
      notified,
    })
  }

  /* ── Send back: return to the stage before this one ──────── */
  if (action === 'send_back') {
    const back = previousStage(stage)
    if (!back) {
      return NextResponse.json(
        { error: 'This requisition is already with the requester.' },
        { status: 409 }
      )
    }

    await execute(
      `UPDATE public.requests
          SET status = 'sent_back',
              sent_back_to = $2,
              return_to_stage = $3,
              sent_back_by = $4,
              sent_back_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [id, back, stage, user.id]
    )

    if (po && (stage === 'cost_control' || stage === 'finance')) {
      await execute(
        `UPDATE public.purchase_orders
            SET status = 'sent_back', sent_back_to = $2, return_to_stage = $3,
                rejection_reason = COALESCE($4, rejection_reason), updated_at = now()
          WHERE id = $1`,
        [po.id, back, stage, comment]
      )
    }

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, $3, 'sent_back', $4, $5)`,
      [id, po?.id ?? null, stage, user.id, comment]
    )

    if (back === 'requester') {
      if (existing.created_by) {
        await createNotification({
          userId: existing.created_by,
          title: `Sent back by ${STAGES[stage].label}`,
          message: `"${existing.purpose}" needs your attention before it can continue.${comment ? ` Reason: ${comment}` : ''}`,
          type: 'warning',
          link: `/minta/requests/${id}`,
          sendEmailAlert: true,
        })

        await dispatchWorkflowEmail({
          eventType: 'po_sent_back',
          requestId: id,
          poId: po?.id,
          recipientUserId: existing.created_by,
          performerId: user.id,
          comments: comment,
        })
      }
      return NextResponse.json({ success: true, status: 'sent_back', stage: back, notified: 1 })
    }

    const notified = await notifyStage(
      back,
      id,
      `Sent back by ${STAGES[stage].label}`,
      `"${existing.purpose}" was returned to you by ${requesterName}.${comment ? ` Reason: ${comment}` : ''}`,
      // A send-back is a correction someone is waiting on — emailed at once,
      // never bundled.
      { type: 'warning' }
    )

    return NextResponse.json({ success: true, status: 'sent_back', stage: back, notified })
  }

  /* ── Resubmit: resume at the stage that bounced it ───────── */
  if (action === 'resubmit') {
    if (existing.status !== 'sent_back') {
      return NextResponse.json(
        { error: 'This requisition has not been sent back.' },
        { status: 409 }
      )
    }

    const resume = (existing.return_to_stage as Stage | null) ?? 'lead'

    await execute(
      `UPDATE public.requests
          SET status = $2, sent_back_to = NULL, return_to_stage = NULL,
              sent_back_by = NULL, sent_back_at = NULL, updated_at = now()
        WHERE id = $1`,
      [id, statusForStage(resume)]
    )

    if (po) {
      await execute(
        `UPDATE public.purchase_orders
            SET status = $2, sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
          WHERE id = $1`,
        [po.id, resume === 'finance' ? 'pending_finance' : 'pending_cost_control']
      )
    }

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, $3, 'resubmitted', $4, $5)`,
      [id, po?.id ?? null, stage, user.id, comment]
    )

    const notified = await notifyStage(
      resume,
      id,
      `Resubmitted for ${STAGES[resume].label}`,
      `"${existing.purpose}" was corrected by ${requesterName} and is back with you.${comment ? ` Note: ${comment}` : ''}`
    )

    return NextResponse.json({ success: true, status: statusForStage(resume), stage: resume, notified })
  }

  /* ── Reject: close it out ────────────────────────────────── */
  await execute(
    `UPDATE public.requests
        SET status = 'rejected', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
      WHERE id = $1`,
    [id]
  )
  if (po) {
    await execute(
      `UPDATE public.purchase_orders
          SET status = 'rejected', rejection_reason = COALESCE($2, rejection_reason), updated_at = now()
        WHERE id = $1`,
      [po.id, comment]
    )
  }
  await execute(
    `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
     VALUES ($1, $2, $3, 'rejected', $4, $5)`,
    [id, po?.id ?? null, stage, user.id, comment]
  )
  if (existing.created_by) {
    await createNotification({
      userId: existing.created_by,
      title: `Rejected by ${STAGES[stage].label}`,
      message: `"${existing.purpose}" was rejected.${comment ? ` Reason: ${comment}` : ''}`,
      type: 'warning',
      link: `/minta/requests/${id}`,
      sendEmailAlert: true,
    })
  }

  return NextResponse.json({ success: true, status: 'rejected' })
}
