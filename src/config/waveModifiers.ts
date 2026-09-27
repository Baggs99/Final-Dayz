import type { EnemyType } from './enemies'

export type WaveModifierId =
  | 'runnerRush'
  | 'bruteBreach'
  | 'acidWave'
  | 'volatileHorde'
  | 'screamTeam'
  | 'swarm'
  | 'heavy'

export type WaveModifier = {
  id: WaveModifierId
  name: string
  minWave: number
  weightScale: Partial<Record<EnemyType, number>>
  countMultiplier: number
  healthMultiplier: number
}

const waveModifiers: WaveModifier[] = [
  { id: 'runnerRush', name: 'Runner Rush', minWave: 4, weightScale: { runner: 4, walker: 0.7, brute: 0.4 }, countMultiplier: 1, healthMultiplier: 1 },
  { id: 'bruteBreach', name: 'Brute Breach', minWave: 4, weightScale: { brute: 4, runner: 0.6 }, countMultiplier: 0.9, healthMultiplier: 1 },
  { id: 'acidWave', name: 'Acid Wave', minWave: 4, weightScale: { spitter: 4, walker: 0.8 }, countMultiplier: 1, healthMultiplier: 1 },
  { id: 'volatileHorde', name: 'Volatile Horde', minWave: 5, weightScale: { exploder: 4, walker: 0.8 }, countMultiplier: 1, healthMultiplier: 1 },
  { id: 'screamTeam', name: 'Scream Team', minWave: 6, weightScale: { screamer: 4, walker: 0.85 }, countMultiplier: 1, healthMultiplier: 1 },
  { id: 'swarm', name: 'Swarm', minWave: 5, weightScale: { walker: 1.6, runner: 1.4 }, countMultiplier: 1.3, healthMultiplier: 0.85 },
  { id: 'heavy', name: 'Heavy Wave', minWave: 6, weightScale: { brute: 2.2, walker: 0.7 }, countMultiplier: 0.75, healthMultiplier: 1.3 },
]

export function rollWaveModifier(wave: number, random = Math.random): WaveModifier | undefined {
  if (wave < 4 || wave === 10 || random() > 0.7) {
    return undefined
  }

  const pool = waveModifiers.filter((modifier) => wave >= modifier.minWave)
  if (pool.length === 0) {
    return undefined
  }

  return pool[Math.floor(random() * pool.length)]
}
