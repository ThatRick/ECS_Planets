import { SystemBase } from '../ECS.js';
import { color, scale } from '../../lib/common.js';
export class PlanetBodyRenderer extends SystemBase {
    constructor(canvas) {
        super();
        this.ctx = canvas.getContext('2d');
    }
    updateQuery(entities) {
        this.planets = entities.filter(ent => ent.pos &&
            ent.size &&
            ent.temperature);
        this.cameraEntity = entities.find(ent => ent.camera);
    }
    update() {
        const { width, height } = this.ctx.canvas;
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.translate(this.cameraEntity.camera.offset.x, this.cameraEntity.camera.offset.y);
        ctx.scale(this.cameraEntity.camera.zoom, this.cameraEntity.camera.zoom);
        this.planets.forEach((ent, i) => {
            const { x, y } = ent.pos;
            const r = ent.size;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            const col = this.bodyColor(ent.temperature);
            ctx.fillStyle = col;
            ctx.fill();
        });
        ctx.restore();
    }
    bodyColor(temp) {
        const min = 100;
        const r = scale(temp, 0, 1000, min, 255, true);
        const g = scale(temp, 0, 7000, min, 255, true);
        const b = scale(temp, 0, 10000, min, 255, true);
        return color(r, g, b);
    }
}
