import { Position, Velocity, Mass, Size, Temperature } from '../Components.js';
import { SpatialHash } from '../SpatialHash.js';
import { PhysicsConfig } from '../PhysicsConfig.js';
/**
 * Pre-allocated scratch space for physics calculations (module-level singleton)
 */
let scratch = null;
function ensureScratch(count) {
    if (!scratch || scratch.capacity < count) {
        const capacity = Math.max(count, (scratch?.capacity || 0) * 2, 512);
        scratch = {
            posX: new Float64Array(capacity),
            posY: new Float64Array(capacity),
            velX: new Float64Array(capacity),
            velY: new Float64Array(capacity),
            mass: new Float64Array(capacity),
            size: new Float64Array(capacity),
            temp: new Float64Array(capacity),
            accX: new Float64Array(capacity),
            accY: new Float64Array(capacity),
            entityIds: new Array(capacity),
            capacity
        };
    }
    // Clear acceleration arrays
    scratch.accX.fill(0, 0, count);
    scratch.accY.fill(0, 0, count);
    return scratch;
}
/**
 * Optimized N-body gravitational simulation using TypedArrays
 *
 * Optimizations:
 * - Direct Float64Array access (no Map lookups)
 * - Pre-allocated scratch arrays (no GC pressure)
 * - Newton's 3rd law symmetry (compute each pair once)
 * - Inline vector math (no temporary Vec2 objects)
 */
