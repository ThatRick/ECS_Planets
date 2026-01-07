/**
 * Parallel Gravity System using Web Workers
 *
 * Distributes N-body gravity calculations across multiple Web Workers
 * to utilize multi-core CPUs.
 *
 * Note: Due to the inherently asynchronous nature of Web Workers,
 * this system uses a double-buffering approach: it computes forces
 * for the NEXT frame while the current frame uses previously computed forces.
 * This adds one frame of latency but allows true parallelism.
 *
 * Performance characteristics:
 * - Worker overhead makes this slower for <500 entities
 * - Best for 1000+ entities on 4+ core machines
 * - For 10,000+ entities, Barnes-Hut O(n log n) is likely faster
 *
 * Usage:
 *   const gravitySystem = createGravitySystemParallel(4) // 4 workers
 *   world.registerSystem(gravitySystem)
 */
import { Position, Velocity, Mass, Size, Temperature } from '../Components.js';
import { PhysicsConfig } from '../PhysicsConfig.js';
import { SpatialHash } from '../SpatialHash.js';
// Inline worker code as a blob URL
const WORKER_CODE = `
self.onmessage = (event) => {
    const { type, posX, posY, mass, startIdx, endIdx, count, G } = event.data;
    if (type !== 'compute') return;

    const rangeSize = endIdx - startIdx;
    const accX = new Float64Array(rangeSize);
    const accY = new Float64Array(rangeSize);

    for (let i = startIdx; i < endIdx; i++) {
        const localIdx = i - startIdx;
        const pxi = posX[i];
        const pyi = posY[i];
        let ax = 0, ay = 0;

        for (let j = 0; j < count; j++) {
            if (j === i) continue;
            const dx = posX[j] - pxi;
            const dy = posY[j] - pyi;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0) {
                const dist = Math.sqrt(distSq);
                const force = (G * mass[j]) / distSq;
                ax += (dx / dist) * force;
                ay += (dy / dist) * force;
            }
        }
        accX[localIdx] = ax;
        accY[localIdx] = ay;
    }

    self.postMessage({ type: 'result', accX, accY, startIdx, endIdx }, [accX.buffer, accY.buffer]);
};
self.postMessage({ type: 'ready' });
`;
// Pre-allocated scratch arrays
let scratch = null;
function ensureScratch(count) {
    if (!scratch || scratch.capacity < count) {
        const capacity = Math.max(count, 512);
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
    return scratch;
}
/**
 * Create a parallel gravity system.
 *
 * This system uses Web Workers to parallelize gravity calculations.
 * Falls back to single-threaded for small entity counts.
 *
 * @param workerCount Number of workers (default: CPU cores - 1)
 * @param minEntitiesForParallel Min entities before using workers (default: 500)
 */
export function createGravitySystemParallel(workerCount, minEntitiesForParallel = 500) {
    const numWorkers = workerCount ?? Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    // Create worker blob URL
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    // Initialize workers
    const workers = [];
    let workersReady = 0;
    // Double buffer for async results
    let pendingAccelerations = null;
    let lastEntityCount = 0;
    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(workerUrl);
        worker.onmessage = (e) => {
            if (e.data.type === 'ready') {
                workersReady++;
            }
        };
        workers.push(worker);
    }
    // Results accumulator for current computation
    let resultsReceived = 0;
    let expectedResults = 0;
    function startAsyncComputation(posX, posY, mass, n, G) {
        resultsReceived = 0;
        expectedResults = Math.min(workers.length, Math.ceil(n / 100));
        const newAccX = new Float64Array(n);
        const newAccY = new Float64Array(n);
        const chunkSize = Math.ceil(n / expectedResults);
        for (let w = 0; w < expectedResults; w++) {
            const startIdx = w * chunkSize;
            const endIdx = Math.min(startIdx + chunkSize, n);
            if (startIdx >= n)
                break;
            const worker = workers[w];
            // One-time handler for this computation
            const handler = (e) => {
                if (e.data.type === 'result') {
                    // Copy results into accumulator
                    const { accX: resultAccX, accY: resultAccY, startIdx: rStart } = e.data;
                    for (let i = 0; i < resultAccX.length; i++) {
                        newAccX[rStart + i] = resultAccX[i];
                        newAccY[rStart + i] = resultAccY[i];
                    }
                    resultsReceived++;
                    if (resultsReceived >= expectedResults) {
                        // All results received - store for next frame
                        pendingAccelerations = { accX: newAccX, accY: newAccY };
                    }
                    worker.removeEventListener('message', handler);
                }
            };
            worker.addEventListener('message', handler);
            worker.postMessage({
                type: 'compute',
                posX: posX.slice(0, n),
                posY: posY.slice(0, n),
                mass: mass.slice(0, n),
                startIdx,
                endIdx,
                count: n,
                G
            });
        }
    }
    return {
        name: 'GravityParallel',
        phase: 'simulate',
        update(world, dt) {
            const entities = world.query(Position, Velocity, Mass, Size, Temperature);
            const n = entities.length;
            if (n === 0)
                return;
            const { G, heatCapacity, stefanBoltzmann, minTemperature } = PhysicsConfig;
            const s = ensureScratch(n);
            const { posX, posY, velX, velY, mass, size, temp, accX, accY, entityIds } = s;
            // Copy data to contiguous arrays
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
            // ========== Collision Detection ==========
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
                    const [winner, loser] = mass[iA] >= mass[iB] ? [iA, iB] : [iB, iA];
                    const mW = mass[winner];
                    const mL = mass[loser];
                    const combinedMass = mW + mL;
                    const newVx = (velX[winner] * mW + velX[loser] * mL) / combinedMass;
                    const newVy = (velY[winner] * mW + velY[loser] * mL) / combinedMass;
                    const newPx = (posX[winner] * mW + posX[loser] * mL) / combinedMass;
                    const newPy = (posY[winner] * mW + posY[loser] * mL) / combinedMass;
                    const initKE = 0.5 * mW * (velX[winner] ** 2 + velY[winner] ** 2)
                        + 0.5 * mL * (velX[loser] ** 2 + velY[loser] ** 2);
                    const finalKE = 0.5 * combinedMass * (newVx ** 2 + newVy ** 2);
                    const energyLoss = initKE - finalKE;
                    const combinedTemp = (temp[winner] * mW + temp[loser] * mL) / combinedMass;
                    const impactHeat = energyLoss / (combinedMass * heatCapacity);
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
            for (const idx of mergedIndices) {
                world.removeEntity(entityIds[idx]);
            }
            // ========== Gravity Calculation ==========
            // Clear acceleration arrays
            accX.fill(0, 0, n);
            accY.fill(0, 0, n);
            const useWorkers = workersReady >= numWorkers && n >= minEntitiesForParallel;
            if (useWorkers) {
                // Use pending results from previous frame (if available and matching)
                if (pendingAccelerations && lastEntityCount === n) {
                    for (let i = 0; i < n; i++) {
                        if (!mergedIndices.has(i)) {
                            accX[i] = pendingAccelerations.accX[i];
                            accY[i] = pendingAccelerations.accY[i];
                        }
                    }
                }
                // Start async computation for next frame
                startAsyncComputation(posX, posY, mass, n, G);
                lastEntityCount = n;
            }
            else {
                // Single-threaded fallback (using Newton's 3rd law optimization)
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
            }
            // ========== Velocity Verlet Integration ==========
            const halfDt = dt / 2;
            for (let i = 0; i < n; i++) {
                if (mergedIndices.has(i))
                    continue;
                velX[i] += accX[i] * halfDt;
                velY[i] += accY[i] * halfDt;
                posX[i] += velX[i] * dt;
                posY[i] += velY[i] * dt;
            }
            for (let i = 0; i < n; i++) {
                if (mergedIndices.has(i))
                    continue;
                velX[i] += accX[i] * halfDt;
                velY[i] += accY[i] * halfDt;
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
        },
        destroy() {
            for (const worker of workers) {
                worker.terminate();
            }
            URL.revokeObjectURL(workerUrl);
            console.log('GravitySystemParallel: workers terminated');
        }
    };
}
