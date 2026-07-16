import Phaser from 'phaser'
import { enemyConfigs, type EnemyType } from '../config/enemies'
import { waveConfig } from '../config/waves'
import Player from './Player'

export type ZombieNavState =
  | 'targetingBarricade'
  | 'attackingBarricade'
  | 'movingToOutsidePoint'
  | 'movingToDoorway'
  | 'movingToInsidePoint'
  | 'pathing'
  | 'stuck'
  | 'chasingPlayer'

export type ZombieLocationState = 'outsideBase' | 'enteringBase' | 'insideBase'
export type ZombieRouteDirection = 'outsideToInside' | 'insideToOutside'

export default class Zombie extends Phaser.Physics.Arcade.Sprite {
  enemyType: EnemyType = 'walker'
  maxHealth = 70
  health = 70
  baseSpeed = 76
  speed = 76
  damage = 12
  scoreValue = 10
  barricadeDamageMultiplier = 1
  explosionDamage = 0
  explosionRadius = 0
  spitDamage = 0
  spitRange = 0
  spitCooldownMs = 0
  screamRadius = 0
  screamSpeedMultiplier = 1
  hasBreached = false
  locationState: ZombieLocationState = 'outsideBase'
  navState: ZombieNavState = 'targetingBarricade'
  targetEntryId?: string
  routeDirection?: ZombieRouteDirection
  routeStepIndex = 0
  path: Phaser.Math.Vector2[] = []
  pathIndex = 0
  nextPathAt = 0
  currentTargetPoint?: Phaser.Math.Vector2
  lastStuckCheckAt = 0
  lastStuckX = 0
  lastStuckY = 0
  debugLabel?: Phaser.GameObjects.Text
  private lastAttackAt = 0
  private healthBarBg: Phaser.GameObjects.Rectangle
  private healthBarFill: Phaser.GameObjects.Rectangle
  private flashTimer?: Phaser.Time.TimerEvent

  constructor(scene: Phaser.Scene, x: number, y: number, wave: number, enemyType: EnemyType = 'walker') {
    super(scene, x, y, 'zombie')

    scene.add.existing(this)
    scene.physics.add.existing(this)

    const config = enemyConfigs[enemyType]
    this.enemyType = enemyType
    this.maxHealth = Math.round((this.maxHealth + wave * waveConfig.zombieHealthPerWave) * config.healthMultiplier)
    this.health = this.maxHealth
    this.baseSpeed = Math.round((this.baseSpeed + wave * waveConfig.zombieSpeedPerWave) * config.speedMultiplier)
    this.speed = this.baseSpeed
    this.damage = Math.round(this.damage * config.damageMultiplier)
    this.scoreValue = config.scoreValue
    this.barricadeDamageMultiplier = config.barricadeDamageMultiplier ?? 1
    this.explosionDamage = config.explosionDamage ?? 0
    this.explosionRadius = config.explosionRadius ?? 0
    this.spitDamage = config.spitDamage ?? 0
    this.spitRange = config.spitRange ?? 0
    this.spitCooldownMs = config.spitCooldownMs ?? 0
    this.screamRadius = config.screamRadius ?? 0
    this.screamSpeedMultiplier = config.screamSpeedMultiplier ?? 1
    this.setCircle(config.radius)
    this.setBounce(0.15)
    this.setDrag(120)
    this.setTint(config.color)
    this.setDisplaySize(config.radius * 2, config.radius * 2)

    this.healthBarBg = scene.add.rectangle(this.x, this.y - 28, 34, 5, 0x111111)
    this.healthBarFill = scene.add.rectangle(this.x, this.y - 28, 32, 3, 0x7bed65)
  }

  chase(player: Player) {
    this.moveToward(player.x, player.y)
  }

  moveToward(x: number, y: number) {
    const body = this.body as Phaser.Physics.Arcade.Body
    const angle = Phaser.Math.Angle.Between(this.x, this.y, x, y)

    this.rotation = angle
    this.scene.physics.velocityFromRotation(angle, this.speed, body.velocity)
  }

  stopMoving() {
    this.setVelocity(0, 0)
  }

  setSpeedMultiplier(multiplier: number) {
    this.speed = this.baseSpeed * multiplier
  }

  tryAttack(time: number, cooldownMs: number) {
    if (time - this.lastAttackAt < cooldownMs) {
      return false
    }

    this.lastAttackAt = time
    return true
  }

  takeDamage(amount: number, knockbackX: number, knockbackY: number) {
    this.health -= amount
    this.flashOnHit()
    this.applyKnockback(knockbackX, knockbackY)
    this.updateHealthBar()

    if (this.health <= 0) {
      this.destroy()
      return true
    }

    return false
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta)
    this.updateHealthBarPosition()
  }

  destroy(fromScene?: boolean) {
    this.flashTimer?.remove(false)
    this.debugLabel?.destroy()
    this.healthBarBg.destroy()
    this.healthBarFill.destroy()
    super.destroy(fromScene)
  }

  private flashOnHit() {
    this.flashTimer?.remove(false)
    this.setTint(0xfff2a8)

    this.flashTimer = this.scene.time.delayedCall(80, () => {
      if (this.active) {
        this.setTint(enemyConfigs[this.enemyType].color)
      }
    })
  }

  private applyKnockback(knockbackX: number, knockbackY: number) {
    const body = this.body as Phaser.Physics.Arcade.Body
    body.velocity.x += knockbackX * 160
    body.velocity.y += knockbackY * 160
  }

  private updateHealthBar() {
    const healthPercent = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1)
    this.healthBarFill.width = 32 * healthPercent
  }

  private updateHealthBarPosition() {
    this.healthBarBg.setPosition(this.x, this.y - 28)
    this.healthBarFill.setPosition(this.x - (32 - this.healthBarFill.width) / 2, this.y - 28)
  }
}
