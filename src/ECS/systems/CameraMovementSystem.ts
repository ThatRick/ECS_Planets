import { System } from '../System.js'
import { World } from '../World.js'
import { CameraComponent } from '../Components.js'
import Vec2 from '../../lib/Vector2.js'

/**
 * Factory to create a camera movement system bound to a canvas.
 * Handles mouse/touch drag for panning and wheel/pinch for zooming.
 */
export function createCameraMovementSystem(canvas: HTMLCanvasElement): System {
    // Input state
    let pointerDown = false
    let pointerOffset = new Vec2(0, 0)
    let deltaOffset = new Vec2(0, 0)
    let deltaZoom = 1.0

    // Touch pinch state
    let lastPinchDistance = 0

    // Configuration
    const zoomStep = 0.25
    const minZoom = 0.0001
    const maxZoom = 10

    // Helper to get position from mouse or touch event
    function getEventPos(ev: MouseEvent | Touch): Vec2 {
        const rect = canvas.getBoundingClientRect()
        if ('offsetX' in ev) {
            return new Vec2(ev.offsetX, ev.offsetY)
        }
        return new Vec2(ev.clientX - rect.left, ev.clientY - rect.top)
    }

    // Mouse events
    canvas.addEventListener('mousedown', (ev: MouseEvent) => {
        pointerDown = true
        pointerOffset = getEventPos(ev)
    })

    canvas.addEventListener('mouseup', () => {
        pointerDown = false
    })

    canvas.addEventListener('mouseleave', () => {
        pointerDown = false
    })

    canvas.addEventListener('mousemove', (ev: MouseEvent) => {
        if (pointerDown) {
            const currentOffset = getEventPos(ev)
            deltaOffset.add(Vec2.sub(currentOffset, pointerOffset))
            pointerOffset = currentOffset
        }
    })

    canvas.addEventListener('wheel', (ev: WheelEvent) => {
        ev.preventDefault()
        const zoomFactor = ev.deltaY > 0 ? (1 + zoomStep) : (1 - zoomStep)
        deltaZoom *= zoomFactor
    }, { passive: false })

    // Touch events
    canvas.addEventListener('touchstart', (ev: TouchEvent) => {
        ev.preventDefault()
        if (ev.touches.length === 1) {
            pointerDown = true
            pointerOffset = getEventPos(ev.touches[0])
        } else if (ev.touches.length === 2) {
            // Start pinch
            const dx = ev.touches[0].clientX - ev.touches[1].clientX
            const dy = ev.touches[0].clientY - ev.touches[1].clientY
            lastPinchDistance = Math.sqrt(dx * dx + dy * dy)
        }
    }, { passive: false })

    canvas.addEventListener('touchend', (ev: TouchEvent) => {
        if (ev.touches.length === 0) {
            pointerDown = false
        } else if (ev.touches.length === 1) {
            // Switched from pinch to pan
            pointerDown = true
            pointerOffset = getEventPos(ev.touches[0])
            lastPinchDistance = 0
        }
    })

    canvas.addEventListener('touchcancel', () => {
        pointerDown = false
        lastPinchDistance = 0
    })

    canvas.addEventListener('touchmove', (ev: TouchEvent) => {
        ev.preventDefault()

        if (ev.touches.length === 1 && pointerDown) {
            // Pan
            const currentOffset = getEventPos(ev.touches[0])
            deltaOffset.add(Vec2.sub(currentOffset, pointerOffset))
            pointerOffset = currentOffset
        } else if (ev.touches.length === 2) {
            // Pinch zoom
            const dx = ev.touches[0].clientX - ev.touches[1].clientX
            const dy = ev.touches[0].clientY - ev.touches[1].clientY
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (lastPinchDistance > 0) {
                const zoomFactor = distance / lastPinchDistance
                deltaZoom *= zoomFactor
            }
            lastPinchDistance = distance
        }
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
