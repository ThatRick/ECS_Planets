import { System } from '../System.js'
import { World } from '../World.js'
import { Position, Size, Color, Temperature, CameraComponent } from '../Components.js'
import { color, scale } from '../../lib/common.js'

/**
 * Factory to create a 2D fallback planet renderer bound to a canvas.
 * Projects 3D positions to 2D using simple orthographic projection.
 * Note: WebGL renderer is preferred for proper 3D visualization.
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
            const bodies = world.query(Position, Size)

            // Clear canvas
            ctx.save()
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, width, height)

            // Calculate camera basis vectors
            const cosPhi = Math.cos(camera.phi)
            const sinPhi = Math.sin(camera.phi)
            const cosTheta = Math.cos(camera.theta)
            const sinTheta = Math.sin(camera.theta)

            // Camera right vector (for X projection)
            const rightX = cosTheta
            const rightZ = -sinTheta

            // Camera up vector (for Y projection)
            const upX = -sinPhi * sinTheta
            const upY = cosPhi
            const upZ = -sinPhi * cosTheta

            // Scale factor based on camera distance and zoom
            const scaleFactor = (Math.min(width, height) / 2) * camera.zoom / camera.distance

            // Center of screen
            const centerX = width / 2
            const centerY = height / 2

            // Render each planet
            for (const id of bodies) {
                const pos = world.getComponent(id, Position)!
                const size = world.getComponent(id, Size)!
                const explicitColor = world.getComponent(id, Color)
                const temp = world.getComponent(id, Temperature)

                // Project 3D position to 2D screen coordinates
                const screenX = centerX + (pos.x * rightX + pos.z * rightZ) * scaleFactor
                const screenY = centerY - (pos.x * upX + pos.y * upY + pos.z * upZ) * scaleFactor
                const screenSize = size * scaleFactor

                // Skip if too small
                if (screenSize < 0.5) continue

                ctx.beginPath()
                ctx.arc(screenX, screenY, Math.max(screenSize, 1), 0, Math.PI * 2)
                if (explicitColor) {
                    ctx.fillStyle = color(explicitColor.x * 255, explicitColor.y * 255, explicitColor.z * 255)
                } else if (temp !== undefined) {
                    ctx.fillStyle = bodyColor(temp)
                } else {
                    ctx.fillStyle = '#fff'
                }
                ctx.fill()
            }

            ctx.restore()
        }
    }
}

/**
 * Convert temperature to RGB color.
 * Uses logarithmic scale for better visualization across wide temp ranges.
 *
 * - Cold bodies (~100K): Dark gray/brown
 * - Warm bodies (~500K): Red
 * - Hot bodies (~2000K): Orange/Yellow
 * - Very hot (~5000K+): White/Blue-white
 */
function bodyColor(temp: number): string {
    const minBrightness = 80

    // Use logarithmic scale for temperature perception
    // log10(100) = 2, log10(1000) = 3, log10(10000) = 4
    const logTemp = Math.log10(Math.max(temp, 1))

    // Red: ramps from 2 (100K) to 2.7 (500K)
    const r = scale(logTemp, 2, 2.7, minBrightness, 255, true)

    // Green: ramps from 2.3 (200K) to 3.3 (2000K)
    const g = scale(logTemp, 2.3, 3.3, minBrightness, 255, true)

    // Blue: ramps from 2.7 (500K) to 3.7 (5000K)
    const b = scale(logTemp, 2.7, 3.7, minBrightness, 255, true)

    return color(r, g, b)
}
