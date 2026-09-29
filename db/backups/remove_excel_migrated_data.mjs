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
  const client = await pool.connect()
  try {
    console.log('1. Identifying migrated requests...')
    const reqRes = await client.query(`
      SELECT * FROM public.requests 
      WHERE notes LIKE '%MIGRATED%' OR description LIKE '%Migrated from the Macwest Material Request Tracker%'
      ORDER BY created_at ASC
    `)
    const migratedReqs = reqRes.rows
    const reqIds = migratedReqs.map(r => r.id)
    console.log(`Found ${migratedReqs.length} migrated requests.`)

    if (reqIds.length === 0) {
      console.log('No migrated requests found. Nothing to delete.')
      return
    }

    console.log('2. Fetching related items, approvals, POs, attachments...')
    const itemsRes = await client.query(
      `SELECT * FROM public.request_items WHERE request_id = ANY($1::uuid[])`,
      [reqIds]
    )
    const attachRes = await client.query(
      `SELECT * FROM public.request_attachments WHERE request_id = ANY($1::uuid[])`,
      [reqIds]
    )
    const approvalsRes = await client.query(
      `SELECT * FROM public.request_approvals WHERE request_id = ANY($1::uuid[])`,
      [reqIds]
    )
    const poRes = await client.query(
      `SELECT * FROM public.purchase_orders WHERE request_id = ANY($1::uuid[])`,
      [reqIds]
    )
    const poIds = poRes.rows.map(p => p.id)

    let poAttachments = []
    let poAudit = []
    let poComments = []
    let poPayments = []

    if (poIds.length > 0) {
      const poAttachRes = await client.query(
        `SELECT * FROM public.po_attachments WHERE po_id = ANY($1::uuid[])`,
        [poIds]
      )
      poAttachments = poAttachRes.rows

      const poAuditRes = await client.query(
        `SELECT * FROM public.po_audit_trail WHERE po_id = ANY($1::uuid[])`,
        [poIds]
      )
      poAudit = poAuditRes.rows

      const poCommentRes = await client.query(
        `SELECT * FROM public.po_comments WHERE po_id = ANY($1::uuid[])`,
        [poIds]
      )
      poComments = poCommentRes.rows

      const poPayRes = await client.query(
        `SELECT * FROM public.po_payments WHERE po_id = ANY($1::uuid[])`,
        [poIds]
      )
      poPayments = poPayRes.rows
    }

    const backupData = {
      exported_at: new Date().toISOString(),
      counts: {
        requests: migratedReqs.length,
        request_items: itemsRes.rows.length,
        request_attachments: attachRes.rows.length,
        request_approvals: approvalsRes.rows.length,
        purchase_orders: poRes.rows.length,
        po_attachments: poAttachments.length,
        po_audit_trail: poAudit.length,
        po_comments: poComments.length,
        po_payments: poPayments.length,
      },
      requests: migratedReqs,
      request_items: itemsRes.rows,
      request_attachments: attachRes.rows,
      request_approvals: approvalsRes.rows,
      purchase_orders: poRes.rows,
      po_attachments: poAttachments,
      po_audit_trail: poAudit,
      po_comments: poComments,
      po_payments: poPayments,
    }

    const backupFilePath = path.join(__dirname, 'excel_migrated_backup_20260929.json')
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8')
    console.log(`3. Successfully created backup archive at: ${backupFilePath}`)
    console.log('Backup summary:', backupData.counts)

    console.log('4. Beginning deletion transaction...')
    await client.query('BEGIN')

    // Delete reminders
    const remindersRes = await client.query(
      `DELETE FROM public.reminders WHERE target_id = ANY($1::uuid[])`,
      [reqIds]
    )
    console.log(`Deleted ${remindersRes.rowCount} reminders.`)

    // Delete stage digest queue
    const digestRes = await client.query(
      `DELETE FROM public.stage_digest_queue WHERE request_id = ANY($1::uuid[])`,
      [reqIds]
    )
    console.log(`Deleted ${digestRes.rowCount} stage digest queue records.`)

    // Delete notifications linking to these requests
    const notifRes = await client.query(`
      DELETE FROM public.notifications 
      WHERE link LIKE '%/requests/%'
        AND EXISTS (
          SELECT 1 FROM unnest($1::uuid[]) AS rid
          WHERE link LIKE '%' || rid::text || '%'
        )
    `, [reqIds])
    console.log(`Deleted ${notifRes.rowCount} notifications.`)

    // Delete PO related rows
    if (poIds.length > 0) {
      await client.query(`DELETE FROM public.po_payments WHERE po_id = ANY($1::uuid[])`, [poIds])
      await client.query(`DELETE FROM public.po_comments WHERE po_id = ANY($1::uuid[])`, [poIds])
      await client.query(`DELETE FROM public.po_attachments WHERE po_id = ANY($1::uuid[])`, [poIds])
      await client.query(`DELETE FROM public.po_audit_trail WHERE po_id = ANY($1::uuid[])`, [poIds])
      await client.query(`DELETE FROM public.purchase_orders WHERE id = ANY($1::uuid[])`, [poIds])
      console.log(`Deleted ${poIds.length} purchase orders and their dependencies.`)
    }

    // Delete request approvals, items, attachments
    await client.query(`DELETE FROM public.request_approvals WHERE request_id = ANY($1::uuid[])`, [reqIds])
    await client.query(`DELETE FROM public.request_items WHERE request_id = ANY($1::uuid[])`, [reqIds])
    await client.query(`DELETE FROM public.request_attachments WHERE request_id = ANY($1::uuid[])`, [reqIds])
    console.log('Deleted request approvals, items, and attachments.')

    // Finally delete requests
    const delReqs = await client.query(
      `DELETE FROM public.requests WHERE id = ANY($1::uuid[])`,
      [reqIds]
    )
    console.log(`Deleted ${delReqs.rowCount} migrated requests.`)

    await client.query('COMMIT')
    console.log('5. Transaction committed successfully. Excel migrated data has been removed.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error removing migrated data. Transaction rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
