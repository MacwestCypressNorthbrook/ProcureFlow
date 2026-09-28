/**
 * Macwest Material Request Tracker → ProcureFlow
 *
 *   node migration/import-tracker.mjs            # dry run — writes nothing
 *   node migration/import-tracker.mjs --commit   # performs the import
 *
 * Source is the VISIBLE 'August 2026' tab only. The hidden 'August 2026 - Simon'
 * tab is a stale working copy and is deliberately ignored.
 *
 * Every row written carries a batch tag in `notes`, so the whole migration can be
 * removed with one DELETE if anything is wrong.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const COMMIT = process.argv.includes('--commit')
const BATCH = 'MIGRATED:AUG2026'
const PARKED_SITE = 'ada shs & shts' // awaiting the engineer's allocation

const url = fs
  .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
  .slice(13)
  .trim()
  .replace(/^["']|["']$/g, '')
const sql = neon(url)

/* ── csv ─────────────────────────────────────────────────────────────── */
function readCsv(file) {
  const text = fs.readFileSync(path.join(ROOT, 'migration', file), 'utf8')
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

/* ── mapping tables, from the reviewed CSVs ──────────────────────────── */
const siteMap = new Map()
for (const r of readCsv('1-sites.csv').slice(1)) {
  const [tracker, , proposed, , , confirm] = r
  const chosen = (confirm || '').trim() || (proposed || '').trim()
  if (tracker?.trim() && chosen) siteMap.set(tracker.trim().toLowerCase(), chosen)
}
// Decisions taken in conversation, recorded here so the file is self-describing.
const OVERRIDES = {
  'mdf ajumako ochiso': 'MDF Ajumako Ochiso',
  'ada shs': 'ADA 1 - SHS - 31- 3 storey 18 Unit Classroom & Rehabilation of Science lab - Lot 31',
  'nkroful renovation project': 'Construction of 6- unit classroom block for Nkroful Agricultural Secondary School - NASS SCHOOL',
  'nkroful renovation': 'Construction of 6- unit classroom block for Nkroful Agricultural Secondary School - NASS SCHOOL',
  'ada shs ( services equipment use)': 'ADA 1 - SHS - 31- 3 storey 18 Unit Classroom & Rehabilation of Science lab - Lot 31',
  'ada shts ( services equipment use)': 'ADA 3 - SHTS -33 - Two number two storey 12 Unit Classroom & 2KM fence wall',
  'renovation of 4 bedroom - ayinase': 'RENOVATION WORKS',
}
for (const [k, v] of Object.entries(OVERRIDES)) siteMap.set(k, v)

const engMap = new Map()
for (const r of readCsv('2-engineers.csv').slice(1)) {
  const [tracker, , , email, , , confirm] = r
  const chosen = (confirm || '').trim() || (email || '').trim()
  if (tracker?.trim() && chosen) engMap.set(tracker.trim().toLowerCase(), chosen)
}

// Only confident matches link a supplier. Everything else keeps its original
// text in the line's remarks rather than pointing at the wrong vendor.
const supMap = new Map()
for (const r of readCsv('3-suppliers.csv').slice(1)) {
  const [tracker, , proposed, , status, confirm] = r
  if (!tracker?.trim()) continue
  const c = (confirm || '').trim()
  if (c && c.toUpperCase() !== 'NEW') { supMap.set(tracker.trim().toLowerCase(), c); continue }
  if (['OK', 'CHECK'].includes((status || '').trim()) && proposed?.trim()) {
    supMap.set(tracker.trim().toLowerCase(), proposed.trim())
  }
}

/* ── spreadsheet ─────────────────────────────────────────────────────── */
function parseSheet() {
  const raw = fs.readFileSync(path.join(ROOT, 'blocks.json'), 'utf8')
  return JSON.parse(raw)
}

const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Where the requisition sits, from the tracker's own status columns. */
function stageOf(b) {
  const t = (s) => (s || '').toString().trim().toLowerCase()
  const pay = t(b.payment)
  const proc = t(b.procurement)
  const lead = t(b.lead)
  const paidWords = ['done', 'received', 'paid']
  const isPaid = paidWords.includes(pay) && !pay.startsWith('not')
  if (isPaid) return { status: 'completed', po: 'paid', why: `Payment made = "${b.payment}"` }
  if (pay.includes('part')) return { status: 'pending_finance', po: 'partially_paid', why: `Payment made = "${b.payment}"` }
  if (pay) return { status: 'pending_finance', po: 'pending_finance', why: `Payment column filled ("${b.payment}")` }
  if (proc.startsWith('approv') || proc === 'paid') return { status: 'pending_admin', po: null, why: `Procurement Status = "${b.procurement}"` }
  if (lead.startsWith('appr') || lead.startsWith('appo') || lead.startsWith('appp')) return { status: 'pending_supply_chain', po: null, why: `Team Lead = "${b.lead}"` }
  return { status: 'pending_lead', po: null, why: 'no approvals recorded' }
}

/* ── main ────────────────────────────────────────────────────────────── */
const blocks = parseSheet()
const projects = await sql.query('SELECT id, name FROM public.projects')
const users = await sql.query('SELECT id, name, email FROM public.users')
const suppliers = await sql.query('SELECT id, name FROM public.suppliers')
const pByName = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p]))
const uByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]))
const sByName = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s]))

