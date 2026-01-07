import { Position, Size, Temperature, CameraComponent } from '../Components.js';
import { color, scale } from '../../lib/common.js';
/**
 * Factory to create a planet renderer bound to a canvas.
 * Renders planets as circles with temperature-based coloring.
 */
export function createPlanetRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    return {
        name: 'PlanetRenderer',
        phase: 'visual',
        update(world, _dt) {
            const { width, height } = canvas;
            // Get camera
            const cameraEntity = world.querySingle(CameraComponent);
            if (cameraEntity === undefined)
                return;
            const camera = world.getComponent(cameraEntity, CameraComponent);
            // Get renderable planets
            const planets = world.query(Position, Size, Temperature);
            // Clear canvas
            ctx.save();
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            // Apply camera transform
            ctx.translate(camera.offset.x, camera.offset.y);
            ctx.scale(camera.zoom, camera.zoom);
            // Render each planet
            for (const id of planets) {
                const pos = world.getComponent(id, Position);
                const size = world.getComponent(id, Size);
                const temp = world.getComponent(id, Temperature);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                ctx.fillStyle = bodyColor(temp);
                ctx.fill();
            }
            ctx.restore();
        }
    };
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
function bodyColor(temp) {
    const minBrightness = 80;
    // Use logarithmic scale for temperature perception
    // log10(100) = 2, log10(1000) = 3, log10(10000) = 4
    const logTemp = Math.log10(Math.max(temp, 1));
    // Red: ramps from 2 (100K) to 2.7 (500K)
    const r = scale(logTemp, 2, 2.7, minBrightness, 255, true);
    // Green: ramps from 2.3 (200K) to 3.3 (2000K)
    const g = scale(logTemp, 2.3, 3.3, minBrightness, 255, true);
    // Blue: ramps from 2.7 (500K) to 3.7 (5000K)
    const b = scale(logTemp, 2.7, 3.7, minBrightness, 255, true);
    return color(r, g, b);
}
