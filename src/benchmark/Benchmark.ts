/**
 * ECS Performance Benchmark Framework
 *
 * Tests different data structures and patterns for:
 * - Entity creation/destruction throughput
 * - Component access patterns (read/write)
 * - Query performance
 * - N-body gravity calculation (the hot path)
 */

export interface BenchmarkResult {
    name: string
    entityCount: number
    iterations: number
    totalMs: number
    avgMs: number
    opsPerSecond: number
}

export interface BenchmarkSuite {
    name: string
    results: BenchmarkResult[]
}

/**
 * Run a benchmark function multiple times and collect stats
 */
export function benchmark(
    name: string,
    fn: () => void,
    iterations: number,
    entityCount: number
): BenchmarkResult {
    // Warmup
    for (let i = 0; i < 3; i++) fn()

    // Actual benchmark
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
        fn()
    }
    const totalMs = performance.now() - start

    return {
        name,
        entityCount,
        iterations,
        totalMs,
        avgMs: totalMs / iterations,
        opsPerSecond: (iterations / totalMs) * 1000
    }
}

/**
 * Format benchmark results as a table
 */
export function formatResults(results: BenchmarkResult[]): string {
    const lines = [
        '┌─────────────────────────────────┬──────────┬───────────┬────────────┬─────────────┐',
        '│ Benchmark                       │ Entities │ Avg (ms)  │ Ops/sec    │ Total (ms)  │',
        '├─────────────────────────────────┼──────────┼───────────┼────────────┼─────────────┤'
    ]

    for (const r of results) {
        const name = r.name.padEnd(31)
        const entities = r.entityCount.toString().padStart(8)
        const avg = r.avgMs.toFixed(3).padStart(9)
        const ops = r.opsPerSecond.toFixed(0).padStart(10)
        const total = r.totalMs.toFixed(1).padStart(11)
        lines.push(`│ ${name} │ ${entities} │ ${avg} │ ${ops} │ ${total} │`)
    }

    lines.push('└─────────────────────────────────┴──────────┴───────────┴────────────┴─────────────┘')
    return lines.join('\n')
}

// ============================================================
// Data Structure Implementations for Comparison
// ============================================================

/**
 * Current approach: Map<EntityId, Object>
 */
export class MapStorage {
    private posX = new Map<number, number>()
    private posY = new Map<number, number>()
    private velX = new Map<number, number>()
    private velY = new Map<number, number>()
    private mass = new Map<number, number>()

    add(id: number, px: number, py: number, vx: number, vy: number, m: number) {
        this.posX.set(id, px)
        this.posY.set(id, py)
        this.velX.set(id, vx)
        this.velY.set(id, vy)
        this.mass.set(id, m)
    }

    getPos(id: number): [number, number] {
        return [this.posX.get(id)!, this.posY.get(id)!]
    }

    setPos(id: number, x: number, y: number) {
        this.posX.set(id, x)
        this.posY.set(id, y)
    }

    getVel(id: number): [number, number] {
        return [this.velX.get(id)!, this.velY.get(id)!]
    }

    setVel(id: number, x: number, y: number) {
        this.velX.set(id, x)
        this.velY.set(id, y)
    }

    getMass(id: number): number {
        return this.mass.get(id)!
    }

    ids(): number[] {
        return Array.from(this.posX.keys())
    }
}

/**
 * SOA (Structure of Arrays) with TypedArrays
 * All data for a component type stored contiguously
 */
export class TypedArrayStorage {
    private capacity: number
    private count = 0

    // Entity ID to index mapping
    private idToIndex = new Map<number, number>()
    private indexToId: Uint32Array

    // Component data (SOA layout)
    posX: Float64Array
    posY: Float64Array
    velX: Float64Array
    velY: Float64Array
    mass: Float64Array

    constructor(capacity: number) {
        this.capacity = capacity
        this.indexToId = new Uint32Array(capacity)
        this.posX = new Float64Array(capacity)
        this.posY = new Float64Array(capacity)
        this.velX = new Float64Array(capacity)
        this.velY = new Float64Array(capacity)
        this.mass = new Float64Array(capacity)
    }

