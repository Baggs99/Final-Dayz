import Phaser from 'phaser'

export default class Bullet extends Phaser.Physics.Arcade.Sprite {
  damage: number
  speed: number
  lifespan = 1600
  private bornAt = 0

  constructor(scene: Phaser.Scene, x: number, y: number, damage: number, speed: number) {
    super(scene, x, y, 'bullet')

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.damage = damage
    this.speed = speed
    this.bornAt = scene.time.now
    this.setCircle(4)
  }

  launch(directionX: number, directionY: number) {
    const body = this.body as Phaser.Physics.Arcade.Body

    this.setRotation(Math.atan2(directionY, directionX))
    body.setVelocity(directionX * this.speed, directionY * this.speed)
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta)

    const bounds = this.scene.physics.world.bounds
    const isOutOfBounds =
      this.x < bounds.left - this.width ||
      this.x > bounds.right + this.width ||
      this.y < bounds.top - this.height ||
      this.y > bounds.bottom + this.height

    if (isOutOfBounds || time - this.bornAt > this.lifespan) {
      this.destroy()
    }
  }
}
