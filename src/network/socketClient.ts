import { io, type Socket } from 'socket.io-client'

export type NetworkPlayerState = {
  id: string
  x: number
  y: number
  rotation: number
  aimX: number
  aimY: number
  weapon: string
  connected: boolean
}

type ServerToClientEvents = {
  roomCreated: (payload: { roomCode: string; playerId: string }) => void
  roomJoined: (payload: { roomCode: string; playerId: string; players: NetworkPlayerState[] }) => void
  playerJoined: (player: NetworkPlayerState) => void
  playerLeft: (payload: { playerId: string }) => void
  roomFull: () => void
  roomNotFound: () => void
  playerStates: (players: NetworkPlayerState[]) => void
}

type ClientToServerEvents = {
  createRoom: () => void
  joinRoom: (roomCode: string) => void
  playerInput: (state: Partial<NetworkPlayerState>) => void
  playerStateUpdate: (state: Partial<NetworkPlayerState>) => void
  leaveRoom: () => void
}

export type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export function createMultiplayerSocket() {
  return io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  }) as MultiplayerSocket
}
