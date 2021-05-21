import { SystemBase, Entity } from '../ECS.js'
import Vec2, {vec2} from '../../lib/Vector2.js'

interface MovableEntity
{
    pos: Vec2
    vel: Vec2
}

export class MovementSystem extends SystemBase
{
    movableEntities: MovableEntity[]
    
    update(dt: number)
    {
        this.movableEntities.forEach(ent => {
            const dPos = Vec2.scale(ent.vel, dt)
            ent.pos.add(dPos)
        })
    }

    updateQuery(entities: Entity[]) {
        this.movableEntities = entities.filter(ent => ent.pos && ent.vel) as MovableEntity[]
    }
}
