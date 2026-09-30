import { execute, query, queryOne } from '@/lib/db'
import { getUserFromSession } from '@/lib/auth/server'
import { isElevated } from '@/lib/roles'
import {
  STAGES,
  canActAt,
  currentStage,
  isTerminalStage,
  nextStage,
  previousStage,
  statusForStage,
  type Stage,
} from '@/lib/workflow'
import { can } from '@/lib/roles'
import {
  createNotification,
  enqueueStageDigest,
  notifyRequisitionParties,
} from '@/lib/notifications'
import { getPaymentPosition, recordPayment } from '@/lib/payments'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'

type Action = 'approve' | 'send_back' | 'resubmit' | 'reject' | 'mark_urgent'

const ACTIONS: Action[] = ['approve', 'send_back', 'resubmit', 'reject', 'mark_urgent']

interface RequestRow extends DbRequest {
  sent_back_to: string | null
  return_to_stage: string | null
  is_urgent: boolean | null
  urgent_reason: string | null
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
 *
 * A stage that was sent a requisition back may itself send it back further
 * when it cannot answer. Each hop records the stage that passed it down, so the
 * answer walks forward one stage at a time until it reaches whoever asked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const limit = await rateLimit(`transition:${user.id}`, { max: 40, windowSeconds: 60 })
  if (!limit.ok) return tooManyRequests('Too many approvals at once. Give it a moment.', limit.retryAfter)

  const { id } = await params

