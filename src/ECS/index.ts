// Core ECS exports
export { World } from './World.js'
export { System, SystemPhase, createSystem } from './System.js'

// Components
export {
    Position,
    Velocity,
    Mass,
    Size,
    Color,
    Temperature,
    Orbit,
    CameraComponent,
    EarthTag,
    CameraData,
    OrbitData,
    ComponentTypes,
    ComponentKey
} from './Components.js'

// Utilities
export { SpatialHash } from './SpatialHash.js'
export { PhysicsConfig } from './PhysicsConfig.js'
export { QuadTree, Body } from './QuadTree.js'

// Systems
export {
    GravitySystemSimple,
    GravitySystemBarnesHut,
    OrbitSystem,
    createCameraMovementSystem,
    createPlanetRenderer,
    createPlanetRendererWebGL,
    isWebGL2Available
} from './systems/index.js'
