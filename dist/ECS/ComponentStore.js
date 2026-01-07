/**
 * High-performance component storage using TypedArrays (SOA layout)
 *
 * Benefits:
 * - Cache-friendly contiguous memory layout
 * - No GC pressure from object allocations
 * - Direct array indexing (no Map lookups in hot loops)
 * - SIMD-friendly for future optimizations
 */
/**
 * Numeric component store using Float64Array
 * Stores scalar values (mass, size, temperature)
 */
export class ScalarStore {
    data;
    capacity;
    constructor(capacity) {
        this.capacity = capacity;
        this.data = new Float64Array(capacity);
    }
    get(index) {
        return this.data[index];
    }
    set(index, value) {
        this.data[index] = value;
    }
    getArray() {
        return this.data;
    }
    grow(newCapacity) {
        if (newCapacity <= this.capacity)
            return;
        const newData = new Float64Array(newCapacity);
        newData.set(this.data);
        this.data = newData;
        this.capacity = newCapacity;
    }
}
/**
 * Vector2 component store using parallel Float64Arrays (SOA)
 * Stores x and y components separately for cache efficiency
 */
export class Vec2Store {
    _x;
    _y;
    capacity;
    constructor(capacity) {
        this.capacity = capacity;
        this._x = new Float64Array(capacity);
        this._y = new Float64Array(capacity);
    }
    getX(index) {
        return this._x[index];
    }
    getY(index) {
        return this._y[index];
    }
    get(index) {
        return [this._x[index], this._y[index]];
    }
    setX(index, value) {
        this._x[index] = value;
    }
    setY(index, value) {
        this._y[index] = value;
    }
    set(index, x, y) {
        this._x[index] = x;
        this._y[index] = y;
    }
    addTo(index, dx, dy) {
        this._x[index] += dx;
        this._y[index] += dy;
    }
    get x() {
        return this._x;
    }
    get y() {
        return this._y;
    }
    grow(newCapacity) {
        if (newCapacity <= this.capacity)
            return;
        const newX = new Float64Array(newCapacity);
        const newY = new Float64Array(newCapacity);
        newX.set(this._x);
        newY.set(this._y);
        this._x = newX;
        this._y = newY;
        this.capacity = newCapacity;
    }
}
/**
 * Entity index manager with free list for recycling IDs
 * Maps entity IDs to dense array indices
 */
export class EntityManager {
    // Entity ID -> dense index
    entityToIndex = new Map();
    // Dense index -> entity ID
    indexToEntity;
    // Alive status per index
    alive;
    // Number of active entities
    _count = 0;
    _nextId = 0;
    capacity;
    constructor(capacity) {
        this.capacity = capacity;
        this.indexToEntity = new Uint32Array(capacity);
        this.alive = new Uint8Array(capacity);
    }
    /**
     * Create a new entity, returns [entityId, denseIndex]
     */
    create() {
        const id = this._nextId++;
        const index = this._count++;
        if (index >= this.capacity) {
            this.grow(this.capacity * 2);
        }
        this.entityToIndex.set(id, index);
        this.indexToEntity[index] = id;
        this.alive[index] = 1;
        return [id, index];
    }
    /**
     * Remove an entity by swapping with last element (maintains density)
     */
    remove(id) {
        const index = this.entityToIndex.get(id);
        if (index === undefined)
            return undefined;
        const lastIndex = this._count - 1;
        if (index !== lastIndex) {
            // Swap with last element
            const lastId = this.indexToEntity[lastIndex];
            this.indexToEntity[index] = lastId;
            this.entityToIndex.set(lastId, index);
        }
        this.entityToIndex.delete(id);
        this.alive[lastIndex] = 0;
        this._count--;
        return index;
    }
    getIndex(id) {
        return this.entityToIndex.get(id);
    }
    getId(index) {
        return this.indexToEntity[index];
    }
    has(id) {
        return this.entityToIndex.has(id);
    }
    get count() {
        return this._count;
    }
    grow(newCapacity) {
        const newIndexToEntity = new Uint32Array(newCapacity);
        const newAlive = new Uint8Array(newCapacity);
        newIndexToEntity.set(this.indexToEntity);
        newAlive.set(this.alive);
        this.indexToEntity = newIndexToEntity;
        this.alive = newAlive;
        this.capacity = newCapacity;
    }
}
/**
 * Pre-allocated scratch arrays for physics calculations
 * Avoids allocations in hot loops
 */
export class PhysicsScratch {
    accX;
    accY;
    capacity;
    constructor(capacity) {
        this.capacity = capacity;
        this.accX = new Float64Array(capacity);
        this.accY = new Float64Array(capacity);
    }
    clear(count) {
        // Faster than creating new arrays
        this.accX.fill(0, 0, count);
        this.accY.fill(0, 0, count);
    }
    grow(newCapacity) {
        if (newCapacity <= this.capacity)
            return;
        this.accX = new Float64Array(newCapacity);
        this.accY = new Float64Array(newCapacity);
        this.capacity = newCapacity;
    }
}
