/**
 * 3D Spatial hash grid for efficient proximity queries.
 * Reduces N-body collision checks from O(n²) to O(n) average case.
 * Also supports 2D mode for backward compatibility.
 */
export class SpatialHash3D {
    cellSize;
    cells = new Map();
    constructor(cellSize) {
        this.cellSize = cellSize;
    }
    clear() {
        this.cells.clear();
    }
    /**
     * Insert an entity into the spatial hash.
     * Supports both 2D and 3D modes:
     * - insert(id, x, y, z, radius) - 3D mode
     * - insert(id, pos, radius) - 2D mode with {x, y} object
     */
    insert(id, xOrPos, yOrRadius, zOrUndefined, radiusArg) {
        let x, y, z, radius;
        if (typeof xOrPos === 'object') {
            // 2D mode: insert(id, pos, radius)
            x = xOrPos.x;
            y = xOrPos.y;
            z = xOrPos.z ?? 0;
            radius = yOrRadius ?? 0;
        }
        else {
            // 3D mode: insert(id, x, y, z, radius)
            x = xOrPos;
            y = yOrRadius ?? 0;
            z = zOrUndefined ?? 0;
            radius = radiusArg ?? 0;
        }
        // Insert into all cells that the entity's bounding box overlaps
        const minX = Math.floor((x - radius) / this.cellSize);
        const maxX = Math.floor((x + radius) / this.cellSize);
        const minY = Math.floor((y - radius) / this.cellSize);
        const maxY = Math.floor((y + radius) / this.cellSize);
        const minZ = Math.floor((z - radius) / this.cellSize);
        const maxZ = Math.floor((z + radius) / this.cellSize);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const k = `${cx},${cy},${cz}`;
                    if (!this.cells.has(k)) {
                        this.cells.set(k, new Set());
                    }
                    this.cells.get(k).add(id);
                }
            }
        }
    }
    /**
     * Query all entities within a radius of a position.
     * Returns entity IDs that are potentially within range (broad phase).
     * Supports both 2D {x, y} and 3D {x, y, z} position objects.
     */
    queryRadius(pos, radius) {
        const results = new Set();
        const z = pos.z ?? 0;
        const minX = Math.floor((pos.x - radius) / this.cellSize);
        const maxX = Math.floor((pos.x + radius) / this.cellSize);
        const minY = Math.floor((pos.y - radius) / this.cellSize);
        const maxY = Math.floor((pos.y + radius) / this.cellSize);
        const minZ = Math.floor((z - radius) / this.cellSize);
        const maxZ = Math.floor((z + radius) / this.cellSize);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const cell = this.cells.get(`${cx},${cy},${cz}`);
                    if (cell) {
                        for (const id of cell) {
                            results.add(id);
                        }
                    }
                }
            }
        }
        return results;
    }
    /**
     * Get all unique pairs of potentially colliding entities.
     * Much more efficient than checking all pairs.
     */
    getPotentialPairs() {
        const pairs = [];
        const seen = new Set();
        for (const cell of this.cells.values()) {
            const entities = Array.from(cell);
            for (let i = 0; i < entities.length; i++) {
                for (let j = i + 1; j < entities.length; j++) {
                    const a = Math.min(entities[i], entities[j]);
                    const b = Math.max(entities[i], entities[j]);
                    const pairKey = `${a},${b}`;
                    if (!seen.has(pairKey)) {
                        seen.add(pairKey);
                        pairs.push([a, b]);
                    }
                }
            }
        }
        return pairs;
    }
}
// Alias for backward compatibility
export { SpatialHash3D as SpatialHash };
