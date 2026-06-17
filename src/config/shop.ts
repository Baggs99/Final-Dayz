import type { WeaponId } from './weapons'

export type ShopItemId =
  | 'healPlayer'
  | 'repairAll'
  | 'damageUpgrade'
  | 'maxHealthUpgrade'
  | 'buySmg'
  | 'buyShotgun'

export interface ShopItemConfig {
  id: ShopItemId
  label: string
  cost: number
}

export const shopConfig: Record<ShopItemId, ShopItemConfig> = {
  healPlayer: {
    id: 'healPlayer',
    label: 'Heal Player',
    cost: 40,
  },
  repairAll: {
    id: 'repairAll',
    label: 'Repair All Barricades',
    cost: 75,
  },
  damageUpgrade: {
    id: 'damageUpgrade',
    label: 'Increase Bullet Damage',
    cost: 120,
  },
  maxHealthUpgrade: {
    id: 'maxHealthUpgrade',
    label: 'Increase Max Health',
    cost: 125,
  },
  buySmg: {
    id: 'buySmg',
    label: 'Buy SMG',
    cost: 150,
  },
  buyShotgun: {
    id: 'buyShotgun',
    label: 'Buy Shotgun',
    cost: 300,
  },
}

export const shopWeaponUnlocks: Partial<Record<ShopItemId, WeaponId>> = {
  buySmg: 'smg',
  buyShotgun: 'shotgun',
}

export const shopUpgradeConfig = {
  healAmount: 45,
  damageUpgradeAmount: 6,
  maxHealthUpgradeAmount: 20,
}
