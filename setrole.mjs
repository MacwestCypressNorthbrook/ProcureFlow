import { readFileSync } from 'node:fs'
import pg from 'pg'
const url = readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim()
const c = new pg.Client({ connectionString: url })
await c.connect()
const [email, role] = process.argv.slice(2)
const { rows } = await c.query(
  `UPDATE public.users SET role=$1, updated_at=now() WHERE email=$2 RETURNING email, role`, [role, email])
if (!rows.length) console.log('NO ROW for', email)
else console.log(rows[0].email, '->', rows[0].role)
const all = await c.query(`SELECT email, role FROM public.users ORDER BY created_at`)
console.log('--- all users ---')
for (const r of all.rows) console.log(' ', r.email, '|', r.role)
await c.end()