    add(id: number, px: number, py: number, vx: number, vy: number, m: number) {
        const idx = this.count++
        this.idToIndex.set(id, idx)
        this.indexToId[idx] = id
        this.posX[idx] = px
        this.posY[idx] = py
        this.velX[idx] = vx
        this.velY[idx] = vy
        this.mass[idx] = m
    }

    getIndex(id: number): number {
        return this.idToIndex.get(id)!
    }

    getPos(id: number): [number, number] {
        const idx = this.idToIndex.get(id)!
        return [this.posX[idx], this.posY[idx]]
    }

    setPos(id: number, x: number, y: number) {
        const idx = this.idToIndex.get(id)!
        this.posX[idx] = x
        this.posY[idx] = y
    }

    getVel(id: number): [number, number] {
        const idx = this.idToIndex.get(id)!
        return [this.velX[idx], this.velY[idx]]
    }

    setVel(id: number, x: number, y: number) {
        const idx = this.idToIndex.get(id)!
        this.velX[idx] = x
        this.velY[idx] = y
    }

    getMass(id: number): number {
        const idx = this.idToIndex.get(id)!
        return this.mass[idx]
    }

    get length(): number {
        return this.count
    }
}

/**
 * Dense array storage with index = entity ID
 * Fastest access but wastes memory with sparse IDs
 */
export class DenseArrayStorage {
    posX: Float64Array
    posY: Float64Array
    velX: Float64Array
    velY: Float64Array
    mass: Float64Array
    alive: Uint8Array
    count = 0

    constructor(capacity: number) {
        this.posX = new Float64Array(capacity)
        this.posY = new Float64Array(capacity)
        this.velX = new Float64Array(capacity)
        this.velY = new Float64Array(capacity)
        this.mass = new Float64Array(capacity)
        this.alive = new Uint8Array(capacity)
    }

    add(id: number, px: number, py: number, vx: number, vy: number, m: number) {
        this.posX[id] = px
        this.posY[id] = py
        this.velX[id] = vx
        this.velY[id] = vy
        this.mass[id] = m
        this.alive[id] = 1
        this.count++
    }

    getPos(id: number): [number, number] {
        return [this.posX[id], this.posY[id]]
    }

    setPos(id: number, x: number, y: number) {
        this.posX[id] = x
        this.posY[id] = y
    }

    getVel(id: number): [number, number] {
        return [this.velX[id], this.velY[id]]
    }

    setVel(id: number, x: number, y: number) {
        this.velX[id] = x
        this.velY[id] = y
    }

    getMass(id: number): number {
        return this.mass[id]
    }
}

// ============================================================
// Gravity Calculation Implementations
// ============================================================

const G = 6.674e-11

/**
 * Current approach: Using Maps and Vec2 objects
 */
export function gravityWithMaps(storage: MapStorage): void {
    const ids = storage.ids()
    const n = ids.length

    // Calculate accelerations
    const accX = new Map<number, number>()
    const accY = new Map<number, number>()

    for (const id of ids) {
        accX.set(id, 0)
        accY.set(id, 0)
    }

    for (let i = 0; i < n; i++) {
        const idA = ids[i]
        const [pxA, pyA] = storage.getPos(idA)

        for (let j = i + 1; j < n; j++) {
            const idB = ids[j]
            const [pxB, pyB] = storage.getPos(idB)
            const massB = storage.getMass(idB)
            const massA = storage.getMass(idA)

            const dx = pxB - pxA
            const dy = pyB - pyA
            const distSq = dx * dx + dy * dy
            const dist = Math.sqrt(distSq)

            if (dist > 0) {
                const force = G / distSq
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force

                accX.set(idA, accX.get(idA)! + fx * massB)
                accY.set(idA, accY.get(idA)! + fy * massB)
                accX.set(idB, accX.get(idB)! - fx * massA)
                accY.set(idB, accY.get(idB)! - fy * massA)
            }
        }
    }

    // Apply velocities
    const dt = 0.01
    for (const id of ids) {
        const [vx, vy] = storage.getVel(id)
        const [px, py] = storage.getPos(id)
        const newVx = vx + accX.get(id)! * dt
        const newVy = vy + accY.get(id)! * dt
        storage.setVel(id, newVx, newVy)
        storage.setPos(id, px + newVx * dt, py + newVy * dt)
    }
}

