export type EnemyType = 'walker' | 'runner' | 'brute' | 'spitter' | 'exploder' | 'screamer' | 'warden'

export type EnemyConfig = {
  type: EnemyType
  name: string
  color: number
  healthMultiplier: number
  speedMultiplier: number
  damageMultiplier: number
  radius: number
  scoreValue: number
  unlockWave: number
  spawnWeight: number
  description: string
  barricadeDamageMultiplier?: number
  explosionDamage?: number
  explosionRadius?: number
  spitDamage?: number
  spitRange?: number
  spitCooldownMs?: number
  screamRadius?: number
  screamSpeedMultiplier?: number
  cashValue: number
}

export const enemyConfigs: Record<EnemyType, EnemyConfig> = {
  walker: {
    type: 'walker',
    name: 'Walker',
    color: 0x62b846,
    healthMultiplier: 1,
    speedMultiplier: 1,
    damageMultiplier: 1,
    radius: 17,
    scoreValue: 10,
    unlockWave: 1,
    spawnWeight: 12,
    cashValue: 12,
    description: 'Basic pressure.',
  },
  runner: {
    type: 'runner',
    name: 'Runner',
    color: 0xa6ff4d,
    healthMultiplier: 0.65,
    speedMultiplier: 1.65,
    damageMultiplier: 0.75,
    radius: 15,
    scoreValue: 12,
    unlockWave: 2,
    spawnWeight: 4,
    cashValue: 14,
    description: 'Fast and fragile.',
  },
  brute: {
    type: 'brute',
    name: 'Brute',
    color: 0x8b5a2b,
    healthMultiplier: 2.6,
    speedMultiplier: 0.66,
    damageMultiplier: 1.55,
    radius: 22,
    scoreValue: 25,
    unlockWave: 3,
    spawnWeight: 2,
    cashValue: 20,
    barricadeDamageMultiplier: 2.2,
    description: 'Slow door breaker.',
  },
  spitter: {
    type: 'spitter',
    name: 'Spitter',
    color: 0x9b59ff,
    healthMultiplier: 0.9,
    speedMultiplier: 0.85,
    damageMultiplier: 0.7,
    radius: 16,
    scoreValue: 18,
    unlockWave: 4,
    spawnWeight: 2,
    cashValue: 16,
    spitDamage: 8,
    spitRange: 250,
    spitCooldownMs: 1900,
    description: 'Ranged acid. Dodge the glob.',
  },
  exploder: {
    type: 'exploder',
    name: 'Exploder',
    color: 0xff8c1a,
    healthMultiplier: 0.8,
    speedMultiplier: 1.08,
    damageMultiplier: 0.9,
    radius: 18,
    scoreValue: 20,
    unlockWave: 5,
    spawnWeight: 2,
    cashValue: 16,
    explosionDamage: 36,
    explosionRadius: 96,
    description: 'Booms on contact or death, and hurts nearby zombies.',
  },
  screamer: {
    type: 'screamer',
    name: 'Screamer',
    color: 0xff4da6,
    healthMultiplier: 1.15,
    speedMultiplier: 0.92,
    damageMultiplier: 0.8,
    radius: 17,
    scoreValue: 22,
    unlockWave: 6,
    spawnWeight: 2,
    cashValue: 18,
    screamRadius: 150,
    screamSpeedMultiplier: 1.28,
    description: 'Speeds up nearby zombies. Kill it first.',
  },
  warden: {
    type: 'warden',
    name: 'The Warden',
    color: 0x4d6bff,
    healthMultiplier: 7,
    speedMultiplier: 0.58,
    damageMultiplier: 2,
    radius: 30,
    scoreValue: 150,
    cashValue: 60,
    unlockWave: 10,
    spawnWeight: 0,
    barricadeDamageMultiplier: 2.2,
    screamRadius: 260,
    screamSpeedMultiplier: 1.35,
    description: 'Wave 10 boss that buffs nearby zombies and hits hard.',
  },
}

export function pickEnemyTypeForWave(
  wave: number,
  random = Math.random,
  weightScale?: Partial<Record<EnemyType, number>>,
): EnemyType {
  const available = Object.values(enemyConfigs).filter((enemy) => wave >= enemy.unlockWave && enemy.spawnWeight > 0)
  const totalWeight = available.reduce((sum, enemy) => sum + enemy.spawnWeight * (weightScale?.[enemy.type] ?? 1), 0)
  let roll = random() * totalWeight

  for (const enemy of available) {
    roll -= enemy.spawnWeight * (weightScale?.[enemy.type] ?? 1)

    if (roll <= 0) {
      return enemy.type
    }
  }

  return 'walker'
}

export function getBossEnemyTypeForWave(wave: number): EnemyType | undefined {
  return wave === 10 ? 'warden' : undefined
}
