import Phaser from 'phaser'

export default class Player extends Phaser.Physics.Arcade.Sprite {
  maxHealth = 100
  health = this.maxHealth
  speed = 260

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player')

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.setCircle(18)
    this.setDrag(900)
  }

  aimAt(pointer: Phaser.Input.Pointer) {
    this.rotation = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY)
  }

  takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount)
  }
}
