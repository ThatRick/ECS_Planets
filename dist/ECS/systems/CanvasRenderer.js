import { SystemBase } from '../ECS.js';
export class CanvasRenderer extends SystemBase {
    constructor(ctx) {
        super();
        this.ctx = ctx;
    }
    updateQuery(entities) {
        this.queryResults = entities.filter(ent => ent.physicsBody);
    }
    update() {
        const { width, height } = this.ctx.canvas;
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.beginPath();
        this.queryResults.forEach(ent => {
            const { x, y } = ent.physicsBody.pos;
            const r = ent.physicsBody.size;
            ctx.moveTo(x, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
        });
        ctx.fillStyle = '#88A';
        ctx.fill();
    }
}