  let body: { action?: Action; comment?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const action = body.action
  const comment = body.comment?.trim() || null

  if (!action || !ACTIONS.includes(action)) {
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
      ? (existing.created_by
          ? existing.created_by === user.id
          : user.role === 'engineer' || existing.guest_email === user.email) || isElevated(user.role)
      : canActAt(user.role, stage)

  if (!isHolder) {
    return NextResponse.json(
      { error: `This requisition is with ${STAGES[stage].label} — you cannot act on it.` },
      { status: 403 }
    )
  }

  const requesterName = user.name || user.email

  /* ── Mark urgent: the Project Lead's emergency escalation ── */
  if (action === 'mark_urgent') {
    // The red button belongs to the Project Lead and to their own stage. They
    // are the one who knows a site is actually stopped, and an escalation that
    // any stage could raise would stop meaning anything.
    if (!can(user.role, 'request:urgent')) {
      return NextResponse.json(
        { error: 'Only the Project Lead can mark a requisition urgent.' },
        { status: 403 }
      )
    }
    if (stage !== 'lead') {
      return NextResponse.json(
        {
          error: `This requisition is with ${STAGES[stage].label}. A requisition can only be escalated while it is with the Project Lead.`,
        },
        { status: 409 }
      )
    }

    const reason = (body.reason ?? body.comment)?.trim() || null
    if (!reason) {
      return NextResponse.json(
        { error: 'Give a reason for the emergency approval — it travels with the requisition.' },
        { status: 400 }
      )
    }

    // Urgent approval both flags and advances: the whole point is that it does
    // not wait for a second click, and Supply Chain is the stage that acts.
    const onward = nextStage('lead')!

    await execute(
      `UPDATE public.requests
          SET is_urgent = true,
              urgent_reason = $2,
              urgent_marked_by = $3,
              urgent_marked_at = now(),
              status = $4,
              sent_back_to = NULL,
              return_to_stage = NULL,
              updated_at = now()
        WHERE id = $1`,
      [id, reason, user.id, statusForStage(onward)]
    )

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'lead', 'marked_urgent', $3, $4)`,
      [id, po?.id ?? null, user.id, reason]
    )

    // Instant, never bundled. Bypassing the stage digest is the entire
    // mechanism behind the flag — a digest can sit for up to half an hour.
    const notified = await notifyStage(
      onward,
      id,
      `URGENT — requisition needs ${STAGES[onward].label} now`,
      `[URGENT] "${existing.purpose}" was escalated for emergency approval by ${STAGES.lead.label} (${requesterName}). Reason: ${reason}`,
      { type: 'warning', email: 'instant' }
    )

    if (existing.created_by && existing.created_by !== user.id) {
      await createNotification({
        userId: existing.created_by,
        title: 'Marked urgent by the Project Lead',
        message: `"${existing.purpose}" was escalated for emergency approval and sent straight to ${STAGES[onward].label}. Reason: ${reason}`,
        type: 'warning',
        link: `/minta/requests/${id}`,
        sendEmailAlert: true,
      })
    }

    await dispatchWorkflowEmail({
      eventType: 'urgent_escalation',
      requestId: id,
      poId: po?.id,
      recipientRole: 'supply_chain',
      performerId: user.id,
      comments: reason,
    })

    return NextResponse.json({
      success: true,
      urgent: true,
      status: statusForStage(onward),
      stage: onward,
      notified,
    })
  }

  /* ── Approve: hand to the next stage ─────────────────────── */
  if (action === 'approve') {
    if (stage === 'requester') {
      return NextResponse.json(
        { error: 'Submit the requisition rather than approving your own.' },
        { status: 400 }
      )
    }

    // Supply Chain's whole job is putting a price against each line. Pricing is
    // saved by its own button, so approving without pressing it used to advance
    // the requisition with zeros and silently discard what was typed — the next
    // stage then had nothing to raise a purchase order from.
    if (stage === 'supply_chain') {
      const unpriced = await queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM public.request_items
          WHERE request_id = $1
            AND COALESCE(unit_price, 0) <= 0`,
        [id]
      )
      if ((unpriced?.count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: `${unpriced!.count} line${unpriced!.count === 1 ? ' has' : 's have'} no unit price. Enter the prices and press Save pricing before approving.`,
          },
          { status: 409 }
        )
      }
    }

    // The Administrator closes the chain, and their close *is* the purchase
    // order. There is no stage after them to catch a missing document.
    if (stage === 'admin' && !po) {
      return NextResponse.json(
        { error: 'Attach the purchase order before completing this requisition.' },
        { status: 409 }
      )
    }

    // Cost Control audits the vendor invoices Supply Chain attached. This runs
    // on the way OUT of Cost Control — whichever stage follows — so the
    // Administrator never receives a requisition whose quotes were never
    // adjudicated.
    if (stage === 'cost_control') {
      const docs = await query<{ id: string; status: string | null }>(
        `SELECT id, status FROM public.request_attachments WHERE request_id = $1`,
        [id]
      )
      if (docs.length > 0) {
        const allDeclined = docs.every((d) => d.status === 'declined')
        if (allDeclined) {
          return NextResponse.json(
            {
              error:
                'All attached vendor invoices have been marked as declined. Send this back to Supply Chain for revised quotes, or accept a valid quote before authorizing.',
            },
            { status: 400 }
          )
        }

        const hasAccepted = docs.some((d) => d.status === 'accepted')

        // With several quotes on the table, "approve" is ambiguous — Cost
        // Control has to say which one the purchase order should be raised
        // against, because the Administrator raises it next.
        if (!hasAccepted && docs.length > 1) {
          return NextResponse.json(
            {
              error:
                'Multiple vendor invoices/quotes are attached. Review and accept the preferred invoice before authorizing.',
            },
            { status: 400 }
          )
        }

        if (hasAccepted) {
          // Whatever was not picked is recorded as an alternative that lost,
          // never silently accepted alongside the winner.
          await query(
            `UPDATE public.request_attachments
                SET status = 'declined',
                    reviewed_by = $1,
                    reviewed_at = now(),
                    review_notes = COALESCE(review_notes, 'Alternative quote not selected by Cost Control')
              WHERE request_id = $2 AND (status IS NULL OR status = 'pending')`,
            [user.id, id]
          )
        } else if (docs.length === 1) {
          // A single invoice: authorizing is itself the acceptance.
          await query(
            `UPDATE public.request_attachments
                SET status = 'accepted', reviewed_by = $1, reviewed_at = now()
              WHERE request_id = $2 AND (status IS NULL OR status = 'pending')`,
            [user.id, id]
          )
        }
      }
    }

    const onward = nextStage(stage)

    /* ── Terminal: the Administrator closes it ──────────────── */
    if (!onward || isTerminalStage(stage)) {
      // A legacy row still sitting at Finance settles its outstanding balance
      // on the way out; nothing new ever routes there.
      if (stage === 'finance' && po) {
        const total = Number(po.total_amount) || 0
        const position = await getPaymentPosition(po.id, total)
        if (position.outstanding > 0) {
          const paid = await recordPayment(po.id, total, user.id, position.outstanding, {
            note: comment || 'Settled in full at the Finance stage.',
          })
          if (!paid.ok) {
            return NextResponse.json({ error: paid.error }, { status: paid.status })
          }
        }
      }

      const approvalAction = stage === 'finance' ? 'paid' : 'completed'

      await execute(
        `UPDATE public.requests
            SET status = 'completed', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
          WHERE id = $1`,
        [id]
      )
      if (po) {
        await execute(
          `UPDATE public.purchase_orders SET status = 'approved', updated_at = now() WHERE id = $1`,
          [po.id]
        )
      }
      await execute(
        `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, po?.id ?? null, stage, approvalAction, user.id, comment]
      )

      // Completion is the one event the whole chain wants: the requisition is
      // closed and the purchase order behind it is final. Everyone who raised,
      // justified, priced or audited it hears about it, each linked into their
      // own area.
      const poLine = po?.po_number ? ` Purchase order #${po.po_number} is attached.` : ''
      await notifyRequisitionParties(id, {
        title:
          stage === 'finance'
            ? 'Requisition paid and closed'
            : 'Requisition completed by Administration',
        message:
          stage === 'finance'
            ? `"${existing.purpose}" has been paid and closed by ${requesterName}.${comment ? ` Note: ${comment}` : ''}`
            : `"${existing.purpose}" has been authorized and completed by Administration (${requesterName}).${poLine}${comment ? ` Note: ${comment}` : ''}`,
        type: 'success',
        sendEmailAlert: true,
        excludeUserId: user.id,
      })

      if (existing.created_by) {
        await dispatchWorkflowEmail({
          eventType: stage === 'finance' ? 'payment_complete' : 'requisition_completed',
          requestId: id,
          poId: po?.id,
          recipientUserId: existing.created_by,
          performerId: user.id,
          comments: comment,
        })
      }

      return NextResponse.json({ success: true, status: 'completed' })
    }

    /* ── Forward: hand to the next stage ────────────────────── */
    await execute(
      `UPDATE public.requests
          SET status = $2, sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id = $1`,
      [id, statusForStage(onward)]
    )

    if (po && onward === 'admin') {
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
    // queue would otherwise send the next stage one email per requisition. An
    // urgent requisition is the exception: it is emailed the moment it lands,
    // because a bundled digest is exactly the delay the flag exists to avoid.
    const urgent = existing.is_urgent === true
    const notified = await notifyStage(
      onward,
      id,
      urgent
        ? `URGENT — requisition awaiting ${STAGES[onward].label}`
        : `Requisition awaiting ${STAGES[onward].label}`,
      `${urgent ? '[URGENT] ' : ''}"${existing.purpose}" was approved by ${STAGES[stage].label} (${requesterName}) and is now with you.${comment ? ` Note: ${comment}` : ''}`,
      urgent
        ? { type: 'warning', email: 'instant' }
        : { email: 'bundled', approvedBy: user.id }
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

    if (po && (stage === 'cost_control' || stage === 'admin' || stage === 'finance')) {
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
        // The purchase order tracks whichever stage the requisition resumed at;
        // `admin` is the closing stage, so its order is awaiting final sign-off.
        [po.id, resume === 'admin' || resume === 'finance' ? 'pending_finance' : 'pending_cost_control']
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
