import Vec2, {vec2} from '../../lib/Vector2.js'

export interface PhysicsBody
{
    pos: Vec2
    vel: Vec2
    mass: number
    size: number
}