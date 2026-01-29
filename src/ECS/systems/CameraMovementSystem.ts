import { System } from '../System.js'
import { World } from '../World.js'
import { CameraComponent } from '../Components.js'

/**
 * Factory to create a 3D camera movement system bound to a canvas.
 * Handles mouse/touch drag for rotation around origin and wheel/pinch for zooming.
 */
export function createCameraMovementSystem(canvas: HTMLCanvasElement): System {
    // Input state
    let pointerDown = false
    let lastPointerX = 0
    let lastPointerY = 0
    let deltaTheta = 0
    let deltaPhi = 0
    let deltaZoom = 1.0
    let deltaDistance = 1.0

    // Touch pinch state
    let lastPinchDistance = 0
    let lastGestureScale = 0

    // Configuration
    const rotationSensitivity = 0.005  // Radians per pixel
    // Wheel/trackpad zoom:
    // - Use a continuous exponential mapping based on wheel delta magnitude.
    // - On macOS, trackpad pinch often comes through as wheel events with ctrlKey=true.
    //   Treat those as "distance" (dolly) to match touch pinch behavior.
    const zoomSensitivity = 0.0008        // exp(-deltaPx * k) for FOV zoom
    const distanceSensitivity = 0.0006    // exp(+deltaPx * k) for dolly distance
    const pinchSensitivity = 0.6          // <1 => less sensitive pinch in log-space
    const minPhi = -Math.PI / 2 + 0.1  // Prevent gimbal lock at poles
    const maxPhi = Math.PI / 2 - 0.1
    const minZoom = 0.1
    const maxZoom = 5.0
    const minDistance = 100
    const maxDistance = 1e9

    // Helper to get position from mouse or touch event
    function getEventPos(ev: MouseEvent | Touch): { x: number, y: number } {
        const rect = canvas.getBoundingClientRect()
        if ('offsetX' in ev) {
            return { x: ev.offsetX, y: ev.offsetY }
        }
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
    }

    function normalizeWheelDeltaY(ev: WheelEvent): number {
        // Normalize to approximate pixels across delta modes.
        // DOM_DELTA_PIXEL = 0, DOM_DELTA_LINE = 1, DOM_DELTA_PAGE = 2.
        let deltaY = ev.deltaY
        if (ev.deltaMode === 1) deltaY *= 16
        else if (ev.deltaMode === 2) deltaY *= window.innerHeight
        return deltaY
    }

    // Mouse events
    canvas.addEventListener('mousedown', (ev: MouseEvent) => {
        pointerDown = true
        const pos = getEventPos(ev)
        lastPointerX = pos.x
        lastPointerY = pos.y
    })

    canvas.addEventListener('mouseup', () => {
        pointerDown = false
    })

    canvas.addEventListener('mouseleave', () => {
        pointerDown = false
    })

    canvas.addEventListener('mousemove', (ev: MouseEvent) => {
        if (pointerDown) {
            const pos = getEventPos(ev)
            const dx = pos.x - lastPointerX
            const dy = pos.y - lastPointerY

            // Horizontal drag rotates theta (azimuth)
            deltaTheta -= dx * rotationSensitivity
            // Vertical drag rotates phi (elevation)
            deltaPhi -= dy * rotationSensitivity

            lastPointerX = pos.x
            lastPointerY = pos.y
        }
    })

    canvas.addEventListener('wheel', (ev: WheelEvent) => {
        ev.preventDefault()
        const deltaY = normalizeWheelDeltaY(ev)

        // Ignore tiny deltas (trackpad noise)
        if (Math.abs(deltaY) < 0.5) return

        // Clamp extreme deltas to avoid huge jumps (e.g., momentum scroll spikes)
        const clampedDeltaY = Math.max(-500, Math.min(500, deltaY))

        // Shift+scroll (and macOS pinch-gesture wheel events) => dolly distance
        if (ev.shiftKey || ev.ctrlKey) {
            const distanceFactor = Math.exp(clampedDeltaY * distanceSensitivity)
            deltaDistance *= distanceFactor
        } else {
            // Normal scroll => FOV zoom
            const zoomFactor = Math.exp(-clampedDeltaY * zoomSensitivity)
            deltaZoom *= zoomFactor
        }
    }, { passive: false })

    // Touch events
    canvas.addEventListener('touchstart', (ev: TouchEvent) => {
        ev.preventDefault()
        if (ev.touches.length === 1) {
            pointerDown = true
            const pos = getEventPos(ev.touches[0])
            lastPointerX = pos.x
            lastPointerY = pos.y
        } else if (ev.touches.length === 2) {
            // Start pinch
            pointerDown = false
            const dx = ev.touches[0].clientX - ev.touches[1].clientX
            const dy = ev.touches[0].clientY - ev.touches[1].clientY
            lastPinchDistance = Math.sqrt(dx * dx + dy * dy)
        }
    }, { passive: false })

    canvas.addEventListener('touchend', (ev: TouchEvent) => {
        if (ev.touches.length === 0) {
            pointerDown = false
        } else if (ev.touches.length === 1) {
            // Switched from pinch to rotate
            pointerDown = true
            const pos = getEventPos(ev.touches[0])
            lastPointerX = pos.x
            lastPointerY = pos.y
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
            // Rotate
            const pos = getEventPos(ev.touches[0])
            const dx = pos.x - lastPointerX
            const dy = pos.y - lastPointerY

            deltaTheta -= dx * rotationSensitivity
            deltaPhi -= dy * rotationSensitivity

            lastPointerX = pos.x
            lastPointerY = pos.y
        } else if (ev.touches.length === 2) {
            // Pinch zoom (affects distance)
            const dx = ev.touches[0].clientX - ev.touches[1].clientX
            const dy = ev.touches[0].clientY - ev.touches[1].clientY
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (lastPinchDistance > 0) {
                const zoomFactor = distance / lastPinchDistance
                deltaDistance /= Math.pow(zoomFactor, pinchSensitivity)  // Pinch in = move closer
            }
            lastPinchDistance = distance
        }
    }, { passive: false })

    // Safari (macOS) trackpad pinch gesture events (non-standard)
    canvas.addEventListener('gesturestart', (ev: Event) => {
        ev.preventDefault()
        lastGestureScale = 1
    }, { passive: false })

    canvas.addEventListener('gesturechange', (ev: Event) => {
        ev.preventDefault()
        const gestureEv = ev as Event & { scale?: number }
        if (typeof gestureEv.scale !== 'number') return

        if (lastGestureScale > 0) {
            const zoomFactor = gestureEv.scale / lastGestureScale
            deltaDistance /= Math.pow(zoomFactor, pinchSensitivity)
        }
        lastGestureScale = gestureEv.scale
    }, { passive: false })

    canvas.addEventListener('gestureend', (ev: Event) => {
        ev.preventDefault()
        lastGestureScale = 0
    }, { passive: false })

    return {
        name: 'CameraMovement',
        phase: 'visual',

        update(world: World, _dt: number): void {
            const cameraEntity = world.querySingle(CameraComponent)
            if (cameraEntity === undefined) return

            const camera = world.getComponent(cameraEntity, CameraComponent)!

            // Apply accumulated rotation
            camera.theta += deltaTheta
            camera.phi += deltaPhi

            // Clamp phi to prevent flipping over poles
            camera.phi = Math.max(minPhi, Math.min(maxPhi, camera.phi))

            // Wrap theta to [0, 2π)
            while (camera.theta < 0) camera.theta += Math.PI * 2
            while (camera.theta >= Math.PI * 2) camera.theta -= Math.PI * 2

            deltaTheta = 0
            deltaPhi = 0

            // Apply accumulated zoom with bounds
            camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * deltaZoom))
            deltaZoom = 1.0

            // Apply accumulated distance change with bounds
            camera.distance = Math.max(minDistance, Math.min(maxDistance, camera.distance * deltaDistance))
            deltaDistance = 1.0
        }
    }
}
