// Component type symbols for type-safe component access
export const Position = Symbol('Position');
export const Velocity = Symbol('Velocity');
export const Mass = Symbol('Mass');
export const Size = Symbol('Size');
export const Color = Symbol('Color');
export const Temperature = Symbol('Temperature');
export const Orbit = Symbol('Orbit');
export const CameraComponent = Symbol('Camera');
export const EarthTag = Symbol('EarthTag');
// All component symbols for iteration
export const ALL_COMPONENTS = [
    Position,
    Velocity,
    Mass,
    Size,
    Color,
    Temperature,
    Orbit,
    CameraComponent,
    EarthTag
];
