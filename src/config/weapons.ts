export type WeaponId = 'pistol' | 'smg' | 'shotgun'

export interface WeaponConfig {
  id: WeaponId
  name: string
  damage: number
  fireRateMs: number
  bulletSpeed: number
  spreadDegrees: number
  bulletsPerShot: number
  cost: number
}

export const weapons: Record<WeaponId, WeaponConfig> = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    damage: 35,
    fireRateMs: 220,
    bulletSpeed: 1800,
    spreadDegrees: 1,
    bulletsPerShot: 1,
    cost: 0,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    damage: 18,
    fireRateMs: 75,
    bulletSpeed: 1700,
    spreadDegrees: 6,
    bulletsPerShot: 1,
    cost: 150,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    damage: 24,
    fireRateMs: 650,
    bulletSpeed: 1500,
    spreadDegrees: 24,
    bulletsPerShot: 6,
    cost: 300,
  },
}

export const defaultWeaponId: WeaponId = 'pistol'
