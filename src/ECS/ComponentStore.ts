/**
 * High-performance component storage using TypedArrays (SOA layout)
 *
 * Benefits:
 * - Cache-friendly contiguous memory layout
 * - No GC pressure from object allocations
 * - Direct array indexing (no Map lookups in hot loops)
 * - SIMD-friendly for future optimizations
 */

export type EntityId = number

/**
 * Numeric component store using Float64Array
 * Stores scalar values (mass, size, temperature)
 */
export class ScalarStore {
    private data: Float64Array
    private capacity: number

    constructor(capacity: number) {
        this.capacity = capacity
        this.data = new Float64Array(capacity)
    }

    get(index: number): number {
        return this.data[index]
    }

    set(index: number, value: number): void {
        this.data[index] = value
    }

    getArray(): Float64Array {
        return this.data
    }

    grow(newCapacity: number): void {
        if (newCapacity <= this.capacity) return
        const newData = new Float64Array(newCapacity)
        newData.set(this.data)
        this.data = newData
        this.capacity = newCapacity
    }
}

/**
 * Vector2 component store using parallel Float64Arrays (SOA)
 * Stores x and y components separately for cache efficiency
 */
export class Vec2Store {
    private _x: Float64Array
    private _y: Float64Array
    private capacity: number

    constructor(capacity: number) {
        this.capacity = capacity
        this._x = new Float64Array(capacity)
        this._y = new Float64Array(capacity)
    }

    getX(index: number): number {
        return this._x[index]
    }

    getY(index: number): number {
        return this._y[index]
    }

    get(index: number): [number, number] {
        return [this._x[index], this._y[index]]
    }

    setX(index: number, value: number): void {
        this._x[index] = value
    }

    setY(index: number, value: number): void {
        this._y[index] = value
    }

    set(index: number, x: number, y: number): void {
        this._x[index] = x
        this._y[index] = y
    }

    addTo(index: number, dx: number, dy: number): void {
        this._x[index] += dx
        this._y[index] += dy
    }

    get x(): Float64Array {
        return this._x
    }

    get y(): Float64Array {
        return this._y
    }

    grow(newCapacity: number): void {
        if (newCapacity <= this.capacity) return
        const newX = new Float64Array(newCapacity)
        const newY = new Float64Array(newCapacity)
        newX.set(this._x)
        newY.set(this._y)
        this._x = newX
        this._y = newY
        this.capacity = newCapacity
    }
}

/**
 * Entity index manager with free list for recycling IDs
 * Maps entity IDs to dense array indices
 */
export class EntityManager {
    // Entity ID -> dense index
    private entityToIndex: Map<EntityId, number> = new Map()
    // Dense index -> entity ID
    private indexToEntity: Uint32Array
    // Alive status per index
    private alive: Uint8Array
    // Number of active entities
    private _count = 0
    private _nextId = 0
    private capacity: number

    constructor(capacity: number) {
        this.capacity = capacity
        this.indexToEntity = new Uint32Array(capacity)
        this.alive = new Uint8Array(capacity)
    }

    /**
     * Create a new entity, returns [entityId, denseIndex]
     */
    create(): [EntityId, number] {
        const id = this._nextId++
        const index = this._count++

        if (index >= this.capacity) {
            this.grow(this.capacity * 2)
        }

        this.entityToIndex.set(id, index)
        this.indexToEntity[index] = id
        this.alive[index] = 1

        return [id, index]
    }

    /**
     * Remove an entity by swapping with last element (maintains density)
     */
    remove(id: EntityId): number | undefined {
        const index = this.entityToIndex.get(id)
        if (index === undefined) return undefined

        const lastIndex = this._count - 1

        if (index !== lastIndex) {
            // Swap with last element
            const lastId = this.indexToEntity[lastIndex]
            this.indexToEntity[index] = lastId
            this.entityToIndex.set(lastId, index)
        }

        this.entityToIndex.delete(id)
        this.alive[lastIndex] = 0
        this._count--

        return index
    }

    getIndex(id: EntityId): number | undefined {
        return this.entityToIndex.get(id)
    }

    getId(index: number): EntityId {
        return this.indexToEntity[index]
    }

    has(id: EntityId): boolean {
        return this.entityToIndex.has(id)
    }

    get count(): number {
        return this._count
    }

    private grow(newCapacity: number): void {
        const newIndexToEntity = new Uint32Array(newCapacity)
        const newAlive = new Uint8Array(newCapacity)
        newIndexToEntity.set(this.indexToEntity)
        newAlive.set(this.alive)
        this.indexToEntity = newIndexToEntity
        this.alive = newAlive
        this.capacity = newCapacity
    }
}

/**
 * Pre-allocated scratch arrays for physics calculations
 * Avoids allocations in hot loops
 */
export class PhysicsScratch {
    accX: Float64Array
    accY: Float64Array
    capacity: number

    constructor(capacity: number) {
        this.capacity = capacity
        this.accX = new Float64Array(capacity)
        this.accY = new Float64Array(capacity)
    }

    clear(count: number): void {
        // Faster than creating new arrays
        this.accX.fill(0, 0, count)
        this.accY.fill(0, 0, count)
    }

    grow(newCapacity: number): void {
        if (newCapacity <= this.capacity) return
        this.accX = new Float64Array(newCapacity)
        this.accY = new Float64Array(newCapacity)
        this.capacity = newCapacity
    }
}
