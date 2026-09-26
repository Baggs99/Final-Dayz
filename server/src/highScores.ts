import { Pool } from 'pg'

export const HIGH_SCORE_MAX_ENTRIES = 5
export const HIGH_SCORE_INITIALS_LENGTH = 3
const HIGH_SCORE_STORE_LIMIT = 100
const HIGH_SCORE_MAX_VALUE = 1_000_000_000

export type HighScoreEntry = {
  initials: string
  score: number
}

let pool: Pool | undefined
let tableReady: Promise<void> | undefined

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim()
}

export function isHighScoreStoreConfigured() {
  return Boolean(getDatabaseUrl())
}

function getPool() {
  const connectionString = getDatabaseUrl()

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  if (!pool) {
    const isLocal = /localhost|127\.0\.0\.1/i.test(connectionString)
    pool = new Pool({
      connectionString,
      max: 4,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    })
  }

  return pool
}

export async function ensureHighScoreTable() {
  if (!isHighScoreStoreConfigured()) {
    return
  }

  if (!tableReady) {
    tableReady = (async () => {
      const client = getPool()
      await client.query(`
        CREATE TABLE IF NOT EXISTS high_scores (
          id BIGSERIAL PRIMARY KEY,
          initials VARCHAR(3) NOT NULL,
          score INTEGER NOT NULL CHECK (score >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS high_scores_score_created_idx
        ON high_scores (score DESC, created_at ASC)
      `)
    })().catch((error) => {
      tableReady = undefined
      throw error
    })
  }

  await tableReady
}

export function sanitizeInitials(value: string) {
  const letters = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, HIGH_SCORE_INITIALS_LENGTH)
  return letters.padEnd(HIGH_SCORE_INITIALS_LENGTH, 'A')
}

export function parseHighScorePayload(body: unknown): HighScoreEntry | undefined {
  if (!body || typeof body !== 'object') {
    return undefined
  }

  const initialsValue = (body as { initials?: unknown }).initials
  const scoreValue = (body as { score?: unknown }).score

  if (typeof initialsValue !== 'string') {
    return undefined
  }

  const score = typeof scoreValue === 'number' ? scoreValue : Number(scoreValue)

  if (!Number.isFinite(score)) {
    return undefined
  }

  const normalizedScore = Math.max(0, Math.floor(score))

  if (normalizedScore <= 0 || normalizedScore > HIGH_SCORE_MAX_VALUE) {
    return undefined
  }

  return {
    initials: sanitizeInitials(initialsValue),
    score: normalizedScore,
  }
}

export async function listHighScores(): Promise<HighScoreEntry[]> {
  await ensureHighScoreTable()
  const result = await getPool().query<{ initials: string; score: number }>(
    `
      SELECT initials, score
      FROM high_scores
      ORDER BY score DESC, created_at ASC, id ASC
      LIMIT $1
    `,
    [HIGH_SCORE_MAX_ENTRIES],
  )

  return result.rows.map((row) => ({
    initials: sanitizeInitials(row.initials),
    score: row.score,
  }))
}

export async function addHighScore(initials: string, score: number): Promise<HighScoreEntry[]> {
  await ensureHighScoreTable()
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO high_scores (initials, score) VALUES ($1, $2)', [
      sanitizeInitials(initials),
      score,
    ])
    await client.query(
      `
        DELETE FROM high_scores
        WHERE id NOT IN (
          SELECT id
          FROM high_scores
          ORDER BY score DESC, created_at ASC, id ASC
          LIMIT $1
        )
      `,
      [HIGH_SCORE_STORE_LIMIT],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return listHighScores()
}
