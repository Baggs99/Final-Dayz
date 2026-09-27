export type PerkId =
  | 'fortifier'
  | 'engineer'
  | 'sprinter'
  | 'deadeye'
  | 'closeQuarters'
  | 'suppressiveFire'
  | 'thickSkin'
  | 'lastStand'
  | 'barricadePlating'
  | 'bonusCash'

export type PerkConfig = {
  id: PerkId
  name: string
  description: string
}

export const PERK_CHOICES = 3
export const PERK_WAVE_INTERVAL = 3

export const perkCatalog: PerkConfig[] = [
  { id: 'fortifier', name: 'Fortifier', description: 'Repairs restore 25% more barricade health.' },
  { id: 'engineer', name: 'Engineer', description: 'Field repairs cost $15 instead of $25.' },
  { id: 'sprinter', name: 'Sprinter', description: 'Move 8% faster.' },
  { id: 'deadeye', name: 'Deadeye', description: 'Pistol damage +20%.' },
  { id: 'closeQuarters', name: 'Close Quarters', description: 'Shotgun fires one extra pellet.' },
  { id: 'suppressiveFire', name: 'Suppressive Fire', description: 'SMG hits briefly slow zombies.' },
  { id: 'thickSkin', name: 'Thick Skin', description: 'Contact damage taken -10%.' },
  { id: 'lastStand', name: 'Last Stand', description: '+25% damage below 30% HP.' },
  { id: 'barricadePlating', name: 'Barricade Plating', description: 'Every door gains +25 max health.' },
  { id: 'bonusCash', name: 'Bonus Cash', description: 'Wave clear bonus +25%.' },
]

const perkById = new Map(perkCatalog.map((perk) => [perk.id, perk]))

export function getPerk(id: PerkId) {
  return perkById.get(id)!
}

export function rollPerkChoices(owned: PerkId[], random = Math.random): PerkConfig[] {
  const available = perkCatalog.filter((perk) => !owned.includes(perk.id))
  const pool = [...available]

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const current = pool[index]
    pool[index] = pool[swap]
    pool[swap] = current
  }

  return pool.slice(0, PERK_CHOICES)
}