/**
 * TypedArray SOA approach: Direct array access
 */
export function gravityWithTypedArrays(storage: TypedArrayStorage): void {
    const n = storage.length
    const { posX, posY, velX, velY, mass } = storage
    const dt = 0.01

    // Pre-allocate acceleration arrays
    const accX = new Float64Array(n)
    const accY = new Float64Array(n)

    // Calculate accelerations using Newton's third law (compute once per pair)
    for (let i = 0; i < n; i++) {
        const pxA = posX[i]
        const pyA = posY[i]
        const massA = mass[i]

        for (let j = i + 1; j < n; j++) {
            const dx = posX[j] - pxA
            const dy = posY[j] - pyA
            const distSq = dx * dx + dy * dy
            const dist = Math.sqrt(distSq)

            if (dist > 0) {
                const force = G / distSq
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force

                accX[i] += fx * mass[j]
                accY[i] += fy * mass[j]
                accX[j] -= fx * massA
                accY[j] -= fy * massA
            }
        }
    }

    // Apply velocities and positions
    for (let i = 0; i < n; i++) {
        velX[i] += accX[i] * dt
        velY[i] += accY[i] * dt
        posX[i] += velX[i] * dt
        posY[i] += velY[i] * dt
    }
}

/**
 * Dense array approach: Direct index access (no Map lookup)
 */
export function gravityWithDenseArrays(storage: DenseArrayStorage, entityIds: number[]): void {
    const n = entityIds.length
    const { posX, posY, velX, velY, mass } = storage
    const dt = 0.01

    const accX = new Float64Array(n)
    const accY = new Float64Array(n)

    for (let i = 0; i < n; i++) {
        const idA = entityIds[i]
        const pxA = posX[idA]
        const pyA = posY[idA]
        const massA = mass[idA]

        for (let j = i + 1; j < n; j++) {
            const idB = entityIds[j]
            const dx = posX[idB] - pxA
            const dy = posY[idB] - pyA
            const distSq = dx * dx + dy * dy
            const dist = Math.sqrt(distSq)

            if (dist > 0) {
                const force = G / distSq
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force

                accX[i] += fx * mass[idB]
                accY[i] += fy * mass[idB]
                accX[j] -= fx * massA
                accY[j] -= fy * massA
            }
        }
    }

    for (let i = 0; i < n; i++) {
        const id = entityIds[i]
        velX[id] += accX[i] * dt
        velY[id] += accY[i] * dt
        posX[id] += velX[id] * dt
        posY[id] += velY[id] * dt
    }
}

// ============================================================
// Benchmark Runner
// ============================================================

export function runBenchmarkSuite(entityCounts: number[] = [100, 500, 1000, 2000]): BenchmarkSuite[] {
    const suites: BenchmarkSuite[] = []

    for (const count of entityCounts) {
        const results: BenchmarkResult[] = []

        // Setup storage instances
        const mapStorage = new MapStorage()
        const typedStorage = new TypedArrayStorage(count)
        const denseStorage = new DenseArrayStorage(count)
        const entityIds: number[] = []

        for (let i = 0; i < count; i++) {
            const px = Math.random() * 1000000
            const py = Math.random() * 1000000
            const vx = (Math.random() - 0.5) * 1000
            const vy = (Math.random() - 0.5) * 1000
            const m = 1e14 + Math.random() * 1e14

            mapStorage.add(i, px, py, vx, vy, m)
            typedStorage.add(i, px, py, vx, vy, m)
            denseStorage.add(i, px, py, vx, vy, m)
            entityIds.push(i)
        }

        // Determine iterations based on entity count (fewer for larger counts)
        const iters = Math.max(10, Math.floor(1000 / count))

        // Benchmark gravity calculations
        results.push(benchmark(
            'Gravity: Map Storage',
            () => gravityWithMaps(mapStorage),
            iters,
            count
        ))

        results.push(benchmark(
            'Gravity: TypedArray SOA',
            () => gravityWithTypedArrays(typedStorage),
            iters,
            count
        ))

        results.push(benchmark(
            'Gravity: Dense Array',
            () => gravityWithDenseArrays(denseStorage, entityIds),
            iters,
            count
        ))

        suites.push({ name: `${count} Entities`, results })
    }

    return suites
}
