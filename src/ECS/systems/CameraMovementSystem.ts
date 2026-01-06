import { System } from '../System.js'
import { World } from '../World.js'
import { CameraComponent } from '../Components.js'
import Vec2 from '../../lib/Vector2.js'

/**
 * Factory to create a camera movement system bound to a canvas.
 * Handles mouse drag for panning and wheel for zooming.
 */
export function createCameraMovementSystem(canvas: HTMLCanvasElement): System {
    // Input state
    let mouseIsDown = false
    let mouseOffset = new Vec2(0, 0)
    let deltaOffset = new Vec2(0, 0)
    let deltaZoom = 1.0

    // Configuration
    const zoomStep = 0.25
    const minZoom = 0.0001
    const maxZoom = 10

    // Bind event listeners
    canvas.addEventListener('mousedown', (ev: MouseEvent) => {
        mouseIsDown = true
        mouseOffset = new Vec2(ev.offsetX, ev.offsetY)
    })

    canvas.addEventListener('mouseup', () => {
        mouseIsDown = false
    })

    canvas.addEventListener('mouseleave', () => {
        mouseIsDown = false
    })

    canvas.addEventListener('mousemove', (ev: MouseEvent) => {
        if (mouseIsDown) {
            const currentOffset = new Vec2(ev.offsetX, ev.offsetY)
            deltaOffset.add(Vec2.sub(currentOffset, mouseOffset))
            mouseOffset = currentOffset
        }
    })

    canvas.addEventListener('wheel', (ev: WheelEvent) => {
        ev.preventDefault()
        const zoomFactor = ev.deltaY > 0 ? (1 + zoomStep) : (1 - zoomStep)
        deltaZoom *= zoomFactor
    }, { passive: false })

    return {
        name: 'CameraMovement',
        phase: 'visual',

        update(world: World, _dt: number): void {
            const cameraEntity = world.querySingle(CameraComponent)
            if (cameraEntity === undefined) return

            const camera = world.getComponent(cameraEntity, CameraComponent)!

            // Apply accumulated pan offset
            camera.offset.add(deltaOffset)
            deltaOffset.set(0, 0)

            // Apply accumulated zoom with bounds
            camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * deltaZoom))
            deltaZoom = 1.0
        }
    }
}
