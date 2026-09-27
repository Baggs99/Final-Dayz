export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'flamethrower'
export type WeaponKind = 'bullet' | 'cone'

export interface WeaponConfig {
  id: WeaponId
  name: string
  kind: WeaponKind
  damage: number
  fireRateMs: number
  bulletSpeed: number
  spreadDegrees: number
  bulletsPerShot: number
  cost: number
  description: string
  /** Extra zombies a bullet can pass through after the first hit. */
  pierce?: number
  /** Cone weapons: reach in pixels. spreadDegrees is the full cone width. */
  range?: number
}

export const weapons: Record<WeaponId, WeaponConfig> = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    kind: 'bullet',
    damage: 35,
    fireRateMs: 220,
    bulletSpeed: 1800,
    spreadDegrees: 1,
    bulletsPerShot: 1,
    cost: 0,
    description: 'Reliable single shots.',
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    kind: 'bullet',
    damage: 18,
    fireRateMs: 75,
    bulletSpeed: 1700,
    spreadDegrees: 6,
    bulletsPerShot: 1,
    cost: 150,
    description: 'Fast spray.',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    kind: 'bullet',
    damage: 24,
    fireRateMs: 650,
    bulletSpeed: 1500,
    spreadDegrees: 24,
    bulletsPerShot: 6,
    cost: 300,
    description: 'Wide close-range blast.',
  },
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    kind: 'bullet',
    damage: 90,
    fireRateMs: 520,
    bulletSpeed: 2400,
    spreadDegrees: 0,
    bulletsPerShot: 1,
    cost: 450,
    pierce: 1,
    description: 'Slow, heavy, pierces one zombie.',
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    kind: 'cone',
    damage: 9,
    fireRateMs: 100,
    bulletSpeed: 0,
    spreadDegrees: 36,
    bulletsPerShot: 1,
    cost: 600,
    range: 150,
    description: 'Short cone. Hold to burn.',
  },
}

export const weaponCycle: WeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle', 'flamethrower']
export const defaultWeaponId: WeaponId = 'pistol'

export const toolConfig = {
  mineUnlockCost: 350,
  minePlaceCost: 35,
  mineMax: 5,
  mineArmMs: 400,
  mineTriggerRadius: 45,
  mineExplosionRadius: 115,
  mineDamage: 120,
  turretUnlockCost: 700,
  turretPlaceCost: 100,
  turretMax: 2,
  turretRange: 260,
  turretFireRateMs: 350,
  turretDamage: 22,
  meleeCooldownMs: 2500,
  meleeRange: 70,
  meleeDamage: 45,
}
