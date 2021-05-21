import { SystemBase } from '../ECS.js';
import Vec2 from '../../lib/Vector2.js';
export class MovementSystem extends SystemBase {
    update(dt) {
        this.movableEntities.forEach(ent => {
            const dPos = Vec2.scale(ent.vel, dt);
            ent.pos.add(dPos);
        });
    }
    updateQuery(entities) {
        this.movableEntities = entities.filter(ent => ent.pos && ent.vel);
    }
}
