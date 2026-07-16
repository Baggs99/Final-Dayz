export type EnemyType = 'walker' | 'runner' | 'brute' | 'spitter' | 'exploder' | 'screamer' | 'warden'

export type ServerEnemyConfig = {
  type: EnemyType
  color: number
  healthMultiplier: number
  speedMultiplier: number
  damageMultiplier: number
  radius: number
  scoreValue: number
  unlockWave: number
  spawnWeight: number
  barricadeDamageMultiplier?: number
  explosionDamage?: number
  explosionRadius?: number
  spitDamage?: number
  spitRange?: number
  spitCooldownMs?: number
  screamRadius?: number
  screamSpeedMultiplier?: number
}

export const serverEnemyConfigs: Record<EnemyType, ServerEnemyConfig> = {
  walker: {
    type: 'walker',
    color: 0x62b846,
    healthMultiplier: 1,
    speedMultiplier: 1,
    damageMultiplier: 1,
    radius: 17,
    scoreValue: 10,
    unlockWave: 1,
    spawnWeight: 10,
  },
  runner: {
    type: 'runner',
    color: 0xa6ff4d,
    healthMultiplier: 0.65,
    speedMultiplier: 1.65,
    damageMultiplier: 0.75,
    radius: 15,
    scoreValue: 12,
    unlockWave: 2,
    spawnWeight: 5,
  },
  brute: {
    type: 'brute',
    color: 0x8b5a2b,
    healthMultiplier: 2.6,
    speedMultiplier: 0.72,
    damageMultiplier: 1.55,
    radius: 22,
    scoreValue: 25,
    unlockWave: 3,
    spawnWeight: 2,
    barricadeDamageMultiplier: 1.8,
  },
  spitter: {
    type: 'spitter',
    color: 0x9b59ff,
    healthMultiplier: 0.9,
    speedMultiplier: 0.85,
    damageMultiplier: 0.7,
    radius: 16,
    scoreValue: 18,
    unlockWave: 4,
    spawnWeight: 3,
    spitDamage: 6,
    spitRange: 270,
    spitCooldownMs: 1500,
  },
  exploder: {
    type: 'exploder',
    color: 0xff8c1a,
    healthMultiplier: 0.8,
    speedMultiplier: 1.08,
    damageMultiplier: 0.9,
    radius: 18,
    scoreValue: 20,
    unlockWave: 5,
    spawnWeight: 2,
    explosionDamage: 42,
    explosionRadius: 112,
  },
  screamer: {
    type: 'screamer',
    color: 0xff4da6,
    healthMultiplier: 1.15,
    speedMultiplier: 0.92,
    damageMultiplier: 0.8,
    radius: 17,
    scoreValue: 22,
    unlockWave: 6,
    spawnWeight: 2,
    screamRadius: 170,
    screamSpeedMultiplier: 1.25,
  },
  warden: {
    type: 'warden',
    color: 0x4d6bff,
    healthMultiplier: 7,
    speedMultiplier: 0.58,
    damageMultiplier: 2,
    radius: 30,
    scoreValue: 150,
    unlockWave: 10,
    spawnWeight: 0,
    barricadeDamageMultiplier: 2.2,
    screamRadius: 260,
    screamSpeedMultiplier: 1.35,
  },
}

export function pickEnemyTypeForWave(wave: number, random = Math.random): EnemyType {
  const available = Object.values(serverEnemyConfigs).filter((enemy) => wave >= enemy.unlockWave)
  const totalWeight = available.reduce((sum, enemy) => sum + enemy.spawnWeight, 0)
  let roll = random() * totalWeight

  for (const enemy of available) {
    roll -= enemy.spawnWeight

    if (roll <= 0) {
      return enemy.type
    }
  }

  return 'walker'
}

export function getBossEnemyTypeForWave(wave: number): EnemyType | undefined {
  return wave === 10 ? 'warden' : undefined
}
