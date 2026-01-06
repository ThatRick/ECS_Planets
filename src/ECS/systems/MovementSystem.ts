import { System } from '../System.js'
import { World } from '../World.js'
import { Position, Velocity } from '../Components.js'
import Vec2 from '../../lib/Vector2.js'

/**
 * Simple kinematic movement for entities without gravity.
 * Updates position based on velocity.
 *
 * Note: For gravitating bodies, movement is handled by GravitySystem
 * using Velocity Verlet integration for better accuracy.
 */
export const MovementSystem: System = {
    name: 'Movement',
    phase: 'simulate',

    update(world: World, dt: number): void {
        const entities = world.query(Position, Velocity)

        for (const id of entities) {
            const pos = world.getComponent(id, Position)!
            const vel = world.getComponent(id, Velocity)!

            // Simple Euler integration: x += v * dt
            pos.add(Vec2.scale(vel, dt))
        }
    }
}
