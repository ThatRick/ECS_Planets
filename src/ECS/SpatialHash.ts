import Vec2 from '../lib/Vector2.js'

/**
 * Spatial hash grid for efficient proximity queries.
 * Reduces N-body collision checks from O(n²) to O(n) average case.
 */
export class SpatialHash {
    private cellSize: number
    private cells: Map<string, Set<number>> = new Map()

    constructor(cellSize: number) {
        this.cellSize = cellSize
    }

    private key(x: number, y: number): string {
        const cx = Math.floor(x / this.cellSize)
        const cy = Math.floor(y / this.cellSize)
        return `${cx},${cy}`
    }

    clear(): void {
        this.cells.clear()
    }

    insert(id: number, pos: Vec2, radius: number = 0): void {
        // Insert into all cells that the entity's bounding box overlaps
        const minX = Math.floor((pos.x - radius) / this.cellSize)
        const maxX = Math.floor((pos.x + radius) / this.cellSize)
        const minY = Math.floor((pos.y - radius) / this.cellSize)
        const maxY = Math.floor((pos.y + radius) / this.cellSize)

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                const k = `${cx},${cy}`
                if (!this.cells.has(k)) {
                    this.cells.set(k, new Set())
                }
                this.cells.get(k)!.add(id)
            }
        }
    }

    /**
     * Query all entities within a radius of a position.
     * Returns entity IDs that are potentially within range (broad phase).
     */
    queryRadius(pos: Vec2, radius: number): Set<number> {
        const results = new Set<number>()
        const minX = Math.floor((pos.x - radius) / this.cellSize)
        const maxX = Math.floor((pos.x + radius) / this.cellSize)
        const minY = Math.floor((pos.y - radius) / this.cellSize)
        const maxY = Math.floor((pos.y + radius) / this.cellSize)

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                const cell = this.cells.get(`${cx},${cy}`)
                if (cell) {
                    for (const id of cell) {
                        results.add(id)
                    }
                }
            }
        }
        return results
    }

    /**
     * Get all unique pairs of potentially colliding entities.
     * Much more efficient than checking all pairs.
     */
    getPotentialPairs(): Array<[number, number]> {
        const pairs: Array<[number, number]> = []
        const seen = new Set<string>()

        for (const cell of this.cells.values()) {
            const entities = Array.from(cell)
            for (let i = 0; i < entities.length; i++) {
                for (let j = i + 1; j < entities.length; j++) {
                    const a = Math.min(entities[i], entities[j])
                    const b = Math.max(entities[i], entities[j])
                    const pairKey = `${a},${b}`
                    if (!seen.has(pairKey)) {
                        seen.add(pairKey)
                        pairs.push([a, b])
                    }
                }
            }
        }
        return pairs
    }
}
