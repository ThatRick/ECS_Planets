import { SystemBase, Entity, Camera } from '../ECS.js'
import Vec2, {vec2} from '../../lib/Vector2.js'

interface CameraEntity
{
    camera: Camera
}

export class CameraMovementSystem extends SystemBase
{
    cameraEntity: CameraEntity
    canvas: HTMLCanvasElement

    mouseIsDown = false
    mouseOffset: Vec2
    deltaOffset = new Vec2(0, 0)

    zoomStep = 0.25
    deltaZoom = 1.0

    constructor(canvas: HTMLCanvasElement)
    {
        super()
        this.canvas = canvas

        canvas.addEventListener('mousedown', (ev: MouseEvent) => {
            this.mouseIsDown = true
            this.mouseOffset = new Vec2(ev.offsetX, ev.offsetY)
        })
        canvas.addEventListener('mouseup', (ev: MouseEvent) => { this.mouseIsDown = false })
        canvas.addEventListener('mousemove', (ev: MouseEvent) => {
            if (this.mouseIsDown) {
                const currentOffset = new Vec2(ev.offsetX, ev.offsetY)
                this.deltaOffset.add(Vec2.sub(currentOffset, this.mouseOffset))
                this.mouseOffset = currentOffset
            }
        })
        canvas.addEventListener('wheel', (ev: WheelEvent) => {
            const zoomFactor = (ev.deltaY > 0) ? 1 + this.zoomStep : 1 - this.zoomStep
            this.deltaZoom *= zoomFactor
            console.log('Camera zoom:', this.cameraEntity.camera.zoom)
        })
    }

    update(dt: number)
    {
        if (!this.cameraEntity) return
        this.cameraEntity.camera.offset.add(this.deltaOffset)
        this.cameraEntity.camera.zoom *= this.deltaZoom
        this.deltaOffset.set(0,0)
        this.deltaZoom = 1.0
    }

    updateQuery(entities: Entity[]) {
        this.cameraEntity = entities.find(ent => ent.camera) as CameraEntity
    }
}