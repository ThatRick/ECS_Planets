/**
 * Barnes-Hut Gravity System - O(n log n) complexity (3D)
 *
 * Uses an Octree to approximate the gravitational effect of distant
 * body groups as single bodies at their center of mass.
 *
 * For N bodies:
 * - Direct summation: O(n²) - 10,000 bodies = 100M calculations
 * - Barnes-Hut: O(n log n) - 10,000 bodies = ~130K calculations
 *
 * The theta parameter controls accuracy/speed tradeoff:
 * - theta = 0.5: Good balance (default)
 * - theta = 0.3: More accurate, slower
 * - theta = 1.0: Faster, less accurate
 */
import { Position, Velocity, Mass, Size, Temperature } from '../Components.js';
import { PhysicsConfig } from '../PhysicsConfig.js';
import { SpatialHash3D } from '../SpatialHash.js';
import { Octree } from '../QuadTree.js';
// Softening length to prevent singularity at close distances
const SOFTENING = 100;
// Pre-allocated arrays for SOA layout (3D)
let scratch = null;
// Reusable Octree instance
const octree = new Octree();
// Reusable bodies array for Octree
let bodies = [];
function ensureScratch(count) {
    if (!scratch || scratch.capacity < count) {
        const capacity = Math.max(count, 512);
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
            entities: new Array(capacity),
            capacity
        };
        bodies = new Array(capacity);
        for (let i = 0; i < capacity; i++) {
            bodies[i] = { x: 0, y: 0, z: 0, mass: 0, index: i };
        }
    }
    // Clear acceleration arrays
    scratch.accX.fill(0, 0, count);
    scratch.accY.fill(0, 0, count);
    scratch.accZ.fill(0, 0, count);
}
export const GravitySystemBarnesHut = {
    name: 'GravityBarnesHut',
    phase: 'simulate',
    update(world, dt) {
        const entityIds = world.query(Position, Velocity, Mass, Size, Temperature);
        const count = entityIds.length;
        if (count < 2)
            return;
        ensureScratch(count);
        const s = scratch;
        const { G, heatCapacity, stefanBoltzmann, minTemperature, impactHeatMultiplier, maxImpactTemperature } = PhysicsConfig;
        // Copy data to contiguous arrays (SOA layout)
        for (let i = 0; i < count; i++) {
            const id = entityIds[i];
            const pos = world.getComponent(id, Position);
            const vel = world.getComponent(id, Velocity);
            const mass = world.getComponent(id, Mass);
            const size = world.getComponent(id, Size);
            const temp = world.getComponent(id, Temperature);
            s.posX[i] = pos.x;
            s.posY[i] = pos.y;
            s.posZ[i] = pos.z;
            s.velX[i] = vel.x;
            s.velY[i] = vel.y;
            s.velZ[i] = vel.z;
            s.mass[i] = mass;
            s.size[i] = size;
            s.temp[i] = temp;
            s.entities[i] = id;
            // Update body for Octree
            bodies[i].x = pos.x;
            bodies[i].y = pos.y;
            bodies[i].z = pos.z;
            bodies[i].mass = mass;
            bodies[i].index = i;
        }
        // ========== Collision Detection with 3D Spatial Hash ==========
        let maxSize = 0;
        for (let i = 0; i < count; i++) {
            if (s.size[i] > maxSize)
                maxSize = s.size[i];
        }
        const spatialHash = new SpatialHash3D(maxSize * 4);
        for (let i = 0; i < count; i++) {
            spatialHash.insert(i, s.posX[i], s.posY[i], s.posZ[i], s.size[i]);
        }
        const mergedIndices = new Set();
        const pairs = spatialHash.getPotentialPairs();
        for (const [iA, iB] of pairs) {
            if (mergedIndices.has(iA) || mergedIndices.has(iB))
                continue;
            const dx = s.posX[iB] - s.posX[iA];
            const dy = s.posY[iB] - s.posY[iA];
            const dz = s.posZ[iB] - s.posZ[iA];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < s.size[iA] + s.size[iB]) {
                // Collision! Merge smaller into larger
                const [winner, loser] = s.mass[iA] >= s.mass[iB] ? [iA, iB] : [iB, iA];
                const mW = s.mass[winner];
                const mL = s.mass[loser];
                const combinedMass = mW + mL;
                // Conservation of momentum
                const newVx = (s.velX[winner] * mW + s.velX[loser] * mL) / combinedMass;
                const newVy = (s.velY[winner] * mW + s.velY[loser] * mL) / combinedMass;
                const newVz = (s.velZ[winner] * mW + s.velZ[loser] * mL) / combinedMass;
                // Center of mass
                const newPx = (s.posX[winner] * mW + s.posX[loser] * mL) / combinedMass;
                const newPy = (s.posY[winner] * mW + s.posY[loser] * mL) / combinedMass;
                const newPz = (s.posZ[winner] * mW + s.posZ[loser] * mL) / combinedMass;
                // Impact heating (capped)
                const initKE = 0.5 * mW * (s.velX[winner] ** 2 + s.velY[winner] ** 2 + s.velZ[winner] ** 2)
                    + 0.5 * mL * (s.velX[loser] ** 2 + s.velY[loser] ** 2 + s.velZ[loser] ** 2);
                const finalKE = 0.5 * combinedMass * (newVx ** 2 + newVy ** 2 + newVz ** 2);
                const energyLoss = initKE - finalKE;
                const combinedTemp = (s.temp[winner] * mW + s.temp[loser] * mL) / combinedMass;
                const impactHeat = (energyLoss * impactHeatMultiplier) / (combinedMass * heatCapacity);
                // Update winner
                s.posX[winner] = newPx;
                s.posY[winner] = newPy;
                s.posZ[winner] = newPz;
                s.velX[winner] = newVx;
                s.velY[winner] = newVy;
                s.velZ[winner] = newVz;
                s.mass[winner] = combinedMass;
                s.size[winner] = PhysicsConfig.bodySize(combinedMass);
                s.temp[winner] = Math.min(combinedTemp + impactHeat, maxImpactTemperature);
                // Update body for Octree
                bodies[winner].x = newPx;
                bodies[winner].y = newPy;
                bodies[winner].z = newPz;
                bodies[winner].mass = combinedMass;
                mergedIndices.add(loser);
            }
        }
        // Remove merged entities
        for (const idx of mergedIndices) {
            world.removeEntity(s.entities[idx]);
        }
        // ========== Barnes-Hut Gravity Calculation O(n log n) ==========
        // Build Octree (exclude merged bodies)
        const activeBodies = [];
        for (let i = 0; i < count; i++) {
            if (!mergedIndices.has(i)) {
                activeBodies.push(bodies[i]);
            }
        }
        octree.theta = 0.5; // Balance of accuracy and speed
        octree.build(activeBodies);
        // Calculate accelerations using Barnes-Hut
        for (let i = 0; i < count; i++) {
            if (mergedIndices.has(i))
                continue;
            const force = octree.calculateForce(bodies[i], G, SOFTENING);
            s.accX[i] = force.fx;
            s.accY[i] = force.fy;
            s.accZ[i] = force.fz;
        }
        // ========== Velocity Verlet Integration ==========
        const halfDt = dt / 2;
        // First half velocity update + position update
        for (let i = 0; i < count; i++) {
            if (mergedIndices.has(i))
                continue;
            s.velX[i] += s.accX[i] * halfDt;
            s.velY[i] += s.accY[i] * halfDt;
            s.velZ[i] += s.accZ[i] * halfDt;
            s.posX[i] += s.velX[i] * dt;
            s.posY[i] += s.velY[i] * dt;
            s.posZ[i] += s.velZ[i] * dt;
        }
        // For Barnes-Hut, we skip the second force calculation
        // This is a slight approximation but saves significant computation
        // (Full Verlet would rebuild the tree and recalculate forces)
        // Second half velocity update + thermal simulation
        for (let i = 0; i < count; i++) {
            if (mergedIndices.has(i))
                continue;
            s.velX[i] += s.accX[i] * halfDt;
            s.velY[i] += s.accY[i] * halfDt;
            s.velZ[i] += s.accZ[i] * halfDt;
            // Black-body radiation cooling
            const surfaceArea = 4 * Math.PI * s.size[i] ** 2;
            const radPower = surfaceArea * stefanBoltzmann * s.temp[i] ** 4;
            const cooling = (radPower * dt) / (s.mass[i] * heatCapacity);
            s.temp[i] = Math.max(s.temp[i] - cooling, minTemperature);
        }
        // ========== Write back to World ==========
        for (let i = 0; i < count; i++) {
            if (mergedIndices.has(i))
                continue;
            const id = s.entities[i];
            const pos = world.getComponent(id, Position);
            const vel = world.getComponent(id, Velocity);
            pos.x = s.posX[i];
            pos.y = s.posY[i];
            pos.z = s.posZ[i];
            vel.x = s.velX[i];
            vel.y = s.velY[i];
            vel.z = s.velZ[i];
            world.setComponent(id, Mass, s.mass[i]);
            world.setComponent(id, Size, s.size[i]);
            world.setComponent(id, Temperature, s.temp[i]);
        }
    }
};
