import Vec2 from '../lib/Vector2.js'

// Component type symbols for type-safe component access
export const Position = Symbol('Position')
export const Velocity = Symbol('Velocity')
export const Mass = Symbol('Mass')
export const Size = Symbol('Size')
export const Temperature = Symbol('Temperature')
export const CameraComponent = Symbol('Camera')

// Component data types
export interface CameraData {
    offset: Vec2
    zoom: number
}

// Type mapping from symbols to their data types
export interface ComponentTypes {
    [Position]: Vec2
    [Velocity]: Vec2
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
