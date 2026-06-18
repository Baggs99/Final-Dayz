import Phaser from 'phaser'
import { barricadeConfig } from '../config/barricades'
import { shopConfig, shopUpgradeConfig, shopWeaponUnlocks, type ShopItemId } from '../config/shop'
import { waveConfig } from '../config/waves'
import { defaultWeaponId, type WeaponConfig, type WeaponId, weapons } from '../config/weapons'
import Barricade from '../entities/Barricade'
import Bullet from '../entities/Bullet'
import Player from '../entities/Player'
import Zombie from '../entities/Zombie'
import {
  createMultiplayerSocket,
  getSocketServerUrl,
  type MultiplayerConnectionStatus,
  type NetworkBulletState,
  type NetworkGameState,
  type MultiplayerSocket,
  type NetworkBarricadeState,
  type NetworkPlayerState,
  type NetworkRoomState,
  type NetworkZombieState,
  type PlayerShotPayload,
} from '../network/socketClient'

const DEBUG_BARRICADE_ATTACKS = false
const DEBUG_NAV = false
const DEBUG_MULTIPLAYER = true

type WasdKeys = {
  W: Phaser.Input.Keyboard.Key
  A: Phaser.Input.Keyboard.Key
  S: Phaser.Input.Keyboard.Key
  D: Phaser.Input.Keyboard.Key
  ONE: Phaser.Input.Keyboard.Key
  TWO: Phaser.Input.Keyboard.Key
  THREE: Phaser.Input.Keyboard.Key
  E: Phaser.Input.Keyboard.Key
  ENTER: Phaser.Input.Keyboard.Key
}

type EntryPointId = 'top' | 'bottom' | 'left' | 'right'
type BaseZone = 'inside' | 'outside'

type EntryPoint = {
  id: EntryPointId
  barricade: Barricade
  outsidePoint: Phaser.Math.Vector2
  doorwayPoint: Phaser.Math.Vector2
  insidePoint: Phaser.Math.Vector2
  attackZone: Phaser.Geom.Rectangle
}

type GridCell = {
  x: number
  y: number
}

type GameMode = 'singlePlayer' | 'multiplayer'

