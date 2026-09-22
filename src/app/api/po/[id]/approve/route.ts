import { query, queryOne, execute } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { PurchaseOrder, User } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('po:approve')
  if (guard.error) return guard.error

  const po = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  await execute(
    `UPDATE public.purchase_orders
     SET status = 'pending_finance',
         approved_by = $1,
         approved_at = now(),
         sam_approved_by = $1,
         sam_approved_at = now(),
         updated_at = now()
     WHERE id = $2`,
    [guard.user.id, id]
  )

  // Cost Control's approval hands the requisition to Finance.
  if (po.request_id) {
    await execute(
      `UPDATE public.requests
          SET status = 'pending_finance', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id = $1`,
      [po.request_id]
    )
    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by)
       VALUES ($1, $2, 'cost_control', 'approved', $3)`,
      [po.request_id, id, guard.user.id]
    )
  }

  await execute(
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [id, 'approved', guard.user.id, `Approved by ${guard.user.name || guard.user.role}`]
  )

  // Notify creator
  if (po.created_by) {
    await createNotification({
      userId: po.created_by,
      title: 'Purchase Order Approved',
      message: `Purchase Order "${po.purpose}" has been approved.`,
      type: 'success',
      target: { type: 'po', id },
      sendEmailAlert: true,
    })
  }

  // Notify Finance team for disbursement
  try {
    const financeUsers = await query<User>(
      `SELECT id, email, name FROM public.users WHERE role IN ('finance', 'administrator', 'super_user')`
    )
    for (const fUser of financeUsers) {
      await createNotification({
        userId: fUser.id,
        title: 'PO Ready for Payment',
        message: `Purchase order "${po.purpose}" is approved and pending payment review.`,
        type: 'approval',
        target: { type: 'po', id },
      })
    }
  } catch (err) {
    console.error('Error notifying finance:', err)
  }

  return NextResponse.json({ success: true })
}
