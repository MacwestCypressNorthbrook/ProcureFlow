import { query, queryOne, execute } from '@/lib/db'
import { requireRole, requireCapability } from '@/lib/auth-guard'
import { isElevated } from '@/lib/roles'
import { canRecordInvoiceOn } from '@/lib/workflow'
import { getRequestInvoices, isMissingTable, type SupplierInvoice } from '@/lib/supplier-invoices'
import { NextResponse } from 'next/server'

const READERS = ['engineer', 'project_lead', 'supply_chain', 'cost_control', 'finance', 'super_user', 'administrator'] as const

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : NaN
}

/** A calendar date that is real (no 31 February) and not in the future. */
function validInvoiceDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000
  if (d.getTime() > tomorrow) return null
  if (value < '2020-01-01') return null
  return value
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireRole(...READERS)
  if (guard.error) return guard.error

  const data = await getRequestInvoices(id)
  if (data === null) {
    return NextResponse.json({ error: 'Supplier invoices are not set up yet.' }, { status: 503 })
  }
  return NextResponse.json({ data })
}

/**
 * Record a supplier invoice against a requisition.
 *
 * Only once the requisition has reached Supply Chain, so there is a real
 * purchase behind the invoice (see `canRecordInvoiceOn`), and only for a
 * supplier that actually appears on one of its lines — an invoice from someone
 * the requisition never named is a mismatch to resolve by fixing the lines
 * first, not to record.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireCapability('invoice:record')
  if (guard.error) return guard.error

  const req = await queryOne<{ id: string; status: string; sent_back_to: string | null }>(
    `SELECT id, status, sent_back_to FROM public.requests WHERE id = $1`,
    [id]
  )
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (!canRecordInvoiceOn(guard.user.role, req.status, req.sent_back_to)) {
    return NextResponse.json(
      { error: 'An invoice can only be recorded once the requisition has reached Supply Chain pricing.' },
      { status: 409 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supplierId = typeof body.supplierId === 'string' ? body.supplierId : ''
  const invoiceNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''
  const invoiceDate = validInvoiceDate(body.invoiceDate)
  const amount = Math.round(toNumber(body.amount) * 100) / 100
  const attachmentId = typeof body.attachmentId === 'string' && body.attachmentId ? body.attachmentId : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null

  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) {
    return NextResponse.json({ error: 'Choose the supplier who issued the invoice.' }, { status: 400 })
  }
  if (!invoiceNumber || invoiceNumber.length > 80) {
    return NextResponse.json({ error: 'Enter the invoice number as printed on the invoice.' }, { status: 400 })
  }
  if (!invoiceDate) {
    return NextResponse.json({ error: 'Enter a valid invoice date that is not in the future.' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Enter the invoice amount, greater than zero.' }, { status: 400 })
  }

  const onLines = await queryOne<{ id: string }>(
    `SELECT id FROM public.request_items WHERE request_id = $1 AND supplier_id = $2 LIMIT 1`,
    [id, supplierId]
  )
  if (!onLines) {
    return NextResponse.json(
      { error: 'That supplier is not on any line of this requisition. Assign them to the lines first.' },
      { status: 400 }
    )
  }

  if (attachmentId) {
    const doc = await queryOne<{ id: string }>(
      `SELECT id FROM public.request_attachments WHERE id = $1 AND request_id = $2`,
      [attachmentId, id]
    )
    if (!doc) {
      return NextResponse.json({ error: 'That document is not attached to this requisition.' }, { status: 400 })
    }
  }

  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO public.supplier_invoices
         (request_id, supplier_id, invoice_number, invoice_date, amount, attachment_id, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [id, supplierId, invoiceNumber, invoiceDate, amount, attachmentId, notes, guard.user.id]
    )
    const data = (await getRequestInvoices(id))?.find((i) => i.id === row?.id) ?? null
    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    if (isMissingTable(err)) {
      return NextResponse.json({ error: 'Supplier invoices are not set up yet.' }, { status: 503 })
    }
    if ((err as { code?: string })?.code === '23505') {
      const dup = await queryOne<{ request_id: string; purpose: string }>(
        `SELECT i.request_id, r.purpose
           FROM public.supplier_invoices i JOIN public.requests r ON r.id = i.request_id
          WHERE i.supplier_id = $1 AND lower(btrim(i.invoice_number)) = lower(btrim($2))`,
        [supplierId, invoiceNumber]
      )
      const where = dup ? (dup.request_id === id ? 'on this requisition' : `on "${dup.purpose}"`) : 'already'
      return NextResponse.json(
        { error: `Invoice ${invoiceNumber} from this supplier is already recorded ${where}. The same invoice cannot be recorded twice.` },
        { status: 409 }
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/** Cost Control verifies an invoice against its document, or takes the mark back. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireCapability('invoice:verify')
  if (guard.error) return guard.error

  let body: { invoiceId?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.invoiceId || !/^[0-9a-f-]{36}$/i.test(body.invoiceId) || (body.action !== 'verify' && body.action !== 'unverify')) {
    return NextResponse.json({ error: 'An invoice and an action are required.' }, { status: 400 })
  }

  const rows =
    body.action === 'verify'
      ? await query<{ id: string }>(
          `UPDATE public.supplier_invoices SET status = 'verified', verified_by = $3, verified_at = now()
            WHERE id = $1 AND request_id = $2 RETURNING id`,
          [body.invoiceId, id, guard.user.id]
        )
      : await query<{ id: string }>(
          `UPDATE public.supplier_invoices SET status = 'recorded', verified_by = NULL, verified_at = NULL
            WHERE id = $1 AND request_id = $2 RETURNING id`,
          [body.invoiceId, id]
        )
  if (rows.length === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

/**
 * Remove an invoice recorded in error. Whoever recorded it may, or an elevated
 * role; a verified invoice has been checked against its document, so it must be
 * un-verified by Cost Control first.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireCapability('invoice:record')
  if (guard.error) return guard.error

  const invoiceId = new URL(request.url).searchParams.get('invoiceId')
  if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    return NextResponse.json({ error: 'An invoice id is required' }, { status: 400 })
  }

  const inv = await queryOne<Pick<SupplierInvoice, 'id' | 'recorded_by' | 'status'>>(
    `SELECT id, recorded_by, status FROM public.supplier_invoices WHERE id = $1 AND request_id = $2`,
    [invoiceId, id]
  )
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (inv.status === 'verified') {
    return NextResponse.json({ error: 'A verified invoice cannot be removed. Cost Control must un-verify it first.' }, { status: 409 })
  }
  if (inv.recorded_by !== guard.user.id && !isElevated(guard.user.role)) {
    return NextResponse.json({ error: 'Only whoever recorded this invoice can remove it.' }, { status: 403 })
  }

  await execute(`DELETE FROM public.supplier_invoices WHERE id = $1`, [invoiceId])
  return NextResponse.json({ success: true })
}
