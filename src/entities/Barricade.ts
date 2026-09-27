import Phaser from 'phaser'
import { barricadeConfig } from '../config/barricades'

export default class Barricade extends Phaser.GameObjects.Rectangle {
  maxHealth = barricadeConfig.maxHealth
  health = this.maxHealth

  private healthBarBg: Phaser.GameObjects.Rectangle
  private healthBarFill: Phaser.GameObjects.Rectangle
  private healthBarWidth: number
  private urgentTween?: Phaser.Tweens.Tween
  private hitFlash?: Phaser.Time.TimerEvent

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, width, height, 0x8b5a2b, 1)

    scene.add.existing(this)
    scene.physics.add.existing(this, true)
    this.setStrokeStyle(2, 0x3b2413)

    this.healthBarWidth = Math.max(width, height, 80)
    this.healthBarBg = scene.add.rectangle(this.x, this.y - height / 2 - 10, this.healthBarWidth, 5, 0x111111, 0.9)
    this.healthBarFill = scene.add.rectangle(this.x, this.y - height / 2 - 10, this.healthBarWidth - 4, 3, 0x2ecc71, 1)
    this.healthBarBg.setDepth(2)
    this.healthBarFill.setDepth(2)

    const body = this.body as Phaser.Physics.Arcade.StaticBody
    body.setSize(width, height)
    body.updateFromGameObject()

    this.updateVisuals()
  }

  get isAlive() {
    return this.health > 0
  }

  takeDamage(amount: number) {
    if (!this.isAlive) {
      return
    }

    this.health = Math.max(0, this.health - amount)
    this.updateVisuals()
    this.flashAttack()
  }

  flashAttack() {
    if (!this.active || !this.isAlive) {
      return
    }

    this.fillColor = 0xffc857
    this.hitFlash?.remove(false)
    this.hitFlash = this.scene.time.delayedCall(80, () => {
      if (this.active) {
        this.updateVisuals()
      }
    })
  }

  repair(amount: number) {
    if (this.health >= this.maxHealth) {
      return false
    }

    this.health = Math.min(this.maxHealth, this.health + amount)
    this.updateVisuals()
    return true
  }

  repairFully() {
    this.health = this.maxHealth
    this.updateVisuals()
  }

  syncHealth(health: number, maxHealth = this.maxHealth) {
    this.maxHealth = maxHealth
    this.health = Phaser.Math.Clamp(health, 0, this.maxHealth)
    this.updateVisuals()
  }

  enableCollision() {
    const body = this.body as Phaser.Physics.Arcade.StaticBody
    body.enable = true
  }

  disableCollision() {
    const body = this.body as Phaser.Physics.Arcade.StaticBody
    body.enable = false
  }

  private updateVisuals() {
    const healthPercent = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1)

    this.healthBarFill.width = (this.healthBarWidth - 4) * healthPercent
    this.healthBarFill.x = this.x - ((this.healthBarWidth - 4) - this.healthBarFill.width) / 2

    const urgent = this.isAlive && healthPercent <= 0.35

    if (!this.isAlive) {
      this.stopUrgentPulse()
      this.fillColor = 0x2b2b2b
      this.setAlpha(0.35)
      this.setStrokeStyle(2, 0x3b2413)
      this.healthBarBg.setVisible(false)
      this.healthBarFill.setVisible(false)
      this.disableCollision()
      return
    }

    this.enableCollision()
    this.fillColor = urgent ? 0xe74c3c : 0x8b5a2b
    this.setStrokeStyle(urgent ? 4 : 2, urgent ? 0xff6b3d : 0x3b2413)
    this.healthBarFill.fillColor = urgent ? 0xe74c3c : 0x2ecc71
    this.healthBarBg.setVisible(true)
    this.healthBarFill.setVisible(true)
    this.syncUrgentPulse(urgent)
  }

  private syncUrgentPulse(urgent: boolean) {
    if (!urgent) {
      this.stopUrgentPulse()
      this.setAlpha(1)
      return
    }

    if (this.urgentTween) {
      return
    }

    this.urgentTween = this.scene.tweens.add({
      targets: this,
      alpha: 0.55,
      duration: 280,
      yoyo: true,
      repeat: -1,
    })
  }

  private stopUrgentPulse() {
    this.urgentTween?.stop()
    this.urgentTween = undefined
  }

  destroy(fromScene?: boolean) {
    this.hitFlash?.remove(false)
    this.stopUrgentPulse()
    this.healthBarBg.destroy()
    this.healthBarFill.destroy()
    super.destroy(fromScene)
  }
}
