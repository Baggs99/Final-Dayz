import type { WeaponId } from './weapons'

export type ShopItemId =
  | 'healPlayer'
  | 'repairAll'
  | 'damageUpgrade'
  | 'maxHealthUpgrade'
  | 'buySmg'
  | 'buyShotgun'
  | 'buyRifle'
  | 'buyFlamethrower'
  | 'buyMines'
  | 'buyTurret'

export interface ShopItemConfig {
  id: ShopItemId
  label: string
  cost: number
  repeatable?: boolean
}

export const shopConfig: Record<ShopItemId, ShopItemConfig> = {
  healPlayer: {
    id: 'healPlayer',
    label: 'Heal Player',
    cost: 40,
    repeatable: true,
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
    repeatable: true,
  },
  maxHealthUpgrade: {
    id: 'maxHealthUpgrade',
    label: 'Increase Max Health',
    cost: 125,
    repeatable: true,
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
  buyRifle: {
    id: 'buyRifle',
    label: 'Buy Rifle',
    cost: 450,
  },
  buyFlamethrower: {
    id: 'buyFlamethrower',
    label: 'Buy Flamethrower',
    cost: 600,
  },
  buyMines: {
    id: 'buyMines',
    label: 'Buy Mines',
    cost: 350,
  },
  buyTurret: {
    id: 'buyTurret',
    label: 'Buy Turret',
    cost: 700,
  },
}

export const shopWeaponUnlocks: Partial<Record<ShopItemId, WeaponId>> = {
  buySmg: 'smg',
  buyShotgun: 'shotgun',
  buyRifle: 'rifle',
  buyFlamethrower: 'flamethrower',
}

export const shopUpgradeConfig = {
  healAmount: 45,
  damageUpgradeAmount: 6,
  maxHealthUpgradeAmount: 20,
}
