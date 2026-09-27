import Phaser from 'phaser'
import { barricadeConfig } from '../config/barricades'
import { enemyConfigs, getBossEnemyTypeForWave, pickEnemyTypeForWave, type EnemyType } from '../config/enemies'
import {
  buildShareText,
  formatBestHighScoreLabel,
  formatHighScoreBoard,
  formatPersonalBestLabel,
  formatPointsShortOfBoard,
  formatScore,
  HIGH_SCORE_INITIALS_LENGTH,
  loadHighScores,
  loadLastInitials,
  loadPersonalBest,
  saveLastInitials,
  savePersonalBest,
  scoreQualifiesForHighScore,
} from '../config/highScores'
import { persistHighScore, syncHighScoresFromServer } from '../network/highScoreClient'
import { getPerk, rollPerkChoices, PERK_WAVE_INTERVAL, type PerkConfig, type PerkId } from '../config/perks'
import { shopConfig, shopUpgradeConfig, shopWeaponUnlocks, type ShopItemId } from '../config/shop'
import { waveConfig } from '../config/waves'
import { defaultWeaponId, toolConfig, type WeaponConfig, type WeaponId, weaponCycle, weapons } from '../config/weapons'
import { GameAudio, type SoundId } from '../audio/gameAudio'
import Barricade from '../entities/Barricade'
import Bullet from '../entities/Bullet'
import Player from '../entities/Player'
import Zombie from '../entities/Zombie'
import {
  createMultiplayerSocket,
  getSocketServerUrl,
  type MultiplayerConnectionStatus,
  type NetworkBulletState,
  type NetworkDebugNavState,
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
const CLIENT_DEBUG_VERSION = '0.0.0'

type WasdKeys = {
  W: Phaser.Input.Keyboard.Key
  A: Phaser.Input.Keyboard.Key
  S: Phaser.Input.Keyboard.Key
  D: Phaser.Input.Keyboard.Key
  ONE: Phaser.Input.Keyboard.Key
  TWO: Phaser.Input.Keyboard.Key
  THREE: Phaser.Input.Keyboard.Key
  FOUR: Phaser.Input.Keyboard.Key
  Q: Phaser.Input.Keyboard.Key
  T: Phaser.Input.Keyboard.Key
  SPACE: Phaser.Input.Keyboard.Key
  E: Phaser.Input.Keyboard.Key
  ENTER: Phaser.Input.Keyboard.Key
}

type PlacedMine = {
  x: number
  y: number
  armedAt: number
  sprite: Phaser.GameObjects.Arc
}

type PlacedTurret = {
  x: number
  y: number
  lastShotAt: number
  base: Phaser.GameObjects.Arc
  aim: Phaser.GameObjects.Rectangle
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

type TouchPad = {
  base: Phaser.GameObjects.Arc
  knob: Phaser.GameObjects.Arc
  label: Phaser.GameObjects.Text
  pointerId?: number
  centerX: number
  centerY: number
  radius: number
  grabRadius: number
  vector: Phaser.Math.Vector2
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
  enemyType?: string
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
  private perkText!: Phaser.GameObjects.Text
  private multiplayerText!: Phaser.GameObjects.Text
  private messageText!: Phaser.GameObjects.Text
  private repairHintText!: Phaser.GameObjects.Text
  private pauseButton!: Phaser.GameObjects.Text
  private skipRoundButton!: Phaser.GameObjects.Text
  private highScoreText!: Phaser.GameObjects.Text
  private healthBarBg!: Phaser.GameObjects.Rectangle
  private healthBarMaxWidth = 200
  private startHighScoreLabel?: Phaser.GameObjects.Text
  private startBoardText?: Phaser.GameObjects.Text
  private startSourceText?: Phaser.GameObjects.Text
  private startPersonalText?: Phaser.GameObjects.Text
  private scoreSource: 'loading' | 'live' | 'cache' = 'loading'
  private personalBestAtStart = loadPersonalBest()
  private runIsPersonalBest = false
  private announcedPersonalBest = false
  private touchWeaponButton?: Phaser.GameObjects.Text
  private touchRepairButton?: Phaser.GameObjects.Text
  private isSavingHighScore = false
  private timerText!: Phaser.GameObjects.Text
  private pauseOverlay?: Phaser.GameObjects.Text
  private startOverlay?: Phaser.GameObjects.Container
  private lobbyOverlay?: Phaser.GameObjects.Container
  private lobbyRoomCodeText?: Phaser.GameObjects.Text
  private lobbyPlayersText?: Phaser.GameObjects.Text
  private lobbyStatusText?: Phaser.GameObjects.Text
  private lobbyStartButton?: Phaser.GameObjects.Text
  private shopOverlay?: Phaser.GameObjects.Container
  private shopStatusText?: Phaser.GameObjects.Text
  private shopLabels = new Map<ShopItemId, Phaser.GameObjects.Text>()
  private perkOverlay?: Phaser.GameObjects.Container
  private pendingPerkChoices?: PerkConfig[]
  private gameOverOverlay?: Phaser.GameObjects.Container
  private initialsLetterTexts: Phaser.GameObjects.Text[] = []
  private isEnteringInitials = false
  private initials = loadLastInitials().split('')
  private initialsCursor = 0
  private nextRoundClickCount = 0
  private nextRoundClickAt = 0
  private shopItemClick?: { itemId: ShopItemId; count: number; at: number }
  private shopHoldTimer?: Phaser.Time.TimerEvent

  private wave = 0
  private score = 0
  private cash = 0
  private currentWeaponId: WeaponId = defaultWeaponId
  private ownedWeapons = new Set<WeaponId>([defaultWeaponId])
  private ownsMines = false
  private ownsTurret = false
  private mines: PlacedMine[] = []
  private turrets: PlacedTurret[] = []
  private lastMeleeAt = -10000
  private shopPage = 0
  private touchMeleeButton?: Phaser.GameObjects.Text
  private touchMineButton?: Phaser.GameObjects.Text
  private touchTurretButton?: Phaser.GameObjects.Text
  private toolText!: Phaser.GameObjects.Text
  private damageBonus = 0
  private damageUpgradeLevel = 0
  private maxHealthUpgradeLevel = 0
  private ownedPerks: PerkId[] = []
  private perkWavesHandled = new Set<number>()
  private zombiesKilled = 0
  private cashEarned = 0
  private repairsDone = 0
  private lastWaveBonus = 0
  private lastShopFailAt = 0
  private readonly basePlayerSpeed = 260
  private zombiesToSpawn = 0
  private spawnDelay = 900
  private lastShotAt = 0
  private lastContactDamageAt = 0
  private elapsedMs = 0
  private lastTimerUpdate = 0
  private messageTimer?: Phaser.Time.TimerEvent
  private waveSpawnTimer?: Phaser.Time.TimerEvent
  private pendingBossEnemyType?: EnemyType
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
  private debugNavRender = false
  private coopDebug = false
  private audio = new GameAudio()
  private damageFlash!: Phaser.GameObjects.Rectangle
  private muteButton!: Phaser.GameObjects.Text
  private waveBanner?: Phaser.GameObjects.Text
  private doorWarnings = new Map<EntryPointId, Phaser.GameObjects.Text>()
  private doorToastAt = new Map<EntryPointId, number>()
  private multiplayerNavDebugObjects: Phaser.GameObjects.GameObject[] = []
  private multiplayerNavDebugText?: Phaser.GameObjects.Text
  private useTouchControls = false
  private movePad?: TouchPad
  private firePad?: TouchPad
  private lastAimWorldPoint = new Phaser.Math.Vector2(0, 0)

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
    const params = new URLSearchParams(window.location.search)
    this.debugNavRender = params.get('debugNav') === '1'
    this.coopDebug = params.get('coopDebug') === '1'
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height)
    this.input.mouse?.disableContextMenu()

    this.bullets = this.physics.add.group({ classType: Bullet, runChildUpdate: true })
    this.zombies = this.physics.add.group({ classType: Zombie, runChildUpdate: true })
    this.walls = this.physics.add.staticGroup()

    this.player = new Player(this, this.scale.width / 2, this.scale.height / 2)
    this.lastAimWorldPoint.set(this.player.x + 1, this.player.y)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,FOUR,Q,T,SPACE,E,ENTER') as WasdKeys

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
    this.createTouchControls()
    this.showStartScreen()
    this.syncLeaderboard()
    this.input.on('pointerdown', this.unlockAudio, this)
    this.input.keyboard?.on('keydown', this.unlockAudio, this)

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
      this.input.off('pointerdown', this.handleTouchPointerDown, this)
      this.input.off('pointermove', this.handleTouchPointerMove, this)
      this.input.off('pointerup', this.handleTouchPointerUp, this)
      this.input.off('pointerupoutside', this.handleTouchPointerUp, this)
      this.input.off('pointerdown', this.unlockAudio, this)
      this.input.keyboard?.off('keydown', this.unlockAudio, this)
      this.input.keyboard?.off('keydown', this.handleInitialsKeydown, this)
      this.clearShareFallback()
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
    this.updatePlayerAim()
    this.updateWeaponSwitching()
    if (this.gameMode === 'singlePlayer') {
      this.updateRepairInteraction()
      this.updatePlayerZoneNavigation()
    }
    this.sendMultiplayerState(time)

    if (!this.isIntermission && this.isFiringInputActive()) {
      this.tryShoot(time)
    }

    if (this.gameMode === 'singlePlayer' && !this.isIntermission) {
      this.updatePlayerTools(time)
    }

    this.clearNavigationPathDebug()

    if (this.gameMode === 'singlePlayer') {
      this.updateScreamerAuras()
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
    this.addBarricadeColliders()
  }

  private addBarricadeColliders() {
    this.barricades.forEach((barricade) => {
      this.physics.add.collider(this.player, barricade)
      this.physics.add.collider(this.zombies, barricade)
    })
  }

  private createHud() {
    this.healthBarBg = this.add.rectangle(20, 20, 204, 24, 0x111111, 0.85).setOrigin(0).setScrollFactor(0)
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
    this.perkText = this.add.text(20, 214, '', this.smallHudTextStyle())
    this.toolText = this.add.text(20, 238, '', this.smallHudTextStyle())
    this.multiplayerText = this.add.text(20, 214, '', this.smallHudTextStyle())
    this.messageText = this.add.text(this.scale.width / 2, 34, '', {
      align: 'center',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '20px',
      stroke: '#000000',
      strokeThickness: 4,
      wordWrap: { width: Math.max(220, this.scale.width * 0.72) },
    }).setOrigin(0.5, 0).setDepth(16).setScrollFactor(0)
    this.damageFlash = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xff2222, 0)
      .setScrollFactor(0)
      .setDepth(18)
    this.muteButton = this.add
      .text(this.scale.width - 20, 168, this.audio.muted ? 'Muted' : 'Sound', {
        align: 'center',
        backgroundColor: '#20262b',
        color: '#fff2a8',
        fixedWidth: 88,
        fontFamily: 'Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        padding: { x: 8, y: 12 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(16)
      .setInteractive({ useHandCursor: true })
    this.muteButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      this.audio.unlock()
      const muted = this.audio.toggleMute()
      this.muteButton.setText(muted ? 'Muted' : 'Sound')
    })
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
        padding: { x: 10, y: 10 },
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

    this.skipRoundButton = this.add
      .text(this.scale.width - 20, 94, 'Skip Round', {
        backgroundColor: '#20262b',
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '16px',
        padding: { x: 10, y: 10 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)

    this.skipRoundButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      this.handleNextRoundClick()
    })

    this.highScoreText = this.add
      .text(this.scale.width - 20, 134, formatBestHighScoreLabel(), {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: '16px',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)

    this.layoutHud()
  }

  private createTouchControls() {
    const isTouchDevice = this.sys.game.device.input.touch || window.matchMedia('(pointer: coarse)').matches

    if (!isTouchDevice) {
      return
    }

    this.useTouchControls = true
    this.movePad = this.createTouchPad('MOVE', 0x111111, 0xffffff)
    this.firePad = this.createTouchPad('FIRE', 0x3b1515, 0xff6b6b)
    this.touchWeaponButton = this.createTouchActionButton('Weapon', () => this.cycleOwnedWeapon())
    this.touchRepairButton = this.createTouchActionButton('Repair', () => this.tryRepair())
    this.touchMeleeButton = this.createTouchActionButton('Melee', () => this.tryMelee(this.time.now))
    this.touchMineButton = this.createTouchActionButton('Mine', () => this.tryPlaceMine(this.time.now))
    this.touchTurretButton = this.createTouchActionButton('Turret', () => this.tryPlaceTurret(this.time.now))
    this.layoutTouchControls(this.scale.gameSize)
    this.setTouchActionButtonsVisible(false)
    this.layoutHud()

    this.input.addPointer(2)
    this.input.on('pointerdown', this.handleTouchPointerDown, this)
    this.input.on('pointermove', this.handleTouchPointerMove, this)
    this.input.on('pointerup', this.handleTouchPointerUp, this)
    this.input.on('pointerupoutside', this.handleTouchPointerUp, this)
  }

  private createTouchPad(label: string, baseColor: number, knobColor: number): TouchPad {
    const radius = 52
    const base = this.add
      .circle(0, 0, radius, baseColor, 0.4)
      .setStrokeStyle(3, knobColor, 0.55)
      .setScrollFactor(0)
      .setDepth(50)
    const knob = this.add.circle(0, 0, 20, knobColor, 0.5).setScrollFactor(0).setDepth(51)
    const text = this.add
      .text(0, 0, label, {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: '12px',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(52)

    return {
      base,
      knob,
      label: text,
      centerX: 0,
      centerY: 0,
      radius,
      grabRadius: radius + 18,
      vector: new Phaser.Math.Vector2(0, 0),
    }
  }

  private createTouchActionButton(label: string, onClick: () => void) {
    const button = this.add
      .text(0, 0, label, {
        align: 'center',
        backgroundColor: '#20262b',
        color: '#ffffff',
        fixedWidth: 88,
        fontFamily: 'Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        padding: { x: 8, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })

    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      onClick()
    })

    return button
  }

  private handleTouchPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.isBlockingOverlayOpen()) {
      return
    }

    if (this.movePad && this.movePad.pointerId === undefined && this.isInsidePad(this.movePad, pointer)) {
      this.movePad.pointerId = pointer.id
      this.updateTouchPad(this.movePad, pointer)
      return
    }

    if (this.firePad && this.firePad.pointerId === undefined && this.isInsidePad(this.firePad, pointer)) {
      this.firePad.pointerId = pointer.id
      this.updateTouchPad(this.firePad, pointer)
    }
  }

  private handleTouchPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.movePad?.pointerId === pointer.id) {
      this.updateTouchPad(this.movePad, pointer)
    }

    if (this.firePad?.pointerId === pointer.id) {
      this.updateTouchPad(this.firePad, pointer)
    }
  }

  private handleTouchPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.movePad?.pointerId === pointer.id) {
      this.releaseTouchPad(this.movePad)
    }

    if (this.firePad?.pointerId === pointer.id) {
      this.releaseTouchPad(this.firePad)
    }
  }

  private isInsidePad(pad: TouchPad, pointer: Phaser.Input.Pointer) {
    return Phaser.Math.Distance.Between(pointer.x, pointer.y, pad.centerX, pad.centerY) <= pad.grabRadius
  }

  private updateTouchPad(pad: TouchPad, pointer: Phaser.Input.Pointer) {
    const offset = new Phaser.Math.Vector2(pointer.x - pad.centerX, pointer.y - pad.centerY)
    const distance = offset.length()
    const clampedDistance = Math.min(distance, pad.radius)
    const direction = distance > 0 ? offset.clone().normalize() : new Phaser.Math.Vector2(0, 0)

    pad.vector.copy(direction).scale(clampedDistance / pad.radius)
    pad.knob.setPosition(pad.centerX + direction.x * clampedDistance, pad.centerY + direction.y * clampedDistance)
  }

  private releaseTouchPad(pad: TouchPad) {
    pad.pointerId = undefined
    pad.vector.set(0, 0)
    pad.knob.setPosition(pad.centerX, pad.centerY)
  }

  private layoutTouchControls(gameSize: Phaser.Structs.Size) {
    if (!this.movePad || !this.firePad) {
      return
    }

    const inset = this.getSafeInsets()
    const radius = this.movePad.radius
    const bottom = gameSize.height - Math.max(18, inset.bottom + 12) - radius

    this.placeTouchPad(this.movePad, Math.max(18, inset.left + 12) + radius, bottom)
    this.placeTouchPad(this.firePad, gameSize.width - Math.max(18, inset.right + 12) - radius, bottom)

    const fireX = this.firePad.centerX
    const fireTop = this.firePad.centerY - radius - 36
    this.touchRepairButton?.setPosition(fireX, fireTop)
    this.touchWeaponButton?.setPosition(fireX, fireTop - 52)
    this.touchMeleeButton?.setPosition(fireX, fireTop - 104)
    this.touchMineButton?.setPosition(fireX, fireTop - 156)
    this.touchTurretButton?.setPosition(fireX, fireTop - 208)
  }

  private placeTouchPad(pad: TouchPad, x: number, y: number) {
    pad.centerX = x
    pad.centerY = y
    pad.base.setPosition(x, y)
    pad.label.setPosition(x, y)
    if (pad.pointerId === undefined) {
      pad.knob.setPosition(x, y)
    }
  }

  private showStartScreen() {
    const status = this.multiplayerStatusText?.text ?? ''
    this.startOverlay?.destroy()

    const compact = this.isCompactMenu()
    const centerX = this.scale.width / 2
    const centerY = this.scale.height / 2
    const panel = this.add.rectangle(0, 0, compact ? 360 : 680, compact ? 640 : 660, 0x000000, 0.94)
    const title = this.add
      .text(0, compact ? -292 : -300, 'FINAL DAYZ', {
        color: '#ff5555',
        fontFamily: 'Arial',
        fontSize: compact ? 32 : 52,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const instructions = this.add
      .text(0, compact ? -236 : -230, this.getStartInstructions(), {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: compact ? 14 : 18,
        lineSpacing: compact ? 4 : 6,
      })
      .setOrigin(0.5)
    this.startHighScoreLabel = this.add
      .text(0, compact ? -168 : -150, formatBestHighScoreLabel(), {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: compact ? 18 : 24,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.startPersonalText = this.add
      .text(0, compact ? -142 : -118, formatPersonalBestLabel(), {
        color: '#d9e8d9',
        fontFamily: 'Arial',
        fontSize: compact ? 13 : 16,
      })
      .setOrigin(0.5)
    this.startBoardText = this.add
      .text(0, compact ? -78 : -40, this.formatStartBoard(), {
        align: 'center',
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: compact ? 15 : 18,
        lineSpacing: 4,
      })
      .setOrigin(0.5)
    this.startSourceText = this.add
      .text(0, compact ? -8 : 48, this.formatScoreSourceNote(), {
        color: '#8d9794',
        fontFamily: 'Arial',
        fontSize: compact ? 13 : 14,
      })
      .setOrigin(0.5)
    const buttonY = compact ? 40 : 100
    const buttonGap = compact ? 52 : 58
    const singlePlayerButton = this.createStartMenuButton(0, buttonY, 'Single Player', 0x2ecc71, () => this.startGame('singlePlayer'))
    const menuItems: Phaser.GameObjects.GameObject[] = [
      panel,
      title,
      instructions,
      this.startHighScoreLabel,
      this.startPersonalText,
      this.startBoardText,
      this.startSourceText,
      singlePlayerButton,
    ]

    if (this.coopDebug) {
      menuItems.push(this.createStartMenuButton(0, buttonY + buttonGap, 'Create Co-op Room', 0x4aa3ff, () => this.createCoopRoom()))
      menuItems.push(this.createStartMenuButton(0, buttonY + buttonGap * 2, 'Join Co-op Room', 0xffc857, () => this.promptJoinCoopRoom()))
      this.multiplayerStatusText = this.add
        .text(0, buttonY + buttonGap * 3 + 8, status, {
          align: 'center',
          color: '#fff2a8',
          fontFamily: 'Arial',
          fontSize: compact ? 14 : 18,
          stroke: '#000000',
          strokeThickness: 3,
          wordWrap: { width: compact ? 320 : 520 },
        })
        .setOrigin(0.5)
      menuItems.push(this.multiplayerStatusText)
    } else {
      this.multiplayerStatusText = undefined
      menuItems.push(
        this.add
          .text(0, buttonY + buttonGap + 6, 'Co-op coming soon', {
            align: 'center',
            color: '#8d9794',
            fontFamily: 'Arial',
            fontSize: compact ? 18 : 22,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      menuItems.push(
        this.add
          .text(0, buttonY + buttonGap + (compact ? 28 : 34), 'Online co-op is being rebuilt for smoother play.', {
            align: 'center',
            color: '#6f7874',
            fontFamily: 'Arial',
            fontSize: compact ? 13 : 15,
          })
          .setOrigin(0.5),
      )
      menuItems.push(
        this.add
          .text(0, buttonY + buttonGap + (compact ? 58 : 68), 'Daily Challenge coming soon', {
            align: 'center',
            color: '#6f7874',
            fontFamily: 'Arial',
            fontSize: compact ? 14 : 16,
          })
          .setOrigin(0.5),
      )
    }

    this.startOverlay = this.add.container(centerX, centerY, menuItems)
    this.startOverlay.setDepth(10)
    this.layoutHud()
  }

  private getStartInstructions() {
    if (this.useTouchControls) {
      return 'Left stick to move\nRight pad to aim and fire\nWeapon cycles guns\nRepair fixes nearby barricades'
    }

    return 'WASD to move\nMouse to aim\nHold left click to shoot\n1/2/3 switch weapons\nE repairs damaged barricades'
  }

  private createStartMenuButton(x: number, y: number, label: string, backgroundColor: number, onClick: () => void) {
    const compact = this.isCompactMenu()
    const button = this.add
      .text(x, y, label, {
        backgroundColor: Phaser.Display.Color.IntegerToColor(backgroundColor).rgba,
        color: '#101316',
        fixedWidth: compact ? 280 : 250,
        fontFamily: 'Arial',
        fontSize: compact ? 18 : 22,
        fontStyle: 'bold',
        padding: { x: 14, y: compact ? 12 : 10 },
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
    this.skipRoundButton.setVisible(mode === 'singlePlayer')
    this.startOverlay?.destroy()
    this.startOverlay = undefined
    this.startHighScoreLabel = undefined
    this.startBoardText = undefined
    this.startSourceText = undefined
    this.startPersonalText = undefined
    this.multiplayerStatusText = undefined
    this.layoutHud()
    this.setTouchActionButtonsVisible(true)
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
    this.startHighScoreLabel = undefined
    this.startBoardText = undefined
    this.startSourceText = undefined
    this.startPersonalText = undefined
    this.multiplayerStatusText = undefined
    this.lobbyOverlay?.destroy()

    const compact = this.isCompactMenu()
    const panel = this.add.rectangle(0, 0, compact ? 360 : 620, compact ? 460 : 390, 0x000000, 0.86)
    const title = this.add
      .text(0, compact ? -180 : -150, 'CO-OP LOBBY', {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: compact ? 28 : 36,
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
      aimX: this.lastAimWorldPoint.x,
      aimY: this.lastAimWorldPoint.y,
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

  private createMuzzleFlash(x: number, y: number, angle: number, color = 0xfff2a8, radius = 7) {
    const distance = 32
    const flash = this.add.circle(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      radius,
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
    this.renderMultiplayerNavDebug(gameState)

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
      view.sprite.setTint(zombie.color)
      view.sprite.setDisplaySize(zombie.radius * 2, zombie.radius * 2)
      view.enemyType = zombie.enemyType
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
    const view: ServerZombieView = { sprite, healthBarBg, healthBarFill }

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

  private renderMultiplayerNavDebug(gameState: NetworkGameState) {
    if (!this.debugNavRender) {
      this.clearMultiplayerNavDebug()
      return
    }

    this.clearMultiplayerNavDebug()

    const debugNav = gameState.debugNav

    if (!debugNav) {
      this.multiplayerNavDebugText = this.add
        .text(12, this.scale.height - 24, 'debugNav=1: waiting for server debug nav data', {
          color: '#ffdd88',
          fontFamily: 'Arial',
          fontSize: '12px',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setScrollFactor(0)
        .setDepth(100)
      return
    }

    this.drawServerBlockers(debugNav)
    this.drawServerNavGraph(debugNav)
    this.drawServerZombieDebug(gameState.zombies)
    this.drawDebugSummary(gameState)
  }

  private drawServerBlockers(debugNav: NetworkDebugNavState) {
    const graphics = this.add.graphics().setDepth(8)

    graphics.fillStyle(0xff3333, 0.15)
    graphics.lineStyle(1, 0xff7777, 0.55)
    debugNav.wallRects.forEach((rect) => {
      graphics.fillRect(rect.x, rect.y, rect.width, rect.height)
      graphics.strokeRect(rect.x, rect.y, rect.width, rect.height)
    })

    debugNav.barricadeRects.forEach((rect) => {
      graphics.fillStyle(rect.alive ? 0xffaa00 : 0x55ff55, rect.alive ? 0.2 : 0.1)
      graphics.lineStyle(1, rect.alive ? 0xffcc55 : 0x55ff55, 0.7)
      graphics.fillRect(rect.x, rect.y, rect.width, rect.height)
      graphics.strokeRect(rect.x, rect.y, rect.width, rect.height)
    })

    this.multiplayerNavDebugObjects.push(graphics)
  }

  private drawServerNavGraph(debugNav: NetworkDebugNavState) {
    const nodeById = new Map(debugNav.navNodes.map((node) => [node.id, node]))
    const graphics = this.add.graphics().setDepth(9)

    debugNav.edges.forEach((edge) => {
      const from = nodeById.get(edge.from)
      const to = nodeById.get(edge.to)

      if (!from || !to) {
        return
      }

      const isDoorEdge = Boolean(edge.entryId)
      graphics.lineStyle(
        isDoorEdge ? 2 : 1,
        isDoorEdge ? (edge.open ? 0x63ff7a : 0xff4d4d) : 0x6ab7ff,
        isDoorEdge ? 0.75 : 0.28,
      )
      graphics.lineBetween(from.x, from.y, to.x, to.y)
    })

    debugNav.navNodes.forEach((node) => {
      const color = node.zone === 'inside' ? 0x6ab7ff : node.zone === 'door' ? 0xfff27a : 0xd28cff
      graphics.fillStyle(color, 0.9)
      graphics.fillCircle(node.x, node.y, 5)
      graphics.lineStyle(1, 0x000000, 0.9)
      graphics.strokeCircle(node.x, node.y, 5)

      const label = this.add
        .text(node.x + 8, node.y - 8, node.id, {
          color: '#ffffff',
          fontFamily: 'Arial',
          fontSize: '10px',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setDepth(10)
      this.multiplayerNavDebugObjects.push(label)
    })

    this.multiplayerNavDebugObjects.push(graphics)
  }

  private drawServerZombieDebug(zombies: NetworkZombieState[]) {
    const graphics = this.add.graphics().setDepth(10)

    zombies.forEach((zombie) => {
      const target = zombie.currentTargetPoint

      if (target) {
        graphics.lineStyle(1, 0xffffff, 0.45)
        graphics.lineBetween(zombie.x, zombie.y, target.x, target.y)
        graphics.fillStyle(0xffffff, 0.9)
        graphics.fillCircle(target.x, target.y, 4)
      }

      const routeNode = zombie.routeNodeIds?.[zombie.routeIndex ?? 0]
      const targetLabel = routeNode ?? zombie.targetDoorwayId ?? zombie.targetEntryId ?? zombie.targetPlayerId?.slice(0, 4) ?? 'none'
      const labelText = [
        zombie.navState ?? 'unknown',
        `to ${targetLabel}`,
        `stuck ${zombie.stuckCount ?? 0}`,
        zombie.zone ?? 'zone?',
      ].join('\n')
      const label = this.add
        .text(zombie.x, zombie.y - 54, labelText, {
          color: '#ffffff',
          fontFamily: 'Arial',
          fontSize: '10px',
          align: 'center',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(11)

      this.multiplayerNavDebugObjects.push(label)
    })

    this.multiplayerNavDebugObjects.push(graphics)
  }

  private drawDebugSummary(gameState: NetworkGameState) {
    const aliveBarricades = gameState.barricades.filter((barricade) => barricade.health > 0).length

    this.multiplayerNavDebugText = this.add
      .text(
        12,
        120,
        [
          `Final Dayz client ${CLIENT_DEBUG_VERSION}`,
          `server ${getSocketServerUrl()}`,
          `room ${gameState.roomCode} phase ${gameState.phase}`,
          `wave ${gameState.wave} zombies ${gameState.zombies.length}`,
          `barricades ${aliveBarricades}/${gameState.barricades.length}`,
        ].join('\n'),
        {
          color: '#d9f7ff',
          fontFamily: 'Arial',
          fontSize: '12px',
          stroke: '#000000',
          strokeThickness: 3,
        },
      )
      .setScrollFactor(0)
      .setDepth(100)
  }

  private clearMultiplayerNavDebug() {
    this.multiplayerNavDebugObjects.forEach((object) => object.destroy())
    this.multiplayerNavDebugObjects = []
    this.multiplayerNavDebugText?.destroy()
    this.multiplayerNavDebugText = undefined
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
    this.score = gameState.score
    this.scoreText.setText(`Score ${this.score}`)
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
    this.clearMultiplayerNavDebug()
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
      fontSize: this.isNarrowHud() ? '13px' : '16px',
      stroke: '#000000',
      strokeThickness: 3,
    }
  }

  private isCompactMenu() {
    return this.scale.width < 520 || this.scale.height < 720
  }

  private isNarrowHud() {
    return this.scale.width < 540
  }

  private isBlockingOverlayOpen() {
    return Boolean(this.startOverlay || this.shopOverlay || this.perkOverlay || this.lobbyOverlay || this.gameOverOverlay || this.isPaused)
  }

  private getSafeInsets() {
    const root = getComputedStyle(document.documentElement)
    return {
      top: parseFloat(root.getPropertyValue('--sat')) || 0,
      right: parseFloat(root.getPropertyValue('--sar')) || 0,
      bottom: parseFloat(root.getPropertyValue('--sab')) || 0,
      left: parseFloat(root.getPropertyValue('--sal')) || 0,
    }
  }

  private setTouchActionButtonsVisible(visible: boolean) {
    const showWeapon = visible && this.useTouchControls && this.isStarted && !this.isGameOver && !this.shopOverlay && !this.perkOverlay
    const showRepair = showWeapon && this.gameMode === 'singlePlayer'
    this.touchWeaponButton?.setVisible(showWeapon)
    this.touchRepairButton?.setVisible(showRepair)
    this.touchMeleeButton?.setVisible(showWeapon)
    this.touchMineButton?.setVisible(showWeapon && this.ownsMines)
    this.touchTurretButton?.setVisible(showWeapon && this.ownsTurret)
    this.movePad?.base.setVisible(showWeapon)
    this.movePad?.knob.setVisible(showWeapon)
    this.movePad?.label.setVisible(showWeapon)
    this.firePad?.base.setVisible(showWeapon)
    this.firePad?.knob.setVisible(showWeapon)
    this.firePad?.label.setVisible(showWeapon)
  }

  private layoutHud() {
    const inset = this.getSafeInsets()
    const narrow = this.isNarrowHud()
    const left = 12 + inset.left
    const top = 12 + inset.top
    const right = this.scale.width - 12 - inset.right
    this.healthBarMaxWidth = narrow ? 132 : 200

    this.healthBarBg.setPosition(left, top)
    this.healthBarBg.width = this.healthBarMaxWidth + 4
    this.healthBarBg.height = 22
    this.healthFill.setPosition(left + 2, top + 2)
    this.healthFill.height = 18
    this.healthText.setPosition(left + 8, top + 3)
    this.healthText.setFontSize(narrow ? 12 : 14)

    const hideCombatHud = Boolean(this.shopOverlay || this.perkOverlay || this.startOverlay || this.gameOverOverlay)
    const line = narrow ? 22 : 28
    this.waveText.setPosition(left, top + 30)
    this.scoreText.setPosition(left, top + 30 + line)
    this.cashText.setPosition(left, top + 30 + line * 2)
    this.weaponText.setPosition(left, top + 30 + line * 3)
    this.ownedWeaponsText.setPosition(left, top + 30 + line * 4)
    this.barricadeText.setPosition(left, top + 30 + line * 5)
    this.perkText.setPosition(left, top + 30 + line * 6)
    this.perkText.setWordWrapWidth(narrow ? 160 : 260)
    this.toolText.setPosition(left, top + 30 + line * 7)
    this.multiplayerText.setPosition(left, top + 30 + line * 8)
    this.toolText.setText(this.formatToolHud())
    this.toolText.setVisible(!hideCombatHud && !narrow && (this.ownsMines || this.ownsTurret))
    this.waveText.setFontSize(narrow ? 14 : 20)
    this.scoreText.setFontSize(narrow ? 14 : 20)
    this.cashText.setFontSize(narrow ? 14 : 20)
    this.weaponText.setFontSize(narrow ? 14 : 20)
    this.healthBarBg.setVisible(!hideCombatHud)
    this.healthFill.setVisible(!hideCombatHud)
    this.healthText.setVisible(!hideCombatHud)
    this.waveText.setVisible(!hideCombatHud)
    this.scoreText.setVisible(!hideCombatHud)
    this.cashText.setVisible(!hideCombatHud)
    this.weaponText.setVisible(!hideCombatHud)
    this.timerText.setVisible(!hideCombatHud)
    this.highScoreText.setVisible(!hideCombatHud && !narrow)
    this.ownedWeaponsText.setVisible(!hideCombatHud && !narrow)
    this.barricadeText.setVisible(!hideCombatHud && !narrow)
    this.perkText.setVisible(!hideCombatHud && !narrow && this.ownedPerks.length > 0)
    this.refreshPerkHud()

    this.pauseButton.setPosition(right, top)
    this.pauseButton.setVisible(this.isStarted && !this.startOverlay && !this.gameOverOverlay && !this.shopOverlay && !this.perkOverlay)
    this.timerText.setPosition(right, top + 48)
    this.skipRoundButton.setPosition(right, top + 84)
    this.highScoreText.setPosition(right, top + (narrow ? 128 : 134))
    this.highScoreText.setVisible(!narrow)
    if (this.startOverlay) {
      this.muteButton?.setOrigin(0.5, 1)
      this.muteButton?.setPosition(this.scale.width / 2, this.scale.height - Math.max(16, inset.bottom + 8))
    } else if (this.shopOverlay || this.perkOverlay) {
      this.muteButton?.setOrigin(0, 1)
      this.muteButton?.setPosition(left, this.scale.height - Math.max(8, inset.bottom + 4))
      this.skipRoundButton?.setVisible(false)
    } else {
      this.muteButton?.setOrigin(1, 0)
      this.muteButton?.setPosition(right, top + (narrow ? 128 : 168))
    }
    const messageY = this.shopOverlay || this.perkOverlay ? this.scale.height * 0.7 : Math.max(top + 96, this.scale.height * 0.16)
    this.messageText.setPosition(this.scale.width / 2, messageY)
    this.messageText.setWordWrapWidth(Math.max(220, this.scale.width * 0.7))
    this.damageFlash?.setPosition(this.scale.width / 2, this.scale.height / 2)
    this.damageFlash?.setSize(this.scale.width, this.scale.height)
    this.repairHintText.setPosition(
      this.scale.width / 2,
      this.scale.height - Math.max(150, 72 + inset.bottom + (this.useTouchControls ? 110 : 0)),
    )
    this.repairHintText.setFontSize(narrow ? 16 : 20)
    this.updateHealthBar()
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
    if (amount > 0) {
      this.cashEarned += amount
    }
    this.cashText.setText(`Cash $${this.cash}`)
  }

  private spendCash(amount: number) {
    if (this.cash < amount) {
      this.showMessage('Not enough cash', 'warning')
      this.playSound('notEnoughCash')
      return false
    }

    this.updateCash(-amount)
    return true
  }

  private updateBarricadeHud() {
    this.barricadeText.setText(this.getBarricadeStatusLabel())
  }

  private unlockAudio() {
    this.audio.unlock()
  }

  private playSound(id: SoundId) {
    this.audio.play(this, id)
  }

  private vibrate(durationMs: number) {
    if (!this.useTouchControls || this.audio.muted || durationMs <= 0) {
      return
    }

    navigator.vibrate?.(durationMs)
  }

  private showMessage(message: string, kind: 'info' | 'warning' | 'danger' | 'money' = 'info') {
    const color = {
      info: '#ffffff',
      warning: '#fff2a8',
      danger: '#ff6b6b',
      money: '#7dffb3',
    }[kind]

    this.messageTimer?.remove(false)
    this.messageText.setColor(color)
    this.messageText.setFontSize(this.isNarrowHud() ? 16 : 22)
    this.messageText.setText(message)

    this.messageTimer = this.time.delayedCall(1500, () => {
      this.messageText.setText('')
    })
  }

  private showWaveBanner(text: string, color = '#fff2a8') {
    this.waveBanner?.destroy()
    this.waveBanner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.28, text, {
        align: 'center',
        color,
        fontFamily: 'Arial',
        fontSize: this.isNarrowHud() ? '28px' : '40px',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(17)

    this.tweens.add({
      targets: this.waveBanner,
      alpha: 0,
      delay: 900,
      duration: 380,
      onComplete: () => {
        this.waveBanner?.destroy()
        this.waveBanner = undefined
      },
    })
  }

  private doorName(id: EntryPointId) {
    return { top: 'North', bottom: 'South', left: 'West', right: 'East' }[id]
  }

  private showDoorLabel(entry: EntryPoint, text: string) {
    this.doorWarnings.get(entry.id)?.destroy()
    const label = this.add
      .text(entry.doorwayPoint.x, entry.doorwayPoint.y - 36, text, {
        align: 'center',
        color: '#ff5555',
        fontFamily: 'Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(8)

    this.doorWarnings.set(entry.id, label)
    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 16,
      delay: 1100,
      duration: 420,
      onComplete: () => {
        label.destroy()
        if (this.doorWarnings.get(entry.id) === label) {
          this.doorWarnings.delete(entry.id)
        }
      },
    })
  }

  private hurtPlayer(amount: number, heavy = false, contact = false) {
    if (amount <= 0 || this.isGameOver) {
      return
    }

    const dealt = contact && this.hasPerk('thickSkin') ? Math.max(1, Math.round(amount * 0.9)) : amount
    this.player.takeDamage(dealt)
    this.player.setTint(0xff6666)
    this.time.delayedCall(90, () => {
      if (this.player.active) {
        this.player.clearTint()
      }
    })
    this.damageFlash.setAlpha(heavy ? 0.32 : 0.18)
    this.tweens.killTweensOf(this.damageFlash)
    this.tweens.add({ targets: this.damageFlash, alpha: 0, duration: heavy ? 220 : 140 })
    this.healthFill.fillColor = 0xffffff
    this.time.delayedCall(90, () => {
      if (!this.isGameOver) {
        this.updateHealthBar()
      }
    })
    this.cameras.main.shake(heavy ? 110 : 60, heavy ? 0.005 : 0.0025)
    this.playSound('playerHurt')
    this.vibrate(heavy ? 28 : 16)
    this.updateHealthBar()

    if (this.player.health <= 0) {
      this.endGame()
    }
  }

  private spawnHitSpark(x: number, y: number, color: number, count: number, distance: number) {
    for (let index = 0; index < count; index += 1) {
      const spark = this.add.circle(x, y, 2, color, 0.95).setDepth(6)
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const travel = Phaser.Math.Between(6, distance)
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * travel,
        y: y + Math.sin(angle) * travel,
        alpha: 0,
        duration: 130,
        onComplete: () => spark.destroy(),
      })
    }
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

    if (this.movePad && this.movePad.vector.lengthSq() > 0.01) {
      direction.x += this.movePad.vector.x
      direction.y += this.movePad.vector.y
    }

    direction.normalize().scale(this.player.speed)
    body.setVelocity(direction.x, direction.y)
  }

  private isFiringInputActive() {
    if (this.useTouchControls) {
      return this.firePad?.pointerId !== undefined
    }

    return this.input.activePointer.isDown
  }

  private updatePlayerAim() {
    if (this.useTouchControls) {
      if (this.firePad && this.firePad.vector.lengthSq() > 0.01) {
        this.lastAimWorldPoint.set(
          this.player.x + this.firePad.vector.x * 120,
          this.player.y + this.firePad.vector.y * 120,
        )
      }
    } else {
      const pointer = this.input.activePointer
      const aimPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.lastAimWorldPoint.set(aimPoint.x, aimPoint.y)
    }

    this.player.rotation = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      this.lastAimWorldPoint.x,
      this.lastAimWorldPoint.y,
    )
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

    if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) {
      this.setWeapon('rifle')
    }
  }

  private updatePlayerTools(time: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) {
      this.tryPlaceMine(time)
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.T)) {
      this.tryPlaceTurret(time)
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.tryMelee(time)
    }

    this.updateMines(time)
    this.updateTurrets(time)
    this.refreshMeleeButton(time)
  }

  private formatToolHud() {
    const parts: string[] = []
    if (this.ownsMines) {
      parts.push(`Mines ${this.mines.length}/${toolConfig.mineMax}`)
    }
    if (this.ownsTurret) {
      parts.push(`Turrets ${this.turrets.length}/${toolConfig.turretMax}`)
    }
    return parts.join('  ')
  }

  private refreshMeleeButton(time: number) {
    if (!this.touchMeleeButton) {
      return
    }

    const readyIn = toolConfig.meleeCooldownMs - (time - this.lastMeleeAt)
    this.touchMeleeButton.setText(readyIn > 0 ? `Melee ${(readyIn / 1000).toFixed(1)}` : 'Melee')
  }

  private tryPlaceMine(time: number) {
    if (!this.ownsMines || this.isIntermission || this.isGameOver) {
      return
    }

    if (this.mines.length >= toolConfig.mineMax) {
      this.showMessage('Max mines placed', 'warning')
      return
    }

    if (!this.spendCash(toolConfig.minePlaceCost)) {
      return
    }

    const sprite = this.add.circle(this.player.x, this.player.y, 8, 0xffc857, 0.9).setStrokeStyle(2, 0xff8c1a).setDepth(4)
    this.mines.push({ x: this.player.x, y: this.player.y, armedAt: time + toolConfig.mineArmMs, sprite })
    this.playSound('minePlace')
    this.showMessage('Mine placed', 'info')
  }

  private tryPlaceTurret(time: number) {
    if (!this.ownsTurret || this.isIntermission || this.isGameOver) {
      return
    }

    if (this.turrets.length >= toolConfig.turretMax) {
      this.showMessage('Max turrets placed', 'warning')
      return
    }

    if (!this.spendCash(toolConfig.turretPlaceCost)) {
      return
    }

    const base = this.add.circle(this.player.x, this.player.y, 12, 0x8fd3ff, 0.95).setStrokeStyle(2, 0xd7f3ff).setDepth(4)
    const aim = this.add.rectangle(this.player.x + 16, this.player.y, 16, 3, 0xd7f3ff).setDepth(4)
    this.turrets.push({ x: this.player.x, y: this.player.y, lastShotAt: time, base, aim })
    this.playSound('turretPlace')
    this.showMessage('Turret placed', 'info')
  }

  private tryMelee(time: number) {
    if (this.isIntermission || this.isGameOver || time - this.lastMeleeAt < toolConfig.meleeCooldownMs) {
      return
    }

    this.lastMeleeAt = time
    this.playSound('meleeSwing')
    this.vibrate(16)
    const aim = new Phaser.Math.Vector2(this.lastAimWorldPoint.x - this.player.x, this.lastAimWorldPoint.y - this.player.y)
    if (aim.lengthSq() === 0) {
      aim.set(Math.cos(this.player.rotation), Math.sin(this.player.rotation))
    }
    aim.normalize()
    const arc = this.add.circle(this.player.x + aim.x * 28, this.player.y + aim.y * 28, toolConfig.meleeRange * 0.55, 0xd7f3ff, 0.28).setDepth(5)
    this.tweens.add({
      targets: arc,
      alpha: 0,
      scale: 1.2,
      duration: 140,
      onComplete: () => arc.destroy(),
    })

    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      if (!zombie.active) {
        return true
      }

      const offset = new Phaser.Math.Vector2(zombie.x - this.player.x, zombie.y - this.player.y)
      if (offset.length() > toolConfig.meleeRange) {
        return true
      }

      const away = offset.lengthSq() > 0 ? offset.clone().normalize() : aim
      this.applyZombieDamage(zombie, this.getMeleeDamage(), away.x * 2.4, away.y * 2.4, false)
      return true
    })
  }

  private getMeleeDamage() {
    let damage = toolConfig.meleeDamage
    if (this.hasPerk('lastStand') && this.player.health / this.player.maxHealth < 0.3) {
      damage = Math.round(damage * 1.25)
    }
    return damage
  }

  private updateMines(time: number) {
    const pending: PlacedMine[] = []
    this.mines.forEach((mine) => {
      if (time < mine.armedAt) {
        pending.push(mine)
        return
      }

      const triggered = this.zombies.children.entries.some((child) => {
        const zombie = child as Zombie
        return zombie.active && Phaser.Math.Distance.Between(zombie.x, zombie.y, mine.x, mine.y) <= toolConfig.mineTriggerRadius
      })

      if (!triggered) {
        pending.push(mine)
        return
      }

      this.detonateMine(mine)
    })
    this.mines = pending
  }

  private detonateMine(mine: PlacedMine) {
    mine.sprite.destroy()
    this.playSound('mineBoom')
    this.cameras.main.shake(70, 0.004)
    const burst = this.add.circle(mine.x, mine.y, toolConfig.mineExplosionRadius, 0xff8c1a, 0.28).setDepth(4)
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.15,
      duration: 180,
      onComplete: () => burst.destroy(),
    })

    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      if (!zombie.active) {
        return true
      }

      const offset = new Phaser.Math.Vector2(zombie.x - mine.x, zombie.y - mine.y)
      if (offset.length() > toolConfig.mineExplosionRadius) {
        return true
      }

      const away = offset.lengthSq() > 0 ? offset.clone().normalize() : new Phaser.Math.Vector2(1, 0)
      this.applyZombieDamage(zombie, toolConfig.mineDamage, away.x, away.y, false)
      return true
    })
  }

  private updateTurrets(time: number) {
    this.turrets.forEach((turret) => {
      const target = this.nearestZombie(turret.x, turret.y, toolConfig.turretRange)
      if (!target) {
        turret.aim.setPosition(turret.x + 16, turret.y)
        return
      }

      const angle = Phaser.Math.Angle.Between(turret.x, turret.y, target.x, target.y)
      turret.aim.setPosition(turret.x + Math.cos(angle) * 18, turret.y + Math.sin(angle) * 18)
      turret.aim.setRotation(angle)
      if (time - turret.lastShotAt < toolConfig.turretFireRateMs) {
        return
      }

      turret.lastShotAt = time
      this.playSound('turretShot')
      const direction = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle))
      const bullet = new Bullet(
        this,
        turret.x + direction.x * 16,
        turret.y + direction.y * 16,
        toolConfig.turretDamage + Math.floor(this.damageBonus / 2),
        1400,
        'turret',
      )
      this.bullets.add(bullet)
      bullet.launch(direction.x, direction.y)
    })
  }

  private nearestZombie(x: number, y: number, range: number) {
    let closest: Zombie | undefined
    let closestDistance = range
    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      if (!zombie.active) {
        return true
      }

      const distance = Phaser.Math.Distance.Between(x, y, zombie.x, zombie.y)
      if (distance <= closestDistance) {
        closest = zombie
        closestDistance = distance
      }
      return true
    })
    return closest
  }

  private tickFlamethrower(_time: number, angle: number) {
    this.playSound('flameTick')
    const range = this.currentWeapon.range ?? 150
    const halfCone = Phaser.Math.DegToRad(this.currentWeapon.spreadDegrees / 2)
    for (let index = 0; index < 4; index += 1) {
      const puffAngle = angle + Phaser.Math.FloatBetween(-halfCone, halfCone)
      const distance = Phaser.Math.Between(24, range)
      const puff = this.add.circle(
        this.player.x + Math.cos(puffAngle) * distance,
        this.player.y + Math.sin(puffAngle) * distance,
        Phaser.Math.Between(4, 8),
        index % 2 === 0 ? 0xff8c1a : 0xffe08a,
        0.7,
      ).setDepth(5)
      this.tweens.add({
        targets: puff,
        alpha: 0,
        scale: 0.4,
        duration: 120,
        onComplete: () => puff.destroy(),
      })
    }

    const damage = this.getShotDamage(this.currentWeapon)
    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      if (!zombie.active) {
        return true
      }

      const offset = new Phaser.Math.Vector2(zombie.x - this.player.x, zombie.y - this.player.y)
      const distance = offset.length()
      if (distance > range || distance < 8) {
        return true
      }

      const aim = Math.atan2(offset.y, offset.x)
      const delta = Math.atan2(Math.sin(aim - angle), Math.cos(aim - angle))
      if (Math.abs(delta) > halfCone) {
        return true
      }

      const knock = offset.normalize()
      this.applyZombieDamage(zombie, damage, knock.x * 0.15, knock.y * 0.15, true)
      return true
    })
  }

  private applyZombieDamage(zombie: Zombie, damage: number, knockX: number, knockY: number, quietHit: boolean) {
    const deathX = zombie.x
    const deathY = zombie.y
    if (!quietHit) {
      this.spawnHitSpark(deathX, deathY, 0xfff2a8, 3, 16)
      this.playSound('zombieHit')
    }

    if (!zombie.takeDamage(damage, knockX, knockY)) {
      return
    }

    this.score += zombie.scoreValue
    this.zombiesKilled += 1
    this.updateCash(waveConfig.cashPerKill)
    this.scoreText.setText(`Score ${this.score}`)
    this.notePersonalBestBeaten()
    const deathColor = zombie.enemyType === 'exploder' ? 0xff8c1a : enemyConfigs[zombie.enemyType].color
    const deathScale = zombie.enemyType === 'warden' ? 1.8 : 1
    this.spawnZombieDeathEffect(deathX, deathY, deathColor, deathScale)
    this.triggerExploderBurst(zombie, deathX, deathY, false)
    this.showFloatingScore(deathX, deathY, zombie.scoreValue, zombie.enemyType === 'warden' ? 28 : 18)
    if (zombie.enemyType === 'warden') {
      this.playSound('wardenDeath')
      this.showWaveBanner('THE WARDEN IS DOWN', '#8eb4ff')
      this.showMessage(`THE WARDEN IS DOWN  +${zombie.scoreValue}`, 'money')
      this.cameras.main.shake(150, 0.007)
    } else {
      this.playSound('zombieDeath')
    }
  }

  private setWeapon(weaponId: WeaponId) {
    if (!this.ownedWeapons.has(weaponId)) {
      this.showMessage('Weapon not owned')
      return
    }

    this.currentWeaponId = weaponId
    this.weaponText.setText(`Weapon ${this.currentWeapon.name}`)
    this.touchWeaponButton?.setText(this.currentWeapon.name)
    this.emitMultiplayerStateNow()
  }

  private cycleOwnedWeapon() {
    const owned = weaponCycle.filter((weaponId) => this.ownedWeapons.has(weaponId))
    const currentIndex = owned.indexOf(this.currentWeaponId)
    const nextWeapon = owned[(currentIndex + 1 + owned.length) % owned.length]

    if (nextWeapon) {
      this.setWeapon(nextWeapon)
    }
  }

  private updateRepairInteraction() {
    const repairTarget = this.getNearbyDamagedBarricade()
    const hint = this.useTouchControls
      ? `Tap Repair ($${this.getRepairCost()})`
      : `Press E to repair ($${this.getRepairCost()})`
    this.repairHintText.setText(repairTarget ? hint : '')

    if (!repairTarget || !Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      return
    }

    this.tryRepair()
  }

  private tryRepair() {
    if (this.gameMode !== 'singlePlayer') {
      return
    }

    const repairTarget = this.getNearbyDamagedBarricade()

    if (!repairTarget) {
      this.showMessage('No damaged barricade nearby')
      return
    }

    if (!this.spendCash(this.getRepairCost())) {
      return
    }

    repairTarget.repair(this.getRepairAmount())
    this.repairsDone += 1
    this.rebuildNavigationGrid()
    this.invalidateZombiePaths()
    this.updateBarricadeHud()
    this.playSound('repair')
    this.showMessage('Repaired', 'money')
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

    const direction = new Phaser.Math.Vector2(this.lastAimWorldPoint.x - this.player.x, this.lastAimWorldPoint.y - this.player.y)

    if (direction.lengthSq() === 0) {
      return
    }

    direction.normalize()

    const spawnOffset = 28
    const baseAngle = Math.atan2(direction.y, direction.x)
    const spreadRadians = Phaser.Math.DegToRad(weapon.spreadDegrees)
    const pelletCount = this.getPelletCount(weapon)
    const shotDamage = this.getShotDamage(weapon)
    const firstShotOffset = pelletCount > 1 ? -spreadRadians / 2 : 0
    const angleStep = pelletCount > 1 ? spreadRadians / (pelletCount - 1) : 0

    if (weapon.kind === 'cone') {
      this.tickFlamethrower(time, baseAngle)
      return
    }

    const muzzleRadius = weapon.id === 'shotgun' ? 14 : weapon.id === 'rifle' ? 5 : weapon.id === 'smg' ? 5 : 8
    const muzzleColor = weapon.id === 'shotgun' ? 0xffe08a : weapon.id === 'rifle' ? 0xfff6c8 : 0xfff2a8
    this.createMuzzleFlash(this.player.x, this.player.y, baseAngle, muzzleColor, muzzleRadius)
    this.playSound(this.shotSound(weapon.id))
    if (weapon.id === 'shotgun') {
      this.cameras.main.shake(45, 0.0022)
      this.vibrate(14)
    } else if (weapon.id === 'rifle') {
      this.cameras.main.shake(30, 0.0016)
      this.vibrate(10)
    } else if (weapon.id === 'pistol') {
      this.vibrate(8)
    }

    if (this.gameMode === 'multiplayer') {
      this.emitLocalShot(this.lastAimWorldPoint.x, this.lastAimWorldPoint.y)
      return
    }

    for (let i = 0; i < pelletCount; i += 1) {
      const randomSpread = pelletCount === 1 ? Phaser.Math.FloatBetween(-spreadRadians / 2, spreadRadians / 2) : 0
      const shotAngle = baseAngle + firstShotOffset + angleStep * i + randomSpread
      const shotDirection = new Phaser.Math.Vector2(Math.cos(shotAngle), Math.sin(shotAngle))
      const muzzleX = this.player.x + shotDirection.x * spawnOffset
      const muzzleY = this.player.y + shotDirection.y * spawnOffset
      const bullet = new Bullet(this, muzzleX, muzzleY, shotDamage, weapon.bulletSpeed, weapon.id, weapon.pierce ?? 0)

      this.bullets.add(bullet)
      bullet.launch(shotDirection.x, shotDirection.y)
    }

    this.emitLocalShot(this.lastAimWorldPoint.x, this.lastAimWorldPoint.y)
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
    if (this.pendingPerkChoices) {
      this.showMessage('Choose a perk first', 'warning')
      return
    }

    this.isIntermission = false
    this.hideShop()
    this.waveSpawnTimer?.remove(false)
    this.wave += 1
    this.zombiesToSpawn = waveConfig.baseZombieCount + this.wave * waveConfig.zombiesPerWave
    this.pendingBossEnemyType = getBossEnemyTypeForWave(this.wave)
    this.spawnDelay = Math.max(
      waveConfig.minSpawnDelayMs,
      waveConfig.baseSpawnDelayMs - this.wave * waveConfig.spawnDelayReductionPerWaveMs,
    )
    this.waveText.setText(`Wave ${this.wave}`)
    this.skipRoundButton.setText('Skip Round')
    this.skipRoundButton.setVisible(this.gameMode === 'singlePlayer')
    if (this.pendingBossEnemyType) {
      this.showWaveBanner('Wave 10: THE WARDEN', '#8eb4ff')
      this.playSound('wardenWarn')
    } else {
      this.showWaveBanner(`Wave ${this.wave}`)
      this.playSound('waveStart')
    }

    this.waveSpawnTimer = this.time.addEvent({
      delay: this.spawnDelay,
      repeat: this.zombiesToSpawn - 1,
      callback: this.spawnZombie,
      callbackScope: this,
    })
    this.setTouchActionButtonsVisible(true)
  }

  private completeWave() {
    this.isIntermission = true
    const bonus = this.getWaveBonus(this.wave)

    this.lastWaveBonus = bonus
    this.updateCash(bonus)
    this.waveBanner?.destroy()
    this.waveBanner = undefined
    this.playSound('waveComplete')
    this.vibrate(18)
    this.skipRoundButton.setText('Next Wave')
    this.offerPerkOrShop()
  }

  private getWaveBonus(wave: number) {
    const bonus = waveConfig.waveBonusBase + wave * waveConfig.waveBonusPerWave
    return this.hasPerk('bonusCash') ? Math.round(bonus * 1.25) : bonus
  }

  private handleNextRoundClick() {
    if (!this.isStarted || this.isGameOver || this.gameMode !== 'singlePlayer') {
      return
    }

    const now = this.time.now
    this.nextRoundClickCount = now - this.nextRoundClickAt <= 2000 ? this.nextRoundClickCount + 1 : 1
    this.nextRoundClickAt = now

    if (this.nextRoundClickCount >= 3) {
      this.nextRoundClickCount = 0
      this.promptSkipToWave()
      return
    }

    this.skipRound()
  }

  private promptSkipToWave() {
    const nextWave = this.isIntermission ? this.wave + 1 : this.wave
    const raw = window.prompt(`Skip to wave (current ${this.wave}):`, String(Math.max(nextWave + 4, 10)))

    if (raw == null) {
      return
    }

    const targetWave = Math.floor(Number(raw.trim()))

    if (!Number.isFinite(targetWave) || targetWave < 1) {
      this.showMessage('Enter a valid wave number')
      return
    }

    this.skipToWave(Math.min(999, targetWave))
  }

  private skipToWave(targetWave: number) {
    const nextPlayableWave = this.isIntermission ? this.wave + 1 : this.wave

    if (targetWave < nextPlayableWave) {
      this.showMessage(`Already at wave ${this.wave}`)
      return
    }

    if (targetWave === nextPlayableWave && this.isIntermission) {
      this.startNextWave()
      return
    }

    if (targetWave === this.wave && !this.isIntermission) {
      this.showMessage(`Already fighting wave ${this.wave}`)
      return
    }

    this.clearActiveWaveCombat()

    let bonus = 0
    let completedThrough = this.wave

    if (!this.isIntermission) {
      bonus += this.getWaveBonus(this.wave)
    }

    for (let wave = completedThrough + 1; wave < targetWave; wave += 1) {
      bonus += this.getWaveBonus(wave)
    }

    if (bonus > 0) {
      this.updateCash(bonus)
    }

    this.wave = targetWave - 1
    this.isIntermission = true
    this.lastWaveBonus = bonus
    this.waveText.setText(`Wave ${this.wave} Complete`)
    this.skipRoundButton.setText('Next Wave')
    this.offerPerkOrShop()
    this.showMessage(bonus > 0 ? `Skipped to wave ${targetWave} (+$${bonus})` : `Skipped to wave ${targetWave}`)
  }

  private clearActiveWaveCombat() {
    this.waveSpawnTimer?.remove(false)
    this.waveSpawnTimer = undefined
    this.zombiesToSpawn = 0
    this.bullets.clear(true, true)
    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      zombie.destroy()
      return true
    })
  }

  private skipRound() {
    if (!this.isStarted || this.isGameOver || this.gameMode !== 'singlePlayer') {
      return
    }

    if (this.isIntermission) {
      this.startNextWave()
      return
    }

    this.clearActiveWaveCombat()
    this.completeWave()
  }

  private offerPerkOrShop() {
    const offerPerk = this.wave > 0 && this.wave % PERK_WAVE_INTERVAL === 0 && !this.perkWavesHandled.has(this.wave)
    const choices = offerPerk ? rollPerkChoices(this.ownedPerks) : []

    if (choices.length > 0) {
      this.showPerkChoice(choices)
      return
    }

    this.showShop()
  }

  private showShop() {
    this.hideShop()

    const compact = this.isCompactMenu()
    const centerX = this.scale.width / 2
    const centerY = this.scale.height / 2
    const panel = this.add.rectangle(0, 0, compact ? 360 : 640, compact ? 640 : 660, 0x000000, 0.86)
    const title = this.add
      .text(0, compact ? -292 : -300, 'Wave Complete', {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: compact ? 28 : 40,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const bonus = this.add
      .text(0, compact ? -256 : -258, `Wave bonus +$${this.lastWaveBonus}`, {
        color: '#7dffb3',
        fontFamily: 'Arial',
        fontSize: compact ? 16 : 20,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.shopStatusText = this.add
      .text(0, compact ? -196 : -198, this.formatShopStatus(), {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: compact ? 15 : 16,
        lineSpacing: 4,
      })
      .setOrigin(0.5)
    const nextWave = this.wave + 1
    const continueButton = this.createShopButton(0, compact ? 286 : 250, `Start Wave ${nextWave}`, () => this.handleNextRoundClick(), undefined, '#2ecc71', '#101316')
    const items: Phaser.GameObjects.GameObject[] = [panel, title, bonus, this.shopStatusText, continueButton]
    const upgradeItems: ShopItemId[] = ['healPlayer', 'repairAll', 'damageUpgrade', 'maxHealthUpgrade']
    const gearItems: ShopItemId[] = ['buySmg', 'buyShotgun', 'buyRifle', 'buyFlamethrower', 'buyMines', 'buyTurret']
    const shopEntries = compact ? (this.shopPage === 0 ? upgradeItems : gearItems) : [...upgradeItems, ...gearItems]
    this.shopLabels.clear()

    if (compact) {
      items.push(
        this.createShopButton(0, 214, this.shopPage === 0 ? 'Weapons & Tools' : 'Upgrades', () => {
          this.shopPage = this.shopPage === 0 ? 1 : 0
          this.showShop()
        }),
      )
    }

    shopEntries.forEach((itemId, index) => {
      const columns = compact ? 1 : 2
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = compact ? 0 : column === 0 ? -155 : 155
      const y = (compact ? -108 : -130) + row * (compact ? 50 : 58)
      const button = this.createShopButton(
        x,
        y,
        this.formatShopItemLabel(itemId),
        () => this.handleShopItemClick(itemId),
        shopConfig[itemId].repeatable ? () => this.buyMaxShopItem(itemId) : undefined,
        '#20262b',
        '#ffffff',
        compact ? 320 : 280,
      )
      this.shopLabels.set(itemId, button)
      items.push(button)
    })

    this.shopOverlay = this.add.container(centerX, centerY, items)
    this.shopOverlay.setDepth(12)
    this.refreshShopButtons()
    this.layoutHud()
    this.setTouchActionButtonsVisible(true)
  }

  private hideShop() {
    this.clearShopHoldTimer()
    this.shopOverlay?.destroy()
    this.shopOverlay = undefined
    this.shopStatusText = undefined
    this.shopLabels.clear()
    this.shopButtons = []
  }

  private clearShopHoldTimer() {
    this.shopHoldTimer?.remove(false)
    this.shopHoldTimer = undefined
  }

  private createShopButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    onHold?: () => void,
    backgroundColor = '#20262b',
    color = '#ffffff',
    width?: number,
  ) {
    const compact = this.isCompactMenu()
    const button = this.add
      .text(x, y, label, {
        align: 'center',
        backgroundColor,
        color,
        fixedWidth: width ?? (compact ? 320 : 420),
        fontFamily: 'Arial',
        fontSize: compact ? '16px' : '18px',
        padding: { x: 12, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      onClick()

      if (!onHold) {
        return
      }

      this.clearShopHoldTimer()
      this.shopHoldTimer = this.time.delayedCall(400, () => {
        this.shopHoldTimer = undefined
        onHold()
      })
    })
    button.on('pointerup', () => this.clearShopHoldTimer())
    button.on('pointerupoutside', () => this.clearShopHoldTimer())
    button.on('pointerout', () => this.clearShopHoldTimer())

    this.shopButtons.push(button)
    return button
  }

  private handleShopItemClick(itemId: ShopItemId) {
    const item = shopConfig[itemId]

    if (!item.repeatable) {
      this.buyShopItem(itemId)
      return
    }

    const now = this.time.now
    const count = this.shopItemClick && this.shopItemClick.itemId === itemId && now - this.shopItemClick.at <= 1000
      ? this.shopItemClick.count + 1
      : 1
    this.shopItemClick = { itemId, count, at: now }

    if (count >= 3) {
      this.shopItemClick = undefined
      this.buyMaxShopItem(itemId)
      return
    }

    this.buyShopItem(itemId)
  }

  private buyMaxShopItem(itemId: ShopItemId) {
    let count = 0

    while (count < 500 && this.buyShopItem(itemId, true)) {
      count += 1
    }

    if (count === 0) {
      this.buyShopItem(itemId)
      return
    }

    if (itemId === 'damageUpgrade') {
      this.showMessage('Damage upgraded', 'money')
      return
    }

    if (itemId === 'maxHealthUpgrade') {
      this.showMessage('Max HP upgraded', 'money')
      return
    }

    if (itemId === 'healPlayer') {
      this.showMessage(count === 1 ? 'Healed +45' : `Healed +${shopUpgradeConfig.healAmount * count}`, 'money')
    }
  }

  private buyShopItem(itemId: ShopItemId, quiet = false) {
    const item = shopConfig[itemId]
    const weaponUnlock = shopWeaponUnlocks[itemId]

    if (weaponUnlock && this.ownedWeapons.has(weaponUnlock)) {
      if (!quiet) {
        this.denyPurchase('Already owned')
      }
      return false
    }

    if ((itemId === 'buyMines' && this.ownsMines) || (itemId === 'buyTurret' && this.ownsTurret)) {
      if (!quiet) {
        this.denyPurchase('Already owned')
      }
      return false
    }

    if (itemId === 'healPlayer' && this.player.health >= this.player.maxHealth) {
      if (!quiet) {
        this.denyPurchase('Already full HP')
      }
      return false
    }

    if (itemId === 'repairAll' && this.barricades.every((barricade) => barricade.health >= barricade.maxHealth)) {
      if (!quiet) {
        this.denyPurchase('Doors already repaired')
      }
      return false
    }

    if (this.cash < item.cost) {
      if (!quiet) {
        this.denyPurchase('Not enough cash')
      }
      return false
    }

    this.updateCash(-item.cost)
    if (!quiet) {
      this.playSound('purchase')
    }

    if (itemId === 'healPlayer') {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + shopUpgradeConfig.healAmount)
      this.updateHealthBar()
      if (!quiet) {
        this.showMessage('Healed +45', 'money')
      }
      this.refreshShopButtons()
      return true
    }

    if (itemId === 'repairAll') {
      let repaired = 0
      this.barricades.forEach((barricade) => {
        if (barricade.health < barricade.maxHealth) {
          repaired += 1
        }
        barricade.repairFully()
      })
      this.repairsDone += repaired
      this.rebuildNavigationGrid()
      this.invalidateZombiePaths()
      this.updateBarricadeHud()
      if (!quiet) {
        this.showMessage('All doors repaired', 'money')
      }
      this.refreshShopButtons()
      return true
    }

    if (itemId === 'damageUpgrade') {
      this.damageBonus += shopUpgradeConfig.damageUpgradeAmount
      this.damageUpgradeLevel += 1
      if (!quiet) {
        this.showMessage('Damage upgraded', 'money')
      }
      this.refreshShopButtons()
      return true
    }

    if (itemId === 'maxHealthUpgrade') {
      this.player.maxHealth += shopUpgradeConfig.maxHealthUpgradeAmount
      this.player.health += shopUpgradeConfig.maxHealthUpgradeAmount
      this.maxHealthUpgradeLevel += 1
      this.updateHealthBar()
      if (!quiet) {
        this.showMessage('Max HP upgraded', 'money')
      }
      this.refreshShopButtons()
      return true
    }

    if (itemId === 'buyMines') {
      this.ownsMines = true
      if (!quiet) {
        this.showMessage('Mines unlocked', 'money')
      }
      this.setTouchActionButtonsVisible(true)
      this.refreshShopButtons()
      return true
    }

    if (itemId === 'buyTurret') {
      this.ownsTurret = true
      if (!quiet) {
        this.showMessage('Turret unlocked', 'money')
      }
      this.setTouchActionButtonsVisible(true)
      this.refreshShopButtons()
      return true
    }

    if (weaponUnlock) {
      this.ownedWeapons.add(weaponUnlock)
      this.ownedWeaponsText.setText(this.getOwnedWeaponsLabel())
      if (!quiet) {
        this.showMessage(`${weapons[weaponUnlock].name} unlocked`, 'money')
      }
    }

    this.refreshShopButtons()
    return true
  }

  private denyPurchase(message: string) {
    const now = this.time.now
    if (now - this.lastShopFailAt < 350) {
      return
    }

    this.lastShopFailAt = now
    this.showMessage(message, 'warning')
    this.playSound('notEnoughCash')
  }

  private formatShopStatus() {
    const aliveDoors = this.barricades.filter((barricade) => barricade.isAlive).length
    const perkNames = this.ownedPerks.map((id) => getPerk(id).name)
    return [
      `Cash $${this.cash}`,
      `HP ${Math.ceil(this.player.health)}/${this.player.maxHealth}`,
      `Doors ${aliveDoors}/${this.barricades.length}`,
      `Weapons ${this.getOwnedWeaponsLabel().replace('Owned ', '')}`,
      `Next wave ${this.wave + 1}`,
      `Perks: ${perkNames.length > 0 ? perkNames.join(', ') : 'None'}`,
    ].join('\n')
  }

  private formatShopItemLabel(itemId: ShopItemId) {
    if (itemId === 'healPlayer') {
      return `Heal +${shopUpgradeConfig.healAmount} HP — $${shopConfig.healPlayer.cost}`
    }

    if (itemId === 'repairAll') {
      return `Repair All Doors — $${shopConfig.repairAll.cost}`
    }

    if (itemId === 'damageUpgrade') {
      return `Damage +${shopUpgradeConfig.damageUpgradeAmount} — $${shopConfig.damageUpgrade.cost} — Level ${this.damageUpgradeLevel}`
    }

    if (itemId === 'maxHealthUpgrade') {
      return `Max HP +${shopUpgradeConfig.maxHealthUpgradeAmount} — $${shopConfig.maxHealthUpgrade.cost} — Level ${this.maxHealthUpgradeLevel}`
    }

    if (itemId === 'buySmg') {
      return this.ownedWeapons.has('smg') ? 'SMG — Owned' : `SMG — $${shopConfig.buySmg.cost}`
    }

    if (itemId === 'buyShotgun') {
      return this.ownedWeapons.has('shotgun') ? 'Shotgun — Owned' : `Shotgun — $${shopConfig.buyShotgun.cost}`
    }

    if (itemId === 'buyRifle') {
      return this.ownedWeapons.has('rifle') ? 'Rifle — Owned' : `Rifle — $${shopConfig.buyRifle.cost}`
    }

    if (itemId === 'buyFlamethrower') {
      return this.ownedWeapons.has('flamethrower') ? 'Flamethrower — Owned' : `Flamethrower — $${shopConfig.buyFlamethrower.cost}`
    }

    if (itemId === 'buyMines') {
      return this.ownsMines ? 'Mines — Owned' : `Mines — $${shopConfig.buyMines.cost}`
    }

    return this.ownsTurret ? 'Turret — Owned' : `Turret — $${shopConfig.buyTurret.cost}`
  }

  private canPurchaseShopItem(itemId: ShopItemId) {
    const weaponUnlock = shopWeaponUnlocks[itemId]
    if (weaponUnlock && this.ownedWeapons.has(weaponUnlock)) {
      return false
    }

    if (itemId === 'buyMines' && this.ownsMines) {
      return false
    }

    if (itemId === 'buyTurret' && this.ownsTurret) {
      return false
    }

    if (itemId === 'healPlayer' && this.player.health >= this.player.maxHealth) {
      return false
    }

    if (itemId === 'repairAll' && this.barricades.every((barricade) => barricade.health >= barricade.maxHealth)) {
      return false
    }

    return this.cash >= shopConfig[itemId].cost
  }

  private refreshShopButtons() {
    this.shopStatusText?.setText(this.formatShopStatus())
    this.shopLabels.forEach((label, itemId) => {
      const owned = Boolean(shopWeaponUnlocks[itemId] && this.ownedWeapons.has(shopWeaponUnlocks[itemId]!))
      label.setText(this.formatShopItemLabel(itemId))
      label.setColor(owned ? '#fff2a8' : this.canPurchaseShopItem(itemId) ? '#ffffff' : '#8d9794')
    })
    this.refreshPerkHud()
  }

  private refreshPerkHud() {
    const names = this.ownedPerks.map((id) => getPerk(id).name)
    this.perkText?.setText(names.length > 0 ? `Perks ${names.join(', ')}` : '')
    this.perkText?.setVisible(!this.isNarrowHud() && names.length > 0 && !this.shopOverlay && !this.perkOverlay)
  }

  private showPerkChoice(choices: PerkConfig[]) {
    this.hideShop()
    this.perkOverlay?.destroy()
    this.pendingPerkChoices = choices
    const compact = this.isCompactMenu()
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, compact ? 360 : 560, compact ? 520 : 480, 0x000000, 0.9),
      this.add
        .text(0, compact ? -210 : -190, 'Choose a Perk', {
          color: '#fff2a8',
          fontFamily: 'Arial',
          fontSize: compact ? 28 : 36,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
      this.add
        .text(0, compact ? -168 : -146, 'Permanent for this run', {
          color: '#d9e8d9',
          fontFamily: 'Arial',
          fontSize: compact ? 15 : 18,
        })
        .setOrigin(0.5),
    ]

    choices.forEach((perk, index) => {
      const card = this.add
        .text(0, (compact ? -70 : -50) + index * (compact ? 110 : 100), `${perk.name}\n${perk.description}`, {
          align: 'center',
          backgroundColor: '#20262b',
          color: '#ffffff',
          fixedWidth: compact ? 320 : 420,
          fontFamily: 'Arial',
          fontSize: compact ? '18px' : '20px',
          lineSpacing: 6,
          padding: { x: 14, y: 14 },
          wordWrap: { width: compact ? 292 : 392 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })

      card.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation()
        this.choosePerk(perk.id)
      })
      items.push(card)
    })

    this.perkOverlay = this.add.container(this.scale.width / 2, this.scale.height / 2, items)
    this.perkOverlay.setDepth(16)
    this.layoutHud()
    this.setTouchActionButtonsVisible(true)
  }

  private choosePerk(id: PerkId) {
    if (!this.pendingPerkChoices?.some((perk) => perk.id === id) || this.ownedPerks.includes(id)) {
      return
    }

    this.ownedPerks.push(id)
    this.perkWavesHandled.add(this.wave)
    this.pendingPerkChoices = undefined
    this.perkOverlay?.destroy()
    this.perkOverlay = undefined
    this.applyPerk(id)
    this.playSound('purchase')
    this.showMessage(getPerk(id).name, 'money')
    this.refreshPerkHud()
    this.showShop()
  }

  private applyPerk(id: PerkId) {
    if (id === 'sprinter') {
      this.player.speed = Math.round(this.basePlayerSpeed * 1.08)
    }

    if (id === 'barricadePlating') {
      this.barricades.forEach((barricade) => {
        barricade.syncHealth(Math.min(barricade.maxHealth + 25, barricade.health + 25), barricade.maxHealth + 25)
      })
      this.updateBarricadeHud()
    }
  }

  private hasPerk(id: PerkId) {
    return this.ownedPerks.includes(id)
  }

  private getRepairCost() {
    return this.hasPerk('engineer') ? 15 : barricadeConfig.repairCost
  }

  private getRepairAmount() {
    const amount = barricadeConfig.repairAmount
    return this.hasPerk('fortifier') ? Math.round(amount * 1.25) : amount
  }

  private getShotDamage(weapon: WeaponConfig) {
    const bonus = weapon.kind === 'cone' ? Math.floor(this.damageBonus / 2) : this.damageBonus
    let damage = weapon.damage + bonus
    if (weapon.id === 'pistol' && this.hasPerk('deadeye')) {
      damage = Math.round(damage * 1.2)
    }

    if (this.hasPerk('lastStand') && this.player.health / this.player.maxHealth < 0.3) {
      damage = Math.round(damage * 1.25)
    }

    return damage
  }

  private shotSound(weaponId: WeaponId): SoundId {
    if (weaponId === 'shotgun') return 'shotgunShot'
    if (weaponId === 'smg') return 'smgShot'
    if (weaponId === 'rifle') return 'rifleShot'
    if (weaponId === 'flamethrower') return 'flameTick'
    return 'pistolShot'
  }

  private getPelletCount(weapon: WeaponConfig) {
    return weapon.id === 'shotgun' && this.hasPerk('closeQuarters') ? weapon.bulletsPerShot + 1 : weapon.bulletsPerShot
  }

  private formatRunSummary() {
    const perkNames = this.ownedPerks.map((id) => getPerk(id).name)
    const waveLabel = this.isIntermission ? `Cleared wave ${this.wave}` : `Reached wave ${this.wave}`
    return `${waveLabel}\nKills ${this.zombiesKilled} · Cash $${this.cashEarned}\n${this.currentWeapon.name} · Repairs ${this.repairsDone}\nPerks: ${perkNames.length > 0 ? perkNames.join(', ') : 'None'}`
  }

  private spawnZombie() {
    if (this.isGameOver || this.zombiesToSpawn <= 0) {
      return
    }

    const { x, y } = this.getRandomEdgeSpawnPoint()
    const enemyType = this.pendingBossEnemyType ?? pickEnemyTypeForWave(this.wave)
    const zombie = new Zombie(this, x, y, this.wave, enemyType)
    this.pendingBossEnemyType = undefined

    if (enemyType === 'warden') {
      this.showMessage('THE WARDEN HAS ENTERED', 'danger')
      this.playSound('wardenWarn')
      this.cameras.main.shake(160, 0.006)
      this.vibrate(36)
    }

    this.zombies.add(zombie)
    this.zombiesToSpawn -= 1
  }

  private updateZombieTarget(zombie: Zombie, time: number) {
    zombie.locationState = this.isInsideBase(zombie.x, zombie.y) ? 'insideBase' : 'outsideBase'

    if (this.trySpitterAttack(zombie, time)) {
      return
    }

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

    this.strikeBarricade(entry.barricade, Math.round(barricadeConfig.zombieAttackDamage * zombie.barricadeDamageMultiplier), zombie)

    if (DEBUG_BARRICADE_ATTACKS) {
      console.log(
        `Zombie damaged ${entry.id} barricade: ${entry.barricade.health}/${entry.barricade.maxHealth}`,
      )
    }
  }

  private strikeBarricade(barricade: Barricade, amount: number, attacker?: Zombie) {
    const wasAlive = barricade.isAlive
    barricade.takeDamage(amount)
    this.playSound('barricadeHit')
    this.updateBarricadeHud()

    const entry = this.entryPoints.find((item) => item.barricade === barricade)
    if (!entry) {
      return
    }

    if (wasAlive && !barricade.isAlive) {
      if (attacker) {
        this.onBarricadeDestroyed(attacker)
      } else {
        this.rebuildNavigationGrid()
        this.invalidateZombiePaths()
      }
      this.announceBreach(entry)
      return
    }

    if (barricade.health / barricade.maxHealth <= 0.35) {
      const lastToast = this.doorToastAt.get(entry.id) ?? 0
      if (this.time.now - lastToast > 2200) {
        this.doorToastAt.set(entry.id, this.time.now)
        this.showMessage(`${this.doorName(entry.id)} Door under attack`, 'warning')
        this.playSound('barricadeLow')
      }
    }
  }

  private announceBreach(entry: EntryPoint) {
    this.showDoorLabel(entry, 'DOOR BREACHED')
    this.showMessage(`${this.doorName(entry.id)} Door breached`, 'danger')
    this.playSound('barricadeDestroyed')
    this.cameras.main.shake(80, 0.004)
    this.vibrate(32)
  }

  private onBarricadeDestroyed(zombie: Zombie) {
    zombie.navState = 'pathing'
    zombie.targetEntryId = undefined
    zombie.routeDirection = undefined
    zombie.path = []
    zombie.lastStuckCheckAt = 0
    this.rebuildNavigationGrid()
    this.invalidateZombiePaths()
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
    if (!bullet.active || bullet.struck.has(zombie)) {
      return
    }

    bullet.struck.add(zombie)
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body
    const bulletDirection = new Phaser.Math.Vector2(bulletBody.velocity.x, bulletBody.velocity.y).normalize()
    if (bullet.weaponId === 'smg' && this.hasPerk('suppressiveFire')) {
      zombie.suppressedUntil = this.time.now + 500
    }

    const shotgunHit = bullet.weaponId === 'shotgun'
    this.spawnHitSpark(zombie.x, zombie.y, bullet.weaponId === 'rifle' ? 0xfff6c8 : 0xfff2a8, shotgunHit ? 5 : 3, shotgunHit ? 22 : 14)
    this.playSound('zombieHit')
    this.applyZombieDamage(zombie, bullet.damage, bulletDirection.x, bulletDirection.y, true)
    if (bullet.pierce > 0) {
      bullet.pierce -= 1
      return
    }

    bullet.destroy()
  }

  private spawnZombieDeathEffect(x: number, y: number, color = 0x8b1e1e, scale = 1) {
    const count = Math.round(8 * scale)
    for (let i = 0; i < count; i += 1) {
      const particle = this.add.circle(x, y, Phaser.Math.Between(2, 4) * scale, color, 0.85)
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const distance = Phaser.Math.Between(12, 34) * scale

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

  private showFloatingScore(x: number, y: number, amount: number, fontSize = 18) {
    const scorePopup = this.add
      .text(x, y - 24, `+${amount}`, {
        color: '#fff2a8',
        fontFamily: 'Arial',
        fontSize: `${fontSize}px`,
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

  private updateScreamerAuras() {
    const activeZombies = this.zombies.children.entries.filter((child) => child.active) as Zombie[]
    const auraZombies = activeZombies.filter((zombie) => zombie.screamRadius > 0)

    activeZombies.forEach((zombie) => {
      const speedMultiplier = auraZombies.reduce((multiplier, screamer) => {
        if (screamer === zombie || screamer.screamRadius <= 0) {
          return multiplier
        }

        if (Phaser.Math.Distance.Between(zombie.x, zombie.y, screamer.x, screamer.y) > screamer.screamRadius) {
          return multiplier
        }

        return Math.max(multiplier, screamer.screamSpeedMultiplier)
      }, 1)

      const slowed = zombie.suppressedUntil > this.time.now ? speedMultiplier * 0.72 : speedMultiplier
      zombie.setSpeedMultiplier(slowed)
    })
  }

  private trySpitterAttack(zombie: Zombie, time: number) {
    if (zombie.enemyType !== 'spitter' || zombie.spitRange <= 0) {
      return false
    }

    const sameZone = this.isInsideBase(zombie.x, zombie.y) === this.isInsideBase(this.player.x, this.player.y)
    const distance = Phaser.Math.Distance.Between(zombie.x, zombie.y, this.player.x, this.player.y)

    if (!sameZone || distance > zombie.spitRange) {
      return false
    }

    zombie.navState = 'chasingPlayer'
    zombie.stopMoving()
    zombie.rotation = Phaser.Math.Angle.Between(zombie.x, zombie.y, this.player.x, this.player.y)

    if (!zombie.tryAttack(time, zombie.spitCooldownMs)) {
      return true
    }

    this.hurtPlayer(zombie.spitDamage)
    this.spawnSpitEffect(zombie.x, zombie.y, this.player.x, this.player.y)

    return true
  }

  private spawnSpitEffect(fromX: number, fromY: number, toX: number, toY: number) {
    const acid = this.add.circle(fromX, fromY, 5, 0x9bff59, 0.85).setDepth(5)

    this.tweens.add({
      targets: acid,
      x: toX,
      y: toY,
      alpha: 0,
      scale: 1.7,
      duration: 160,
      ease: 'Quad.easeOut',
      onComplete: () => acid.destroy(),
    })
  }

  private triggerExploderBurst(zombie: Zombie, x: number, y: number, contactTriggered: boolean) {
    if (zombie.enemyType !== 'exploder' || zombie.explosionRadius <= 0) {
      return
    }

    const burst = this.add.circle(x, y, zombie.explosionRadius, 0xff8c1a, 0.22).setDepth(4)
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.15,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy(),
    })

    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= zombie.explosionRadius) {
      this.hurtPlayer(contactTriggered ? zombie.explosionDamage : Math.round(zombie.explosionDamage * 0.7), true)
    }

    this.entryPoints.forEach((entry) => {
      if (!entry.barricade.isAlive) {
        return
      }

      if (Phaser.Math.Distance.Between(x, y, entry.barricade.x, entry.barricade.y) <= zombie.explosionRadius) {
        this.strikeBarricade(entry.barricade, Math.round(zombie.explosionDamage * 0.8))
      }
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

    if (zombie.enemyType === 'exploder') {
      const deathX = zombie.x
      const deathY = zombie.y
      zombie.destroy()
      this.triggerExploderBurst(zombie, deathX, deathY, true)
      this.spawnZombieDeathEffect(deathX, deathY, 0xff8c1a, 1.2)
      this.playSound('zombieDeath')
      return
    }

    this.hurtPlayer(zombie.damage, false, true)
  }

  private updateHealthBar() {
    const healthPercent = Phaser.Math.Clamp(this.player.health / this.player.maxHealth, 0, 1)
    this.healthFill.width = this.healthBarMaxWidth * healthPercent
    this.healthFill.fillColor = healthPercent > 0.35 ? 0x2ecc71 : 0xe74c3c
    this.healthText.setText(`HP ${Math.ceil(this.player.health)}`)
  }

  private endGame() {
    if (this.isGameOver) {
      return
    }

    if (this.isPaused) {
      this.togglePause()
    }

    this.isGameOver = true
    this.playSound('gameOver')

    this.hideShop()
    this.waveSpawnTimer?.remove(false)
    this.waveSpawnTimer = undefined
    this.skipRoundButton?.setVisible(false)
    this.setTouchActionButtonsVisible(false)
    this.player.setVelocity(0, 0)

    this.zombies.children.each((child) => {
      const zombie = child as Zombie
      zombie.setVelocity(0, 0)
      return true
    })

    this.recordRunPersonalBest()
    this.showGameOverOverlay(scoreQualifiesForHighScore(this.score, loadHighScores()))
  }

  private notePersonalBestBeaten() {
    if (this.announcedPersonalBest || !this.personalBestAtStart) {
      return
    }

    if (this.score <= this.personalBestAtStart.score) {
      return
    }

    this.announcedPersonalBest = true
    this.showMessage('Personal Best beaten!', 'money')
  }

  private recordRunPersonalBest() {
    const previous = this.personalBestAtStart
    this.runIsPersonalBest = this.score > 0 && (!previous || this.score > previous.score)
    if (!this.runIsPersonalBest) {
      return
    }

    savePersonalBest({
      initials: loadLastInitials(),
      score: this.score,
      wave: this.wave,
      kills: this.zombiesKilled,
      at: new Date().toISOString(),
    })
  }

  private formatStartBoard() {
    if (this.scoreSource === 'loading' && loadHighScores().length === 0) {
      return 'Loading scores…'
    }

    return formatHighScoreBoard(loadHighScores())
  }

  private formatScoreSourceNote() {
    if (this.scoreSource === 'loading') {
      return loadHighScores().length > 0 ? 'Loading scores…' : ''
    }

    if (this.scoreSource === 'cache') {
      return loadHighScores().length > 0 ? 'Offline cache' : 'Offline cache · No scores yet'
    }

    return ''
  }

  private getShareText() {
    return buildShareText({
      score: this.score,
      wave: this.wave,
      perks: this.ownedPerks.map((id) => getPerk(id).name),
    })
  }

  private copyRunResult() {
    const text = this.getShareText()
    if (!navigator.clipboard?.writeText) {
      this.finishCopy(this.copyWithTextarea(text), text)
      return
    }

    void navigator.clipboard.writeText(text).then(() => {
      if (this.sys.isActive()) {
        this.showMessage('Run copied', 'money')
        this.clearShareFallback()
      }
    }).catch(() => {
      this.finishCopy(this.copyWithTextarea(text), text)
    })
  }

  private finishCopy(copied: boolean, text: string) {
    if (!this.sys.isActive()) {
      return
    }

    if (copied) {
      this.showMessage('Run copied', 'money')
      this.clearShareFallback()
      return
    }

    this.showShareFallback(text)
  }

  private copyWithTextarea(text: string) {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'true')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    let copied = false
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }
    area.remove()
    return copied
  }

  private showShareFallback(text: string) {
    this.clearShareFallback()
    this.showMessage('Copy failed — select the run text', 'warning')
    const box = document.createElement('textarea')
    box.id = 'final-dayz-share'
    box.readOnly = true
    box.value = text
    box.style.position = 'fixed'
    box.style.left = '50%'
    box.style.bottom = '12px'
    box.style.transform = 'translateX(-50%)'
    box.style.width = 'min(360px, 92vw)'
    box.style.height = '88px'
    box.style.zIndex = '30'
    box.style.font = '14px Arial'
    document.body.appendChild(box)
    box.focus()
    box.select()
  }

  private clearShareFallback() {
    document.getElementById('final-dayz-share')?.remove()
  }

  private createResultButton(y: number, label: string, background: string, onClick: () => void) {
    const button = this.add
      .text(0, y, label, {
        align: 'center',
        backgroundColor: background,
        color: background === '#2ecc71' ? '#101316' : '#ffffff',
        fixedWidth: this.isCompactMenu() ? 240 : 220,
        fontFamily: 'Arial',
        fontSize: '18px',
        fontStyle: 'bold',
        padding: { x: 12, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation()
      onClick()
    })

    return button
  }

  private showGameOverOverlay(askForInitials: boolean) {
    this.clearShareFallback()
    this.gameOverOverlay?.destroy()
    this.initialsLetterTexts = []
    this.isEnteringInitials = askForInitials
    this.input.keyboard?.off('keydown', this.handleInitialsKeydown, this)

    const items: Phaser.GameObjects.GameObject[] = []

    if (askForInitials) {
      this.initials = loadLastInitials().split('')
      this.initialsCursor = 0
      const compact = this.isCompactMenu()
      items.push(this.add.rectangle(0, 0, compact ? 360 : 520, compact ? 640 : 620, 0x000000, 0.9))
      items.push(
        this.add
          .text(0, compact ? -286 : -270, 'GAME OVER', {
            color: '#ff5555',
            fontFamily: 'Arial',
            fontSize: compact ? 32 : 46,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? -244 : -214, 'NEW HIGH SCORE!', {
            color: '#fff2a8',
            fontFamily: 'Arial',
            fontSize: compact ? 22 : 28,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? -200 : -164, formatScore(this.score), {
            color: '#ffffff',
            fontFamily: 'Arial',
            fontSize: compact ? 36 : 48,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? -120 : -78, `${this.formatRunSummary()}${this.runIsPersonalBest ? '\nNew Personal Best!' : ''}`, {
            align: 'center',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontSize: compact ? '15px' : '16px',
            lineSpacing: 4,
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? 10 : 28, 'Tap a letter or type. Save when ready.', {
            align: 'center',
            color: '#d9e8d9',
            fontFamily: 'Arial',
            fontSize: '16px',
          })
          .setOrigin(0.5),
      )

      for (let index = 0; index < HIGH_SCORE_INITIALS_LENGTH; index += 1) {
        const letterButton = this.add
          .text(-88 + index * 88, compact ? 78 : 96, this.initials[index] ?? 'A', {
            align: 'center',
            backgroundColor: '#20262b',
            color: '#ffffff',
            fixedWidth: 72,
            fontFamily: 'Arial',
            fontSize: '36px',
            fontStyle: 'bold',
            padding: { x: 8, y: 14 },
          })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })

        letterButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation()
          this.cycleInitialsLetter(index)
        })

        this.initialsLetterTexts.push(letterButton)
        items.push(letterButton)
      }

      const saveButton = this.add
        .text(0, compact ? 156 : 176, 'Save Initials', {
          align: 'center',
          backgroundColor: '#2ecc71',
          color: '#101316',
          fixedWidth: 200,
          fontFamily: 'Arial',
          fontSize: '20px',
          fontStyle: 'bold',
          padding: { x: 12, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })

      saveButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation()
        this.confirmHighScoreInitials()
      })
      items.push(saveButton)
      items.push(this.createResultButton(compact ? 214 : 236, 'Share Run', '#20262b', () => this.copyRunResult()))
      this.refreshInitialsLetterDisplay()
      this.input.keyboard?.on('keydown', this.handleInitialsKeydown, this)
    } else {
      const compact = this.isCompactMenu()
      const shortfall = formatPointsShortOfBoard(this.score, loadHighScores())
      items.push(this.add.rectangle(0, 0, compact ? 360 : 520, compact ? 620 : 600, 0x000000, 0.9))
      items.push(
        this.add
          .text(0, compact ? -270 : -250, 'GAME OVER', {
            color: '#ff5555',
            fontFamily: 'Arial',
            fontSize: compact ? 32 : 46,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? -214 : -186, formatScore(this.score), {
            color: '#ffffff',
            fontFamily: 'Arial',
            fontSize: compact ? 40 : 52,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? -120 : -90, `${this.formatRunSummary()}${this.runIsPersonalBest ? '\nNew Personal Best!' : ''}`, {
            align: 'center',
            color: '#ffffff',
            fontFamily: 'Arial',
            fontSize: compact ? '15px' : '18px',
            lineSpacing: 4,
          })
          .setOrigin(0.5),
      )
      items.push(
        this.add
          .text(0, compact ? 20 : 40, shortfall ?? formatBestHighScoreLabel(), {
            align: 'center',
            color: '#fff2a8',
            fontFamily: 'Arial',
            fontSize: compact ? 15 : 18,
            lineSpacing: 4,
          })
          .setOrigin(0.5),
      )
      items.push(this.createResultButton(compact ? 100 : 130, 'Share Run', '#20262b', () => this.copyRunResult()))
      items.push(this.createResultButton(compact ? 164 : 196, 'Restart', '#2ecc71', () => {
        this.clearShareFallback()
        this.scene.restart()
      }))
    }

    this.gameOverOverlay = this.add.container(this.scale.width / 2, this.scale.height / 2, items)
    this.gameOverOverlay.setDepth(20)
    this.refreshHighScoreHud()
  }

  private refreshHighScoreHud() {
    const label = formatBestHighScoreLabel()
    this.highScoreText?.setText(label)
    this.startHighScoreLabel?.setText(label)
    this.startPersonalText?.setText(formatPersonalBestLabel())
    this.startBoardText?.setText(this.formatStartBoard())
    this.startSourceText?.setText(this.formatScoreSourceNote())
  }

  private syncLeaderboard() {
    this.scoreSource = 'loading'
    this.refreshHighScoreHud()
    void syncHighScoresFromServer().then((result) => {
      if (!this.sys.isActive()) {
        return
      }

      this.scoreSource = result.source
      this.refreshHighScoreHud()
    })
  }

  private showSavingHighScoreOverlay() {
    this.clearShareFallback()
    this.gameOverOverlay?.destroy()
    this.initialsLetterTexts = []
    this.gameOverOverlay = this.add.container(this.scale.width / 2, this.scale.height / 2, [
      this.add.rectangle(0, 0, 460, 240, 0x000000, 0.82),
      this.add
        .text(0, -24, 'GAME OVER', {
          color: '#ff5555',
          fontFamily: 'Arial',
          fontSize: '46px',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
      this.add
        .text(0, 36, 'Saving high score...', {
          color: '#fff2a8',
          fontFamily: 'Arial',
          fontSize: '22px',
        })
        .setOrigin(0.5),
    ])
    this.gameOverOverlay.setDepth(20)
  }

  private refreshInitialsLetterDisplay() {
    this.initialsLetterTexts.forEach((letterText, index) => {
      const active = index === this.initialsCursor
      letterText.setText(this.initials[index] ?? 'A')
      letterText.setColor(active ? '#fff2a8' : '#ffffff')
      letterText.setBackgroundColor(active ? '#3d3420' : '#20262b')
    })
  }

  private cycleInitialsLetter(index: number) {
    if (!this.isEnteringInitials) {
      return
    }

    this.initialsCursor = index
    const current = this.initials[index] ?? 'A'
    const nextCode = current.charCodeAt(0) >= 90 ? 65 : current.charCodeAt(0) + 1
    this.initials[index] = String.fromCharCode(nextCode)
    this.refreshInitialsLetterDisplay()
  }

  private handleInitialsKeydown(event: KeyboardEvent) {
    if (!this.isEnteringInitials) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      this.confirmHighScoreInitials()
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      if (this.initialsCursor > 0) {
        this.initialsCursor -= 1
      }
      this.initials[this.initialsCursor] = 'A'
      this.refreshInitialsLetterDisplay()
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      this.initialsCursor = Math.max(0, this.initialsCursor - 1)
      this.refreshInitialsLetterDisplay()
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      this.initialsCursor = Math.min(HIGH_SCORE_INITIALS_LENGTH - 1, this.initialsCursor + 1)
      this.refreshInitialsLetterDisplay()
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const current = this.initials[this.initialsCursor] ?? 'A'
      const delta = event.key === 'ArrowUp' ? 1 : -1
      const nextCode = ((current.charCodeAt(0) - 65 + delta + 26) % 26) + 65
      this.initials[this.initialsCursor] = String.fromCharCode(nextCode)
      this.refreshInitialsLetterDisplay()
      return
    }

    const letter = event.key.toUpperCase()
    if (/^[A-Z]$/.test(letter)) {
      event.preventDefault()
      this.initials[this.initialsCursor] = letter
      this.initialsCursor = Math.min(HIGH_SCORE_INITIALS_LENGTH - 1, this.initialsCursor + 1)
      this.refreshInitialsLetterDisplay()
    }
  }

  private confirmHighScoreInitials() {
    if (!this.isEnteringInitials || this.isSavingHighScore) {
      return
    }

    const initials = saveLastInitials(this.initials.join('') || 'AAA')
    if (this.runIsPersonalBest) {
      savePersonalBest({
        initials,
        score: this.score,
        wave: this.wave,
        kills: this.zombiesKilled,
        at: new Date().toISOString(),
      })
    }
    this.isEnteringInitials = false
    this.isSavingHighScore = true
    this.input.keyboard?.off('keydown', this.handleInitialsKeydown, this)
    this.showSavingHighScoreOverlay()

    void persistHighScore(initials, this.score).then(() => {
      this.isSavingHighScore = false

      if (!this.sys.isActive() || !this.isGameOver) {
        return
      }

      this.showGameOverOverlay(false)
    })
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.physics.world.setBounds(0, 0, gameSize.width, gameSize.height)
    this.layoutHud()
    this.layoutTouchControls(gameSize)
    if (this.startOverlay) {
      this.showStartScreen()
    }
    this.pauseOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.lobbyOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.shopOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.perkOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.gameOverOverlay?.setPosition(gameSize.width / 2, gameSize.height / 2)
    this.multiplayerNavDebugText?.setPosition(12, 120)

    if (!this.isGameOver) {
      this.player.setPosition(
        Phaser.Math.Clamp(this.player.x, 20, gameSize.width - 20),
        Phaser.Math.Clamp(this.player.y, 20, gameSize.height - 20),
      )
    }
  }
}
