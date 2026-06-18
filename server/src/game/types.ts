import type { WeaponId } from './weapons.js'

export type RoomPhase = 'waitingForPlayers' | 'readyToStart' | 'fighting' | 'shopping' | 'gameOver'

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
  x: number
  y: number
  health: number
  maxHealth: number
  speed: number
  radius: number
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

export type ServerRoom = {
  code: string
  hostId: string
  maxPlayers: number
  phase: RoomPhase
  players: Map<string, ServerPlayer>
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
  zombies: ServerZombie[]
  bullets: ServerBullet[]
  score: number
  wave: number
  gameOver: boolean
}

export type RoomStateSnapshot = {
  roomCode: string
  phase: RoomPhase
  players: ServerPlayer[]
  playerCount: number
  maxPlayers: number
  hostId: string
}