export const GravitySystemOptimized = {
    name: 'GravityOptimized',
    phase: 'simulate',
    update(world, dt) {
        const entities = world.query(Position, Velocity, Mass, Size, Temperature);
        const n = entities.length;
        if (n === 0)
            return;
        const { G, heatCapacity, stefanBoltzmann, minTemperature, impactHeatMultiplier } = PhysicsConfig;
        // Ensure scratch space
        const s = ensureScratch(n);
        const { posX, posY, velX, velY, mass, size, temp, accX, accY, entityIds } = s;
        // Copy data to contiguous arrays (cache-friendly access pattern)
        for (let i = 0; i < n; i++) {
            const id = entities[i];
            entityIds[i] = id;
            const pos = world.getComponent(id, Position);
            const vel = world.getComponent(id, Velocity);
            posX[i] = pos.x;
            posY[i] = pos.y;
            velX[i] = vel.x;
            velY[i] = vel.y;
            mass[i] = world.getComponent(id, Mass);
            size[i] = world.getComponent(id, Size);
            temp[i] = world.getComponent(id, Temperature);
        }
        // ========== Collision Detection with Spatial Hash ==========
        let maxSize = 0;
        for (let i = 0; i < n; i++) {
            if (size[i] > maxSize)
                maxSize = size[i];
        }
        const spatialHash = new SpatialHash(maxSize * 4);
        for (let i = 0; i < n; i++) {
            spatialHash.insert(i, { x: posX[i], y: posY[i] }, size[i]);
        }
        const mergedIndices = new Set();
        const pairs = spatialHash.getPotentialPairs();
        for (const [iA, iB] of pairs) {
            if (mergedIndices.has(iA) || mergedIndices.has(iB))
                continue;
            const dx = posX[iB] - posX[iA];
            const dy = posY[iB] - posY[iA];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < size[iA] + size[iB]) {
                // Collision! Merge smaller into larger
                const [winner, loser] = mass[iA] >= mass[iB] ? [iA, iB] : [iB, iA];
                const mW = mass[winner];
                const mL = mass[loser];
                const combinedMass = mW + mL;
                // Conservation of momentum
                const newVx = (velX[winner] * mW + velX[loser] * mL) / combinedMass;
                const newVy = (velY[winner] * mW + velY[loser] * mL) / combinedMass;
                // Center of mass
                const newPx = (posX[winner] * mW + posX[loser] * mL) / combinedMass;
                const newPy = (posY[winner] * mW + posY[loser] * mL) / combinedMass;
                // Impact heating
                const initKE = 0.5 * mW * (velX[winner] ** 2 + velY[winner] ** 2)
                    + 0.5 * mL * (velX[loser] ** 2 + velY[loser] ** 2);
                const finalKE = 0.5 * combinedMass * (newVx ** 2 + newVy ** 2);
                const energyLoss = initKE - finalKE;
                const combinedTemp = (temp[winner] * mW + temp[loser] * mL) / combinedMass;
                const impactHeat = (energyLoss * impactHeatMultiplier) / (combinedMass * heatCapacity);
                // Update winner
                posX[winner] = newPx;
                posY[winner] = newPy;
                velX[winner] = newVx;
                velY[winner] = newVy;
                mass[winner] = combinedMass;
                size[winner] = PhysicsConfig.bodySize(combinedMass);
                temp[winner] = combinedTemp + impactHeat;
                mergedIndices.add(loser);
            }
        }
        // Remove merged entities
        for (const idx of mergedIndices) {
            world.removeEntity(entityIds[idx]);
        }
        // ========== Gravity Calculation (O(n²) but optimized) ==========
        // Using Newton's 3rd law: compute force once per pair
        for (let i = 0; i < n; i++) {
            if (mergedIndices.has(i))
                continue;
            const pxi = posX[i];
            const pyi = posY[i];
            const mi = mass[i];
            for (let j = i + 1; j < n; j++) {
                if (mergedIndices.has(j))
                    continue;
                const dx = posX[j] - pxi;
                const dy = posY[j] - pyi;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);
                if (dist > 0) {
                    const force = G / distSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    // Newton's 3rd law: equal and opposite forces
                    accX[i] += fx * mass[j];
                    accY[i] += fy * mass[j];
                    accX[j] -= fx * mi;
                    accY[j] -= fy * mi;
                }
            }
        }
        // ========== Velocity Verlet Integration ==========
        const halfDt = dt / 2;
        // First half velocity update + position update
        for (let i = 0; i < n; i++) {
            if (mergedIndices.has(i))
                continue;
            velX[i] += accX[i] * halfDt;
            velY[i] += accY[i] * halfDt;
            posX[i] += velX[i] * dt;
            posY[i] += velY[i] * dt;
        }
        // Recalculate accelerations at new positions
        accX.fill(0, 0, n);
        accY.fill(0, 0, n);
        for (let i = 0; i < n; i++) {
            if (mergedIndices.has(i))
                continue;
            const pxi = posX[i];
            const pyi = posY[i];
            const mi = mass[i];
            for (let j = i + 1; j < n; j++) {
                if (mergedIndices.has(j))
                    continue;
                const dx = posX[j] - pxi;
                const dy = posY[j] - pyi;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);
                if (dist > 0) {
                    const force = G / distSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    accX[i] += fx * mass[j];
                    accY[i] += fy * mass[j];
                    accX[j] -= fx * mi;
                    accY[j] -= fy * mi;
                }
            }
        }
        // Second half velocity update + thermal simulation
        for (let i = 0; i < n; i++) {
            if (mergedIndices.has(i))
                continue;
            velX[i] += accX[i] * halfDt;
            velY[i] += accY[i] * halfDt;
            // Black-body radiation cooling
            const surfaceArea = 4 * Math.PI * size[i] ** 2;
            const radPower = surfaceArea * stefanBoltzmann * temp[i] ** 4;
            const cooling = (radPower * dt) / (mass[i] * heatCapacity);
            temp[i] = Math.max(temp[i] - cooling, minTemperature);
        }
        // ========== Write back to World ==========
        for (let i = 0; i < n; i++) {
            if (mergedIndices.has(i))
                continue;
            const id = entityIds[i];
            const pos = world.getComponent(id, Position);
            const vel = world.getComponent(id, Velocity);
            pos.x = posX[i];
            pos.y = posY[i];
            vel.x = velX[i];
            vel.y = velY[i];
            world.setComponent(id, Mass, mass[i]);
            world.setComponent(id, Size, size[i]);
            world.setComponent(id, Temperature, temp[i]);
        }
    }
};
