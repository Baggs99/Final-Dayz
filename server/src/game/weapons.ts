export type WeaponId = 'pistol' | 'smg' | 'shotgun'

export type ServerWeaponConfig = {
  id: WeaponId
  name: string
  damage: number
  fireRateMs: number
  bulletSpeed: number
  spreadDegrees: number
  bulletsPerShot: number
}

export const serverWeapons: Record<WeaponId, ServerWeaponConfig> = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    damage: 35,
    fireRateMs: 220,
    bulletSpeed: 1800,
    spreadDegrees: 1,
    bulletsPerShot: 1,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    damage: 18,
    fireRateMs: 75,
    bulletSpeed: 1700,
    spreadDegrees: 6,
    bulletsPerShot: 1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    damage: 24,
    fireRateMs: 650,
    bulletSpeed: 1500,
    spreadDegrees: 24,
    bulletsPerShot: 6,
  },
}

export function isWeaponId(value: unknown): value is WeaponId {
  return value === 'pistol' || value === 'smg' || value === 'shotgun'
}
