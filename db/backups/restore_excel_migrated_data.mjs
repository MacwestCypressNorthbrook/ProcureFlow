import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function run() {
  const backupFilePath = path.join(__dirname, 'excel_migrated_backup_20260929.json')
  if (!fs.existsSync(backupFilePath)) {
    console.error(`Backup file not found at: ${backupFilePath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(backupFilePath, 'utf-8')
  const data = JSON.parse(raw)
  console.log('Loaded backup data from:', backupFilePath)
  console.log('Counts to restore:', data.counts)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('1. Restoring requests...')
    for (const r of data.requests) {
      const cols = Object.keys(r)
      const vals = Object.values(r)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO public.requests (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals
      )
    }

    console.log('2. Restoring request_items...')
    for (const item of data.request_items) {
      const cols = Object.keys(item)
      const vals = Object.values(item)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO public.request_items (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals
      )
    }

    console.log('3. Restoring request_attachments...')
    for (const att of data.request_attachments) {
      const cols = Object.keys(att)
      const vals = Object.values(att)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO public.request_attachments (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals
      )
    }

    console.log('4. Restoring request_approvals...')
    for (const app of data.request_approvals) {
      const cols = Object.keys(app)
      const vals = Object.values(app)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO public.request_approvals (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals
      )
    }

    console.log('5. Restoring purchase_orders...')
    for (const po of data.purchase_orders) {
      const cols = Object.keys(po)
      const vals = Object.values(po)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO public.purchase_orders (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals
      )
    }

    console.log('6. Restoring po_attachments, audit, comments, payments...')
    for (const row of data.po_attachments) {
      const cols = Object.keys(row)
      const vals = Object.values(row)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(`INSERT INTO public.po_attachments (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, vals)
    }
    for (const row of data.po_audit_trail) {
      const cols = Object.keys(row)
      const vals = Object.values(row)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(`INSERT INTO public.po_audit_trail (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, vals)
    }
    for (const row of data.po_comments) {
      const cols = Object.keys(row)
      const vals = Object.values(row)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(`INSERT INTO public.po_comments (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, vals)
    }
    for (const row of data.po_payments) {
      const cols = Object.keys(row)
      const vals = Object.values(row)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(`INSERT INTO public.po_payments (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, vals)
    }

    await client.query('COMMIT')
    console.log('Restore completed successfully!')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error during restore. Rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
