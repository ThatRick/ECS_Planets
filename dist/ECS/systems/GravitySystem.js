import { Position, Velocity, Mass, Size, Temperature } from '../Components.js';
import { SpatialHash } from '../SpatialHash.js';
import { PhysicsConfig } from '../PhysicsConfig.js';
import Vec2 from '../../lib/Vector2.js';
/**
 * N-body gravitational simulation with:
 * - Velocity Verlet integration (energy-conserving)
 * - Spatial hash for O(n log n) collision detection
 * - Momentum-conserving body mergers
 * - Thermodynamic simulation (impact heating + radiative cooling)
 */
export const GravitySystem = {
    name: 'Gravity',
    phase: 'simulate',
    update(world, dt) {
        const entities = world.query(Position, Velocity, Mass, Size, Temperature);
        if (entities.length === 0)
            return;
        const { G, heatCapacity, stefanBoltzmann, minTemperature, impactHeatMultiplier, maxImpactTemperature } = PhysicsConfig;
        // Cache component lookups for performance
        const positions = new Map();
        const velocities = new Map();
        const masses = new Map();
        const sizes = new Map();
        const temperatures = new Map();
        for (const id of entities) {
            positions.set(id, world.getComponent(id, Position));
            velocities.set(id, world.getComponent(id, Velocity));
            masses.set(id, world.getComponent(id, Mass));
            sizes.set(id, world.getComponent(id, Size));
            temperatures.set(id, world.getComponent(id, Temperature));
        }
        // ========== Spatial Hash for Collision Detection ==========
        // Use the largest body size as cell size for efficient queries
        let maxSize = 0;
        for (const size of sizes.values()) {
            if (size > maxSize)
                maxSize = size;
        }
        const cellSize = maxSize * 4; // Cell size = 4x largest body
        const spatialHash = new SpatialHash(cellSize);
        for (const id of entities) {
            const pos = positions.get(id);
            const size = sizes.get(id);
            spatialHash.insert(id, pos, size);
        }
        // ========== Collision Detection & Merging ==========
        const mergedEntities = new Set();
        const pairs = spatialHash.getPotentialPairs();
        for (const [idA, idB] of pairs) {
            // Skip if either entity already merged
            if (mergedEntities.has(idA) || mergedEntities.has(idB))
                continue;
            const posA = positions.get(idA);
            const posB = positions.get(idB);
            const sizeA = sizes.get(idA);
            const sizeB = sizes.get(idB);
            const dist = Vec2.distance(posA, posB);
            // Check for actual collision
            if (dist < sizeA + sizeB) {
                const massA = masses.get(idA);
                const massB = masses.get(idB);
                const velA = velocities.get(idA);
                const velB = velocities.get(idB);
                const tempA = temperatures.get(idA);
                const tempB = temperatures.get(idB);
                // Determine winner (higher mass survives)
                const [winner, loser] = massA >= massB ? [idA, idB] : [idB, idA];
                const [winnerMass, loserMass] = massA >= massB ? [massA, massB] : [massB, massA];
                const [winnerPos, loserPos] = massA >= massB ? [posA, posB] : [posB, posA];
                const [winnerVel, loserVel] = massA >= massB ? [velA, velB] : [velB, velA];
                const [winnerTemp, loserTemp] = massA >= massB ? [tempA, tempB] : [tempB, tempA];
                const combinedMass = winnerMass + loserMass;
                // Conservation of momentum: p = m*v
                const combinedVel = Vec2.scale(Vec2.add(Vec2.scale(winnerVel, winnerMass), Vec2.scale(loserVel, loserMass)), 1 / combinedMass);
                // Center of mass position
                const combinedPos = Vec2.scale(Vec2.add(Vec2.scale(winnerPos, winnerMass), Vec2.scale(loserPos, loserMass)), 1 / combinedMass);
                // Calculate kinetic energy loss (converted to heat)
                const initKE = 0.5 * winnerMass * winnerVel.len() ** 2
                    + 0.5 * loserMass * loserVel.len() ** 2;
                const finalKE = 0.5 * combinedMass * combinedVel.len() ** 2;
                const energyLoss = initKE - finalKE;
                // Weighted average temperature + impact heating (capped)
                const combinedTemp = (winnerTemp * winnerMass + loserTemp * loserMass) / combinedMass;
                const impactHeat = (energyLoss * impactHeatMultiplier) / (combinedMass * heatCapacity);
                const finalTemp = Math.min(combinedTemp + impactHeat, maxImpactTemperature);
                // New size from combined mass
                const combinedSize = PhysicsConfig.bodySize(combinedMass);
                // Update winner
                winnerPos.set(combinedPos);
                winnerVel.set(combinedVel);
                masses.set(winner, combinedMass);
                sizes.set(winner, combinedSize);
                temperatures.set(winner, finalTemp);
                world.setComponent(winner, Mass, combinedMass);
                world.setComponent(winner, Size, combinedSize);
                world.setComponent(winner, Temperature, finalTemp);
                // Mark loser for removal
                mergedEntities.add(loser);
                const velDiff = Vec2.sub(winnerVel, loserVel).len();
                console.log(`Merge: M=${combinedMass.toExponential(1)}kg, ` +
                    `Δv=${velDiff.toFixed(0)}m/s, ` +
                    `E=${energyLoss.toExponential(1)}J, ` +
                    `T=${finalTemp.toFixed(1)}K, ` +
                    `remaining=${entities.length - mergedEntities.size}`);
            }
        }
        // Remove merged entities
        for (const id of mergedEntities) {
            world.removeEntity(id);
        }
        // Get remaining entities for gravity calculation
        const remaining = entities.filter(id => !mergedEntities.has(id));
        // ========== Velocity Verlet Integration ==========
        // More stable than Euler, better energy conservation
        // Step 1: Calculate initial accelerations
        const accelerations = new Map();
        for (const id of remaining) {
            const pos = positions.get(id);
            const acc = new Vec2(0, 0);
            for (const otherId of remaining) {
                if (id === otherId)
                    continue;
                const otherPos = positions.get(otherId);
                const otherMass = masses.get(otherId);
                const delta = Vec2.sub(otherPos, pos);
                const distSq = Vec2.dot(delta, delta);
                const dist = Math.sqrt(distSq);
                // Gravitational acceleration: a = G*M/r²
                // Direction: toward other body
                if (dist > 0) {
                    const aMag = G * otherMass / distSq;
                    acc.add(Vec2.scale(delta, aMag / dist));
                }
            }
            accelerations.set(id, acc);
        }
        // Step 2: Update velocities (half step) and positions (full step)
        for (const id of remaining) {
            const pos = positions.get(id);
            const vel = velocities.get(id);
            const acc = accelerations.get(id);
            // v(t + dt/2) = v(t) + a(t) * dt/2
            vel.add(Vec2.scale(acc, dt / 2));
            // x(t + dt) = x(t) + v(t + dt/2) * dt
            pos.add(Vec2.scale(vel, dt));
        }
        // Step 3: Recalculate accelerations at new positions
        for (const id of remaining) {
            const pos = positions.get(id);
            const acc = new Vec2(0, 0);
            for (const otherId of remaining) {
                if (id === otherId)
                    continue;
                const otherPos = positions.get(otherId);
                const otherMass = masses.get(otherId);
                const delta = Vec2.sub(otherPos, pos);
                const distSq = Vec2.dot(delta, delta);
                const dist = Math.sqrt(distSq);
                if (dist > 0) {
                    const aMag = G * otherMass / distSq;
                    acc.add(Vec2.scale(delta, aMag / dist));
                }
            }
            accelerations.set(id, acc);
        }
        // Step 4: Final velocity update and thermal simulation
        for (const id of remaining) {
            const vel = velocities.get(id);
            const acc = accelerations.get(id);
            const mass = masses.get(id);
            const size = sizes.get(id);
            let temp = temperatures.get(id);
            // v(t + dt) = v(t + dt/2) + a(t + dt) * dt/2
            vel.add(Vec2.scale(acc, dt / 2));
            // ========== Thermal Simulation ==========
            // Black-body radiation cooling: P = σ * A * T⁴
            const surfaceArea = 4 * Math.PI * size ** 2;
            const radPower = surfaceArea * stefanBoltzmann * temp ** 4;
            const cooling = (radPower * dt) / (mass * heatCapacity);
            temp = Math.max(temp - cooling, minTemperature);
            temperatures.set(id, temp);
            world.setComponent(id, Temperature, temp);
        }
    }
};
