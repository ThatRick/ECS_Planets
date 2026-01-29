import { System } from '../System.js'
import { World } from '../World.js'
import { Orbit, Position } from '../Components.js'

const TWO_PI = Math.PI * 2

export const OrbitSystem: System = {
    name: 'OrbitSystem',
    phase: 'simulate',

    update(world: World, dt: number): void {
        const entities = world.query(Position, Orbit)
        for (const id of entities) {
            const pos = world.getComponent(id, Position)
            const orbit = world.getComponent(id, Orbit)
            if (!pos || !orbit) continue

            // Update mean anomaly at the current simulation time (absolute propagation).
            // Falls back to incremental propagation if epoch data is missing.
            if (
                Number.isFinite(world.simTimeMs) &&
                Number.isFinite(orbit.epochMs) &&
                Number.isFinite(orbit.meanAnomalyAtEpoch)
            ) {
                const dtSec = (world.simTimeMs - orbit.epochMs) / 1000
                orbit.meanAnomaly = wrapAngleRad(orbit.meanAnomalyAtEpoch + orbit.meanMotionRadPerSec * dtSec)
            } else {
                orbit.meanAnomaly = wrapAngleRad(orbit.meanAnomaly + orbit.meanMotionRadPerSec * dt)
            }

            // Propagate orbit in the perifocal plane
            const e = orbit.eccentricity
            const a = orbit.semiMajorAxis
            const M = orbit.meanAnomaly

            let xPerif: number
            let yPerif: number

            if (e < 1e-6) {
                // Near-circular shortcut
                xPerif = a * Math.cos(M)
                yPerif = a * Math.sin(M)
            } else {
                const E = solveKeplerE(M, e)
                const cosE = Math.cos(E)
                const sinE = Math.sin(E)
                const sqrtOneMinusESq = Math.sqrt(1 - e * e)

                // Perifocal coordinates from eccentric anomaly
                // x = a (cosE - e)
                // y = a * sqrt(1 - e^2) * sinE
                xPerif = a * (cosE - e)
                yPerif = a * (sqrtOneMinusESq * sinE)
            }

            // Rotate perifocal (x,y,0) into inertial space, then map to Y-up world coords.
            // Orbital elements are typically defined with Z as the primary axis; in this app Y is "up".
            const xEci = orbit.m11 * xPerif + orbit.m12 * yPerif
            const yEci = orbit.m21 * xPerif + orbit.m22 * yPerif
            const zEci = orbit.m31 * xPerif + orbit.m32 * yPerif

            pos.x = xEci
            pos.y = zEci
            pos.z = yEci
        }
    }
}

function wrapAngleRad(rad: number): number {
    rad %= TWO_PI
    if (rad < 0) rad += TWO_PI
    return rad
}

function solveKeplerE(M: number, e: number): number {
    // Newton-Raphson solve of: E - e*sin(E) = M
    let E = M
    for (let i = 0; i < 6; i++) {
        const f = E - e * Math.sin(E) - M
        const fp = 1 - e * Math.cos(E)
        E -= f / fp
    }
    return E
}
