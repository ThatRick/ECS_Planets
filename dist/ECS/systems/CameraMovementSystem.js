import { CameraComponent } from '../Components.js';
/**
 * Factory to create a 3D camera movement system bound to a canvas.
 * Handles mouse/touch drag for rotation around origin and wheel/pinch for zooming.
 */
export function createCameraMovementSystem(canvas) {
    // Input state
    let pointerDown = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let deltaTheta = 0;
    let deltaPhi = 0;
    let deltaZoom = 1.0;
    let deltaDistance = 1.0;
    // Touch pinch state
    let lastPinchDistance = 0;
    // Configuration
    const rotationSensitivity = 0.005; // Radians per pixel
    const zoomStep = 0.15;
    const distanceStep = 0.1;
    const minPhi = -Math.PI / 2 + 0.1; // Prevent gimbal lock at poles
    const maxPhi = Math.PI / 2 - 0.1;
    const minZoom = 0.1;
    const maxZoom = 5.0;
    const minDistance = 100;
    const maxDistance = 1e9;
    // Helper to get position from mouse or touch event
    function getEventPos(ev) {
        const rect = canvas.getBoundingClientRect();
        if ('offsetX' in ev) {
            return { x: ev.offsetX, y: ev.offsetY };
        }
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }
    // Mouse events
    canvas.addEventListener('mousedown', (ev) => {
        pointerDown = true;
        const pos = getEventPos(ev);
        lastPointerX = pos.x;
        lastPointerY = pos.y;
    });
    canvas.addEventListener('mouseup', () => {
        pointerDown = false;
    });
    canvas.addEventListener('mouseleave', () => {
        pointerDown = false;
    });
    canvas.addEventListener('mousemove', (ev) => {
        if (pointerDown) {
            const pos = getEventPos(ev);
            const dx = pos.x - lastPointerX;
            const dy = pos.y - lastPointerY;
            // Horizontal drag rotates theta (azimuth)
            deltaTheta -= dx * rotationSensitivity;
            // Vertical drag rotates phi (elevation)
            deltaPhi -= dy * rotationSensitivity;
            lastPointerX = pos.x;
            lastPointerY = pos.y;
        }
    });
    canvas.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        if (ev.shiftKey) {
            // Shift + scroll: change distance (move camera closer/farther)
            const distanceFactor = ev.deltaY > 0 ? (1 + distanceStep) : (1 - distanceStep);
            deltaDistance *= distanceFactor;
        }
        else {
            // Normal scroll: zoom (change FOV)
            const zoomFactor = ev.deltaY > 0 ? (1 - zoomStep) : (1 + zoomStep);
            deltaZoom *= zoomFactor;
        }
    }, { passive: false });
    // Touch events
    canvas.addEventListener('touchstart', (ev) => {
        ev.preventDefault();
        if (ev.touches.length === 1) {
            pointerDown = true;
            const pos = getEventPos(ev.touches[0]);
            lastPointerX = pos.x;
            lastPointerY = pos.y;
        }
        else if (ev.touches.length === 2) {
            // Start pinch
            pointerDown = false;
            const dx = ev.touches[0].clientX - ev.touches[1].clientX;
            const dy = ev.touches[0].clientY - ev.touches[1].clientY;
            lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: false });
    canvas.addEventListener('touchend', (ev) => {
        if (ev.touches.length === 0) {
            pointerDown = false;
        }
        else if (ev.touches.length === 1) {
            // Switched from pinch to rotate
            pointerDown = true;
            const pos = getEventPos(ev.touches[0]);
            lastPointerX = pos.x;
            lastPointerY = pos.y;
            lastPinchDistance = 0;
        }
    });
    canvas.addEventListener('touchcancel', () => {
        pointerDown = false;
        lastPinchDistance = 0;
    });
    canvas.addEventListener('touchmove', (ev) => {
        ev.preventDefault();
        if (ev.touches.length === 1 && pointerDown) {
            // Rotate
            const pos = getEventPos(ev.touches[0]);
            const dx = pos.x - lastPointerX;
            const dy = pos.y - lastPointerY;
            deltaTheta -= dx * rotationSensitivity;
            deltaPhi -= dy * rotationSensitivity;
            lastPointerX = pos.x;
            lastPointerY = pos.y;
        }
        else if (ev.touches.length === 2) {
            // Pinch zoom (affects distance)
            const dx = ev.touches[0].clientX - ev.touches[1].clientX;
            const dy = ev.touches[0].clientY - ev.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (lastPinchDistance > 0) {
                const zoomFactor = distance / lastPinchDistance;
                deltaDistance /= zoomFactor; // Pinch in = move closer
            }
            lastPinchDistance = distance;
        }
    }, { passive: false });
    return {
        name: 'CameraMovement',
        phase: 'visual',
        update(world, _dt) {
            const cameraEntity = world.querySingle(CameraComponent);
            if (cameraEntity === undefined)
                return;
            const camera = world.getComponent(cameraEntity, CameraComponent);
            // Apply accumulated rotation
            camera.theta += deltaTheta;
            camera.phi += deltaPhi;
            // Clamp phi to prevent flipping over poles
            camera.phi = Math.max(minPhi, Math.min(maxPhi, camera.phi));
            // Wrap theta to [0, 2π)
            while (camera.theta < 0)
                camera.theta += Math.PI * 2;
            while (camera.theta >= Math.PI * 2)
                camera.theta -= Math.PI * 2;
            deltaTheta = 0;
            deltaPhi = 0;
            // Apply accumulated zoom with bounds
            camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * deltaZoom));
            deltaZoom = 1.0;
            // Apply accumulated distance change with bounds
            camera.distance = Math.max(minDistance, Math.min(maxDistance, camera.distance * deltaDistance));
            deltaDistance = 1.0;
        }
    };
}
