/**
 * Physics constants and configuration.
 * Centralized for easy tuning and experimentation.
 */
export const PhysicsConfig = {
    /** Gravitational constant (m³/kg/s²) */
    G: 6.674e-11,

    /**
     * Heat capacity (J/kg/K) - realistic value for rocky material
     */
    heatCapacity: 2000,

    /**
     * Impact heat multiplier for visualization.
     * Multiplies the kinetic energy converted to heat during collisions.
     * Higher values = more dramatic heating on impact.
     */
    impactHeatMultiplier: 20000,

    /** Stefan-Boltzmann constant (W/m²/K⁴) */
    stefanBoltzmann: 5.670367e-8,

    /** Planet material density (kg/m³) */
    density: 1e5,

    /** Minimum temperature (K) - cosmic microwave background */
    minTemperature: 3,

    /** Calculate body radius from mass using density */
    bodySize(mass: number): number {
        // Volume = mass / density
        // V = (4/3)πr³
        // r = ∛(3V / 4π) = ∛(3m / 4πρ)
        return Math.pow((3 * (mass / this.density)) / (4 * Math.PI), 1 / 3)
    },

    /** Calculate mass from radius using density */
    bodyMass(radius: number): number {
        // V = (4/3)πr³
        // m = V * density
        const volume = (4 / 3) * Math.PI * Math.pow(radius, 3)
        return volume * this.density
    }
} as const
