import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import {
  createServerPlayer,
  createServerRoom,
  createShotBullets,
  getGameStateSnapshot,
  tickRoom,
  updatePlayerFromClient,
} from './game/simulation.js'
import type { PlayerShotPayload, ServerPlayer, ServerRoom } from './game/types.js'
import { isWeaponId, serverWeapons } from './game/weapons.js'

const PORT = Number(process.env.PORT) || 3001
const DEFAULT_CLIENT_ORIGINS = ['http://localhost:5173', 'https://zombie.baglini.co']
const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_ORIGIN)
const rooms = new Map<string, ServerRoom>()
const socketRooms = new Map<string, string>()
const lastShotAtBySocket = new Map<string, number>()

const app = express()
app.use(cors({ origin: validateCorsOrigin }))
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: validateCorsOrigin,
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  socket.on('createRoom', () => {
    const roomCode = createRoomCode()
    const player = createServerPlayer(socket.id)
    const room = createServerRoom(roomCode, player)

    rooms.set(roomCode, room)
    socketRooms.set(socket.id, roomCode)
    socket.join(roomCode)

    console.log(`room created ${roomCode} by ${socket.id}`)
    socket.emit('roomCreated', { roomCode, playerId: socket.id })
    socket.emit('roomJoined', {
      roomCode,
      playerId: socket.id,
      players: getPlayers(room),
    })
  })

  socket.on('joinRoom', (rawRoomCode: unknown) => {
    const roomCode = String(rawRoomCode ?? '').trim().toUpperCase()
    const room = rooms.get(roomCode)

    if (!room) {
      console.log(`room not found ${roomCode} for ${socket.id}`)
      socket.emit('roomNotFound')
      return
    }

    if (room.players.size >= 2 && !room.players.has(socket.id)) {
      console.log(`room full ${roomCode} for ${socket.id}`)
      socket.emit('roomFull')
      return
    }

    const player = createServerPlayer(socket.id)
    room.players.set(socket.id, player)
    socketRooms.set(socket.id, roomCode)
    socket.join(roomCode)

    console.log(`player joined ${roomCode}: ${socket.id}`)
    socket.emit('roomJoined', {
      roomCode,
      playerId: socket.id,
      players: getPlayers(room),
    })
    socket.to(roomCode).emit('playerJoined', player)
    io.to(roomCode).emit('playerStates', getPlayers(room))
  })

  socket.on('playerStateUpdate', (state: Partial<ServerPlayer>) => {
    updatePlayerState(socket, state)
  })

  socket.on('playerInput', (state: Partial<ServerPlayer>) => {
    updatePlayerState(socket, state)
  })

  socket.on('playerShoot', (payload: PlayerShotPayload) => {
    handlePlayerShoot(socket, payload)
  })

  socket.on('leaveRoom', () => {
    leaveRoom(socket)
  })

  socket.on('disconnect', () => {
    leaveRoom(socket)
  })
})

setInterval(() => {
  const now = Date.now()

  rooms.forEach((room) => {
    tickRoom(room, now)
    io.to(room.code).emit('gameState', getGameStateSnapshot(room))
  })
}, 50)

httpServer.listen(PORT, () => {
  console.log(`Final Dayz multiplayer server listening on ${PORT}`)
  console.log(`Allowed client origins: ${allowedOrigins.join(', ')}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = ''

    for (let index = 0; index < 5; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }

    if (!rooms.has(code)) {
      return code
    }
  }

  throw new Error('Could not create unique room code')
}

function getSocketRoom(socket: Socket) {
  const roomCode = socketRooms.get(socket.id)
  return roomCode ? rooms.get(roomCode) : undefined
}

function getPlayers(room: ServerRoom) {
  return Array.from(room.players.values())
}

function leaveRoom(socket: Socket) {
  const roomCode = socketRooms.get(socket.id)

  if (!roomCode) {
    return
  }

  const room = rooms.get(roomCode)
  socketRooms.delete(socket.id)
  lastShotAtBySocket.delete(socket.id)
  socket.leave(roomCode)

  if (!room) {
    return
  }

  room.players.delete(socket.id)
  console.log(`player left ${roomCode}: ${socket.id}`)
  socket.to(roomCode).emit('playerLeft', { playerId: socket.id })

  if (room.players.size === 0) {
    rooms.delete(roomCode)
    console.log(`room deleted ${roomCode}`)
    return
  }

  io.to(roomCode).emit('playerStates', getPlayers(room))
}

function updatePlayerState(socket: Socket, state: Partial<ServerPlayer>) {
  const room = getSocketRoom(socket)

  if (!room) {
    return
  }

  const player = room.players.get(socket.id)

  if (!player) {
    return
  }

  updatePlayerFromClient(player, state)

  io.to(room.code).emit('playerStates', getPlayers(room))
}

function handlePlayerShoot(socket: Socket, payload: PlayerShotPayload) {
  const room = getSocketRoom(socket)

  if (!room) {
    return
  }

  const player = room.players.get(socket.id)

  if (!player) {
    return
  }

  const weaponId = isWeaponId(payload.weaponId) ? payload.weaponId : player.weaponId
  const weapon = serverWeapons[weaponId]
  const now = Date.now()
  const lastShotAt = lastShotAtBySocket.get(socket.id) ?? 0
  const minInterval = Math.max(50, weapon.fireRateMs - 20)

  if (now - lastShotAt < minInterval) {
    return
  }

  lastShotAtBySocket.set(socket.id, now)
  const createdBullets = createShotBullets(room, socket.id, payload, now)

  if (!createdBullets) {
    return
  }

  const shotPayload = {
    roomCode: room.code,
    playerId: socket.id,
    x: toNumber(payload.x, player.x),
    y: toNumber(payload.y, player.y),
    aimX: toNumber(payload.aimX, player.aimX),
    aimY: toNumber(payload.aimY, player.aimY),
    rotation: toNumber(payload.rotation, player.rotation),
    weaponId,
    weapon: typeof payload.weapon === 'string' ? payload.weapon : weapon.name,
    timestamp: toNumber(payload.timestamp, now),
  }

  socket.to(room.code).emit('playerShot', shotPayload)
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseAllowedOrigins(value: string | undefined) {
  if (!value) {
    return DEFAULT_CLIENT_ORIGINS
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function validateCorsOrigin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true)
    return
  }

  callback(new Error(`Origin not allowed by CORS: ${origin}`), false)
}
