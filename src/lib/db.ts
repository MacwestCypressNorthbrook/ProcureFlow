import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    return ''
  }
  return url
}

// Neon HTTP query client (stateless, connection pooling built into serverless HTTP)
export function getNeonSql(): NeonQueryFunction<false, false> {
  const url = getDatabaseUrl()
  return neon(url || 'postgresql://placeholder:placeholder@placeholder.neon.tech/neondb')
}

/**
 * Execute parameterized query returning multiple rows.
 */
export async function query<T = Record<string, unknown>>(
  sqlQuery: string,
  params: unknown[] = []
): Promise<T[]> {
  const url = getDatabaseUrl()
  if (!url) {
    console.warn('DATABASE_URL is not set. Query returning empty results.')
    return []
  }

  try {
    const sql = getNeonSql()
    const rows = await sql.query(sqlQuery, params)
    return (rows as unknown as T[]) || []
  } catch (err) {
    console.error('Neon query error:', err, 'Query was:', sqlQuery)
    throw err
  }
}

/**
 * Execute parameterized query returning single row or null.
 */
export async function queryOne<T = Record<string, unknown>>(
  sqlQuery: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sqlQuery, params)
  return rows[0] ?? null
}

/**
 * Execute parameterized query for INSERT/UPDATE/DELETE where no return is expected.
 */
export async function execute(
  sqlQuery: string,
  params: unknown[] = []
): Promise<void> {
  const url = getDatabaseUrl()
  if (!url) {
    console.warn('DATABASE_URL is not set. Execute skipped.')
    return
  }

  try {
    const sql = getNeonSql()
    await sql.query(sqlQuery, params)
  } catch (err) {
    console.error('Neon execute error:', err, 'Query was:', sqlQuery)
    throw err
  }
}

/**
 * Run several statements as one non-interactive Postgres transaction.
 *
 * Neon's HTTP driver has no interactive transactions, so the whole batch must
 * be known up front — you cannot branch on the result of an earlier statement.
 * Each entry is a [sql, params] pair; results come back in the same order.
 */
export async function transaction<T = Record<string, unknown>>(
  statements: Array<[string, unknown[]]>
): Promise<T[][]> {
  const url = getDatabaseUrl()
  if (!url) {
    console.warn('DATABASE_URL is not set. Transaction skipped.')
    return []
  }
  if (statements.length === 0) return []

  try {
    const sql = getNeonSql()
    const results = await sql.transaction(
      statements.map(([text, params]) => sql.query(text, params))
    )
    return results as unknown as T[][]
  } catch (err) {
    console.error('Neon transaction error:', err)
    throw err
  }
}
