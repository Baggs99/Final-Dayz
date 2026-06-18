import { distanceSquared, normalize, toNumber } from './math.js'
import type {
  GameStateSnapshot,
  PlayerShotPayload,
  RoomStateSnapshot,
  ServerBullet,
  ServerPlayer,
  ServerRoom,
  ServerZombie,
} from './types.js'
import { isWeaponId, serverWeapons } from './weapons.js'

const WORLD_WIDTH = 1000
const WORLD_HEIGHT = 700
const PLAYER_RADIUS = 18
const CONTACT_DAMAGE = 8
const CONTACT_COOLDOWN_MS = 650
const SCORE_PER_KILL = 10

let bulletId = 0
let zombieId = 0

export function createServerRoom(code: string, firstPlayer: ServerPlayer): ServerRoom {
  return {
    code,
    hostId: firstPlayer.id,
    maxPlayers: 2,
    phase: 'waitingForPlayers',
    players: new Map([[firstPlayer.id, firstPlayer]]),
    zombies: new Map(),
    bullets: new Map(),
    score: 0,
    wave: 0,
    gameStarted: false,
    gameOver: false,
    lastTick: Date.now(),
    nextWaveAt: Number.POSITIVE_INFINITY,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
  }
}

export function createServerPlayer(id: string): ServerPlayer {
  return {
    id,
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    rotation: 0,
    aimX: WORLD_WIDTH / 2 + 1,
    aimY: WORLD_HEIGHT / 2,
    weaponId: 'pistol',
    weapon: 'Pistol',
    connected: true,
    health: 100,
    alive: true,
    lastDamagedAt: 0,
  }
}

export function updatePlayerFromClient(player: ServerPlayer, state: Partial<ServerPlayer>) {
  player.x = toNumber(state.x, player.x)
  player.y = toNumber(state.y, player.y)
  player.rotation = toNumber(state.rotation, player.rotation)
  player.aimX = toNumber(state.aimX, player.aimX)
  player.aimY = toNumber(state.aimY, player.aimY)
  player.weaponId = isWeaponId(state.weaponId) ? state.weaponId : player.weaponId
  player.weapon = typeof state.weapon === 'string' ? state.weapon : serverWeapons[player.weaponId].name
  player.connected = true
}

export function tickRoom(room: ServerRoom, now: number) {
  if (room.phase !== 'fighting' || !room.gameStarted || room.gameOver) {
    room.lastTick = now
    return
  }

  const deltaSeconds = Math.min((now - room.lastTick) / 1000, 0.1)
  room.lastTick = now

  maybeStartNextWave(room, now)
  moveBullets(room, now, deltaSeconds)
  moveZombies(room, now, deltaSeconds)
  const hadZombies = room.zombies.size > 0
  handleBulletZombieCollisions(room)
  if (hadZombies && room.zombies.size === 0) {
    room.nextWaveAt = now + 2500
  }
  checkGameOver(room)
}

export function createShotBullets(room: ServerRoom, playerId: string, payload: PlayerShotPayload, now: number) {
  const player = room.players.get(playerId)

  if (!player || !player.alive || room.phase !== 'fighting' || room.gameOver) {
    return false
  }

  const weaponId = isWeaponId(payload.weaponId) ? payload.weaponId : player.weaponId
  const weapon = serverWeapons[weaponId]
  const baseX = toNumber(payload.x, player.x)
  const baseY = toNumber(payload.y, player.y)
  const aimX = toNumber(payload.aimX, player.aimX)
  const aimY = toNumber(payload.aimY, player.aimY)
  const direction = normalize(aimX - baseX, aimY - baseY)

  if (direction.x === 0 && direction.y === 0) {
    return false
  }

  const baseAngle = Math.atan2(direction.y, direction.x)
  const spreadRadians = (weapon.spreadDegrees * Math.PI) / 180
  const firstShotOffset = weapon.bulletsPerShot > 1 ? -spreadRadians / 2 : 0
  const angleStep = weapon.bulletsPerShot > 1 ? spreadRadians / (weapon.bulletsPerShot - 1) : 0

  for (let index = 0; index < weapon.bulletsPerShot; index += 1) {
    const shotAngle = baseAngle + firstShotOffset + angleStep * index
    const dx = Math.cos(shotAngle)
    const dy = Math.sin(shotAngle)
    const spawnOffset = 30
    const bullet: ServerBullet = {
      id: `b${bulletId += 1}`,
      ownerId: playerId,
      x: baseX + dx * spawnOffset,
      y: baseY + dy * spawnOffset,
      vx: dx * weapon.bulletSpeed,
      vy: dy * weapon.bulletSpeed,
      damage: weapon.damage,
      createdAt: now,
      lifespanMs: 900,
      radius: 5,
    }

    room.bullets.set(bullet.id, bullet)
  }

  return true
}

export function getGameStateSnapshot(room: ServerRoom): GameStateSnapshot {
  return {
    roomCode: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: Array.from(room.players.values()),
    zombies: Array.from(room.zombies.values()),
    bullets: Array.from(room.bullets.values()),
    score: room.score,
    wave: room.wave,
    gameOver: room.gameOver,
  }
}