const plan = []
const problems = []
let skipped = 0

for (const b of blocks) {
  const siteKey = (b.site || '').trim().toLowerCase()
  if (siteKey === PARKED_SITE) {
    problems.push({ row: b.row, kind: 'PARKED', detail: 'AdA SHS & SHTS — awaiting Stephen\'s allocation' })
    skipped++
    continue
  }
  if (!b.items.length) {
    problems.push({ row: b.row, kind: 'NO LINE ITEMS', detail: `${b.site} / ${b.eng} / ${b.date}` })
    skipped++
    continue
  }
  const siteName = siteMap.get(siteKey)
  const project = siteName ? pByName.get(siteName.trim().toLowerCase()) : null
  if (!project) problems.push({ row: b.row, kind: 'SITE UNRESOLVED', detail: `${b.site} -> ${siteName || '(none)'}` })

  const email = engMap.get((b.eng || '').trim().toLowerCase())
  const user = email ? uByEmail.get(email.toLowerCase()) : null
  if (!user) problems.push({ row: b.row, kind: 'ENGINEER UNRESOLVED', detail: b.eng || '(blank)' })

  const items = b.items.map((it) => {
    const qty = num(it.qty)
    const unit = num(it.unit)
    let total = num(it.total)
    let note = ''
    if (total === null && qty !== null && unit !== null) { total = qty * unit; note = 'total recomputed from qty x rate' }

    const supName = supMap.get((it.supplier || '').trim().toLowerCase())
    const sup = supName ? sByName.get(supName.trim().toLowerCase()) : null
    const remarks = [it.supplier && !sup ? `Supplier (unmatched): ${it.supplier}` : '', note].filter(Boolean).join(' | ')
    // Either a real qty x rate line, or a lump sum. Never mix the two: using the
    // line TOTAL as a rate while keeping the quantity multiplies the value again.
    // The tracker's Total Cost column is authoritative. qty x rate disagrees on
    // 9 lines, and on several of those the stated total equals the RATE — the
    // Quantity column there is not a multiplier. Only compute when no total.
    let q, rate
    if (total !== null) {
      q = 1; rate = total
      if (qty !== null && unit !== null && Math.abs(qty * unit - total) > 0.5) {
        note = [note, `tracker qty ${qty} x rate ${unit} = ${qty * unit}, but stated total ${total} used`].filter(Boolean).join('; ')
      } else if (qty !== null && unit !== null) {
        q = qty; rate = unit        // consistent: keep the real qty and rate
      }
    } else if (qty !== null && qty > 0 && unit !== null && unit > 0) {
      q = qty; rate = unit; note = [note, 'no total in tracker; computed from qty x rate'].filter(Boolean).join('; ')
    } else {
      q = 1; rate = 0; note = [note, 'no amount recorded in tracker'].filter(Boolean).join('; ')
    }
    return { description: it.desc, quantity: q, unit: it.unitLabel || null, unit_price: rate, supplier_id: sup?.id ?? null, remarks: [remarks, note].filter(Boolean).join(' | ') || null }
  })

  const computed = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const stated = num(b.stated_total)
  if (stated !== null && Math.abs(stated - computed) > 0.5) {
    problems.push({ row: b.row, kind: 'TOTAL MISMATCH', detail: `lines=${computed.toFixed(2)} vs sheet total=${stated.toFixed(2)}` })
  }

  const st = stageOf(b)
  plan.push({ block: b, project, user, items, computed, stated, stage: st })
}

