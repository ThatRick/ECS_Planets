import Vec3 from '../lib/Vector3.js'

// Component type symbols for type-safe component access
export const Position = Symbol('Position')
export const Velocity = Symbol('Velocity')
export const Mass = Symbol('Mass')
export const Size = Symbol('Size')
export const Color = Symbol('Color')
export const Temperature = Symbol('Temperature')
export const Orbit = Symbol('Orbit')
export const CameraComponent = Symbol('Camera')

// Component data types for 3D camera with spherical coordinates
export interface CameraData {
    distance: number    // Distance from origin
    theta: number       // Horizontal rotation (azimuth) in radians
    phi: number         // Vertical rotation (elevation) in radians
    zoom: number        // Field of view scale
}

export interface OrbitData {
    semiMajorAxis: number          // meters
    eccentricity: number           // 0..1
    meanMotionRadPerSec: number    // radians / second
    meanAnomaly: number            // radians (mutable)

    // Precomputed rotation matrix (perifocal XY -> world XYZ).
    // For a perifocal position [x, y, 0], world position is:
    //  x' = m11*x + m12*y
    //  y' = m21*x + m22*y
    //  z' = m31*x + m32*y
    m11: number
    m12: number
    m21: number
    m22: number
    m31: number
    m32: number
}

// Type mapping from symbols to their data types
export interface ComponentTypes {
    [Position]: Vec3    // 3D position
    [Velocity]: Vec3    // 3D velocity
    [Mass]: number
    [Size]: number
    [Color]: Vec3       // Linear RGB (0..1)
    [Temperature]: number
    [Orbit]: OrbitData
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
    Color,
    Temperature,
    Orbit,
    CameraComponent
]