export function getRoomStateSnapshot(room: ServerRoom): RoomStateSnapshot {
  return {
    roomCode: room.code,
    phase: room.phase,
    players: Array.from(room.players.values()),
    playerCount: room.players.size,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
  }
}

export function updateRoomLobbyPhase(room: ServerRoom) {
  if (room.phase === 'fighting' || room.phase === 'shopping' || room.phase === 'gameOver') {
    return
  }

  room.phase = room.players.size >= room.maxPlayers ? 'readyToStart' : 'waitingForPlayers'
}

export function startRoomCombat(room: ServerRoom, now: number) {
  room.phase = 'fighting'
  room.gameStarted = true
  room.gameOver = false
  room.score = 0
  room.wave = 0
  room.zombies.clear()
  room.bullets.clear()
  room.nextWaveAt = now
  room.lastTick = now

  room.players.forEach((player) => {
    player.health = 100
    player.alive = true
    player.lastDamagedAt = 0
  })
}

function maybeStartNextWave(room: ServerRoom, now: number) {
  if (room.zombies.size > 0 || now < room.nextWaveAt) {
    return
  }

  room.wave += 1
  const count = 4 + room.wave * 3
  const health = 55 + room.wave * 10
  const speed = 48 + room.wave * 4

  for (let index = 0; index < count; index += 1) {
    const zombie = createZombie(room, health, speed)
    room.zombies.set(zombie.id, zombie)
  }
}

function createZombie(room: ServerRoom, health: number, speed: number): ServerZombie {
  const edge = Math.floor(Math.random() * 4)
  const margin = 40
  let x = 0
  let y = 0

  if (edge === 0) {
    x = Math.random() * room.worldWidth
    y = -margin
  } else if (edge === 1) {
    x = room.worldWidth + margin
    y = Math.random() * room.worldHeight
  } else if (edge === 2) {
    x = Math.random() * room.worldWidth
    y = room.worldHeight + margin
  } else {
    x = -margin
    y = Math.random() * room.worldHeight
  }

  return {
    id: `z${zombieId += 1}`,
    x,
    y,
    health,
    maxHealth: health,
    speed,
    radius: 17,
  }
}

function moveBullets(room: ServerRoom, now: number, deltaSeconds: number) {
  room.bullets.forEach((bullet) => {
    bullet.x += bullet.vx * deltaSeconds
    bullet.y += bullet.vy * deltaSeconds

    const expired = now - bullet.createdAt > bullet.lifespanMs
    const outOfBounds =
      bullet.x < -80 ||
      bullet.x > room.worldWidth + 80 ||
      bullet.y < -80 ||
      bullet.y > room.worldHeight + 80

    if (expired || outOfBounds) {
      room.bullets.delete(bullet.id)
    }
  })
}

function moveZombies(room: ServerRoom, now: number, deltaSeconds: number) {
  const alivePlayers = Array.from(room.players.values()).filter((player) => player.alive)

  if (alivePlayers.length === 0) {
    return
  }

  room.zombies.forEach((zombie) => {
    const target = getNearestPlayer(zombie, alivePlayers)

    if (!target) {
      return
    }

    const direction = normalize(target.x - zombie.x, target.y - zombie.y)
    zombie.x += direction.x * zombie.speed * deltaSeconds
    zombie.y += direction.y * zombie.speed * deltaSeconds

    const contactRadius = zombie.radius + PLAYER_RADIUS

    if (distanceSquared(zombie.x, zombie.y, target.x, target.y) <= contactRadius * contactRadius) {
      damagePlayer(target, now)
    }
  })
}

function getNearestPlayer(zombie: ServerZombie, players: ServerPlayer[]) {
  return players
    .slice()
    .sort((a, b) => distanceSquared(zombie.x, zombie.y, a.x, a.y) - distanceSquared(zombie.x, zombie.y, b.x, b.y))[0]
}

function damagePlayer(player: ServerPlayer, now: number) {
  if (now - player.lastDamagedAt < CONTACT_COOLDOWN_MS) {
    return
  }

  player.lastDamagedAt = now
  player.health = Math.max(0, player.health - CONTACT_DAMAGE)
  player.alive = player.health > 0
}

function handleBulletZombieCollisions(room: ServerRoom) {
  room.bullets.forEach((bullet) => {
    for (const zombie of room.zombies.values()) {
      const hitRadius = bullet.radius + zombie.radius

      if (distanceSquared(bullet.x, bullet.y, zombie.x, zombie.y) > hitRadius * hitRadius) {
        continue
      }

      zombie.health -= bullet.damage
      room.bullets.delete(bullet.id)

      if (zombie.health <= 0) {
        room.zombies.delete(zombie.id)
        room.score += SCORE_PER_KILL
      }

      break
    }
  })

}

function checkGameOver(room: ServerRoom) {
  const players = Array.from(room.players.values())

  if (players.length > 0 && players.every((player) => !player.alive)) {
    room.gameOver = true
    room.phase = 'gameOver'
  }
}
