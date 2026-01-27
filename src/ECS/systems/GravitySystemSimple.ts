import { System } from '../System.js'
import { World } from '../World.js'
import { Position, Velocity, Mass, Size, Temperature } from '../Components.js'
import { SpatialHash3D } from '../SpatialHash.js'
import { PhysicsConfig } from '../PhysicsConfig.js'

/**
 * Pre-allocated scratch space for 3D physics calculations (module-level singleton)
 */
let scratch: {
    posX: Float64Array
    posY: Float64Array
    posZ: Float64Array
    velX: Float64Array
    velY: Float64Array
    velZ: Float64Array
    mass: Float64Array
    size: Float64Array
    temp: Float64Array
    accX: Float64Array
    accY: Float64Array
    accZ: Float64Array
    mergedFlags: Uint8Array
    entityIds: number[]
    capacity: number
} | null = null

// Reusable SpatialHash instance (cleared each frame)
let spatialHash: SpatialHash3D | null = null
let lastCellSize = 0

function ensureScratch(count: number) {
    if (!scratch || scratch.capacity < count) {
        const capacity = Math.max(count, (scratch?.capacity || 0) * 2, 512)
        scratch = {
            posX: new Float64Array(capacity),
            posY: new Float64Array(capacity),
            posZ: new Float64Array(capacity),
            velX: new Float64Array(capacity),
            velY: new Float64Array(capacity),
            velZ: new Float64Array(capacity),
            mass: new Float64Array(capacity),
            size: new Float64Array(capacity),
            temp: new Float64Array(capacity),
            accX: new Float64Array(capacity),
            accY: new Float64Array(capacity),
            accZ: new Float64Array(capacity),
            mergedFlags: new Uint8Array(capacity),
            entityIds: new Array(capacity),
            capacity
        }
    }
    // Clear acceleration arrays
    scratch.accX.fill(0, 0, count)
    scratch.accY.fill(0, 0, count)
    scratch.accZ.fill(0, 0, count)
    scratch.mergedFlags.fill(0, 0, count)
    return scratch
}

/**
 * Simple 3D N-body gravitational simulation using TypedArrays
 *
 * Optimizations:
 * - Direct Float64Array access (no Map lookups)
 * - Pre-allocated scratch arrays (no GC pressure)
 * - Newton's 3rd law symmetry (compute each pair once)
 * - Inline vector math (no temporary Vec3 objects)
 */
