import { io, type Socket } from 'socket.io-client'
import type { WeaponId } from '../config/weapons'

export type NetworkPlayerState = {
  id: string
  x: number
  y: number
  rotation: number
  aimX: number
  aimY: number
  weaponId: WeaponId
  weapon: string
  connected: boolean
}

export type PlayerShotPayload = {
  roomCode?: string
  playerId: string
  x: number
  y: number
  aimX: number
  aimY: number
  rotation: number
  weaponId: WeaponId
  weapon: string
  timestamp: number
}

export type MultiplayerConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'connectionError'

type ServerToClientEvents = {
  roomCreated: (payload: { roomCode: string; playerId: string }) => void
  roomJoined: (payload: { roomCode: string; playerId: string; players: NetworkPlayerState[] }) => void
  playerJoined: (player: NetworkPlayerState) => void
  playerLeft: (payload: { playerId: string }) => void
  roomFull: () => void
  roomNotFound: () => void
  playerStates: (players: NetworkPlayerState[]) => void
  playerShot: (payload: PlayerShotPayload) => void
}

type ClientToServerEvents = {
  createRoom: () => void
  joinRoom: (roomCode: string) => void
  playerInput: (state: Partial<NetworkPlayerState>) => void
  playerStateUpdate: (state: Partial<NetworkPlayerState>) => void
  playerShoot: (payload: PlayerShotPayload) => void
  leaveRoom: () => void
}

export type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export function getSocketServerUrl() {
  return import.meta.env.VITE_SOCKET_URL?.trim() || 'http://localhost:3001'
}

export function createMultiplayerSocket() {
  return io(getSocketServerUrl(), {
    autoConnect: false,
    reconnectionAttempts: 2,
    timeout: 5000,
    transports: ['websocket', 'polling'],
  }) as MultiplayerSocket
}
