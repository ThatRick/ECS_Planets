import { describe, it, expect, beforeEach } from 'vitest'
import { SpatialHash } from './SpatialHash'
import Vec2 from '../lib/Vector2'

describe('SpatialHash', () => {
    let hash: SpatialHash

    beforeEach(() => {
        hash = new SpatialHash(100) // 100 unit cell size
    })

    describe('Insertion and Query', () => {
        it('should insert and query single entity', () => {
            hash.insert(1, new Vec2(50, 50))

            const result = hash.queryRadius(new Vec2(50, 50), 10)
            expect(result.has(1)).toBe(true)
        })

        it('should find entities within radius', () => {
            hash.insert(1, new Vec2(0, 0))
            hash.insert(2, new Vec2(50, 0))
            hash.insert(3, new Vec2(200, 0)) // Far away

            const result = hash.queryRadius(new Vec2(25, 0), 100)
            expect(result.has(1)).toBe(true)
            expect(result.has(2)).toBe(true)
            expect(result.has(3)).toBe(false)
        })

        it('should handle negative coordinates', () => {
            hash.insert(1, new Vec2(-150, -150))
            hash.insert(2, new Vec2(-50, -50))

            const result = hash.queryRadius(new Vec2(-100, -100), 100)
            expect(result.has(1)).toBe(true)
            expect(result.has(2)).toBe(true)
        })

        it('should insert entity with radius into multiple cells', () => {
            // Entity at (50, 50) with radius 60 should span multiple cells
            hash.insert(1, new Vec2(50, 50), 60)

            // Should be found from adjacent cells
            const result1 = hash.queryRadius(new Vec2(0, 0), 10)
            const result2 = hash.queryRadius(new Vec2(100, 100), 10)

            expect(result1.has(1)).toBe(true)
            expect(result2.has(1)).toBe(true)
        })

        it('should clear all entries', () => {
            hash.insert(1, new Vec2(0, 0))
            hash.insert(2, new Vec2(100, 100))

            hash.clear()

            const result = hash.queryRadius(new Vec2(50, 50), 200)
            expect(result.size).toBe(0)
        })
    })

    describe('Potential Pairs', () => {
        it('should find pairs in same cell', () => {
            hash.insert(1, new Vec2(10, 10))
            hash.insert(2, new Vec2(20, 20))

            const pairs = hash.getPotentialPairs()
            expect(pairs).toHaveLength(1)
            expect(pairs[0]).toEqual([1, 2])
        })

        it('should find pairs across adjacent cells', () => {
            // Place entities near cell boundary
            hash.insert(1, new Vec2(95, 50), 10)  // Cell (0,0), overlaps to (1,0)
            hash.insert(2, new Vec2(105, 50), 10) // Cell (1,0), overlaps to (0,0)

            const pairs = hash.getPotentialPairs()
            expect(pairs).toHaveLength(1)
        })

        it('should not duplicate pairs', () => {
            // Both entities span multiple cells
            hash.insert(1, new Vec2(50, 50), 60)
            hash.insert(2, new Vec2(60, 60), 60)

            const pairs = hash.getPotentialPairs()
            // Should have exactly one pair, not duplicates
            expect(pairs).toHaveLength(1)
        })

        it('should return empty array when no pairs exist', () => {
            hash.insert(1, new Vec2(0, 0))
            hash.insert(2, new Vec2(500, 500)) // Far away, different cell

            const pairs = hash.getPotentialPairs()
            expect(pairs).toHaveLength(0)
        })

        it('should handle many entities in same cell', () => {
            // Insert 5 entities in same cell
            for (let i = 0; i < 5; i++) {
                hash.insert(i, new Vec2(10 + i, 10 + i))
            }

            const pairs = hash.getPotentialPairs()
            // 5 entities = 5*4/2 = 10 pairs
            expect(pairs).toHaveLength(10)
        })

        it('should order pairs consistently (smaller ID first)', () => {
            hash.insert(5, new Vec2(10, 10))
            hash.insert(3, new Vec2(20, 20))

            const pairs = hash.getPotentialPairs()
            expect(pairs[0][0]).toBe(3)
            expect(pairs[0][1]).toBe(5)
        })
    })

    describe('Edge Cases', () => {
        it('should handle zero radius query', () => {
            hash.insert(1, new Vec2(50, 50))

            const result = hash.queryRadius(new Vec2(50, 50), 0)
            expect(result.has(1)).toBe(true)
        })

        it('should handle entities at origin', () => {
            hash.insert(1, new Vec2(0, 0))

            const result = hash.queryRadius(new Vec2(0, 0), 10)
            expect(result.has(1)).toBe(true)
        })

        it('should handle very large coordinates', () => {
            hash.insert(1, new Vec2(1e6, 1e6))
            hash.insert(2, new Vec2(1e6 + 50, 1e6 + 50))

            const result = hash.queryRadius(new Vec2(1e6 + 25, 1e6 + 25), 100)
            expect(result.has(1)).toBe(true)
            expect(result.has(2)).toBe(true)
        })
    })

    describe('Performance Characteristics', () => {
        it('should handle large entity counts', () => {
            // Insert 1000 entities
            for (let i = 0; i < 1000; i++) {
                const x = (i % 100) * 50
                const y = Math.floor(i / 100) * 50
                hash.insert(i, new Vec2(x, y), 10)
            }

            // Query should still work
            const result = hash.queryRadius(new Vec2(250, 250), 100)
            expect(result.size).toBeGreaterThan(0)
        })
    })
})
