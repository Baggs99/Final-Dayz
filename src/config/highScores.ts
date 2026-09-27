export const HIGH_SCORE_STORAGE_KEY = 'finalDayz.highScores'
export const LAST_INITIALS_STORAGE_KEY = 'finalDayz.lastInitials'
export const PERSONAL_BEST_STORAGE_KEY = 'finalDayz.personalBest'
export const SHARE_RUN_URL = 'https://zombie.baglini.co'
export const HIGH_SCORE_INITIALS_LENGTH = 3
export const HIGH_SCORE_MAX_ENTRIES = 5

export type PersonalBest = {
  initials: string
  score: number
  wave: number
  kills: number
  at: string
}

export type HighScoreEntry = {
  initials: string
  score: number
}

export function sanitizeInitials(value: string): string {
  const letters = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, HIGH_SCORE_INITIALS_LENGTH)
  return letters.padEnd(HIGH_SCORE_INITIALS_LENGTH, 'A')
}

export function normalizeHighScores(value: unknown): HighScoreEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is { initials: string; score: number } => {
      return Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as HighScoreEntry).initials === 'string' &&
          typeof (item as HighScoreEntry).score === 'number' &&
          Number.isFinite((item as HighScoreEntry).score),
      )
    })
    .map((item) => ({
      initials: sanitizeInitials(item.initials),
      score: Math.max(0, Math.floor(item.score)),
    }))
    .sort((left, right) => right.score - left.score || left.initials.localeCompare(right.initials))
    .filter((entry, index, entries) => {
      return entries.findIndex((other) => other.initials === entry.initials && other.score === entry.score) === index
    })
    .slice(0, HIGH_SCORE_MAX_ENTRIES)
}

export function loadHighScores(): HighScoreEntry[] {
  try {
    const raw = window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY)
    return normalizeHighScores(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

export function saveHighScores(entries: HighScoreEntry[]) {
  const normalized = normalizeHighScores(entries)

  try {
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore quota / privacy-mode failures and keep the in-memory list.
  }

  return normalized
}

export function loadLastInitials(): string {
  try {
    return sanitizeInitials(window.localStorage.getItem(LAST_INITIALS_STORAGE_KEY) ?? 'AAA')
  } catch {
    return 'AAA'
  }
}

export function saveLastInitials(initials: string) {
  const sanitized = sanitizeInitials(initials)

  try {
    window.localStorage.setItem(LAST_INITIALS_STORAGE_KEY, sanitized)
  } catch {
    // Ignore storage failures; the current run can still use the initials.
  }

  return sanitized
}

export function getBestHighScore(entries = loadHighScores()): HighScoreEntry | undefined {
  return entries[0]
}

export function scoreQualifiesForHighScore(score: number, entries = loadHighScores()): boolean {
  if (score <= 0) {
    return false
  }

  if (entries.length < HIGH_SCORE_MAX_ENTRIES) {
    return true
  }

  return score > entries[entries.length - 1].score
}

export function addHighScore(initials: string, score: number, entries = loadHighScores()): HighScoreEntry[] {
  const next = normalizeHighScores([
    ...entries,
    {
      initials: sanitizeInitials(initials),
      score,
    },
  ])

  return saveHighScores(next)
}

export function formatScore(score: number) {
  return Math.max(0, Math.floor(score)).toLocaleString('en-US')
}

export function formatBestHighScoreLabel(entry = getBestHighScore()): string {
  return entry ? `Best: ${entry.initials} ${formatScore(entry.score)}` : 'Best: --- 0'
}

export function formatHighScoreBoard(entries = loadHighScores()): string {
  if (entries.length === 0) {
    return 'No scores yet'
  }

  return entries.map((entry, index) => `${index + 1}. ${entry.initials}  ${formatScore(entry.score)}`).join('\n')
}

export function formatPointsShortOfBoard(score: number, entries = loadHighScores()): string | undefined {
  if (scoreQualifiesForHighScore(score, entries) || entries.length < HIGH_SCORE_MAX_ENTRIES) {
    return undefined
  }

  const cutoff = entries[entries.length - 1].score
  const short = Math.max(1, cutoff - Math.floor(score) + (score >= cutoff ? 1 : 0))
  return `Top 5 cutoff: ${formatScore(cutoff)}\nYou were ${formatScore(short)} points short`
}

export function loadPersonalBest(): PersonalBest | undefined {
  try {
    const raw = window.localStorage.getItem(PERSONAL_BEST_STORAGE_KEY)
    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw) as Partial<PersonalBest>
    if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) {
      return undefined
    }

    return {
      initials: sanitizeInitials(parsed.initials ?? 'AAA'),
      score: Math.max(0, Math.floor(parsed.score)),
      wave: typeof parsed.wave === 'number' ? Math.max(0, Math.floor(parsed.wave)) : 0,
      kills: typeof parsed.kills === 'number' ? Math.max(0, Math.floor(parsed.kills)) : 0,
      at: typeof parsed.at === 'string' ? parsed.at : '',
    }
  } catch {
    return undefined
  }
}

export function savePersonalBest(entry: PersonalBest) {
  const next: PersonalBest = {
    initials: sanitizeInitials(entry.initials),
    score: Math.max(0, Math.floor(entry.score)),
    wave: Math.max(0, Math.floor(entry.wave)),
    kills: Math.max(0, Math.floor(entry.kills)),
    at: entry.at,
  }

  try {
    window.localStorage.setItem(PERSONAL_BEST_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The run can still show the best even if storage is blocked.
  }

  return next
}

export function formatPersonalBestLabel(entry = loadPersonalBest()) {
  return entry ? `Personal Best: ${formatScore(entry.score)} — Wave ${entry.wave}` : 'Personal Best: none yet'
}

export function buildShareText(input: { score: number; wave: number; perks: string[] }) {
  const perkLine = input.perks.length > 0 ? `\nPerks: ${input.perks.join(', ')}` : ''
  return `I survived to Wave ${input.wave} in Final Dayz with ${formatScore(input.score)} points.${perkLine}\nBeat me: ${SHARE_RUN_URL}`
}
