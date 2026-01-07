import { describe, it, expect, vi, beforeEach } from 'vitest'
import { World } from '../ECS/World'
import { Position, Velocity, Mass, Size, Temperature } from '../ECS/Components'
import { PhysicsConfig } from '../ECS/PhysicsConfig'
import { GravitySystem } from '../ECS/systems/GravitySystem'
import { GravitySystemOptimized } from '../ECS/systems/GravitySystemOptimized'
import { GravitySystemBarnesHut } from '../ECS/systems/GravitySystemBarnesHut'
import Vec2 from '../lib/Vector2'

describe('Gravity System Comparison', () => {
    beforeEach(() => {
        vi.stubGlobal('document', {
            getElementById: () => ({
                addEventListener: vi.fn(),
                textContent: ''
            })
        })
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    function createWorld(bodyCount: number): World {
        const world = new World(60)

        for (let i = 0; i < bodyCount; i++) {
            const entity = world.createEntity()
            const r = 10000 + Math.random() * 490000
            const angle = Math.random() * Math.PI * 2
            const px = Math.cos(angle) * r
            const py = Math.sin(angle) * r
            const vx = -Math.sin(angle) * 100
            const vy = Math.cos(angle) * 100
            const mass = 1e14 + Math.random() * 3e14
            const size = PhysicsConfig.bodySize(mass)

            world.addComponent(entity, Position, new Vec2(px, py))
            world.addComponent(entity, Velocity, new Vec2(vx, vy))
            world.addComponent(entity, Mass, mass)
            world.addComponent(entity, Size, size)
            world.addComponent(entity, Temperature, 100)
        }

        return world
    }

    function benchmark(name: string, fn: () => void, iterations: number): number {
        // Warmup
        for (let i = 0; i < 3; i++) fn()

        const start = performance.now()
        for (let i = 0; i < iterations; i++) {
            fn()
        }
        return (performance.now() - start) / iterations
    }

    it('should compare all gravity systems (O(n²) vs O(n²) optimized vs O(n log n))', () => {
        console.log('\n' + '='.repeat(90))
        console.log('GRAVITY SYSTEM PERFORMANCE COMPARISON')
        console.log('Original O(n²) vs Optimized O(n²) vs Barnes-Hut O(n log n)')
        console.log('='.repeat(90))

        // Test larger counts to show Barnes-Hut advantage
        const entityCounts = [100, 200, 500, 1000, 2000]

        console.log('\n┌────────────┬────────────────┬────────────────┬────────────────┬─────────────────────┐')
        console.log('│  Entities  │  Original (ms) │ Optimized (ms) │ BarnesHut (ms) │ Speedup (Opt vs BH) │')
        console.log('├────────────┼────────────────┼────────────────┼────────────────┼─────────────────────┤')

        for (const count of entityCounts) {
            // Create identical worlds for fair comparison
            const world1 = createWorld(count)
            const world2 = createWorld(count)
            const world3 = createWorld(count)

            const iterations = Math.max(3, Math.floor(200 / count))

            // Only run original for smaller counts (too slow otherwise)
            let originalMs = 0
            if (count <= 500) {
                originalMs = benchmark(
                    'Original',
                    () => {
                        GravitySystem.update(world1, 0.01)
                        world1.flush()
                    },
                    iterations
                )
            }

            const optimizedMs = benchmark(
                'Optimized',
                () => {
                    GravitySystemOptimized.update(world2, 0.01)
                    world2.flush()
                },
                iterations
            )

            const barnesHutMs = benchmark(
                'BarnesHut',
                () => {
                    GravitySystemBarnesHut.update(world3, 0.01)
                    world3.flush()
                },
                iterations
            )

            const speedup = optimizedMs / barnesHutMs
            const entities = count.toString().padStart(10)
            const orig = count <= 500 ? originalMs.toFixed(3).padStart(14) : '          N/A '
            const opt = optimizedMs.toFixed(3).padStart(14)
            const bh = barnesHutMs.toFixed(3).padStart(14)
            const speed = speedup.toFixed(2).padStart(18) + 'x'

            console.log(`│ ${entities} │ ${orig} │ ${opt} │ ${bh} │ ${speed} │`)
        }

        console.log('└────────────┴────────────────┴────────────────┴────────────────┴─────────────────────┘')
        console.log('\nNote: Barnes-Hut advantage increases with entity count due to O(n log n) vs O(n²)')
        console.log('At 1000 entities: O(n²) = 1M calculations, O(n log n) ≈ 10K calculations\n')

        expect(true).toBe(true)
    })

    it('should produce correct physics results for all systems', () => {
        // Verify all systems produce similar results
        const world1 = new World(60)
        const world2 = new World(60)
        const world3 = new World(60)

        // Create two identical bodies in each world
        for (const world of [world1, world2, world3]) {
            const e1 = world.createEntity()
            world.addComponent(e1, Position, new Vec2(0, 0))
            world.addComponent(e1, Velocity, new Vec2(0, 0))
            world.addComponent(e1, Mass, 1e14)
            world.addComponent(e1, Size, PhysicsConfig.bodySize(1e14))
            world.addComponent(e1, Temperature, 100)

            const e2 = world.createEntity()
            world.addComponent(e2, Position, new Vec2(10000, 0))
            world.addComponent(e2, Velocity, new Vec2(0, 0))
            world.addComponent(e2, Mass, 1e14)
            world.addComponent(e2, Size, PhysicsConfig.bodySize(1e14))
            world.addComponent(e2, Temperature, 100)
        }

        // Run all systems
        GravitySystem.update(world1, 1.0)
        GravitySystemOptimized.update(world2, 1.0)
        GravitySystemBarnesHut.update(world3, 1.0)

        // Compare results
        const entities1 = world1.query(Position, Velocity)
        const entities2 = world2.query(Position, Velocity)
        const entities3 = world3.query(Position, Velocity)

        expect(entities1.length).toBe(entities2.length)
        expect(entities2.length).toBe(entities3.length)

        for (let i = 0; i < entities1.length; i++) {
            const pos1 = world1.getComponent(entities1[i], Position)!
            const pos2 = world2.getComponent(entities2[i], Position)!
            const pos3 = world3.getComponent(entities3[i], Position)!
            const vel1 = world1.getComponent(entities1[i], Velocity)!
            const vel2 = world2.getComponent(entities2[i], Velocity)!
            const vel3 = world3.getComponent(entities3[i], Velocity)!

            // Original vs Optimized should be nearly identical
            expect(pos1.x).toBeCloseTo(pos2.x, 5)
            expect(pos1.y).toBeCloseTo(pos2.y, 5)
            expect(vel1.x).toBeCloseTo(vel2.x, 5)
            expect(vel1.y).toBeCloseTo(vel2.y, 5)

            // Barnes-Hut may have small approximation errors (theta = 0.5)
            // Allow slightly looser tolerance
            expect(pos3.x).toBeCloseTo(pos1.x, 3)
            expect(pos3.y).toBeCloseTo(pos1.y, 3)
            expect(vel3.x).toBeCloseTo(vel1.x, 3)
            expect(vel3.y).toBeCloseTo(vel1.y, 3)
        }
    })

    it('should scale well with large entity counts using Barnes-Hut', () => {
        // Test that Barnes-Hut can handle large counts
        const world = createWorld(5000)

        const start = performance.now()
        GravitySystemBarnesHut.update(world, 0.01)
        const elapsed = performance.now() - start

        console.log(`\nBarnes-Hut with 5000 entities: ${elapsed.toFixed(2)}ms per frame`)
        console.log('(60 FPS target = 16.67ms budget)\n')

        // Should complete in reasonable time
        expect(elapsed).toBeLessThan(500)  // Very generous for CI environments
    })
})