type RemotePlayerView = {
  sprite: Phaser.GameObjects.Sprite
  aimLine: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

type ServerZombieView = {
  sprite: Phaser.GameObjects.Sprite
  healthBarBg: Phaser.GameObjects.Rectangle
  healthBarFill: Phaser.GameObjects.Rectangle
}

export default class GameScene extends Phaser.Scene {
  private player!: Player
  private bullets!: Phaser.Physics.Arcade.Group
  private zombies!: Phaser.Physics.Arcade.Group
  private walls!: Phaser.Physics.Arcade.StaticGroup
  private keys!: WasdKeys
  private wallRects: Phaser.GameObjects.Rectangle[] = []
  private barricades: Barricade[] = []
  private entryPoints: EntryPoint[] = []
  private shopButtons: Phaser.GameObjects.Text[] = []
  private baseBounds!: Phaser.Geom.Rectangle

  private healthFill!: Phaser.GameObjects.Rectangle
  private healthText!: Phaser.GameObjects.Text
  private waveText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private cashText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private ownedWeaponsText!: Phaser.GameObjects.Text
  private barricadeText!: Phaser.GameObjects.Text
  private multiplayerText!: Phaser.GameObjects.Text
  private messageText!: Phaser.GameObjects.Text
  private repairHintText!: Phaser.GameObjects.Text
  private pauseButton!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private pauseOverlay?: Phaser.GameObjects.Text
  private startOverlay?: Phaser.GameObjects.Container
  private lobbyOverlay?: Phaser.GameObjects.Container
  private lobbyRoomCodeText?: Phaser.GameObjects.Text
  private lobbyPlayersText?: Phaser.GameObjects.Text
  private lobbyStatusText?: Phaser.GameObjects.Text
  private lobbyStartButton?: Phaser.GameObjects.Text
  private shopOverlay?: Phaser.GameObjects.Container
  private gameOverText?: Phaser.GameObjects.Text
  private restartText?: Phaser.GameObjects.Text

  private wave = 0
  private score = 0
  private cash = 0
  private currentWeaponId: WeaponId = defaultWeaponId
  private ownedWeapons = new Set<WeaponId>([defaultWeaponId])
  private damageBonus = 0
  private zombiesToSpawn = 0
  private spawnDelay = 900
  private lastShotAt = 0
  private lastContactDamageAt = 0
  private elapsedMs = 0
  private lastTimerUpdate = 0
  private messageTimer?: Phaser.Time.TimerEvent
  private waveSpawnTimer?: Phaser.Time.TimerEvent
  private isIntermission = false
  private isStarted = false
  private isPaused = false
  private isGameOver = false
  private gameMode: GameMode = 'singlePlayer'
  private multiplayerSocket?: MultiplayerSocket
  private localPlayerId?: string
  private activeRoomCode?: string
  private remotePlayers = new Map<string, RemotePlayerView>()
  private serverZombies = new Map<string, ServerZombieView>()
  private serverBullets = new Map<string, Phaser.GameObjects.Sprite>()
  private lastNetworkSendAt = 0
  private multiplayerStatusText?: Phaser.GameObjects.Text
  private multiplayerConnectionStatus: MultiplayerConnectionStatus = 'disconnected'
  private lastPlayerZone: BaseZone = 'inside'
  private navCellSize = 32
  private navCols = 0
  private navRows = 0
  private navBlocked: boolean[][] = []
  private navDebugObjects: Phaser.GameObjects.GameObject[] = []
  private navPathDebugObjects: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('GameScene')
  }

  preload() {
    this.createCircleTexture('player', 36, 0x4aa3ff, 0xffffff)
    this.createCircleTexture('remotePlayer', 36, 0xffc857, 0xffffff)
    this.createCircleTexture('zombie', 34, 0x62b846, 0x20351b)
    this.createCircleTexture('bullet', 8, 0xfff2a8, 0xffffff)
  }

  create() {
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height)
    this.input.mouse?.disableContextMenu()

    this.bullets = this.physics.add.group({ classType: Bullet, runChildUpdate: true })
    this.zombies = this.physics.add.group({ classType: Zombie, runChildUpdate: true })
    this.walls = this.physics.add.staticGroup()

    this.player = new Player(this, this.scale.width / 2, this.scale.height / 2)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,E,ENTER') as WasdKeys

    this.createBaseLayout()
    this.rebuildNavigationGrid()
    this.addPhysicsColliders()

    this.physics.add.overlap(
      this.bullets,
      this.zombies,
      this.handleBulletHitZombie,
      undefined,
      this,
    )

    this.createHud()
    this.showStartScreen()

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
      this.disconnectMultiplayer()
    })
  }

  update(time: number) {
    if (!this.isStarted || this.isGameOver || this.isPaused) {
      return
    }

    if (this.lastTimerUpdate === 0) {
      this.lastTimerUpdate = time
    }
    this.elapsedMs += time - this.lastTimerUpdate
    this.lastTimerUpdate = time
    const totalSeconds = Math.floor(this.elapsedMs / 1000)
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const secs = (totalSeconds % 60).toString().padStart(2, '0')
    const centis = Math.floor((this.elapsedMs % 1000) / 10).toString().padStart(2, '0')
    this.timerText.setText(`${mins}:${secs}.${centis}`)

    this.updatePlayerMovement()
    this.player.aimAt(this.input.activePointer)
    this.updateWeaponSwitching()
    if (this.gameMode === 'singlePlayer') {
      this.updateRepairInteraction()
      this.updatePlayerZoneNavigation()
    }
    this.sendMultiplayerState(time)

    if (!this.isIntermission && this.input.activePointer.isDown) {
      this.tryShoot(time)
    }

    this.clearNavigationPathDebug()

    if (this.gameMode === 'singlePlayer') {
      this.zombies.children.each((child) => {
        const zombie = child as Zombie
        this.updateZombieTarget(zombie, time)
        this.updateZombieDebugLabel(zombie)
        this.damagePlayerOnContact(zombie, time)
        return true
      })
    }

    if (this.gameMode === 'singlePlayer' && !this.isIntermission && this.zombiesToSpawn === 0 && this.zombies.countActive(true) === 0) {
      this.completeWave()
    }

    if (this.gameMode === 'singlePlayer' && this.isIntermission && Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) {
      this.startNextWave()
    }
  }

  private createCircleTexture(key: string, size: number, fillColor: number, strokeColor: number) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false)
    const radius = size / 2

    graphics.fillStyle(fillColor, 1)
    graphics.fillCircle(radius, radius, radius - 2)
    graphics.lineStyle(3, strokeColor, 1)
    graphics.strokeCircle(radius, radius, radius - 3)
    graphics.generateTexture(key, size, size)
    graphics.destroy()
  }

  private createBaseLayout() {
    const centerX = this.scale.width / 2
    const centerY = this.scale.height / 2
    const roomWidth = Math.min(560, this.scale.width * 0.68)
    const roomHeight = Math.min(380, this.scale.height * 0.58)
    const wallThickness = 18
    const gap = 110
    const wallColor = 0x353b42

    this.baseBounds = new Phaser.Geom.Rectangle(
      centerX - roomWidth / 2,
      centerY - roomHeight / 2,
      roomWidth,
      roomHeight,
    )

    this.add.rectangle(centerX, centerY, roomWidth, roomHeight, 0x171c20, 0.35)
    this.createWall(centerX - roomWidth / 4 - gap / 4, centerY - roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness, wallColor)
    this.createWall(centerX + roomWidth / 4 + gap / 4, centerY - roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness, wallColor)
    this.createWall(centerX - roomWidth / 4 - gap / 4, centerY + roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness, wallColor)
    this.createWall(centerX + roomWidth / 4 + gap / 4, centerY + roomHeight / 2, roomWidth / 2 - gap / 2, wallThickness, wallColor)
    this.createWall(centerX - roomWidth / 2, centerY - roomHeight / 4 - gap / 4, wallThickness, roomHeight / 2 - gap / 2, wallColor)
    this.createWall(centerX - roomWidth / 2, centerY + roomHeight / 4 + gap / 4, wallThickness, roomHeight / 2 - gap / 2, wallColor)
    this.createWall(centerX + roomWidth / 2, centerY - roomHeight / 4 - gap / 4, wallThickness, roomHeight / 2 - gap / 2, wallColor)
    this.createWall(centerX + roomWidth / 2, centerY + roomHeight / 4 + gap / 4, wallThickness, roomHeight / 2 - gap / 2, wallColor)

    this.barricades = [
      new Barricade(this, centerX, centerY - roomHeight / 2, 96, 18),
      new Barricade(this, centerX, centerY + roomHeight / 2, 96, 18),
      new Barricade(this, centerX - roomWidth / 2, centerY, 18, 96),
      new Barricade(this, centerX + roomWidth / 2, centerY, 18, 96),
    ]

    const approachOffset = 70
    const insideOffset = 56
    const attackDepth = 84
    const attackWidth = 150
    this.entryPoints = [
      {
        id: 'top',
        barricade: this.barricades[0],
        outsidePoint: new Phaser.Math.Vector2(centerX, centerY - roomHeight / 2 - approachOffset),
        doorwayPoint: new Phaser.Math.Vector2(centerX, centerY - roomHeight / 2),
        insidePoint: new Phaser.Math.Vector2(centerX, centerY - roomHeight / 2 + insideOffset),
        attackZone: new Phaser.Geom.Rectangle(
          centerX - attackWidth / 2,
          centerY - roomHeight / 2 - attackDepth,
          attackWidth,
          attackDepth + 24,
        ),
      },
      {
        id: 'bottom',
        barricade: this.barricades[1],
        outsidePoint: new Phaser.Math.Vector2(centerX, centerY + roomHeight / 2 + approachOffset),
        doorwayPoint: new Phaser.Math.Vector2(centerX, centerY + roomHeight / 2),
        insidePoint: new Phaser.Math.Vector2(centerX, centerY + roomHeight / 2 - insideOffset),
        attackZone: new Phaser.Geom.Rectangle(
          centerX - attackWidth / 2,
          centerY + roomHeight / 2 - 24,
          attackWidth,
          attackDepth + 24,
        ),
      },
      {
        id: 'left',
        barricade: this.barricades[2],
        outsidePoint: new Phaser.Math.Vector2(centerX - roomWidth / 2 - approachOffset, centerY),
        doorwayPoint: new Phaser.Math.Vector2(centerX - roomWidth / 2, centerY),
        insidePoint: new Phaser.Math.Vector2(centerX - roomWidth / 2 + insideOffset, centerY),
        attackZone: new Phaser.Geom.Rectangle(
          centerX - roomWidth / 2 - attackDepth,
          centerY - attackWidth / 2,
          attackDepth + 24,
          attackWidth,
        ),
      },
      {
        id: 'right',
        barricade: this.barricades[3],
        outsidePoint: new Phaser.Math.Vector2(centerX + roomWidth / 2 + approachOffset, centerY),
        doorwayPoint: new Phaser.Math.Vector2(centerX + roomWidth / 2, centerY),
        insidePoint: new Phaser.Math.Vector2(centerX + roomWidth / 2 - insideOffset, centerY),
        attackZone: new Phaser.Geom.Rectangle(
          centerX + roomWidth / 2 - 24,
          centerY - attackWidth / 2,
          attackDepth + 24,
          attackWidth,
        ),
      },
    ]

    if (DEBUG_BARRICADE_ATTACKS) {
      this.entryPoints.forEach((entry) => {
        this.add.rectangle(
          entry.attackZone.centerX,
          entry.attackZone.centerY,
          entry.attackZone.width,
          entry.attackZone.height,
          0xff0000,
          0.18,
        ).setDepth(1)
      })
    }

    if (DEBUG_NAV) {
      this.entryPoints.forEach((entry) => {
        this.add.circle(entry.outsidePoint.x, entry.outsidePoint.y, 5, 0xffaa00, 0.8).setDepth(3)
        this.add.circle(entry.doorwayPoint.x, entry.doorwayPoint.y, 5, 0x00aaff, 0.8).setDepth(3)
        this.add.circle(entry.insidePoint.x, entry.insidePoint.y, 5, 0x00ff88, 0.8).setDepth(3)
      })
    }
  }

  private createWall(x: number, y: number, width: number, height: number, color: number) {
    const wall = this.add.rectangle(x, y, width, height, color)
    this.wallRects.push(wall)
    this.walls.add(wall)

    const body = wall.body as Phaser.Physics.Arcade.StaticBody
    body.setSize(width, height)
    body.updateFromGameObject()
  }

  private addPhysicsColliders() {
    this.physics.add.collider(this.player, this.walls)
    this.physics.add.collider(this.zombies, this.walls)
    this.physics.add.collider(this.zombies, this.zombies)
    this.barricades.forEach((barricade) => {
      this.physics.add.collider(this.player, barricade)
      this.physics.add.collider(this.zombies, barricade)
    })
  }

  private createHud() {
    this.add.rectangle(20, 20, 204, 24, 0x111111, 0.85).setOrigin(0).setScrollFactor(0)
    this.healthFill = this.add.rectangle(22, 22, 200, 20, 0x2ecc71).setOrigin(0).setScrollFactor(0)
    this.healthText = this.add.text(28, 23, 'HP 100', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '14px',
    })

    this.waveText = this.add.text(20, 54, 'Wave 1', this.hudTextStyle())
    this.scoreText = this.add.text(20, 82, 'Score 0', this.hudTextStyle())
    this.cashText = this.add.text(20, 110, 'Cash $0', this.hudTextStyle())
    this.weaponText = this.add.text(20, 138, `Weapon ${this.currentWeapon.name}`, this.hudTextStyle())
    this.ownedWeaponsText = this.add.text(20, 166, this.getOwnedWeaponsLabel(), this.smallHudTextStyle())
    this.barricadeText = this.add.text(20, 190, this.getBarricadeStatusLabel(), this.smallHudTextStyle())
    this.multiplayerText = this.add.text(20, 214, '', this.smallHudTextStyle())
    this.messageText = this.add.text(this.scale.width / 2, 34, '', {
      align: 'center',
      color: '#fff2a8',
      fontFamily: 'Arial',
      fontSize: '20px',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0)
    this.repairHintText = this.add.text(this.scale.width / 2, this.scale.height - 72, '', {
      align: 'center',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '20px',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5)
    this.pauseButton = this.add
      .text(this.scale.width - 20, 20, 'Pause', {
        backgroundColor: '#111111',
        color: '#ffffff',
        fixedWidth: 92,
        fontFamily: 'Arial',
        fontSize: '18px',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })

    this.pauseButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      this.togglePause()
    })

    this.timerText = this.add
      .text(this.scale.width - 20, 58, '00:00', {
        color: '#f5f5f5',
        fontFamily: 'Arial',
        fontSize: '20px',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)

  }

  private showStartScreen() {
    const centerX = this.scale.width / 2
    const centerY = this.scale.height / 2
    const panel = this.add.rectangle(0, 0, 680, 540, 0x000000, 0.82)
    const title = this.add
      .text(0, -205, 'FINAL DAYZ', {
        color: '#ff5555',
        fontFamily: 'Arial',
        fontSize: '56px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const instructions = this.add
      .text(0, -88, 'WASD to move\nMouse to aim\nHold left click to shoot\n1/2/3 switch weapons\nE repairs damaged barricades', {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '22px',
        lineSpacing: 10,
      })
      .setOrigin(0.5)
    const singlePlayerButton = this.createStartMenuButton(0, 72, 'Single Player', 0x2ecc71, () => this.startGame('singlePlayer'))
    const createRoomButton = this.createStartMenuButton(0, 134, 'Create Co-op Room', 0x4aa3ff, () => this.createCoopRoom())
    const joinRoomButton = this.createStartMenuButton(0, 196, 'Join Co-op Room', 0xffc857, () => this.promptJoinCoopRoom())
    this.multiplayerStatusText = this.add
      .text(0, 250, '', {
        align: 'center',
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '18px',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)

    this.startOverlay = this.add.container(centerX, centerY, [
      panel,
      title,
      instructions,
      singlePlayerButton,
      createRoomButton,
      joinRoomButton,
      this.multiplayerStatusText,
    ])
    this.startOverlay.setDepth(10)
  }

  private createStartMenuButton(x: number, y: number, label: string, backgroundColor: number, onClick: () => void) {
    const button = this.add
      .text(x, y, label, {
        backgroundColor: Phaser.Display.Color.IntegerToColor(backgroundColor).rgba,
        color: '#101316',
        fixedWidth: 250,
        fontFamily: 'Arial',
        fontSize: '22px',
        fontStyle: 'bold',
        padding: { x: 14, y: 10 },
      })
      .setAlign('center')
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      onClick()
    })

    return button
  }

  private startGame(mode: GameMode) {
    this.gameMode = mode
    this.isStarted = true
    this.startOverlay?.destroy()
    this.startOverlay = undefined
    this.multiplayerStatusText = undefined
    this.isIntermission = true
    this.multiplayerText.setText(this.activeRoomCode ? `Room ${this.activeRoomCode}` : '')
    if (mode === 'multiplayer') {
      this.isIntermission = false
      this.cashText.setText('Cash --')
      return
    }

    this.startNextWave()
  }

  private createCoopRoom() {
    this.setMultiplayerConnectionStatus('connecting', `Connecting to multiplayer server at ${getSocketServerUrl()}...`)
    this.connectMultiplayerSocket((socket) => {
      this.setMultiplayerConnectionStatus('connected', 'Connected. Creating room...')
      socket.emit('createRoom')
    })
  }

  private promptJoinCoopRoom() {
    const roomCode = window.prompt('Enter co-op room code:')

    if (!roomCode) {
      return
    }

    this.setMultiplayerConnectionStatus('connecting', `Connecting to multiplayer server at ${getSocketServerUrl()}...`)
    this.connectMultiplayerSocket((socket) => {
      this.setMultiplayerConnectionStatus('connected', `Connected. Joining ${roomCode.trim().toUpperCase()}...`)
      socket.emit('joinRoom', roomCode)
    })
  }

  private connectMultiplayerSocket(onConnected: (socket: MultiplayerSocket) => void) {
    const socket = this.getMultiplayerSocket()

    if (socket.connected) {
      onConnected(socket)
      return
    }

    socket.once('connect', () => onConnected(socket))
    socket.connect()
  }

  private getMultiplayerSocket() {
    if (this.multiplayerSocket) {
      return this.multiplayerSocket
    }

    const socket = createMultiplayerSocket()
    this.multiplayerSocket = socket

    socket.on('connect', () => {
      this.setMultiplayerConnectionStatus('connected', 'Connected to multiplayer server.')
    })

    socket.on('disconnect', () => {
      this.setMultiplayerConnectionStatus('disconnected', 'Disconnected from multiplayer server.')
    })

    socket.on('roomCreated', ({ roomCode }) => {
      this.activeRoomCode = roomCode
      this.setMultiplayerStatus(`Room created: ${roomCode}`)
    })

    socket.on('roomJoined', ({ roomCode, playerId, players }) => {
      this.localPlayerId = playerId
      this.activeRoomCode = roomCode
      this.renderRemotePlayers(players)
      this.showLobbyOverlay()
    })

    socket.on('playerJoined', (player) => {
      this.showMessage('Player joined')
      this.renderRemotePlayers([player])
    })

    socket.on('playerLeft', ({ playerId }) => {
      this.removeRemotePlayer(playerId)
      this.showMessage('Player left')
    })

    socket.on('roomFull', () => this.setMultiplayerStatus('That room is full.'))
    socket.on('roomNotFound', () => this.setMultiplayerStatus('Room not found.'))
    socket.on('playerStates', (players) => this.renderRemotePlayers(players))
    socket.on('playerShot', (payload) => this.handleRemoteShot(payload))
    socket.on('gameState', (payload) => this.applyServerGameState(payload))
    socket.on('roomStateUpdated', (payload) => this.updateLobbyState(payload))
    socket.on('startRejected', ({ reason }) => this.setLobbyStatus(reason))
    socket.on('connect_error', () => {
      this.setMultiplayerConnectionStatus(
        'connectionError',
        'Could not connect to multiplayer server. Try again or play single-player.',
      )
    })

    return socket
  }

  private setMultiplayerStatus(message: string) {
    this.multiplayerStatusText?.setText(message)
  }

  private showLobbyOverlay() {
    this.startOverlay?.destroy()
    this.startOverlay = undefined
    this.multiplayerStatusText = undefined
    this.lobbyOverlay?.destroy()

    const panel = this.add.rectangle(0, 0, 620, 390, 0x000000, 0.86)
    const title = this.add
      .text(0, -150, 'CO-OP LOBBY', {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '36px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.lobbyRoomCodeText = this.add
      .text(0, -86, 'Room Code: -----', {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '28px',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
    const instructions = this.add
      .text(0, -44, 'Share this code with your friend.', {
        align: 'center',
        color: '#d9e8d9',
        fontFamily: 'Arial',
        fontSize: '18px',
      })
      .setOrigin(0.5)
    this.lobbyPlayersText = this.add
      .text(0, 0, 'Players: 1/2', {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '22px',
      })
      .setOrigin(0.5)
    this.lobbyStatusText = this.add
      .text(0, 48, 'Waiting for friend...', {
        align: 'center',
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '18px',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
    this.lobbyStartButton = this.add
      .text(0, 116, 'Waiting for friend...', {
        backgroundColor: '#555555',
        color: '#101316',
        fixedWidth: 250,
        fontFamily: 'Arial',
        fontSize: '20px',
        fontStyle: 'bold',
        padding: { x: 14, y: 10 },
      })
      .setAlign('center')
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    this.lobbyStartButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      this.multiplayerSocket?.emit('startMultiplayerGame')
    })

    const leaveButton = this.add
      .text(0, 170, 'Leave Room', {
        backgroundColor: '#222222',
        color: '#ffffff',
        fixedWidth: 160,
        fontFamily: 'Arial',
        fontSize: '16px',
        padding: { x: 12, y: 8 },
      })
      .setAlign('center')
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    leaveButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      this.leaveMultiplayerLobby()
    })

    this.lobbyOverlay = this.add.container(this.scale.width / 2, this.scale.height / 2, [
      panel,
      title,
      this.lobbyRoomCodeText,
      instructions,
      this.lobbyPlayersText,
      this.lobbyStatusText,
      this.lobbyStartButton,
      leaveButton,
    ])
    this.lobbyOverlay.setDepth(14)
  }

  private updateLobbyState(roomState: NetworkRoomState) {
    if (DEBUG_MULTIPLAYER) {
      console.log(`roomStateUpdated ${roomState.roomCode}: ${roomState.phase}`)
    }

    this.activeRoomCode = roomState.roomCode

    if (roomState.phase === 'fighting') {
      this.enterMultiplayerGameplay()
      return
    }

    this.lobbyRoomCodeText?.setText(`Room Code: ${roomState.roomCode}`)
    this.lobbyPlayersText?.setText(`Players: ${roomState.playerCount}/${roomState.maxPlayers}`)

    const isHost = roomState.hostId === this.localPlayerId

    if (!this.lobbyStartButton || !this.lobbyStatusText) {
      return
    }

    if (!isHost) {
      this.lobbyStartButton.setVisible(false)
      this.setLobbyStatus('Waiting for host to start.')
      return
    }

    this.lobbyStartButton.setVisible(true)

    if (roomState.playerCount >= roomState.maxPlayers && roomState.phase === 'readyToStart') {
      this.lobbyStartButton.setText('Start Co-op Game')
      this.lobbyStartButton.setStyle({ backgroundColor: '#2ecc71' })
      this.setLobbyStatus('Friend joined. Ready to start.')
      return
    }

    this.lobbyStartButton.setText('Waiting for friend...')
    this.lobbyStartButton.setStyle({ backgroundColor: '#555555' })
    this.setLobbyStatus('Waiting for friend to join.')
  }

  private setLobbyStatus(message: string) {
    this.lobbyStatusText?.setText(message)
  }

  private leaveMultiplayerLobby() {
    this.multiplayerSocket?.emit('leaveRoom')
    this.hideCoopLobby()
    this.localPlayerId = undefined
    this.activeRoomCode = undefined
    this.showStartScreen()
  }

  private hideCoopLobby() {
    if (DEBUG_MULTIPLAYER && this.lobbyOverlay) {
      console.log('hiding co-op lobby')
    }

    this.lobbyOverlay?.destroy()
    this.lobbyOverlay = undefined
    this.lobbyRoomCodeText = undefined
    this.lobbyPlayersText = undefined
    this.lobbyStatusText = undefined
    this.lobbyStartButton = undefined
  }

  private enterMultiplayerGameplay() {
    this.hideCoopLobby()

    if (this.isStarted && this.gameMode === 'multiplayer') {
      return
    }

    this.startGame('multiplayer')
  }

  private setMultiplayerConnectionStatus(status: MultiplayerConnectionStatus, message: string) {
    this.multiplayerConnectionStatus = status
    this.setMultiplayerStatus(`${this.getMultiplayerStatusLabel()}: ${message}`)
  }

  private getMultiplayerStatusLabel() {
    if (this.multiplayerConnectionStatus === 'connectionError') {
      return 'Connection error'
    }

    return this.multiplayerConnectionStatus
  }

  private sendMultiplayerState(time: number) {
    if (this.gameMode !== 'multiplayer' || !this.multiplayerSocket?.connected || time - this.lastNetworkSendAt < 50) {
      return
    }

    this.lastNetworkSendAt = time
    this.emitMultiplayerStateNow()
  }

  private emitMultiplayerStateNow() {
    if (this.gameMode !== 'multiplayer' || !this.multiplayerSocket?.connected) {
      return
    }

    this.multiplayerSocket.emit('playerStateUpdate', {
      x: this.player.x,
      y: this.player.y,
      rotation: this.player.rotation,
      aimX: this.input.activePointer.worldX,
      aimY: this.input.activePointer.worldY,
      weaponId: this.currentWeaponId,
      weapon: this.currentWeapon.name,
    })
  }

  private emitLocalShot(aimX: number, aimY: number) {
    if (this.gameMode !== 'multiplayer' || !this.multiplayerSocket?.connected || !this.localPlayerId) {
      return
    }

    this.multiplayerSocket.emit('playerShoot', {
      roomCode: this.activeRoomCode,
      playerId: this.localPlayerId,
      x: this.player.x,
      y: this.player.y,
      aimX,
      aimY,
      rotation: this.player.rotation,
      weaponId: this.currentWeaponId,
      weapon: this.currentWeapon.name,
      timestamp: Date.now(),
    })
  }

  private handleRemoteShot(payload: PlayerShotPayload) {
    if (payload.playerId === this.localPlayerId) {
      return
    }

    const angle = this.getAimAngle(payload.x, payload.y, payload.aimX, payload.aimY, payload.rotation)
    this.createMuzzleFlash(payload.x, payload.y, angle, 0xffc857)
  }

  private createMuzzleFlash(x: number, y: number, angle: number, color = 0xfff2a8) {
    const distance = 32
    const flash = this.add.circle(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      7,
      color,
      0.95,
    )

    flash.setDepth(5)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.8,
      duration: 90,
      onComplete: () => flash.destroy(),
    })
  }

  private getAimAngle(x: number, y: number, aimX: number, aimY: number, fallbackRotation: number) {
    const direction = new Phaser.Math.Vector2(aimX - x, aimY - y)

    if (direction.lengthSq() === 0) {
      return fallbackRotation
    }

    return Math.atan2(direction.y, direction.x)
  }

  private renderRemotePlayers(players: NetworkPlayerState[]) {
    players.forEach((player) => {
      if (player.id === this.localPlayerId) {
        return
      }

      const view = this.getRemotePlayerView(player.id)
      const aimAngle = this.getAimAngle(player.x, player.y, player.aimX, player.aimY, player.rotation)
      view.sprite.setPosition(player.x, player.y)
      view.sprite.setRotation(aimAngle)
      view.aimLine.setPosition(player.x, player.y)
      view.aimLine.setRotation(aimAngle)
      view.label.setPosition(player.x, player.y - 34)
      view.label.setText(player.weapon || 'Co-op')
    })

    const playerIds = new Set(players.map((player) => player.id))
    this.remotePlayers.forEach((_view, playerId) => {
      if (!playerIds.has(playerId)) {
        this.removeRemotePlayer(playerId)
      }
    })
  }

  private applyServerGameState(gameState: NetworkGameState) {
    if (DEBUG_MULTIPLAYER && gameState.phase === 'fighting' && this.lobbyOverlay) {
      console.log(`gameState fighting ${gameState.roomCode}; entering multiplayer gameplay`)
    }

    if (gameState.phase === 'fighting') {
      this.enterMultiplayerGameplay()
    }

    if (this.gameMode !== 'multiplayer' || !this.isStarted) {
      return
    }

    this.renderRemotePlayers(gameState.players)
    this.syncServerBarricades(gameState.barricades)
    this.renderServerZombies(gameState.zombies)
    this.renderServerBullets(gameState.bullets)
    this.updateMultiplayerHud(gameState)

    if (gameState.gameOver && !this.isGameOver) {
      this.endGame()
    }
  }

  private syncServerBarricades(barricades: NetworkBarricadeState[]) {
    const barricadeById = new Map(barricades.map((barricade) => [barricade.id, barricade]))
    const ids: NetworkBarricadeState['id'][] = ['top', 'bottom', 'left', 'right']

    ids.forEach((id, index) => {
      const barricadeState = barricadeById.get(id)
      const barricade = this.barricades[index]

      if (!barricadeState || !barricade) {
        return
      }

      barricade.syncHealth(barricadeState.health, barricadeState.maxHealth)
    })

    this.updateBarricadeHud()
  }

  private renderServerZombies(zombies: NetworkZombieState[]) {
    zombies.forEach((zombie) => {
      const view = this.getServerZombieView(zombie.id)
      const healthPercent = Phaser.Math.Clamp(zombie.health / zombie.maxHealth, 0, 1)

      view.sprite.setPosition(zombie.x, zombie.y)
      view.healthBarBg.setPosition(zombie.x, zombie.y - 28)
      view.healthBarFill.setPosition(zombie.x - (32 - 32 * healthPercent) / 2, zombie.y - 28)
      view.healthBarFill.width = 32 * healthPercent
    })

    const zombieIds = new Set(zombies.map((zombie) => zombie.id))
    this.serverZombies.forEach((_view, zombieId) => {
      if (!zombieIds.has(zombieId)) {
        this.removeServerZombie(zombieId)
      }
    })
  }

  private getServerZombieView(zombieId: string) {
    const existing = this.serverZombies.get(zombieId)

    if (existing) {
      return existing
    }

    const sprite = this.add.sprite(0, 0, 'zombie').setDepth(2)
    const healthBarBg = this.add.rectangle(0, -28, 34, 5, 0x111111).setDepth(3)
    const healthBarFill = this.add.rectangle(0, -28, 32, 3, 0x7bed65).setDepth(3)
    const view = { sprite, healthBarBg, healthBarFill }

    this.serverZombies.set(zombieId, view)
    return view
  }

  private removeServerZombie(zombieId: string) {
    const view = this.serverZombies.get(zombieId)

    if (!view) {
      return
    }

    view.sprite.destroy()
    view.healthBarBg.destroy()
    view.healthBarFill.destroy()
    this.serverZombies.delete(zombieId)
  }

  private renderServerBullets(bullets: NetworkBulletState[]) {
    bullets.forEach((bullet) => {
      const view = this.getServerBulletView(bullet.id)

      view.setPosition(bullet.x, bullet.y)
      view.setRotation(Math.atan2(bullet.vy, bullet.vx))
    })

    const bulletIds = new Set(bullets.map((bullet) => bullet.id))
    this.serverBullets.forEach((view, bulletId) => {
      if (!bulletIds.has(bulletId)) {
        view.destroy()
        this.serverBullets.delete(bulletId)
      }
    })
  }

  private getServerBulletView(bulletId: string) {
    const existing = this.serverBullets.get(bulletId)

    if (existing) {
      return existing
    }

    const sprite = this.add.sprite(0, 0, 'bullet').setDepth(2)
    this.serverBullets.set(bulletId, sprite)
    return sprite
  }

  private updateMultiplayerHud(gameState: NetworkGameState) {
    this.waveText.setText(gameState.phase === 'waveComplete' ? `Wave ${gameState.wave} Complete` : `Wave ${gameState.wave}`)
    this.scoreText.setText(`Score ${gameState.score}`)
    this.cashText.setText('Cash --')
    this.multiplayerText.setText(`Room ${gameState.roomCode} ${gameState.phase}`)

    const localPlayer = gameState.players.find((player) => player.id === this.localPlayerId)

    if (!localPlayer) {
      return
    }

    this.player.health = localPlayer.health
    this.updateHealthBar()
  }

  private getRemotePlayerView(playerId: string) {
    const existing = this.remotePlayers.get(playerId)

    if (existing) {
      return existing
    }

    const sprite = this.add.sprite(this.player.x, this.player.y, 'remotePlayer').setDepth(3)
    const aimLine = this.add.rectangle(this.player.x + 18, this.player.y, 28, 4, 0xffc857, 0.95).setOrigin(0, 0.5).setDepth(4)
    const label = this.add
      .text(this.player.x, this.player.y - 34, 'Co-op', {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '12px',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4)
    const view = { sprite, aimLine, label }

    this.remotePlayers.set(playerId, view)
    return view
  }

  private removeRemotePlayer(playerId: string) {
    const view = this.remotePlayers.get(playerId)

    if (!view) {
      return
    }

    view.sprite.destroy()
    view.aimLine.destroy()
    view.label.destroy()
    this.remotePlayers.delete(playerId)
  }

  private disconnectMultiplayer() {
    this.multiplayerSocket?.emit('leaveRoom')
    this.multiplayerSocket?.disconnect()
    this.multiplayerSocket = undefined
    this.lobbyOverlay?.destroy()
    this.lobbyOverlay = undefined
    this.remotePlayers.forEach((view) => {
      view.sprite.destroy()
      view.aimLine.destroy()
      view.label.destroy()
    })
    this.remotePlayers.clear()
    this.serverZombies.forEach((view) => {
      view.sprite.destroy()
      view.healthBarBg.destroy()
      view.healthBarFill.destroy()
    })
    this.serverZombies.clear()
    this.serverBullets.forEach((view) => view.destroy())
    this.serverBullets.clear()
  }

  private hudTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      color: '#f5f5f5',
      fontFamily: 'Arial',
      fontSize: '20px',
      stroke: '#000000',
      strokeThickness: 4,
    }
  }

  private smallHudTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      color: '#d9e8d9',
      fontFamily: 'Arial',
      fontSize: '16px',
      stroke: '#000000',
      strokeThickness: 3,
    }
  }

  private getOwnedWeaponsLabel() {
    const owned = (Object.keys(weapons) as WeaponId[])
      .filter((weaponId) => this.ownedWeapons.has(weaponId))
      .map((weaponId) => weapons[weaponId].name)

    return `Owned ${owned.join(', ')}`
  }

  private getBarricadeStatusLabel() {
    const aliveCount = this.barricades.filter((barricade) => barricade.isAlive).length
    return `Barricades ${aliveCount}/${this.barricades.length}`
  }

  private updateCash(amount: number) {
    this.cash += amount
    this.cashText.setText(`Cash $${this.cash}`)
  }

  private spendCash(amount: number) {
    if (this.cash < amount) {
      this.showMessage('Not enough cash')
      return false
    }

    this.updateCash(-amount)
    return true
  }

  private updateBarricadeHud() {
    this.barricadeText.setText(this.getBarricadeStatusLabel())
  }

  private showMessage(message: string) {
    this.messageTimer?.remove(false)
    this.messageText.setText(message)

    this.messageTimer = this.time.delayedCall(1500, () => {
      this.messageText.setText('')
    })
  }

  private updatePlayerMovement() {
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const direction = new Phaser.Math.Vector2(0, 0)

    if (this.keys.A.isDown) {
      direction.x -= 1
    }

    if (this.keys.D.isDown) {
      direction.x += 1
    }

    if (this.keys.W.isDown) {
      direction.y -= 1
    }

    if (this.keys.S.isDown) {
      direction.y += 1
    }

    direction.normalize().scale(this.player.speed)
    body.setVelocity(direction.x, direction.y)
  }

  private updateWeaponSwitching() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) {
      this.setWeapon('pistol')
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) {
      this.setWeapon('smg')
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) {
      this.setWeapon('shotgun')
    }
  }

  private setWeapon(weaponId: WeaponId) {
    if (!this.ownedWeapons.has(weaponId)) {
      this.showMessage('Weapon not owned')
      return
    }

    this.currentWeaponId = weaponId
    this.weaponText.setText(`Weapon ${this.currentWeapon.name}`)
    this.emitMultiplayerStateNow()
  }

  private updateRepairInteraction() {
    const repairTarget = this.getNearbyDamagedBarricade()
    this.repairHintText.setText(repairTarget ? `Press E to repair ($${barricadeConfig.repairCost})` : '')

    if (!repairTarget || !Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      return
    }

    if (!this.spendCash(barricadeConfig.repairCost)) {
      return
    }

    repairTarget.repair(barricadeConfig.repairAmount)
    this.rebuildNavigationGrid()
    this.invalidateZombiePaths()
    this.updateBarricadeHud()
    this.showMessage('Barricade repaired')
  }

  private getNearbyDamagedBarricade() {
    return this.barricades.find((barricade) => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, barricade.x, barricade.y)
      return barricade.health < barricade.maxHealth && distance <= barricadeConfig.repairRange
    })
  }

  private get currentWeapon(): WeaponConfig {
    return weapons[this.currentWeaponId]
  }

  private tryShoot(time: number) {
    const weapon = this.currentWeapon

    if (time - this.lastShotAt < weapon.fireRateMs) {
      return
    }

    this.lastShotAt = time

    const pointer = this.input.activePointer
    const mouseWorldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    const direction = new Phaser.Math.Vector2(mouseWorldPoint.x - this.player.x, mouseWorldPoint.y - this.player.y)

    if (direction.lengthSq() === 0) {
      return
    }

    direction.normalize()

    const spawnOffset = 28
    const baseAngle = Math.atan2(direction.y, direction.x)
    const spreadRadians = Phaser.Math.DegToRad(weapon.spreadDegrees)
    const firstShotOffset = weapon.bulletsPerShot > 1 ? -spreadRadians / 2 : 0
    const angleStep = weapon.bulletsPerShot > 1 ? spreadRadians / (weapon.bulletsPerShot - 1) : 0

    this.createMuzzleFlash(this.player.x, this.player.y, baseAngle)

    if (this.gameMode === 'multiplayer') {
      this.emitLocalShot(mouseWorldPoint.x, mouseWorldPoint.y)
      return
    }

    for (let i = 0; i < weapon.bulletsPerShot; i += 1) {
      const randomSpread = weapon.bulletsPerShot === 1 ? Phaser.Math.FloatBetween(-spreadRadians / 2, spreadRadians / 2) : 0
      const shotAngle = baseAngle + firstShotOffset + angleStep * i + randomSpread
      const shotDirection = new Phaser.Math.Vector2(Math.cos(shotAngle), Math.sin(shotAngle))
      const muzzleX = this.player.x + shotDirection.x * spawnOffset
      const muzzleY = this.player.y + shotDirection.y * spawnOffset
      const bullet = new Bullet(this, muzzleX, muzzleY, weapon.damage + this.damageBonus, weapon.bulletSpeed)

      this.bullets.add(bullet)
      bullet.launch(shotDirection.x, shotDirection.y)
    }

    this.emitLocalShot(mouseWorldPoint.x, mouseWorldPoint.y)
  }

  private togglePause() {
    if (!this.isStarted || this.isGameOver) {
      return
    }

    this.isPaused = !this.isPaused
    this.pauseButton.setText(this.isPaused ? 'Resume' : 'Pause')
    this.time.paused = this.isPaused

    if (this.isPaused) {
      this.physics.world.pause()
      this.showPauseOverlay()
      return
    }

    this.physics.world.resume()
    this.pauseOverlay?.destroy()
    this.pauseOverlay = undefined
  }

  private showPauseOverlay() {
    this.pauseOverlay?.destroy()
    this.pauseOverlay = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'PAUSED', {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '44px',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
  }

  private startNextWave() {
    this.isIntermission = false
    this.hideShop()
    this.waveSpawnTimer?.remove(false)
    this.wave += 1
    this.zombiesToSpawn = waveConfig.baseZombieCount + this.wave * waveConfig.zombiesPerWave
    this.spawnDelay = Math.max(
      waveConfig.minSpawnDelayMs,
      waveConfig.baseSpawnDelayMs - this.wave * waveConfig.spawnDelayReductionPerWaveMs,
    )
    this.waveText.setText(`Wave ${this.wave}`)

    this.waveSpawnTimer = this.time.addEvent({
      delay: this.spawnDelay,
      repeat: this.zombiesToSpawn - 1,
      callback: this.spawnZombie,
      callbackScope: this,
    })
  }

  private completeWave() {
    this.isIntermission = true
    const bonus = waveConfig.waveBonusBase + this.wave * waveConfig.waveBonusPerWave

    this.updateCash(bonus)
    this.showMessage(`Wave bonus +$${bonus}`)
    this.showShop()
  }

  private showShop() {
    this.hideShop()

    const centerX = this.scale.width / 2
    const centerY = this.scale.height / 2
    const panel = this.add.rectangle(0, 0, 560, 500, 0x000000, 0.82)
    const title = this.add
      .text(0, -210, 'Wave Complete', {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '38px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const subtitle = this.add
      .text(0, -166, 'Buy upgrades, repair, then start the next wave.', {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '18px',
      })
      .setOrigin(0.5)
    const continueButton = this.createShopButton(0, 204, 'Start Next Wave / Enter', () => this.startNextWave())
    const items: Phaser.GameObjects.GameObject[] = [panel, title, subtitle, continueButton]
    const shopEntries: ShopItemId[] = [
      'healPlayer',
      'repairAll',
      'damageUpgrade',
      'maxHealthUpgrade',
      'buySmg',
      'buyShotgun',
    ]

    shopEntries.forEach((itemId, index) => {
      const item = shopConfig[itemId]
      const y = -112 + index * 48
      items.push(this.createShopButton(0, y, `${item.label} - $${item.cost}`, () => this.buyShopItem(itemId)))
    })

    this.shopOverlay = this.add.container(centerX, centerY, items)
    this.shopOverlay.setDepth(12)
  }

  private hideShop() {
    this.shopOverlay?.destroy()
    this.shopOverlay = undefined
    this.shopButtons = []
  }

  private createShopButton(x: number, y: number, label: string, onClick: () => void) {
    const button = this.add
      .text(x, y, label, {
        align: 'center',
        backgroundColor: '#20262b',
        color: '#ffffff',
        fixedWidth: 330,
        fontFamily: 'Arial',
        fontSize: '17px',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      onClick()
    })

    this.shopButtons.push(button)
    return button
  }

  private buyShopItem(itemId: ShopItemId) {
    const item = shopConfig[itemId]
    const weaponUnlock = shopWeaponUnlocks[itemId]

    if (weaponUnlock && this.ownedWeapons.has(weaponUnlock)) {
      this.showMessage('Already owned')
      return
    }

    if (!this.spendCash(item.cost)) {
      return
    }

    if (itemId === 'healPlayer') {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + shopUpgradeConfig.healAmount)
      this.updateHealthBar()
      this.showMessage('Player healed')
      return
    }

    if (itemId === 'repairAll') {
      this.barricades.forEach((barricade) => barricade.repairFully())
      this.rebuildNavigationGrid()
      this.invalidateZombiePaths()
      this.updateBarricadeHud()
      this.showMessage('Barricades repaired')
      return
    }

    if (itemId === 'damageUpgrade') {
      this.damageBonus += shopUpgradeConfig.damageUpgradeAmount
      this.showMessage(`Damage +${shopUpgradeConfig.damageUpgradeAmount}`)
      return
    }

    if (itemId === 'maxHealthUpgrade') {
      this.player.maxHealth += shopUpgradeConfig.maxHealthUpgradeAmount
      this.player.health += shopUpgradeConfig.maxHealthUpgradeAmount
      this.updateHealthBar()
      this.showMessage(`Max health +${shopUpgradeConfig.maxHealthUpgradeAmount}`)
      return
    }

    if (weaponUnlock) {
      this.ownedWeapons.add(weaponUnlock)
      this.ownedWeaponsText.setText(this.getOwnedWeaponsLabel())
      this.showMessage(`${weapons[weaponUnlock].name} unlocked`)
    }
  }

  private spawnZombie() {
    if (this.isGameOver || this.zombiesToSpawn <= 0) {
      return
    }

    const { x, y } = this.getRandomEdgeSpawnPoint()
    const zombie = new Zombie(this, x, y, this.wave)

    this.zombies.add(zombie)
    this.zombiesToSpawn -= 1
  }

  private updateZombieTarget(zombie: Zombie, time: number) {
    zombie.locationState = this.isInsideBase(zombie.x, zombie.y) ? 'insideBase' : 'outsideBase'

    const attackEntry = this.getAliveEntryInAttackRange(zombie)

    if (attackEntry) {
      zombie.navState = 'attackingBarricade'
      zombie.path = []
      zombie.currentTargetPoint = undefined
      this.damageBarricade(zombie, attackEntry, time)
      return
    }

    if (time >= zombie.nextPathAt || zombie.path.length === 0) {
      this.assignZombiePath(zombie, time)
    }

    if (zombie.path.length > 0) {
      zombie.navState = 'pathing'
      this.followZombiePath(zombie)
      this.updateZombieStuckState(zombie, time)
      return
    }

    const barricadeEntry = this.getBestEntryPointForZombie(zombie)

    if (barricadeEntry?.barricade.isAlive) {
      this.moveZombieToAliveBarricade(zombie, barricadeEntry, time)
      return
    }

    zombie.navState = 'chasingPlayer'
    zombie.chase(this.player)
    this.updateZombieStuckState(zombie, time)
  }

  private updatePlayerZoneNavigation() {
    const playerZone: BaseZone = this.isOutsideBase(this.player.x, this.player.y) ? 'outside' : 'inside'

    if (playerZone === this.lastPlayerZone) {
      return
    }

    this.lastPlayerZone = playerZone
    this.invalidateZombiePaths()
  }

  private rebuildNavigationGrid() {
    this.navCols = Math.ceil(this.scale.width / this.navCellSize)
    this.navRows = Math.ceil(this.scale.height / this.navCellSize)
    this.navBlocked = Array.from({ length: this.navRows }, () => Array.from({ length: this.navCols }, () => false))

    this.wallRects.forEach((wall) => this.blockNavRectangle(wall.getBounds(), 6))
    this.barricades
      .filter((barricade) => barricade.isAlive)
      .forEach((barricade) => this.blockNavRectangle(barricade.getBounds(), 4))

    this.drawNavigationDebug()
  }

  private blockNavRectangle(rect: Phaser.Geom.Rectangle, padding: number) {
    const padded = new Phaser.Geom.Rectangle(
      rect.x - padding,
      rect.y - padding,
      rect.width + padding * 2,
      rect.height + padding * 2,
    )
    const start = this.worldToCell(padded.left, padded.top)
    const end = this.worldToCell(padded.right, padded.bottom)

    for (let y = Math.max(0, start.y); y <= Math.min(this.navRows - 1, end.y); y += 1) {
      for (let x = Math.max(0, start.x); x <= Math.min(this.navCols - 1, end.x); x += 1) {
        const cellRect = new Phaser.Geom.Rectangle(
          x * this.navCellSize,
          y * this.navCellSize,
          this.navCellSize,
          this.navCellSize,
        )

        if (Phaser.Geom.Intersects.RectangleToRectangle(padded, cellRect)) {
          this.navBlocked[y][x] = true
        }
      }
    }
  }

  private assignZombiePath(zombie: Zombie, time: number) {
    zombie.path = this.findPath(zombie.x, zombie.y, this.player.x, this.player.y)
    zombie.pathIndex = 0
    zombie.nextPathAt = time + 450
    zombie.currentTargetPoint = zombie.path[0]
  }

  private findPath(startX: number, startY: number, goalX: number, goalY: number) {
    const start = this.getNearestWalkableCell(this.worldToCell(startX, startY))
    const goal = this.getNearestWalkableCell(this.worldToCell(goalX, goalY))

    if (!start || !goal) {
      return []
    }

    const key = (cell: GridCell) => `${cell.x},${cell.y}`
    const queue: GridCell[] = [start]
    const cameFrom = new Map<string, string | undefined>([[key(start), undefined]])
    const cells = new Map<string, GridCell>([[key(start), start]])
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ]

    while (queue.length > 0) {
      const current = queue.shift()!

      if (current.x === goal.x && current.y === goal.y) {
        break
      }

      directions.forEach((direction) => {
        const next = { x: current.x + direction.x, y: current.y + direction.y }
        const nextKey = key(next)

        if (cameFrom.has(nextKey) || !this.isWalkableCell(next)) {
          return
        }

        if (direction.x !== 0 && direction.y !== 0) {
          const horizontal = { x: current.x + direction.x, y: current.y }
          const vertical = { x: current.x, y: current.y + direction.y }

          if (!this.isWalkableCell(horizontal) || !this.isWalkableCell(vertical)) {
            return
          }
        }

        cameFrom.set(nextKey, key(current))
        cells.set(nextKey, next)
        queue.push(next)
      })
    }

    const goalKey = key(goal)

    if (!cameFrom.has(goalKey)) {
      return []
    }

    const path: Phaser.Math.Vector2[] = []
    let currentKey: string | undefined = goalKey

    while (currentKey) {
      const cell = cells.get(currentKey)

      if (cell) {
        path.push(this.cellToWorld(cell))
      }

      currentKey = cameFrom.get(currentKey)
    }

    path.reverse()
    path.shift()
    return this.simplifyPath(path)
  }

  private simplifyPath(path: Phaser.Math.Vector2[]) {
    if (path.length <= 2) {
      return path
    }

    return path.filter((_, index) => index % 2 === 0 || index === path.length - 1)
  }

  private followZombiePath(zombie: Zombie) {
    const target = zombie.path[zombie.pathIndex]

    if (!target) {
      zombie.path = []
      zombie.currentTargetPoint = undefined
      return
    }

    zombie.currentTargetPoint = target

    if (Phaser.Math.Distance.Between(zombie.x, zombie.y, target.x, target.y) <= 30) {
      zombie.pathIndex += 1
      zombie.currentTargetPoint = zombie.path[zombie.pathIndex]
      return
    }

    zombie.moveToward(target.x, target.y)
  }

  private worldToCell(x: number, y: number): GridCell {
    return {
      x: Phaser.Math.Clamp(Math.floor(x / this.navCellSize), 0, this.navCols - 1),
      y: Phaser.Math.Clamp(Math.floor(y / this.navCellSize), 0, this.navRows - 1),
    }
  }

  private cellToWorld(cell: GridCell) {
    return new Phaser.Math.Vector2(
      cell.x * this.navCellSize + this.navCellSize / 2,
      cell.y * this.navCellSize + this.navCellSize / 2,
    )
  }

  private isWalkableCell(cell: GridCell) {
    return (
      cell.x >= 0 &&
      cell.y >= 0 &&
      cell.x < this.navCols &&
      cell.y < this.navRows &&
      !this.navBlocked[cell.y][cell.x]
    )
  }

  private getNearestWalkableCell(origin: GridCell) {
    if (this.isWalkableCell(origin)) {
      return origin
    }

    for (let radius = 1; radius <= 6; radius += 1) {
      for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
        for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
          const cell = { x, y }

          if (this.isWalkableCell(cell)) {
            return cell
          }
        }
      }
    }

    return undefined
  }

  private drawNavigationDebug() {
    this.navDebugObjects.forEach((object) => object.destroy())
    this.navDebugObjects = []

    if (!DEBUG_NAV) {
      return
    }

    for (let y = 0; y < this.navRows; y += 1) {
      for (let x = 0; x < this.navCols; x += 1) {
        if (!this.navBlocked[y][x]) {
          continue
        }

        const center = this.cellToWorld({ x, y })
        this.navDebugObjects.push(
          this.add.rectangle(center.x, center.y, this.navCellSize - 2, this.navCellSize - 2, 0xff0000, 0.12).setDepth(20),
        )
      }
    }
  }

  private invalidateZombiePaths() {
    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      zombie.path = []
      zombie.pathIndex = 0
      zombie.nextPathAt = 0
      zombie.currentTargetPoint = undefined
      return true
    })
  }

  private updateZombieDebugLabel(zombie: Zombie) {
    if (!DEBUG_NAV) {
      return
    }

    if (!zombie.debugLabel) {
      zombie.debugLabel = this.add.text(zombie.x, zombie.y - 44, '', {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '10px',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5)
    }

    zombie.debugLabel.setPosition(zombie.x, zombie.y - 44)
    zombie.debugLabel.setText(`${zombie.locationState}\n${zombie.navState}`)
    this.drawZombiePathDebug(zombie)
  }

  private clearNavigationPathDebug() {
    if (!DEBUG_NAV) {
      return
    }

    this.navPathDebugObjects.forEach((object) => object.destroy())
    this.navPathDebugObjects = []
  }

  private drawZombiePathDebug(zombie: Zombie) {
    zombie.path.forEach((point, index) => {
      this.navPathDebugObjects.push(
        this.add.circle(point.x, point.y, 3, 0x00ffff, index === zombie.pathIndex ? 0.95 : 0.35).setDepth(21),
      )
    })

    if (zombie.currentTargetPoint) {
      this.navPathDebugObjects.push(
        this.add.circle(zombie.currentTargetPoint.x, zombie.currentTargetPoint.y, 7, 0xff00ff, 0.75).setDepth(22),
      )
    }
  }

  private getBestEntryPointForZombie(zombie: Zombie) {
    // Convert barricade destruction time into an equivalent travel distance so we can
    // compare it directly against the distance to an open doorway.
    const breakCostAsDistance = (barricade: Barricade) => {
      const attacks = Math.ceil(barricade.health / barricadeConfig.zombieAttackDamage)
      const timeMs = attacks * barricadeConfig.zombieAttackCooldownMs
      return (timeMs / 1000) * zombie.speed
    }

    return this.entryPoints.slice().sort((a, b) => {
      const distA = Phaser.Math.Distance.Between(zombie.x, zombie.y, a.outsidePoint.x, a.outsidePoint.y)
      const distB = Phaser.Math.Distance.Between(zombie.x, zombie.y, b.outsidePoint.x, b.outsidePoint.y)
      const costA = distA + (a.barricade.isAlive ? breakCostAsDistance(a.barricade) : 0)
      const costB = distB + (b.barricade.isAlive ? breakCostAsDistance(b.barricade) : 0)
      return costA - costB
    })[0]
  }

  private getAliveEntryInAttackRange(zombie: Zombie) {
    return this.entryPoints.find((entry) => entry.barricade.isAlive && this.isZombieInBarricadeAttackRange(zombie, entry))
  }

  private moveZombieToAliveBarricade(zombie: Zombie, entry: EntryPoint, time: number) {
    if (!entry.barricade.isAlive) {
      zombie.navState = 'movingToDoorway'
      return
    }

    if (this.isZombieInBarricadeAttackRange(zombie, entry)) {
      zombie.navState = 'attackingBarricade'
      this.damageBarricade(zombie, entry, time)
      return
    }

    const distanceToOutsidePoint = Phaser.Math.Distance.Between(
      zombie.x,
      zombie.y,
      entry.outsidePoint.x,
      entry.outsidePoint.y,
    )

    if (distanceToOutsidePoint > 18) {
      zombie.moveToward(entry.outsidePoint.x, entry.outsidePoint.y)
      this.updateZombieStuckState(zombie, time)
      return
    }

    zombie.moveToward(entry.barricade.x, entry.barricade.y)
    this.updateZombieStuckState(zombie, time)
  }

  private isZombieInBarricadeAttackRange(zombie: Zombie, entry: EntryPoint) {
    if (entry.attackZone.contains(zombie.x, zombie.y)) {
      return true
    }

    return Phaser.Math.Distance.Between(zombie.x, zombie.y, entry.barricade.x, entry.barricade.y) <= 72
  }

  private damageBarricade(zombie: Zombie, entry: EntryPoint, time: number) {
    zombie.stopMoving()
    zombie.rotation = Phaser.Math.Angle.Between(zombie.x, zombie.y, entry.barricade.x, entry.barricade.y)

    if (!zombie.tryAttack(time, barricadeConfig.zombieAttackCooldownMs)) {
      return
    }

    entry.barricade.takeDamage(barricadeConfig.zombieAttackDamage)
    this.updateBarricadeHud()

    if (DEBUG_BARRICADE_ATTACKS) {
      console.log(
        `Zombie damaged ${entry.id} barricade: ${entry.barricade.health}/${entry.barricade.maxHealth}`,
      )
    }

    if (!entry.barricade.isAlive) {
      this.onBarricadeDestroyed(zombie)
    }
  }

  private onBarricadeDestroyed(zombie: Zombie) {
    zombie.navState = 'pathing'
    zombie.targetEntryId = undefined
    zombie.routeDirection = undefined
    zombie.path = []
    zombie.lastStuckCheckAt = 0
    this.rebuildNavigationGrid()
    this.invalidateZombiePaths()
    this.showMessage('Barricade destroyed')
  }

  private updateZombieStuckState(zombie: Zombie, time: number) {
    if (zombie.navState === 'attackingBarricade') {
      return
    }

    if (zombie.lastStuckCheckAt === 0) {
      zombie.lastStuckCheckAt = time
      zombie.lastStuckX = zombie.x
      zombie.lastStuckY = zombie.y
      return
    }

    if (time - zombie.lastStuckCheckAt < 750) {
      return
    }

    const movedDistance = Phaser.Math.Distance.Between(zombie.x, zombie.y, zombie.lastStuckX, zombie.lastStuckY)

    zombie.lastStuckCheckAt = time
    zombie.lastStuckX = zombie.x
    zombie.lastStuckY = zombie.y

    if (movedDistance > 8) {
      return
    }

    zombie.navState = 'stuck'
    zombie.path = []
    zombie.pathIndex = 0
    zombie.nextPathAt = 0
    zombie.currentTargetPoint = undefined
  }

  private isInsideBase(x: number, y: number) {
    return Phaser.Geom.Rectangle.Contains(
      new Phaser.Geom.Rectangle(
        this.baseBounds.x + 18,
        this.baseBounds.y + 18,
        this.baseBounds.width - 36,
        this.baseBounds.height - 36,
      ),
      x,
      y,
    )
  }

  private isOutsideBase(x: number, y: number) {
    return !this.isInsideBase(x, y)
  }

  private getRandomEdgeSpawnPoint() {
    const padding = 48
    const width = this.scale.width
    const height = this.scale.height
    const edge = Phaser.Math.Between(0, 3)

    if (edge === 0) {
      return { x: Phaser.Math.Between(0, width), y: -padding }
    }

    if (edge === 1) {
      return { x: width + padding, y: Phaser.Math.Between(0, height) }
    }

    if (edge === 2) {
      return { x: Phaser.Math.Between(0, width), y: height + padding }
    }

    return { x: -padding, y: Phaser.Math.Between(0, height) }
  }

  private handleBulletHitZombie(
    bulletObject:
      | Phaser.Types.Physics.Arcade.ArcadeColliderType
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
    zombieObject:
      | Phaser.Types.Physics.Arcade.ArcadeColliderType
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
  ) {
    const bullet = bulletObject as Bullet
    const zombie = zombieObject as Zombie
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body
    const bulletDirection = new Phaser.Math.Vector2(bulletBody.velocity.x, bulletBody.velocity.y).normalize()
    const deathX = zombie.x
    const deathY = zombie.y

    bullet.destroy()

    if (zombie.takeDamage(bullet.damage, bulletDirection.x, bulletDirection.y)) {
      this.score += zombie.scoreValue
      this.cash += 10
      this.scoreText.setText(`Score ${this.score}`)
      this.cashText.setText(`Cash $${this.cash}`)
      this.spawnZombieDeathEffect(deathX, deathY)
      this.showFloatingScore(deathX, deathY, zombie.scoreValue)
      this.cameras.main.shake(70, 0.003)
    }
  }

  private spawnZombieDeathEffect(x: number, y: number) {
    for (let i = 0; i < 10; i += 1) {
      const particle = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0x8b1e1e, 0.85)
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const distance = Phaser.Math.Between(12, 34)

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.4,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      })
    }
  }

  private showFloatingScore(x: number, y: number, amount: number) {
    const scorePopup = this.add
      .text(x, y - 24, `+${amount}`, {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '18px',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)

    this.tweens.add({
      targets: scorePopup,
      y: scorePopup.y - 28,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => scorePopup.destroy(),
    })
  }

  private damagePlayerOnContact(zombie: Zombie, time: number) {
    if (time - this.lastContactDamageAt < 500) {
      return
    }

    if (!this.physics.overlap(this.player, zombie)) {
      return
    }

    this.lastContactDamageAt = time
    this.player.takeDamage(zombie.damage)
    this.updateHealthBar()

    if (this.player.health <= 0) {
      this.endGame()
    }
  }

  private updateHealthBar() {
    const healthPercent = Phaser.Math.Clamp(this.player.health / this.player.maxHealth, 0, 1)
    this.healthFill.width = 200 * healthPercent
    this.healthFill.fillColor = healthPercent > 0.35 ? 0x2ecc71 : 0xe74c3c
    this.healthText.setText(`HP ${Math.ceil(this.player.health)}`)
  }

  private endGame() {
    if (this.isPaused) {
      this.togglePause()
    }

    this.hideShop()
    this.waveSpawnTimer?.remove(false)
    this.waveSpawnTimer = undefined
    this.isGameOver = true
    this.player.setVelocity(0, 0)

    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      zombie.setVelocity(0, 0)
      return true
    })

    const centerX = this.scale.width / 2
    const centerY = this.scale.height / 2

    this.add.rectangle(centerX, centerY, 420, 220, 0x000000, 0.72)
    this.gameOverText = this.add
      .text(centerX, centerY - 45, 'GAME OVER', {
        color: '#ff5555',
        fontFamily: 'Arial',
        fontSize: '46px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    this.restartText = this.add
      .text(centerX, centerY + 28, `Score: ${this.score}\nClick to restart`, {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '24px',
      })
      .setOrigin(0.5)

    this.input.once('pointerdown', () => this.scene.restart())
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.physics.world.setBounds(0, 0, gameSize.width, gameSize.height)
    this.pauseButton?.setPosition(gameSize.width - 20, 20)
    this.timerText?.setPosition(gameSize.width - 20, 58)
    this.messageText?.setPosition(gameSize.width / 2, 34)
    this.repairHintText?.setPosition(gameSize.width / 2, gameSize.height - 72)
    this.pauseOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.startOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.lobbyOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.shopOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)

    if (!this.isGameOver) {
      this.player.setPosition(
        Phaser.Math.Clamp(this.player.x, 20, gameSize.width - 20),
        Phaser.Math.Clamp(this.player.y, 20, gameSize.height - 20),
      )
      return
    }

    this.gameOverText?.setPosition(gameSize.width / 2, gameSize.height / 2 - 45)
    this.restartText?.setPosition(gameSize.width / 2, gameSize.height / 2 + 28)
  }
}
