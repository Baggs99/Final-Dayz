export const HIGH_SCORE_STORAGE_KEY = 'finalDayz.highScores'
export const LAST_INITIALS_STORAGE_KEY = 'finalDayz.lastInitials'
export const HIGH_SCORE_INITIALS_LENGTH = 3
export const HIGH_SCORE_MAX_ENTRIES = 5

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

export function formatBestHighScoreLabel(entry = getBestHighScore()): string {
  return entry ? `Best ${entry.initials} ${entry.score}` : 'Best --- 0'
}

export function formatHighScoreBoard(entries = loadHighScores()): string {
  if (entries.length === 0) {
    return 'No high scores yet'
  }

  return entries.map((entry, index) => `${index + 1}. ${entry.initials}  ${entry.score}`).join('\n')
}
