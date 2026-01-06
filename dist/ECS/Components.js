// Component type symbols for type-safe component access
export const Position = Symbol('Position');
export const Velocity = Symbol('Velocity');
export const Mass = Symbol('Mass');
export const Size = Symbol('Size');
export const Temperature = Symbol('Temperature');
export const CameraComponent = Symbol('Camera');
// All component symbols for iteration
export const ALL_COMPONENTS = [
    Position,
    Velocity,
    Mass,
    Size,
    Temperature,
    CameraComponent
];
