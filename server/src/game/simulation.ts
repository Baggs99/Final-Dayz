import { distanceSquared, normalize, toNumber } from './math.js'
import type {
  GameStateSnapshot,
  PlayerShotPayload,
  ServerBarricade,
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
const DEBUG_MULTIPLAYER_SIM = false
const ZOMBIE_WAYPOINT_TOLERANCE = 34
const STUCK_CHECK_INTERVAL_MS = 500
const STUCK_DISTANCE_THRESHOLD = 8
const BARRICADE_MAX_HEALTH = 140
const BARRICADE_ATTACK_DAMAGE = 18
const BARRICADE_ATTACK_COOLDOWN_MS = 700
const BASE = {
  x: WORLD_WIDTH / 2 - 280,
  y: WORLD_HEIGHT / 2 - 190,
  width: 560,
  height: 380,
  wallThickness: 18,
  gap: 110,
}

let bulletId = 0
let zombieId = 0

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }
type EntryGeometry = {
  id: 'top' | 'bottom' | 'left' | 'right'
  outsidePoint: Point
  doorwayPoint: Point
  insidePoint: Point
  attackZone: Rect
  barricadeRect: Rect
}

const entryGeometries = createEntryGeometries()
const wallRects = createWallRects()

export function createServerRoom(code: string, firstPlayer: ServerPlayer): ServerRoom {
  return {
    code,
    hostId: firstPlayer.id,
    maxPlayers: 2,
    phase: 'waitingForPlayers',
    players: new Map([[firstPlayer.id, firstPlayer]]),
    barricades: createBarricades(),
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
  if (!room.gameStarted || room.gameOver) {
    room.lastTick = now
    return
  }

  if (room.phase === 'waveComplete') {
    if (now >= room.nextWaveAt) {
      startNextWave(room, now)
    }

    room.lastTick = now
    return
  }

  if (room.phase !== 'fighting') {
    room.lastTick = now
    return
  }

  const deltaSeconds = Math.min((now - room.lastTick) / 1000, 0.1)
  room.lastTick = now

  if (room.zombies.size === 0 && now >= room.nextWaveAt) {
    startNextWave(room, now)
  }

  moveBullets(room, now, deltaSeconds)
  moveZombies(room, now, deltaSeconds)
  handleBulletZombieCollisions(room)

  if (isWaveCleared(room)) {
    completeWave(room, now)
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
    barricades: Array.from(room.barricades.values()),
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
  room.barricades = createBarricades()
  room.nextWaveAt = now
  room.lastTick = now

  room.players.forEach((player) => {
    player.health = 100
    player.alive = true
    player.lastDamagedAt = 0
  })
}

function startNextWave(room: ServerRoom, now: number) {
  room.wave += 1
  room.phase = 'fighting'
  room.nextWaveAt = Number.POSITIVE_INFINITY
  room.bullets.clear()
  const count = 4 + room.wave * 3
  const health = 55 + room.wave * 10
  const speed = 48 + room.wave * 4

  if (DEBUG_MULTIPLAYER_SIM) {
    console.log(`wave started room=${room.code} wave=${room.wave} zombies=${count}`)
  }

  for (let index = 0; index < count; index += 1) {
    const zombie = createZombie(room, health, speed)
    room.zombies.set(zombie.id, zombie)

    if (DEBUG_MULTIPLAYER_SIM) {
      console.log(`zombie spawned ${zombie.id} ${Math.round(zombie.x)},${Math.round(zombie.y)}`)
    }
  }
}

function isWaveCleared(room: ServerRoom) {
  return room.phase === 'fighting' && room.zombies.size === 0 && room.nextWaveAt === Number.POSITIVE_INFINITY
}

function completeWave(room: ServerRoom, now: number) {
  room.phase = 'waveComplete'
  room.nextWaveAt = now + 3000
  room.bullets.clear()

  if (DEBUG_MULTIPLAYER_SIM) {
    console.log(`wave cleared room=${room.code} wave=${room.wave}; next wave at ${room.nextWaveAt}`)
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
    navState: 'chasingDirect',
    lastAttackAt: 0,
    lastStuckCheckAt: 0,
    lastStuckX: x,
    lastStuckY: y,
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

    zombie.targetPlayerId = target.id
    const targetPoint = getZombieMoveTarget(room, zombie, target, now)

    if (!targetPoint) {
      updateZombieStuckState(room, zombie, target, now)
      return
    }

    moveZombieToward(room, zombie, targetPoint, deltaSeconds)
    updateZombieStuckState(room, zombie, target, now)

    const contactRadius = zombie.radius + PLAYER_RADIUS

    if (distanceSquared(zombie.x, zombie.y, target.x, target.y) <= contactRadius * contactRadius) {
      damagePlayer(target, now)
    }
  })
}

function getZombieMoveTarget(room: ServerRoom, zombie: ServerZombie, target: ServerPlayer, now: number): Point | undefined {
  const zombieInside = isInsideBase(zombie.x, zombie.y)
  const playerInside = isInsideBase(target.x, target.y)

  if (zombieInside && playerInside) {
    setZombieTarget(zombie, 'chasingDirect', target)
    return target
  }

  if (!zombieInside && !playerInside) {
    if (lineIntersectsBase(zombie.x, zombie.y, target.x, target.y)) {
      const waypoint = getExteriorWaypointAroundBase(zombie.x, zombie.y, target.x, target.y)
      setZombieTarget(zombie, 'routingToDoorway', waypoint)
      return waypoint
    }

    setZombieTarget(zombie, 'chasingDirect', target)
    return target
  }

  const direction = zombieInside ? 'insideToOutside' : 'outsideToInside'
  const openEntry = getNearestOpenEntry(room, zombie, direction)

  if (openEntry) {
    const routeTarget = getRouteTarget(zombie, openEntry, direction)
    zombie.targetDoorwayId = openEntry.id
    zombie.targetEntryId = undefined
    setZombieTarget(zombie, 'routingToDoorway', getSafeExteriorTarget(zombie, routeTarget))
    return zombie.currentTargetPoint
  }

  const barricadeEntry = getNearestAliveEntry(room, zombie, direction)

  if (!barricadeEntry) {
    return undefined
  }

  const attackPoint = direction === 'outsideToInside' ? barricadeEntry.outsidePoint : barricadeEntry.insidePoint

  zombie.targetEntryId = barricadeEntry.id
  zombie.targetDoorwayId = undefined

  if (isInBarricadeAttackRange(zombie, barricadeEntry)) {
    attackBarricade(room, zombie, barricadeEntry.id, now)
    return undefined
  }

  setZombieTarget(zombie, 'movingToBarricade', getSafeExteriorTarget(zombie, attackPoint))
  return zombie.currentTargetPoint
}

function moveZombieToward(room: ServerRoom, zombie: ServerZombie, target: Point, deltaSeconds: number) {
  const direction = normalize(target.x - zombie.x, target.y - zombie.y)
  const nextX = zombie.x + direction.x * zombie.speed * deltaSeconds
  const nextY = zombie.y + direction.y * zombie.speed * deltaSeconds

  if (canMoveTo(room, zombie, nextX, nextY)) {
    zombie.x = nextX
    zombie.y = nextY
    return
  }

  const canMoveX = canMoveTo(room, zombie, nextX, zombie.y)
  const canMoveY = canMoveTo(room, zombie, zombie.x, nextY)

  if (canMoveX || canMoveY) {
    if (canMoveX) {
      zombie.x = nextX
    }

    if (canMoveY) {
      zombie.y = nextY
    }

    return
  }

  zombie.navState = 'stuck'

  if (DEBUG_MULTIPLAYER_SIM) {
      console.log(`zombie blocked ${zombie.id} at ${Math.round(nextX)},${Math.round(nextY)}`)
  }
}

function getRouteTarget(
  zombie: ServerZombie,
  entry: EntryGeometry,
  direction: 'outsideToInside' | 'insideToOutside',
): Point {
  const route = direction === 'outsideToInside'
    ? [entry.outsidePoint, entry.doorwayPoint, entry.insidePoint]
    : [entry.insidePoint, entry.doorwayPoint, entry.outsidePoint]

  return route.find((point) => !isNearPoint(zombie, point, ZOMBIE_WAYPOINT_TOLERANCE)) ?? route[route.length - 1]
}

function getNearestOpenEntry(room: ServerRoom, zombie: ServerZombie, direction: 'outsideToInside' | 'insideToOutside') {
  const entries = entryGeometries.filter((entry) => !room.barricades.get(entry.id)?.health)
  const startPoint = (entry: EntryGeometry) => (direction === 'outsideToInside' ? entry.outsidePoint : entry.insidePoint)

  return entries.sort(
    (a, b) =>
      distanceSquared(zombie.x, zombie.y, startPoint(a).x, startPoint(a).y) -
      distanceSquared(zombie.x, zombie.y, startPoint(b).x, startPoint(b).y),
  )[0]
}

function getNearestAliveEntry(room: ServerRoom, zombie: ServerZombie, direction: 'outsideToInside' | 'insideToOutside') {
  const entries = entryGeometries.filter((entry) => (room.barricades.get(entry.id)?.health ?? 0) > 0)
  const startPoint = (entry: EntryGeometry) => (direction === 'outsideToInside' ? entry.outsidePoint : entry.insidePoint)

  return entries.sort(
    (a, b) =>
      distanceSquared(zombie.x, zombie.y, startPoint(a).x, startPoint(a).y) -
      distanceSquared(zombie.x, zombie.y, startPoint(b).x, startPoint(b).y),
  )[0]
}

function attackBarricade(room: ServerRoom, zombie: ServerZombie, entryId: EntryGeometry['id'], now: number) {
  const barricade = room.barricades.get(entryId)

  if (!barricade || barricade.health <= 0 || now - zombie.lastAttackAt < BARRICADE_ATTACK_COOLDOWN_MS) {
    return
  }

  zombie.navState = 'attackingBarricade'
  zombie.lastAttackAt = now
  barricade.health = Math.max(0, barricade.health - BARRICADE_ATTACK_DAMAGE)

  if (DEBUG_MULTIPLAYER_SIM) {
    console.log(`zombie damaged ${entryId} barricade: ${barricade.health}/${barricade.maxHealth}`)
  }

  if (barricade.health === 0 && DEBUG_MULTIPLAYER_SIM) {
    console.log(`barricade destroyed ${entryId}; doorway open`)
  }
}

function setZombieTarget(zombie: ServerZombie, navState: ServerZombie['navState'], point: Point) {
  zombie.navState = navState
  zombie.currentTargetPoint = { x: point.x, y: point.y }
}

function getSafeExteriorTarget(zombie: ServerZombie, target: Point): Point {
  if (!isInsideBase(zombie.x, zombie.y) && !isInsideBase(target.x, target.y) && lineIntersectsBase(zombie.x, zombie.y, target.x, target.y)) {
    return getExteriorWaypointAroundBase(zombie.x, zombie.y, target.x, target.y)
  }

  return target
}

function isInBarricadeAttackRange(zombie: ServerZombie, entry: EntryGeometry) {
  const expanded = expandRect(entry.barricadeRect, 76)
  return rectangleContains(expanded, zombie.x, zombie.y) ||
    rectangleContains(entry.attackZone, zombie.x, zombie.y) ||
    isNearPoint(zombie, entry.outsidePoint, 78) ||
    isNearPoint(zombie, entry.insidePoint, 78)
}

function updateZombieStuckState(room: ServerRoom, zombie: ServerZombie, target: ServerPlayer, now: number) {
  if (zombie.navState === 'attackingBarricade') {
    zombie.lastStuckCheckAt = now
    zombie.lastStuckX = zombie.x
    zombie.lastStuckY = zombie.y
    return
  }

  if (zombie.lastStuckCheckAt === 0) {
    zombie.lastStuckCheckAt = now
    zombie.lastStuckX = zombie.x
    zombie.lastStuckY = zombie.y
    return
  }

  if (now - zombie.lastStuckCheckAt < STUCK_CHECK_INTERVAL_MS) {
    return
  }

  const moved = Math.sqrt(distanceSquared(zombie.x, zombie.y, zombie.lastStuckX, zombie.lastStuckY))
  zombie.lastStuckCheckAt = now
  zombie.lastStuckX = zombie.x
  zombie.lastStuckY = zombie.y

  if (moved >= STUCK_DISTANCE_THRESHOLD) {
    return
  }

  zombie.navState = 'stuck'

  const nearbyEntry = entryGeometries.find((entry) => {
    const barricade = room.barricades.get(entry.id)
    return (barricade?.health ?? 0) > 0 && isInBarricadeAttackRange(zombie, entry)
  })

  if (nearbyEntry) {
    attackBarricade(room, zombie, nearbyEntry.id, now)
    return
  }

  if (DEBUG_MULTIPLAYER_SIM) {
    console.log(`zombie stuck ${zombie.id}; recomputing toward ${target.id}`)
  }
}

function createBarricades() {
  return new Map<EntryGeometry['id'], ServerBarricade>(
    entryGeometries.map((entry) => [
      entry.id,
      {
        id: entry.id,
        health: BARRICADE_MAX_HEALTH,
        maxHealth: BARRICADE_MAX_HEALTH,
      },
    ]),
  )
}

function createWallRects(): Rect[] {
  const centerX = WORLD_WIDTH / 2
  const centerY = WORLD_HEIGHT / 2
  const roomWidth = BASE.width
  const roomHeight = BASE.height
  const gap = BASE.gap
  const wallThickness = BASE.wallThickness

  return [
    rectFromCenter(centerX - roomWidth / 4 - gap / 4, centerY - roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness),
    rectFromCenter(centerX + roomWidth / 4 + gap / 4, centerY - roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness),
    rectFromCenter(centerX - roomWidth / 4 - gap / 4, centerY + roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness),
    rectFromCenter(centerX + roomWidth / 4 + gap / 4, centerY + roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness),
    rectFromCenter(centerX - roomWidth / 2, centerY - roomHeight / 4 - gap / 4, wallThickness, roomHeight / 2 - gap / 2),
    rectFromCenter(centerX - roomWidth / 2, centerY + roomHeight / 4 + gap / 4, wallThickness, roomHeight / 2 - gap / 2),
    rectFromCenter(centerX + roomWidth / 2, centerY - roomHeight / 4 - gap / 4, wallThickness, roomHeight / 2 - gap / 2),
    rectFromCenter(centerX + roomWidth / 2, centerY + roomHeight / 4 + gap / 4, wallThickness, roomHeight / 2 - gap / 2),
  ]
}

function createEntryGeometries(): EntryGeometry[] {
  const centerX = WORLD_WIDTH / 2
  const centerY = WORLD_HEIGHT / 2
  const roomWidth = BASE.width
  const roomHeight = BASE.height
  const approachOffset = 70
  const insideOffset = 56
  const attackDepth = 84
  const attackWidth = 150

  return [
    {
      id: 'top',
      outsidePoint: { x: centerX, y: centerY - roomHeight / 2 - approachOffset },
      doorwayPoint: { x: centerX, y: centerY - roomHeight / 2 },
      insidePoint: { x: centerX, y: centerY - roomHeight / 2 + insideOffset },
      attackZone: { x: centerX - attackWidth / 2, y: centerY - roomHeight / 2 - attackDepth, width: attackWidth, height: attackDepth + 24 },
      barricadeRect: rectFromCenter(centerX, centerY - roomHeight / 2, 96, 18),
    },
    {
      id: 'bottom',
      outsidePoint: { x: centerX, y: centerY + roomHeight / 2 + approachOffset },
      doorwayPoint: { x: centerX, y: centerY + roomHeight / 2 },
      insidePoint: { x: centerX, y: centerY + roomHeight / 2 - insideOffset },
      attackZone: { x: centerX - attackWidth / 2, y: centerY + roomHeight / 2 - 24, width: attackWidth, height: attackDepth + 24 },
      barricadeRect: rectFromCenter(centerX, centerY + roomHeight / 2, 96, 18),
    },
    {
      id: 'left',
      outsidePoint: { x: centerX - roomWidth / 2 - approachOffset, y: centerY },
      doorwayPoint: { x: centerX - roomWidth / 2, y: centerY },
      insidePoint: { x: centerX - roomWidth / 2 + insideOffset, y: centerY },
      attackZone: { x: centerX - roomWidth / 2 - attackDepth, y: centerY - attackWidth / 2, width: attackDepth + 24, height: attackWidth },
      barricadeRect: rectFromCenter(centerX - roomWidth / 2, centerY, 18, 96),
    },
    {
      id: 'right',
      outsidePoint: { x: centerX + roomWidth / 2 + approachOffset, y: centerY },
      doorwayPoint: { x: centerX + roomWidth / 2, y: centerY },
      insidePoint: { x: centerX + roomWidth / 2 - insideOffset, y: centerY },
      attackZone: { x: centerX + roomWidth / 2 - 24, y: centerY - attackWidth / 2, width: attackDepth + 24, height: attackWidth },
      barricadeRect: rectFromCenter(centerX + roomWidth / 2, centerY, 18, 96),
    },
  ]
}

function rectFromCenter(centerX: number, centerY: number, width: number, height: number): Rect {
  return { x: centerX - width / 2, y: centerY - height / 2, width, height }
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

function isInsideBase(x: number, y: number) {
  return x > BASE.x + BASE.wallThickness && x < BASE.x + BASE.width - BASE.wallThickness &&
    y > BASE.y + BASE.wallThickness && y < BASE.y + BASE.height - BASE.wallThickness
}

function lineIntersectsBase(fromX: number, fromY: number, toX: number, toY: number) {
  const padding = 44
  const rect = {
    x: BASE.x - padding,
    y: BASE.y - padding,
    width: BASE.width + padding * 2,
    height: BASE.height + padding * 2,
  }

  return lineIntersectsRect(fromX, fromY, toX, toY, rect)
}

function getExteriorWaypointAroundBase(fromX: number, fromY: number, toX: number, toY: number): Point {
  const padding = 72
  const corners = [
    { x: BASE.x - padding, y: BASE.y - padding },
    { x: BASE.x + BASE.width + padding, y: BASE.y - padding },
    { x: BASE.x - padding, y: BASE.y + BASE.height + padding },
    { x: BASE.x + BASE.width + padding, y: BASE.y + BASE.height + padding },
  ]

  return corners.sort(
    (a, b) =>
      distanceSquared(fromX, fromY, a.x, a.y) + distanceSquared(a.x, a.y, toX, toY) -
      (distanceSquared(fromX, fromY, b.x, b.y) + distanceSquared(b.x, b.y, toX, toY)),
  )[0]
}

function isSolidAt(room: ServerRoom, x: number, y: number, radius: number) {
  if (wallRects.some((rect) => circleIntersectsRect(x, y, radius, rect))) {
    return true
  }

  return entryGeometries.some((entry) => {
    const barricade = room.barricades.get(entry.id)
    return (barricade?.health ?? 0) > 0 && circleIntersectsRect(x, y, radius, entry.barricadeRect)
  })
}

function canMoveTo(room: ServerRoom, zombie: ServerZombie, x: number, y: number) {
  return !isSolidAt(room, x, y, zombie.radius)
}

function isNearPoint(point: Point, target: Point, tolerance: number) {
  return distanceSquared(point.x, point.y, target.x, target.y) <= tolerance * tolerance
}

function rectangleContains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

function circleIntersectsRect(circleX: number, circleY: number, radius: number, rect: Rect) {
  const closestX = Math.max(rect.x, Math.min(circleX, rect.x + rect.width))
  const closestY = Math.max(rect.y, Math.min(circleY, rect.y + rect.height))

  return distanceSquared(circleX, circleY, closestX, closestY) <= radius * radius
}

function lineIntersectsRect(fromX: number, fromY: number, toX: number, toY: number, rect: Rect) {
  if (rectangleContains(rect, fromX, fromY) || rectangleContains(rect, toX, toY)) {
    return true
  }

  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height

  return lineSegmentsIntersect(fromX, fromY, toX, toY, left, top, right, top) ||
    lineSegmentsIntersect(fromX, fromY, toX, toY, right, top, right, bottom) ||
    lineSegmentsIntersect(fromX, fromY, toX, toY, right, bottom, left, bottom) ||
    lineSegmentsIntersect(fromX, fromY, toX, toY, left, bottom, left, top)
}

function lineSegmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)

  if (denominator === 0) {
    return false
  }

  const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denominator
  const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / denominator

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
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
