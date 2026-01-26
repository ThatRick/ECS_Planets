import Vec3 from '../lib/Vector3.js'

// Component type symbols for type-safe component access
export const Position = Symbol('Position')
export const Velocity = Symbol('Velocity')
export const Mass = Symbol('Mass')
export const Size = Symbol('Size')
export const Temperature = Symbol('Temperature')
export const CameraComponent = Symbol('Camera')

// Component data types for 3D camera with spherical coordinates
export interface CameraData {
    distance: number    // Distance from origin
    theta: number       // Horizontal rotation (azimuth) in radians
    phi: number         // Vertical rotation (elevation) in radians
    zoom: number        // Field of view scale
}

// Type mapping from symbols to their data types
export interface ComponentTypes {
    [Position]: Vec3    // 3D position
    [Velocity]: Vec3    // 3D velocity
    [Mass]: number
    [Size]: number
    [Temperature]: number
    [CameraComponent]: CameraData
}

// Helper type for component keys
export type ComponentKey = keyof ComponentTypes

// All component symbols for iteration
export const ALL_COMPONENTS: symbol[] = [
    Position,
    Velocity,
    Mass,
    Size,
    Temperature,
    CameraComponent
]