export const GravitySystemSimple: System = {
    name: 'GravitySimple',
    phase: 'simulate',

    update(world: World, dt: number): void {
        const entities = world.query(Position, Velocity, Mass, Size, Temperature)
        const n = entities.length
        if (n === 0) return

        const { G, heatCapacity, stefanBoltzmann, minTemperature, impactHeatMultiplier, maxImpactTemperature } = PhysicsConfig

        // Ensure scratch space
        const s = ensureScratch(n)
        const { posX, posY, posZ, velX, velY, velZ, mass, size, temp, accX, accY, accZ, entityIds, mergedFlags } = s

        // Copy data to contiguous arrays (cache-friendly access pattern)
        for (let i = 0; i < n; i++) {
            const id = entities[i]
            entityIds[i] = id
            const pos = world.getComponent(id, Position)!
            const vel = world.getComponent(id, Velocity)!
            posX[i] = pos.x
            posY[i] = pos.y
            posZ[i] = pos.z
            velX[i] = vel.x
            velY[i] = vel.y
            velZ[i] = vel.z
            mass[i] = world.getComponent(id, Mass)!
            size[i] = world.getComponent(id, Size)!
            temp[i] = world.getComponent(id, Temperature)!
        }

        // ========== Collision Detection with 3D Spatial Hash ==========
        const collisionStart = performance.now()
        let maxSize = 0
        for (let i = 0; i < n; i++) {
            if (size[i] > maxSize) maxSize = size[i]
        }

        const cellSize = maxSize * 4
        if (!spatialHash || Math.abs(cellSize - lastCellSize) > lastCellSize * 0.5) {
            spatialHash = new SpatialHash3D(cellSize)
            lastCellSize = cellSize
        } else {
            spatialHash.clear()
        }
        for (let i = 0; i < n; i++) {
            spatialHash.insert(i, posX[i], posY[i], posZ[i], size[i])
        }

        const pairs = spatialHash.getPotentialPairs()

        for (const [iA, iB] of pairs) {
            if (mergedFlags[iA] || mergedFlags[iB]) continue

            const dx = posX[iB] - posX[iA]
            const dy = posY[iB] - posY[iA]
            const dz = posZ[iB] - posZ[iA]
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

            if (dist < size[iA] + size[iB]) {
                // Collision! Merge smaller into larger
                const [winner, loser] = mass[iA] >= mass[iB] ? [iA, iB] : [iB, iA]
                const mW = mass[winner]
                const mL = mass[loser]
                const combinedMass = mW + mL

                // Conservation of momentum
                const newVx = (velX[winner] * mW + velX[loser] * mL) / combinedMass
                const newVy = (velY[winner] * mW + velY[loser] * mL) / combinedMass
                const newVz = (velZ[winner] * mW + velZ[loser] * mL) / combinedMass

                // Center of mass
                const newPx = (posX[winner] * mW + posX[loser] * mL) / combinedMass
                const newPy = (posY[winner] * mW + posY[loser] * mL) / combinedMass
                const newPz = (posZ[winner] * mW + posZ[loser] * mL) / combinedMass

                // Impact heating (capped)
                const initKE = 0.5 * mW * (velX[winner] ** 2 + velY[winner] ** 2 + velZ[winner] ** 2)
                            + 0.5 * mL * (velX[loser] ** 2 + velY[loser] ** 2 + velZ[loser] ** 2)
                const finalKE = 0.5 * combinedMass * (newVx ** 2 + newVy ** 2 + newVz ** 2)
                const energyLoss = initKE - finalKE
                const combinedTemp = (temp[winner] * mW + temp[loser] * mL) / combinedMass
                const impactHeat = (energyLoss * impactHeatMultiplier) / (combinedMass * heatCapacity)

                // Update winner
                posX[winner] = newPx
                posY[winner] = newPy
                posZ[winner] = newPz
                velX[winner] = newVx
                velY[winner] = newVy
                velZ[winner] = newVz
                mass[winner] = combinedMass
                size[winner] = PhysicsConfig.bodySize(combinedMass)
                temp[winner] = Math.min(combinedTemp + impactHeat, maxImpactTemperature)

                mergedFlags[loser] = 1
            }
        }
        world.onCollisionTime?.(performance.now() - collisionStart)

        // Remove merged entities
        for (let i = 0; i < n; i++) {
            if (mergedFlags[i]) {
                world.removeEntity(entityIds[i])
            }
        }

        // ========== Gravity Calculation (O(n²) direct) ==========
        const gravityStart = performance.now()
        // Using Newton's 3rd law: compute force once per pair
        for (let i = 0; i < n; i++) {
            if (mergedFlags[i]) continue

            const pxi = posX[i]
            const pyi = posY[i]
            const pzi = posZ[i]
            const mi = mass[i]

            for (let j = i + 1; j < n; j++) {
                if (mergedFlags[j]) continue

                const dx = posX[j] - pxi
                const dy = posY[j] - pyi
                const dz = posZ[j] - pzi
                const distSq = dx * dx + dy * dy + dz * dz
                const dist = Math.sqrt(distSq)

                if (dist > 0) {
                    const force = G / distSq
                    const fx = (dx / dist) * force
                    const fy = (dy / dist) * force
                    const fz = (dz / dist) * force

                    // Newton's 3rd law: equal and opposite forces
                    accX[i] += fx * mass[j]
                    accY[i] += fy * mass[j]
                    accZ[i] += fz * mass[j]
                    accX[j] -= fx * mi
                    accY[j] -= fy * mi
                    accZ[j] -= fz * mi
                }
            }
        }

        // ========== Velocity Verlet Integration ==========
        const halfDt = dt / 2

        // First half velocity update + position update
        for (let i = 0; i < n; i++) {
            if (mergedFlags[i]) continue

            velX[i] += accX[i] * halfDt
            velY[i] += accY[i] * halfDt
            velZ[i] += accZ[i] * halfDt
            posX[i] += velX[i] * dt
            posY[i] += velY[i] * dt
            posZ[i] += velZ[i] * dt
        }

        // Recalculate accelerations at new positions
        accX.fill(0, 0, n)
        accY.fill(0, 0, n)
        accZ.fill(0, 0, n)

        for (let i = 0; i < n; i++) {
            if (mergedFlags[i]) continue

            const pxi = posX[i]
            const pyi = posY[i]
            const pzi = posZ[i]
            const mi = mass[i]

            for (let j = i + 1; j < n; j++) {
                if (mergedFlags[j]) continue

                const dx = posX[j] - pxi
                const dy = posY[j] - pyi
                const dz = posZ[j] - pzi
                const distSq = dx * dx + dy * dy + dz * dz
                const dist = Math.sqrt(distSq)

                if (dist > 0) {
                    const force = G / distSq
                    const fx = (dx / dist) * force
                    const fy = (dy / dist) * force
                    const fz = (dz / dist) * force

                    accX[i] += fx * mass[j]
                    accY[i] += fy * mass[j]
                    accZ[i] += fz * mass[j]
                    accX[j] -= fx * mi
                    accY[j] -= fy * mi
                    accZ[j] -= fz * mi
                }
            }
        }
        world.onGravityTime?.(performance.now() - gravityStart)

        // Second half velocity update + thermal simulation
        for (let i = 0; i < n; i++) {
            if (mergedFlags[i]) continue

            velX[i] += accX[i] * halfDt
            velY[i] += accY[i] * halfDt
            velZ[i] += accZ[i] * halfDt

            // Black-body radiation cooling
            const surfaceArea = 4 * Math.PI * size[i] ** 2
            const radPower = surfaceArea * stefanBoltzmann * temp[i] ** 4
            const cooling = (radPower * dt) / (mass[i] * heatCapacity)
            temp[i] = Math.max(temp[i] - cooling, minTemperature)
        }

        // ========== Write back to World ==========
        for (let i = 0; i < n; i++) {
            if (mergedFlags[i]) continue

            const id = entityIds[i]
            const pos = world.getComponent(id, Position)!
            const vel = world.getComponent(id, Velocity)!

            pos.x = posX[i]
            pos.y = posY[i]
            pos.z = posZ[i]
            vel.x = velX[i]
            vel.y = velY[i]
            vel.z = velZ[i]
            world.setComponent(id, Mass, mass[i])
            world.setComponent(id, Size, size[i])
            world.setComponent(id, Temperature, temp[i])
        }
    }
}
