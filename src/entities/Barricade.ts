import Phaser from 'phaser'
import { barricadeConfig } from '../config/barricades'

export default class Barricade extends Phaser.GameObjects.Rectangle {
  maxHealth = barricadeConfig.maxHealth
  health = this.maxHealth

  private healthBarBg: Phaser.GameObjects.Rectangle
  private healthBarFill: Phaser.GameObjects.Rectangle
  private healthBarWidth: number

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

    if (!this.isAlive) {
      this.fillColor = 0x2b2b2b
      this.setAlpha(0.35)
      this.healthBarBg.setVisible(false)
      this.healthBarFill.setVisible(false)
      this.disableCollision()
      return
    }

    this.enableCollision()
    this.setAlpha(1)
    this.fillColor = healthPercent > 0.4 ? 0x8b5a2b : 0xb85c38
    this.healthBarBg.setVisible(true)
    this.healthBarFill.setVisible(true)
  }

  destroy(fromScene?: boolean) {
    this.healthBarBg.destroy()
    this.healthBarFill.destroy()
    super.destroy(fromScene)
  }
}
