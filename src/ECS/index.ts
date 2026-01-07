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
export { QuadTree, Body } from './QuadTree.js'

// Systems
export {
    GravitySystem,
    GravitySystemOptimized,
    GravitySystemBarnesHut,
    createGravitySystemParallel,
    MovementSystem,
    createCameraMovementSystem,
    createPlanetRenderer
} from './systems/index.js'

// High-performance storage
export {
    ScalarStore,
    Vec2Store,
    EntityManager,
    PhysicsScratch
} from './ComponentStore.js'
