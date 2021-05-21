import { SystemBase } from '../ECS.js';
import Vec2 from '../../lib/Vector2.js';
export class CameraMovementSystem extends SystemBase {
    constructor(canvas) {
        super();
        this.mouseIsDown = false;
        this.deltaOffset = new Vec2(0, 0);
        this.zoomStep = 0.25;
        this.deltaZoom = 1.0;
        this.canvas = canvas;
        canvas.addEventListener('mousedown', (ev) => {
            this.mouseIsDown = true;
            this.mouseOffset = new Vec2(ev.offsetX, ev.offsetY);
        });
        canvas.addEventListener('mouseup', (ev) => { this.mouseIsDown = false; });
        canvas.addEventListener('mousemove', (ev) => {
            if (this.mouseIsDown) {
                const currentOffset = new Vec2(ev.offsetX, ev.offsetY);
                this.deltaOffset.add(Vec2.sub(currentOffset, this.mouseOffset));
                this.mouseOffset = currentOffset;
            }
        });
        canvas.addEventListener('wheel', (ev) => {
            const zoomFactor = (ev.deltaY > 0) ? 1 + this.zoomStep : 1 - this.zoomStep;
            this.deltaZoom *= zoomFactor;
            console.log('Camera zoom:', this.cameraEntity.camera.zoom);
        });
    }
    update(dt) {
        if (!this.cameraEntity)
            return;
        this.cameraEntity.camera.offset.add(this.deltaOffset);
        this.cameraEntity.camera.zoom *= this.deltaZoom;
        this.deltaOffset.set(0, 0);
        this.deltaZoom = 1.0;
    }
    updateQuery(entities) {
        this.cameraEntity = entities.find(ent => ent.camera);
    }
}
