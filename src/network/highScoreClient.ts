import {
  addHighScore,
  HIGH_SCORE_MAX_ENTRIES,
  type HighScoreEntry,
  loadHighScores,
  normalizeHighScores,
  saveHighScores,
} from '../config/highScores'
import { getSocketServerUrl } from './socketClient'

const REQUEST_TIMEOUT_MS = 12000

export async function fetchRemoteHighScores(): Promise<HighScoreEntry[] | undefined> {
  try {
    const response = await fetchWithTimeout(`${getSocketServerUrl()}/high-scores`, {
      method: 'GET',
    })

    if (!response.ok) {
      return undefined
    }

    const payload = (await response.json()) as { scores?: unknown }
    return normalizeHighScores(payload.scores)
  } catch {
    return undefined
  }
}

export async function submitRemoteHighScore(
  initials: string,
  score: number,
): Promise<HighScoreEntry[] | undefined> {
  try {
    const response = await fetchWithTimeout(`${getSocketServerUrl()}/high-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initials, score }),
    })

    if (!response.ok) {
      return undefined
    }

    const payload = (await response.json()) as { scores?: unknown }
    return normalizeHighScores(payload.scores)
  } catch {
    return undefined
  }
}

export type ScoreSyncResult = {
  entries: HighScoreEntry[]
  source: 'live' | 'cache'
}

export async function syncHighScoresFromServer(): Promise<ScoreSyncResult> {
  const local = loadHighScores()
  const remote = await fetchRemoteHighScores()

  if (!remote) {
    return { entries: local, source: 'cache' }
  }

  const remoteKeys = new Set(remote.map((entry) => `${entry.initials}:${entry.score}`))
  const unsynced = local.filter((entry) => {
    return !remoteKeys.has(`${entry.initials}:${entry.score}`) && scoreBeatsBoard(entry.score, remote)
  })

  let latest = saveHighScores([...remote, ...local])

  for (const entry of unsynced) {
    const posted = await submitRemoteHighScore(entry.initials, entry.score)

    if (posted) {
      latest = saveHighScores(posted)
    }
  }

  return { entries: latest, source: 'live' }
}

export async function persistHighScore(initials: string, score: number): Promise<HighScoreEntry[]> {
  const local = addHighScore(initials, score)
  const remote = await submitRemoteHighScore(initials, score)
  return remote ? saveHighScores(remote) : local
}

function scoreBeatsBoard(score: number, entries: HighScoreEntry[]) {
  if (score <= 0) {
    return false
  }

  if (entries.length < HIGH_SCORE_MAX_ENTRIES) {
    return true
  }

  return score > entries[entries.length - 1].score
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}
