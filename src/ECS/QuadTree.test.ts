import { describe, it, expect } from 'vitest'
import { QuadTree, Body } from './QuadTree'

describe('QuadTree', () => {
    describe('build', () => {
        it('should handle empty body array', () => {
            const qt = new QuadTree()
            qt.build([])
            const stats = qt.getStats()
            expect(stats.nodeCount).toBe(0)
            expect(stats.bodyCount).toBe(0)
        })

        it('should handle single body', () => {
            const qt = new QuadTree()
            qt.build([{ x: 100, y: 100, mass: 1000, index: 0 }])
            const stats = qt.getStats()
            expect(stats.nodeCount).toBe(1)
            expect(stats.bodyCount).toBe(1)
        })

        it('should handle two bodies', () => {
            const qt = new QuadTree()
            qt.build([
                { x: 0, y: 0, mass: 1000, index: 0 },
                { x: 1000, y: 1000, mass: 2000, index: 1 }
            ])
            const stats = qt.getStats()
            expect(stats.bodyCount).toBe(2)
            expect(stats.nodeCount).toBeGreaterThanOrEqual(2)
        })

        it('should handle many bodies', () => {
            const qt = new QuadTree()
            const bodies: Body[] = []
            for (let i = 0; i < 1000; i++) {
                bodies.push({
                    x: Math.random() * 10000 - 5000,
                    y: Math.random() * 10000 - 5000,
                    mass: Math.random() * 1000 + 100,
                    index: i
                })
            }
            qt.build(bodies)
            const stats = qt.getStats()
            expect(stats.bodyCount).toBe(1000)
        })

        it('should handle bodies at same position', () => {
            const qt = new QuadTree()
            // Bodies at same position will keep subdividing until floating point precision limits
            qt.build([
                { x: 0, y: 0, mass: 1000, index: 0 },
                { x: 0, y: 0, mass: 2000, index: 1 }
            ])
            const stats = qt.getStats()
            expect(stats.bodyCount).toBe(2)
        })
    })

    describe('calculateForce', () => {
        it('should return zero force for empty tree', () => {
            const qt = new QuadTree()
            qt.build([])
            const force = qt.calculateForce({ x: 0, y: 0, mass: 1000, index: 0 }, 6.674e-11)
            expect(force.fx).toBe(0)
            expect(force.fy).toBe(0)
        })

        it('should not calculate self-interaction', () => {
            const qt = new QuadTree()
            const body: Body = { x: 100, y: 100, mass: 1000, index: 0 }
            qt.build([body])
            const force = qt.calculateForce(body, 6.674e-11)
            expect(force.fx).toBe(0)
            expect(force.fy).toBe(0)
        })

        it('should calculate attraction between two bodies', () => {
            const qt = new QuadTree()
            const body1: Body = { x: 0, y: 0, mass: 1e14, index: 0 }
            const body2: Body = { x: 10000, y: 0, mass: 1e14, index: 1 }
            qt.build([body1, body2])

            const force = qt.calculateForce(body1, 6.674e-11, 100)

            // Force should be positive in x direction (toward body2)
            expect(force.fx).toBeGreaterThan(0)
            expect(Math.abs(force.fy)).toBeLessThan(Math.abs(force.fx) * 0.01) // Nearly zero in y
        })

        it('should produce symmetric forces (Newton\'s 3rd law)', () => {
            const qt = new QuadTree()
            const body1: Body = { x: 0, y: 0, mass: 1e14, index: 0 }
            const body2: Body = { x: 10000, y: 0, mass: 1e14, index: 1 }
            qt.build([body1, body2])

            const force1 = qt.calculateForce(body1, 6.674e-11, 100)
            const force2 = qt.calculateForce(body2, 6.674e-11, 100)

            // Forces should be equal and opposite
            expect(force1.fx).toBeCloseTo(-force2.fx, 10)
            expect(force1.fy).toBeCloseTo(-force2.fy, 10)
        })

        it('should vary accuracy with theta parameter', () => {
            const qt = new QuadTree()
            const bodies: Body[] = []

            // Create cluster of bodies
            for (let i = 0; i < 100; i++) {
                bodies.push({
                    x: 10000 + Math.random() * 100,
                    y: Math.random() * 100,
                    mass: 1e12,
                    index: i
                })
            }

            // Add test body far from cluster
            const testBody: Body = { x: 0, y: 0, mass: 1e14, index: 100 }
            bodies.push(testBody)

            qt.build(bodies)

            // Low theta = more accurate
            qt.theta = 0.1
            const forceAccurate = qt.calculateForce(testBody, 6.674e-11, 100)

            // High theta = faster but less accurate
            qt.theta = 2.0
            const forceFast = qt.calculateForce(testBody, 6.674e-11, 100)

            // Both should give reasonable forces in the same direction
            expect(Math.sign(forceAccurate.fx)).toBe(Math.sign(forceFast.fx))

            // But may differ in magnitude
            // With theta=2.0, the entire cluster should be approximated as one mass
        })
    })

    describe('getStats', () => {
        it('should return correct statistics', () => {
            const qt = new QuadTree()
            const bodies: Body[] = [
                { x: -1000, y: -1000, mass: 100, index: 0 },
                { x: 1000, y: -1000, mass: 100, index: 1 },
                { x: -1000, y: 1000, mass: 100, index: 2 },
                { x: 1000, y: 1000, mass: 100, index: 3 }
            ]
            qt.build(bodies)

            const stats = qt.getStats()
            expect(stats.bodyCount).toBe(4)
            expect(stats.maxDepth).toBeGreaterThanOrEqual(1)
            expect(stats.nodeCount).toBeGreaterThanOrEqual(5) // Root + 4 leaves minimum
        })
    })

    describe('mass distribution', () => {
        it('should compute correct center of mass for two equal masses', () => {
            const qt = new QuadTree()
            const bodies: Body[] = [
                { x: 0, y: 0, mass: 1000, index: 0 },
                { x: 100, y: 0, mass: 1000, index: 1 }
            ]
            qt.build(bodies)

            // Test by checking force on a third body
            // Force should point toward x=50 (center of mass)
            const testBody: Body = { x: 50, y: 100, mass: 1, index: 2 }
            qt.theta = 10  // Force approximation
            const force = qt.calculateForce(testBody, 6.674e-11, 0.001)

            // Force in x should be nearly zero (we're directly above center of mass)
            expect(Math.abs(force.fx)).toBeLessThan(Math.abs(force.fy) * 0.01)
            // Force in y should be negative (toward the masses)
            expect(force.fy).toBeLessThan(0)
        })

        it('should weight center of mass by mass', () => {
            const qt = new QuadTree()
            // Body at x=0 has mass 3x body at x=100
            // Center of mass should be at x=25
            const bodies: Body[] = [
                { x: 0, y: 0, mass: 3000, index: 0 },
                { x: 100, y: 0, mass: 1000, index: 1 }
            ]
            qt.build(bodies)

            // Test body directly above center of mass
            const testBody: Body = { x: 25, y: 100, mass: 1, index: 2 }
            qt.theta = 10  // Force approximation
            const force = qt.calculateForce(testBody, 6.674e-11, 0.001)

            // Force in x should be nearly zero
            expect(Math.abs(force.fx)).toBeLessThan(Math.abs(force.fy) * 0.1)
        })
    })
})
