import { System } from '../System.js'
import { World } from '../World.js'
import { Position, Size, Temperature, CameraComponent } from '../Components.js'
import { color, scale } from '../../lib/common.js'

/**
 * Factory to create a planet renderer bound to a canvas.
 * Renders planets as circles with temperature-based coloring.
 */
export function createPlanetRenderer(canvas: HTMLCanvasElement): System {
    const ctx = canvas.getContext('2d')!

    return {
        name: 'PlanetRenderer',
        phase: 'visual',

        update(world: World, _dt: number): void {
            const { width, height } = canvas

            // Get camera
            const cameraEntity = world.querySingle(CameraComponent)
            if (cameraEntity === undefined) return
            const camera = world.getComponent(cameraEntity, CameraComponent)!

            // Get renderable planets
            const planets = world.query(Position, Size, Temperature)

            // Clear canvas
            ctx.save()
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, width, height)

            // Apply camera transform
            ctx.translate(camera.offset.x, camera.offset.y)
            ctx.scale(camera.zoom, camera.zoom)

            // Render each planet
            for (const id of planets) {
                const pos = world.getComponent(id, Position)!
                const size = world.getComponent(id, Size)!
                const temp = world.getComponent(id, Temperature)!

                ctx.beginPath()
                ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2)
                ctx.fillStyle = bodyColor(temp)
                ctx.fill()
            }

            ctx.restore()
        }
    }
}

/**
 * Convert temperature to RGB color.
 * Approximates black-body radiation color.
 *
 * - Cold bodies (~100K): Dark gray
 * - Warm bodies (~1000K): Red
 * - Hot bodies (~7000K): Yellow/white
 * - Very hot (~10000K+): Blue-white
 */
function bodyColor(temp: number): string {
    const minBrightness = 100

    // Red channel ramps up first (0-1000K)
    const r = scale(temp, 0, 1000, minBrightness, 255, true)

    // Green follows (0-7000K)
    const g = scale(temp, 0, 7000, minBrightness, 255, true)

    // Blue last (0-10000K)
    const b = scale(temp, 0, 10000, minBrightness, 255, true)

    return color(r, g, b)
}
