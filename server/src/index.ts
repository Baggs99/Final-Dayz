import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import { Server, type Socket } from 'socket.io'

type PlayerState = {
  id: string
  x: number
  y: number
  rotation: number
  aimX: number
  aimY: number
  weapon: string
  connected: boolean
}

type Room = {
  code: string
  players: Map<string, PlayerState>
}

const PORT = Number(process.env.PORT) || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const rooms = new Map<string, Room>()
const socketRooms = new Map<string, string>()

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN }))
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  socket.on('createRoom', () => {
    const roomCode = createRoomCode()
    const player = createPlayerState(socket.id)
    const room: Room = {
      code: roomCode,
      players: new Map([[socket.id, player]]),
    }

    rooms.set(roomCode, room)
    socketRooms.set(socket.id, roomCode)
    socket.join(roomCode)

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
      socket.emit('roomNotFound')
      return
    }

    if (room.players.size >= 2 && !room.players.has(socket.id)) {
      socket.emit('roomFull')
      return
    }

    const player = createPlayerState(socket.id)
    room.players.set(socket.id, player)
    socketRooms.set(socket.id, roomCode)
    socket.join(roomCode)

    socket.emit('roomJoined', {
      roomCode,
      playerId: socket.id,
      players: getPlayers(room),
    })
    socket.to(roomCode).emit('playerJoined', player)
    io.to(roomCode).emit('playerStates', getPlayers(room))
  })

  socket.on('playerStateUpdate', (state: Partial<PlayerState>) => {
    updatePlayerState(socket, state)
  })

  socket.on('playerInput', (state: Partial<PlayerState>) => {
    updatePlayerState(socket, state)
  })

  socket.on('leaveRoom', () => {
    leaveRoom(socket)
  })

  socket.on('disconnect', () => {
    leaveRoom(socket)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Final Dayz multiplayer server listening on ${PORT}`)
})

function createPlayerState(id: string): PlayerState {
  return {
    id,
    x: 0,
    y: 0,
    rotation: 0,
    aimX: 0,
    aimY: 0,
    weapon: 'Pistol',
    connected: true,
  }
}

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

function getPlayers(room: Room) {
  return Array.from(room.players.values())
}

function leaveRoom(socket: Socket) {
  const roomCode = socketRooms.get(socket.id)

  if (!roomCode) {
    return
  }

  const room = rooms.get(roomCode)
  socketRooms.delete(socket.id)
  socket.leave(roomCode)

  if (!room) {
    return
  }

  room.players.delete(socket.id)
  socket.to(roomCode).emit('playerLeft', { playerId: socket.id })

  if (room.players.size === 0) {
    rooms.delete(roomCode)
    return
  }

  io.to(roomCode).emit('playerStates', getPlayers(room))
}

function updatePlayerState(socket: Socket, state: Partial<PlayerState>) {
  const room = getSocketRoom(socket)

  if (!room) {
    return
  }

  const player = room.players.get(socket.id)

  if (!player) {
    return
  }

  player.x = toNumber(state.x, player.x)
  player.y = toNumber(state.y, player.y)
  player.rotation = toNumber(state.rotation, player.rotation)
  player.aimX = toNumber(state.aimX, player.aimX)
  player.aimY = toNumber(state.aimY, player.aimY)
  player.weapon = typeof state.weapon === 'string' ? state.weapon : player.weapon
  player.connected = true

  io.to(room.code).emit('playerStates', getPlayers(room))
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
