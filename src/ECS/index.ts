// Core ECS exports
export { World } from './World.js'
export { System, SystemPhase, createSystem } from './System.js'

// Components
export {
    Position,
    Velocity,
    Mass,
    Size,
    Temperature,
    CameraComponent,
    CameraData,
    ComponentTypes,
    ComponentKey
} from './Components.js'

// Utilities
export { SpatialHash } from './SpatialHash.js'
export { PhysicsConfig } from './PhysicsConfig.js'

// Systems
export {
    GravitySystem,
    MovementSystem,
    createCameraMovementSystem,
    createPlanetRenderer
} from './systems/index.js'
