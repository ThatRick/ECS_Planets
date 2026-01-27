import { describe, it, expect, vi, beforeEach } from 'vitest'
import { World } from '../ECS/World'
import { Position, Velocity, Mass, Size, Temperature } from '../ECS/Components'
import { PhysicsConfig } from '../ECS/PhysicsConfig'
import { GravitySystemOptimized } from '../ECS/systems/GravitySystemOptimized'
import { GravitySystemBarnesHut } from '../ECS/systems/GravitySystemBarnesHut'
import { SpatialHash3D } from '../ECS/SpatialHash'
import Vec3 from '../lib/Vector3'

describe('3D Performance Analysis', () => {
    beforeEach(() => {
        vi.stubGlobal('document', {
            getElementById: () => ({
                addEventListener: vi.fn(),
                textContent: ''
            })
        })
        // Don't suppress console.log - we want to see benchmark output
    })

    function createWorld3D(bodyCount: number, mode: 'disc' | 'sphere' = 'sphere'): World {
        const world = new World(60)

        for (let i = 0; i < bodyCount; i++) {
            const entity = world.createEntity()
            const r = 10000 + Math.random() * 490000
            const angle = Math.random() * Math.PI * 2

            let px: number, py: number, pz: number

            if (mode === 'disc') {
                // Thin disc - small z variation
                px = Math.cos(angle) * r
                py = (Math.random() - 0.5) * 1000  // Small Y variation
                pz = Math.sin(angle) * r
            } else {
                // Spherical distribution
                const phi = Math.acos(2 * Math.random() - 1)
                const theta = Math.random() * Math.PI * 2
                px = r * Math.sin(phi) * Math.cos(theta)
                py = r * Math.sin(phi) * Math.sin(theta)
                pz = r * Math.cos(phi)
            }

            const vx = -Math.sin(angle) * 100
            const vy = 0
            const vz = Math.cos(angle) * 100
            const mass = 1e14 + Math.random() * 3e14
            const size = PhysicsConfig.bodySize(mass)

            world.addComponent(entity, Position, new Vec3(px, py, pz))
            world.addComponent(entity, Velocity, new Vec3(vx, vy, vz))
            world.addComponent(entity, Mass, mass)
            world.addComponent(entity, Size, size)
            world.addComponent(entity, Temperature, 100)
        }

        return world
    }

    function benchmark(fn: () => void, iterations: number): { avg: number, min: number, max: number } {
        // Warmup
        for (let i = 0; i < 3; i++) fn()

        const times: number[] = []
        for (let i = 0; i < iterations; i++) {
            const start = performance.now()
            fn()
            times.push(performance.now() - start)
        }

        return {
            avg: times.reduce((a, b) => a + b, 0) / times.length,
            min: Math.min(...times),
            max: Math.max(...times)
        }
    }

    it('should analyze SpatialHash3D performance', () => {
        console.log('\n' + '='.repeat(80))
        console.log('SPATIAL HASH 3D PERFORMANCE ANALYSIS')
        console.log('='.repeat(80))

        const counts = [1000, 2000, 3000]

        for (const count of counts) {
            console.log(`\n--- ${count} entities ---`)

            // Generate positions
            const positions: { x: number, y: number, z: number, size: number }[] = []
            for (let i = 0; i < count; i++) {
                const r = 10000 + Math.random() * 490000
                const angle = Math.random() * Math.PI * 2
                positions.push({
                    x: Math.cos(angle) * r,
                    y: (Math.random() - 0.5) * 1000,
                    z: Math.sin(angle) * r,
                    size: 1000 + Math.random() * 2000
                })
            }

            // Find max size for cell size
            const maxSize = Math.max(...positions.map(p => p.size))
            const cellSize = maxSize * 4

            // Benchmark insert
            const insertResult = benchmark(() => {
                const hash = new SpatialHash3D(cellSize)
                for (let i = 0; i < positions.length; i++) {
                    const p = positions[i]
                    hash.insert(i, p.x, p.y, p.z, p.size)
                }
            }, 10)

            // Benchmark getPotentialPairs
            const hash = new SpatialHash3D(cellSize)
            for (let i = 0; i < positions.length; i++) {
                const p = positions[i]
                hash.insert(i, p.x, p.y, p.z, p.size)
            }

            const pairsResult = benchmark(() => {
                hash.getPotentialPairs()
            }, 10)

            const pairs = hash.getPotentialPairs()
            console.log(`  Insert: ${insertResult.avg.toFixed(2)}ms`)
            console.log(`  GetPairs: ${pairsResult.avg.toFixed(2)}ms (found ${pairs.length} pairs)`)
        }

        expect(true).toBe(true)
    })

    it('should compare disc vs sphere distribution performance', () => {
        console.log('\n' + '='.repeat(80))
        console.log('DISC vs SPHERE DISTRIBUTION COMPARISON')
        console.log('='.repeat(80))

        const count = 2000
        const iterations = 5

        console.log(`\n${count} entities, ${iterations} iterations each:\n`)

        // Disc mode
        const worldDisc = createWorld3D(count, 'disc')
        const discResult = benchmark(() => {
            GravitySystemOptimized.update(worldDisc, 0.01)
            worldDisc.flush()
        }, iterations)

        // Sphere mode
        const worldSphere = createWorld3D(count, 'sphere')
        const sphereResult = benchmark(() => {
            GravitySystemOptimized.update(worldSphere, 0.01)
            worldSphere.flush()
        }, iterations)

        console.log(`  Disc mode:   ${discResult.avg.toFixed(2)}ms (min: ${discResult.min.toFixed(2)}, max: ${discResult.max.toFixed(2)})`)
        console.log(`  Sphere mode: ${sphereResult.avg.toFixed(2)}ms (min: ${sphereResult.min.toFixed(2)}, max: ${sphereResult.max.toFixed(2)})`)
        console.log(`  Ratio: ${(discResult.avg / sphereResult.avg).toFixed(2)}x`)

        expect(true).toBe(true)
    })

    it('should benchmark gravity calculations breakdown', { timeout: 60000 }, () => {
        console.log('\n' + '='.repeat(80))
        console.log('GRAVITY SYSTEM BREAKDOWN')
        console.log('='.repeat(80))

        const counts = [500, 1000, 2000, 3000]

        console.log('\n┌────────────┬────────────────┬────────────────┬────────────────┐')
        console.log('│  Entities  │ Optimized (ms) │ BarnesHut (ms) │ BH Speedup     │')
        console.log('├────────────┼────────────────┼────────────────┼────────────────┤')

        for (const count of counts) {
            const world1 = createWorld3D(count, 'sphere')
            const world2 = createWorld3D(count, 'sphere')

            const iterations = Math.max(3, Math.floor(100 / (count / 500)))

            const optResult = benchmark(() => {
                GravitySystemOptimized.update(world1, 0.01)
                world1.flush()
            }, iterations)

            const bhResult = benchmark(() => {
                GravitySystemBarnesHut.update(world2, 0.01)
                world2.flush()
            }, iterations)

            const speedup = optResult.avg / bhResult.avg
            console.log(`│ ${count.toString().padStart(10)} │ ${optResult.avg.toFixed(2).padStart(14)} │ ${bhResult.avg.toFixed(2).padStart(14)} │ ${speedup.toFixed(2).padStart(12)}x │`)
        }

        console.log('└────────────┴────────────────┴────────────────┴────────────────┘')

        // Target analysis
        console.log('\n60 FPS target = 16.67ms frame budget')
        console.log('100 Hz physics = 10ms per physics tick')
        console.log('\nRecommendation: Use Barnes-Hut for 1000+ entities')

        expect(true).toBe(true)
    })

    it('should analyze O(n²) gravity loop performance', () => {
        console.log('\n' + '='.repeat(80))
        console.log('O(N²) GRAVITY LOOP ANALYSIS')
        console.log('='.repeat(80))

        // Pure gravity calculation without collision detection
        const counts = [500, 1000, 1500, 2000, 2500, 3000]

        console.log('\nPure gravity calculation (no collision detection):')
        console.log('┌────────────┬────────────────┬────────────────┬────────────────┐')
        console.log('│  Entities  │ Pairs          │ Time (ms)      │ Pairs/ms       │')
        console.log('├────────────┼────────────────┼────────────────┼────────────────┤')

        for (const n of counts) {
            const pairs = (n * (n - 1)) / 2

            // Setup data
            const posX = new Float64Array(n)
            const posY = new Float64Array(n)
            const posZ = new Float64Array(n)
            const mass = new Float64Array(n)
            const accX = new Float64Array(n)
            const accY = new Float64Array(n)
            const accZ = new Float64Array(n)

            for (let i = 0; i < n; i++) {
                posX[i] = Math.random() * 1000000
                posY[i] = Math.random() * 1000000
                posZ[i] = Math.random() * 1000000
                mass[i] = 1e14
            }

            const G = 6.674e-11

            const result = benchmark(() => {
                accX.fill(0)
                accY.fill(0)
                accZ.fill(0)

                for (let i = 0; i < n; i++) {
                    const pxi = posX[i]
                    const pyi = posY[i]
                    const pzi = posZ[i]
                    const mi = mass[i]

                    for (let j = i + 1; j < n; j++) {
                        const dx = posX[j] - pxi
                        const dy = posY[j] - pyi
                        const dz = posZ[j] - pzi
                        const distSq = dx * dx + dy * dy + dz * dz
                        const dist = Math.sqrt(distSq)

                        if (dist > 0) {
                            const force = G / distSq
                            const fx = (dx / dist) * force
                            const fy = (dy / dist) * force
                            const fz = (dz / dist) * force

                            accX[i] += fx * mass[j]
                            accY[i] += fy * mass[j]
                            accZ[i] += fz * mass[j]
                            accX[j] -= fx * mi
                            accY[j] -= fy * mi
                            accZ[j] -= fz * mi
                        }
                    }
                }
            }, 5)

            const pairsPerMs = pairs / result.avg
            console.log(`│ ${n.toString().padStart(10)} │ ${pairs.toString().padStart(14)} │ ${result.avg.toFixed(2).padStart(14)} │ ${pairsPerMs.toFixed(0).padStart(14)} │`)
        }

        console.log('└────────────┴────────────────┴────────────────┴────────────────┘')

        expect(true).toBe(true)
    })
})