/* ── report ──────────────────────────────────────────────────────────── */
const money = (n) => 'GHS ' + n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log(`\n=== ${COMMIT ? 'IMPORT' : 'DRY RUN — nothing will be written'} ===`)
console.log(`requisitions to create : ${plan.length}`)
console.log(`line items to create   : ${plan.reduce((s, p) => s + p.items.length, 0)}`)
console.log(`skipped                : ${skipped}`)
console.log(`total value            : ${money(plan.reduce((s, p) => s + p.computed, 0))}`)

const byStage = {}
for (const p of plan) byStage[p.stage.status] = (byStage[p.stage.status] || 0) + 1
console.log('\nwhere they will land:')
for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(24)} ${v}`)

const byKind = {}
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1
console.log('\nflags:')
if (!problems.length) console.log('   none')
for (const [k, v] of Object.entries(byKind)) console.log(`   ${k.padEnd(24)} ${v}`)
for (const p of problems.filter((x) => x.kind !== 'TOTAL MISMATCH').slice(0, 20)) {
  console.log(`      row ${p.row}: ${p.kind} — ${p.detail}`)
}

fs.writeFileSync(path.join(ROOT, 'migration', 'dry-run-report.json'),
  JSON.stringify({ plan: plan.map((p) => ({ row: p.block.row, date: p.block.date, site: p.block.site, project: p.project?.name, engineer: p.block.eng, user: p.user?.email, lines: p.items.length, value: p.computed, stated: p.stated, stage: p.stage })), problems }, null, 1))
console.log(`\nfull preview written to migration/dry-run-report.json`)

if (!COMMIT) {
  console.log('\nNo database changes were made. Re-run with --commit to import.')
  process.exit(0)
}

/* ── write ───────────────────────────────────────────────────────────── */
const existing = await sql.query(
  `SELECT COUNT(*)::int c FROM public.requests WHERE notes LIKE $1`, [`%${BATCH}%`])
if (existing[0].c > 0) {
  console.log(`\nREFUSED: ${existing[0].c} requisitions already carry the ${BATCH} tag.`)
  console.log('Remove them first, or the import would duplicate. See the rollback command below.')
  process.exit(1)
}

let made = 0, lines = 0, pos = 0, pays = 0
for (const p of plan) {
  const b = p.block
  const first = p.items[0]?.description ?? 'Migrated requisition'
  const purpose = (p.items.length > 1 ? `${first} + ${p.items.length - 1} more` : first).slice(0, 90)

  // The rich document the app renders on the requisition page.
  const doc = {
    type: 'rich_requisition',
    header: { docTitle: 'REQUISITION FORM', docNo: 'MACWL-IMS-A-RF-001', version: '1.0', page: 'Page 1 of 1' },
    details: { name: p.user?.name ?? b.eng, department: 'Operations', project: p.project?.name ?? b.site, date: b.date },
    items: p.items.map((i) => ({
      category: 'material', description: i.description, quantity: Number(i.quantity),
      unit: i.unit ?? '', unitPrice: Number(i.unit_price), amount: Number(i.quantity) * Number(i.unit_price),
      supplierName: '', remarks: i.remarks ?? '',
    })),
    signatures: { requestedBy: p.user?.name ?? b.eng, headOfDept: '', approvedBy: '', paidBy: '' },
    generalNotes: `Migrated from the Macwest Material Request Tracker (August 2026 tab), spreadsheet row ${b.row}.`,
  }
  const noteParts = [BATCH, `sheet-row=${b.row}`, `tracker-site=${b.site}`, `tracker-engineer=${b.eng}`]
  if (b.lead) noteParts.push(`lead=${b.lead}`)
  if (b.procurement) noteParts.push(`procurement=${b.procurement}`)
  if (b.payment) noteParts.push(`payment=${b.payment}`)
  if (b.finance_notes) noteParts.push(`finance=${b.finance_notes}`)
  if (p.stated !== null && Math.abs(p.stated - p.computed) > 0.5) noteParts.push(`sheet-stated-total=${p.stated}`)

  const req = (await sql.query(
    `INSERT INTO public.requests
       (purpose, description, department, project_id, estimated_quantity, estimated_unit_rate,
        total_amount, currency, guest_name, guest_email, created_by, status, notes, created_at, updated_at)
     VALUES ($1,$2,'Operations',$3,$4,NULL,$5,'GHS',$6,$7,$8,$9,$10,$11,$11)
     RETURNING id`,
    [purpose, JSON.stringify(doc), p.project?.id ?? null,
     p.items.reduce((s, i) => s + Number(i.quantity), 0), p.computed,
     p.user?.name ?? b.eng, p.user?.email ?? null, p.user?.id ?? null,
     p.stage.status, noteParts.join(' | '), b.date + 'T12:00:00Z']
  ))[0]
  made++

  for (const [i, it] of p.items.entries()) {
    await sql.query(
      `INSERT INTO public.request_items
         (request_id, position, description, quantity, unit, unit_price, supplier_id, remarks, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'material')`,
      [req.id, i, it.description, it.quantity, it.unit, it.unit_price, it.supplier_id, it.remarks])
    lines++
  }

  // A purchase order exists once the tracker records a PO number or any payment.
  if (p.stage.po) {
    const po = (await sql.query(
      `INSERT INTO public.purchase_orders
         (po_number, request_id, purpose, description, vendor_name, quantity, unit_rate, total_amount,
          created_by, status, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,1,$5,$5,$6,$7,$8,$9,$9) RETURNING id`,
      [b.po_number || null, req.id, purpose, `Migrated from tracker row ${b.row}`,
       p.computed, p.user?.id ?? null, p.stage.po, BATCH, b.date + 'T12:00:00Z']
    ))[0]
    pos++
    if (p.stage.po === 'paid') {
      await sql.query(
        `INSERT INTO public.po_payments (po_id, amount, note, paid_by, paid_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [po.id, p.computed, `${BATCH} — tracker Payment made = "${b.payment}"`, p.user?.id ?? null, b.date + 'T12:00:00Z'])
      await sql.query(`UPDATE public.purchase_orders SET paid_at=$2, paid_by=$3 WHERE id=$1`,
        [po.id, b.date + 'T12:00:00Z', p.user?.id ?? null])
      pays++
    }
  }

  await sql.query(
    `INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment, created_at)
     VALUES ($1,'requester','submitted',$2,$3,$4)`,
    [req.id, p.user?.id ?? null, `Migrated from the Material Request Tracker (row ${b.row}).`, b.date + 'T12:00:00Z'])
}

console.log(`\nIMPORT COMPLETE`)
console.log(`   requisitions : ${made}`)
console.log(`   line items   : ${lines}`)
console.log(`   purchase orders: ${pos}   payments recorded: ${pays}`)
console.log(`\nTo undo everything this created, in this order:`)
console.log(`   DELETE FROM public.purchase_orders WHERE notes LIKE '%${BATCH}%';  -- takes its payments with it`)
console.log(`   DELETE FROM public.requests        WHERE notes LIKE '%${BATCH}%';  -- takes items + approvals with it`)
console.log(`   (purchase_orders.request_id is ON DELETE SET NULL, so POs must go first or they are orphaned)`)
