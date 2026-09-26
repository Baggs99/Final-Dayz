import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { Server, type Socket } from 'socket.io'
import {
  createServerPlayer,
  createServerRoom,
  createShotBullets,
  getGameStateSnapshot,
  getRoomStateSnapshot,
  startRoomCombat,
  tickRoom,
  updateRoomLobbyPhase,
  updatePlayerFromClient,
} from './game/simulation.js'
import type { PlayerShotPayload, ServerPlayer, ServerRoom } from './game/types.js'
import { isWeaponId, serverWeapons } from './game/weapons.js'
import {
  addHighScore,
  ensureHighScoreTable,
  isHighScoreStoreConfigured,
  listHighScores,
  parseHighScorePayload,
} from './highScores.js'

loadLocalEnv()

const PORT = Number(process.env.PORT) || 3001
const DEFAULT_CLIENT_ORIGINS = ['http://localhost:5173', 'https://zombie.baglini.co']
const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_ORIGIN)
const rooms = new Map<string, ServerRoom>()
const socketRooms = new Map<string, string>()
const lastShotAtBySocket = new Map<string, number>()

const app = express()
app.use(cors({ origin: validateCorsOrigin }))
app.use(express.json({ limit: '16kb' }))
app.get('/health', (_req, res) => {
  res.json({ ok: true, highScores: isHighScoreStoreConfigured() })
})
app.get('/high-scores', async (_req, res) => {
  if (!isHighScoreStoreConfigured()) {
    res.status(503).json({ error: 'High scores are not configured', scores: [] })
    return
  }

  try {
    res.json({ scores: await listHighScores() })
  } catch (error) {
    console.error('Failed to load high scores', error)
    res.status(503).json({ error: 'High scores unavailable', scores: [] })
  }
})
app.post('/high-scores', async (req, res) => {
  if (!isHighScoreStoreConfigured()) {
    res.status(503).json({ error: 'High scores are not configured', scores: [] })
    return
  }

  const entry = parseHighScorePayload(req.body)

  if (!entry) {
    res.status(400).json({ error: 'Invalid high score', scores: [] })
    return
  }

  try {
    res.json({ scores: await addHighScore(entry.initials, entry.score) })
  } catch (error) {
    console.error('Failed to save high score', error)
    res.status(503).json({ error: 'High scores unavailable', scores: [] })
  }
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
    emitRoomState(room)
  })

  socket.on('joinRoom', (rawRoomCode: unknown) => {
    const roomCode = String(rawRoomCode ?? '').trim().toUpperCase()
    const room = rooms.get(roomCode)

    if (!room) {
      console.log(`room not found ${roomCode} for ${socket.id}`)
      socket.emit('roomNotFound')
      return
    }

    if (room.players.size >= room.maxPlayers && !room.players.has(socket.id)) {
      console.log(`room full ${roomCode} for ${socket.id}`)
      socket.emit('roomFull')
      return
    }

    const player = createServerPlayer(socket.id)
    room.players.set(socket.id, player)
    updateRoomLobbyPhase(room)
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
    emitRoomState(room)
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

  socket.on('startMultiplayerGame', () => {
    handleStartMultiplayerGame(socket)
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
    if (room.phase === 'fighting' || room.phase === 'waveComplete' || room.phase === 'gameOver') {
      io.to(room.code).emit('gameState', getGameStateSnapshot(room))
    }
  })
}, 50)

httpServer.listen(PORT, () => {
  console.log(`Final Dayz multiplayer server listening on ${PORT}`)
  console.log(`Allowed client origins: ${allowedOrigins.join(', ')}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(
    isHighScoreStoreConfigured()
      ? 'High scores: Postgres-backed /high-scores'
      : 'High scores: DATABASE_URL is not set; /high-scores will return 503',
  )

  if (isHighScoreStoreConfigured()) {
    ensureHighScoreTable()
      .then(() => {
        console.log('High scores table is ready')
      })
      .catch((error) => {
        console.error('Failed to prepare high scores table', error)
      })
  }
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

  if (room.hostId === socket.id) {
    room.hostId = Array.from(room.players.keys())[0]
    console.log(`host promoted ${roomCode}: ${room.hostId}`)
  }

  updateRoomLobbyPhase(room)
  emitRoomState(room)

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

function handleStartMultiplayerGame(socket: Socket) {
  const room = getSocketRoom(socket)

  if (!room) {
    socket.emit('startRejected', { reason: 'Room not found.' })
    return
  }

  if (room.hostId !== socket.id) {
    socket.emit('startRejected', { reason: 'Only the host can start the co-op game.' })
    return
  }

  if (room.players.size < room.maxPlayers) {
    socket.emit('startRejected', { reason: 'Waiting for a second player.' })
    return
  }

  if (room.phase !== 'waitingForPlayers' && room.phase !== 'readyToStart') {
    socket.emit('startRejected', { reason: 'The room cannot be started right now.' })
    return
  }

  const now = Date.now()
  startRoomCombat(room, now)
  tickRoom(room, now)
  console.log(`game started ${room.code} by ${socket.id}`)
  emitRoomState(room)
  io.to(room.code).emit('gameState', getGameStateSnapshot(room))
  console.log(`start broadcast ${room.code}: phase=${room.phase}, players=${room.players.size}`)
}

function emitRoomState(room: ServerRoom) {
  io.to(room.code).emit('roomStateUpdated', getRoomStateSnapshot(room))
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env')

  if (!existsSync(envPath) || typeof process.loadEnvFile !== 'function') {
    return
  }

  try {
    process.loadEnvFile(envPath)
  } catch {
    // Keep process env as-is if the local file cannot be loaded.
  }
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
