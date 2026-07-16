import type { EnemyType } from './enemies.js'
import type { WeaponId } from './weapons.js'

export type RoomPhase = 'waitingForPlayers' | 'readyToStart' | 'fighting' | 'waveComplete' | 'shopping' | 'gameOver'

export type ServerPlayer = {
  id: string
  x: number
  y: number
  rotation: number
  aimX: number
  aimY: number
  weaponId: WeaponId
  weapon: string
  connected: boolean
  health: number
  alive: boolean
  lastDamagedAt: number
}

export type ServerZombie = {
  id: string
  enemyType: EnemyType
  color: number
  x: number
  y: number
  health: number
  maxHealth: number
  baseSpeed: number
  speed: number
  damage: number
  scoreValue: number
  barricadeDamageMultiplier: number
  explosionDamage: number
  explosionRadius: number
  spitDamage: number
  spitRange: number
  spitCooldownMs: number
  screamRadius: number
  screamSpeedMultiplier: number
  radius: number
  navState: 'chasingDirect' | 'movingToBarricade' | 'attackingBarricade' | 'routingToDoorway' | 'stuck'
  targetPlayerId?: string
  targetEntryId?: EntryPointId
  targetDoorwayId?: EntryPointId
  currentTargetPoint?: { x: number; y: number }
  routeNodeIds: string[]
  routeIndex: number
  stuckCount: number
  lastAttackAt: number
  lastSpitAt: number
  lastStuckCheckAt: number
  lastStuckX: number
  lastStuckY: number
}

export type ServerZombieSnapshot = ServerZombie & {
  zone: 'inside' | 'outside'
}

export type EntryPointId = 'top' | 'bottom' | 'left' | 'right'

export type ServerBarricade = {
  id: EntryPointId
  health: number
  maxHealth: number
}

export type ServerBullet = {
  id: string
  ownerId: string
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  createdAt: number
  lifespanMs: number
  radius: number
}

export type DebugNavSnapshot = {
  navNodes: {
    id: string
    x: number
    y: number
    zone: 'inside' | 'outside' | 'door'
    entryId?: EntryPointId
  }[]
  edges: {
    from: string
    to: string
    open: boolean
    entryId?: EntryPointId
  }[]
  wallRects: {
    x: number
    y: number
    width: number
    height: number
  }[]
  barricadeRects: {
    id: EntryPointId
    x: number
    y: number
    width: number
    height: number
    alive: boolean
  }[]
}

export type ServerRoom = {
  code: string
  hostId: string
  maxPlayers: number
  phase: RoomPhase
  players: Map<string, ServerPlayer>
  barricades: Map<EntryPointId, ServerBarricade>
  zombies: Map<string, ServerZombie>
  bullets: Map<string, ServerBullet>
  score: number
  wave: number
  gameStarted: boolean
  gameOver: boolean
  lastTick: number
  nextWaveAt: number
  worldWidth: number
  worldHeight: number
}

export type PlayerShotPayload = {
  roomCode?: string
  playerId?: string
  x?: number
  y?: number
  aimX?: number
  aimY?: number
  rotation?: number
  weaponId?: WeaponId
  weapon?: string
  timestamp?: number
}

export type GameStateSnapshot = {
  roomCode: string
  phase: RoomPhase
  hostId: string
  players: ServerPlayer[]
  barricades: ServerBarricade[]
  zombies: ServerZombieSnapshot[]
  bullets: ServerBullet[]
  score: number
  wave: number
  gameOver: boolean
  debugNav?: DebugNavSnapshot
}

export type RoomStateSnapshot = {
  roomCode: string
  phase: RoomPhase
  players: ServerPlayer[]
  playerCount: number
  maxPlayers: number
  hostId: string
}
