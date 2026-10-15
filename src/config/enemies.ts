export type EnemyType = 'walker' | 'runner' | 'brute' | 'spitter' | 'exploder' | 'screamer' | 'goo' | 'artillery' | 'weaver' | 'splitter' | 'beam' | 'hive' | 'warden'

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
    unlockWave: 3,
    spawnWeight: 3.4,
    cashValue: 16,
    spitDamage: 8,
    spitRange: 250,
    spitCooldownMs: 1100,
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
  goo: {
    type: 'goo',
    name: 'Goo',
    color: 0x1ed6a4,
    healthMultiplier: 1.05,
    speedMultiplier: 0.72,
    damageMultiplier: 0.8,
    radius: 18,
    scoreValue: 16,
    unlockWave: 4,
    spawnWeight: 2,
    cashValue: 16,
    description: 'Leaves a trail that slows you.',
  },
  artillery: {
    type: 'artillery',
    name: 'Artillery',
    color: 0xff5a3c,
    healthMultiplier: 0.9,
    speedMultiplier: 0.7,
    damageMultiplier: 0.7,
    radius: 17,
    scoreValue: 18,
    unlockWave: 4,
    spawnWeight: 3.2,
    cashValue: 16,
    description: 'Lobs a shell. Leave the painted circle.',
  },
  weaver: {
    type: 'weaver',
    name: 'Weaver',
    color: 0xff4d8d,
    healthMultiplier: 0.75,
    speedMultiplier: 0.95,
    damageMultiplier: 0.55,
    radius: 15,
    scoreValue: 16,
    unlockWave: 3,
    spawnWeight: 4.2,
    cashValue: 14,
    description: 'Sprays a slow spiral. Walk through the gaps.',
  },
  splitter: {
    type: 'splitter',
    name: 'Splitter',
    color: 0xffe14d,
    healthMultiplier: 0.7,
    speedMultiplier: 1.12,
    damageMultiplier: 0.6,
    radius: 14,
    scoreValue: 14,
    unlockWave: 4,
    spawnWeight: 3.2,
    cashValue: 14,
    description: 'Bursts into curving shards on death.',
  },
  beam: {
    type: 'beam',
    name: 'Beam',
    color: 0x7af0ff,
    healthMultiplier: 0.85,
    speedMultiplier: 0.62,
    damageMultiplier: 0.5,
    radius: 16,
    scoreValue: 20,
    unlockWave: 5,
    spawnWeight: 2.6,
    cashValue: 18,
    description: 'Locks a line, then fires. Sidestep it.',
  },
  hive: {
    type: 'hive',
    name: 'Hive',
    color: 0xc084fc,
    healthMultiplier: 1.15,
    speedMultiplier: 0.55,
    damageMultiplier: 0.45,
    radius: 18,
    scoreValue: 22,
    unlockWave: 4,
    spawnWeight: 3.4,
    cashValue: 18,
    description: 'Hangs back and spits homing gnats.',
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

export const gooTrailConfig = {
  radius: 28,
  spacing: 34,
  lifetimeMs: 5200,
  slowMultiplier: 0.5,
}

export function pickEnemyTypeForWave(
  wave: number,
  random = Math.random,
  weightScale?: Partial<Record<EnemyType, number>>,
): EnemyType {
  const available = Object.values(enemyConfigs).filter((enemy) => wave >= enemy.unlockWave && enemy.spawnWeight > 0)
  const totalWeight = available.reduce((sum, enemy) => sum + enemySpawnWeight(enemy, wave, weightScale), 0)
  let roll = random() * totalWeight

  for (const enemy of available) {
    roll -= enemySpawnWeight(enemy, wave, weightScale)

    if (roll <= 0) {
      return enemy.type
    }
  }

  return 'walker'
}

function enemySpawnWeight(enemy: EnemyConfig, wave: number, weightScale?: Partial<Record<EnemyType, number>>) {
  const lateSteps = Math.max(0, wave - 7)
  const lateBias: Partial<Record<EnemyType, number>> = {
    spitter: 0.35,
    brute: 0.28,
    screamer: 0.22,
    weaver: 0.32,
    hive: 0.3,
    artillery: 0.26,
    splitter: 0.22,
    beam: 0.2,
  }
  const perStep = lateBias[enemy.type]
  const endgameBias = enemy.type === 'walker' ? Math.max(0.45, 1 - lateSteps * 0.04) : perStep ? 1 + lateSteps * perStep : 1

  return enemy.spawnWeight * endgameBias * (weightScale?.[enemy.type] ?? 1)
}

export function getBossEnemyTypeForWave(wave: number): EnemyType | undefined {
  return wave === 10 ? 'warden' : undefined
}
