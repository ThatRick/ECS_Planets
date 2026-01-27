import { describe, it, expect, beforeEach, vi } from 'vitest'
import { World } from '../World'
import { GravitySystemSimple } from './GravitySystemSimple'
import { Position, Velocity, Mass, Size, Temperature } from '../Components'
import { PhysicsConfig } from '../PhysicsConfig'
import Vec3 from '../../lib/Vector3'

describe('GravitySystemSimple', () => {
    let world: World

    beforeEach(() => {
        vi.stubGlobal('document', {
            getElementById: () => ({
                addEventListener: vi.fn(),
                textContent: ''
            })
        })
        // Suppress console.log for merge messages
        vi.spyOn(console, 'log').mockImplementation(() => {})

        world = new World(60)
    })

    function createBody(
        x: number, y: number,
        vx: number, vy: number,
        mass: number,
        temp: number = 100
    ): number {
        const entity = world.createEntity()
        world.addComponent(entity, Position, new Vec3(x, y, 0))
        world.addComponent(entity, Velocity, new Vec3(vx, vy, 0))
        world.addComponent(entity, Mass, mass)
        world.addComponent(entity, Size, PhysicsConfig.bodySize(mass))
        world.addComponent(entity, Temperature, temp)
        return entity
    }

    describe('Gravitational Attraction', () => {
        it('should accelerate bodies toward each other', () => {
            // Two bodies at rest, separated by distance
            const e1 = createBody(0, 0, 0, 0, 1e14)
            const e2 = createBody(10000, 0, 0, 0, 1e14)

            // Run one physics step
            GravitySystemSimple.update(world, 1.0)

            const v1 = world.getComponent(e1, Velocity)!
            const v2 = world.getComponent(e2, Velocity)!

            // e1 should move right (toward e2)
            expect(v1.x).toBeGreaterThan(0)
            // e2 should move left (toward e1)
            expect(v2.x).toBeLessThan(0)
        })

        it('should conserve momentum for two-body system', () => {
            const mass1 = 1e14
            const mass2 = 2e14

            const e1 = createBody(0, 0, 0, 0, mass1)
            const e2 = createBody(10000, 0, 0, 0, mass2)

            // Run multiple steps
            for (let i = 0; i < 10; i++) {
                GravitySystemSimple.update(world, 0.1)
            }

            const v1 = world.getComponent(e1, Velocity)!
            const v2 = world.getComponent(e2, Velocity)!

            // Total momentum should be ~0 (started at rest)
            const totalMomentum = v1.x * mass1 + v2.x * mass2
            expect(Math.abs(totalMomentum)).toBeLessThan(1e6) // Allow small numerical error
        })

        it('should produce stronger force at closer distances', () => {
            // Test with two separate setups to avoid collision/merge issues

            // Setup 1: Close bodies (but not colliding)
            const e1Close = createBody(0, 0, 0, 0, 1e14)
            const e2Close = createBody(5000, 0, 0, 0, 1e14) // Far enough to not collide

            GravitySystemSimple.update(world, 1.0)
            const closeAccel = Math.abs(world.getComponent(e1Close, Velocity)!.x)

            // Setup 2: Far bodies (new world to avoid interference)
            vi.stubGlobal('document', {
                getElementById: () => ({
                    addEventListener: vi.fn(),
                    textContent: ''
                })
            })
            const world2 = new World(60)
            const e1Far = world2.createEntity()
            world2.addComponent(e1Far, Position, new Vec3(0, 0, 0))
            world2.addComponent(e1Far, Velocity, new Vec3(0, 0, 0))
            world2.addComponent(e1Far, Mass, 1e14)
            world2.addComponent(e1Far, Size, PhysicsConfig.bodySize(1e14))
            world2.addComponent(e1Far, Temperature, 100)

            const e2Far = world2.createEntity()
            world2.addComponent(e2Far, Position, new Vec3(50000, 0, 0)) // 10x farther
            world2.addComponent(e2Far, Velocity, new Vec3(0, 0, 0))
            world2.addComponent(e2Far, Mass, 1e14)
            world2.addComponent(e2Far, Size, PhysicsConfig.bodySize(1e14))
            world2.addComponent(e2Far, Temperature, 100)

            GravitySystemSimple.update(world2, 1.0)
            const farAccel = Math.abs(world2.getComponent(e1Far, Velocity)!.x)

            // At 10x distance, force should be ~100x weaker (inverse square)
            expect(closeAccel).toBeGreaterThan(farAccel * 50)
        })
    })

    describe('Collision and Merging', () => {
        it('should merge colliding bodies', () => {
            const mass1 = 1e14
            const mass2 = 1e14

            // Bodies overlapping
            const e1 = createBody(0, 0, 0, 0, mass1)
            const e2 = createBody(100, 0, 0, 0, mass2) // Close enough to collide

            const initialCount = world.getEntityCount()

            GravitySystemSimple.update(world, 1.0)
            world.flush()

            expect(world.getEntityCount()).toBe(initialCount - 1)
        })

        it('should conserve mass in collision', () => {
            const mass1 = 1e14
            const mass2 = 2e14
            const totalMass = mass1 + mass2

            const e1 = createBody(0, 0, 0, 0, mass1)
            const e2 = createBody(100, 0, 0, 0, mass2)

            GravitySystemSimple.update(world, 1.0)
            world.flush()

            // Find surviving entity
            const survivors = world.query(Mass)
            expect(survivors).toHaveLength(1)

            const survivorMass = world.getComponent(survivors[0], Mass)!
            expect(survivorMass).toBeCloseTo(totalMass, 5)
        })

        it('should conserve momentum in collision', () => {
            const mass1 = 1e14
            const mass2 = 1e14
            const v1 = 1000
            const v2 = -500

            const initialMomentum = mass1 * v1 + mass2 * v2

            createBody(0, 0, v1, 0, mass1)
            createBody(100, 0, v2, 0, mass2)

            GravitySystemSimple.update(world, 0.01) // Small dt to ensure collision
            world.flush()

            const survivors = world.query(Velocity, Mass)
            expect(survivors).toHaveLength(1)

            const finalVel = world.getComponent(survivors[0], Velocity)!
            const finalMass = world.getComponent(survivors[0], Mass)!
            const finalMomentum = finalVel.x * finalMass

            expect(finalMomentum).toBeCloseTo(initialMomentum, 0)
        })

        it('should heat bodies on collision', () => {
            const initialTemp = 100

            createBody(0, 0, 1000, 0, 1e14, initialTemp)
            createBody(100, 0, -1000, 0, 1e14, initialTemp) // Head-on collision

            GravitySystemSimple.update(world, 0.01)
            world.flush()

            const survivors = world.query(Temperature)
            const finalTemp = world.getComponent(survivors[0], Temperature)!

            // Temperature should increase from kinetic energy conversion
            expect(finalTemp).toBeGreaterThan(initialTemp)
        })

        it('should update body size after merge', () => {
            const mass1 = 1e14
            const mass2 = 1e14

            createBody(0, 0, 0, 0, mass1)
            createBody(100, 0, 0, 0, mass2)

            GravitySystemSimple.update(world, 1.0)
            world.flush()

            const survivors = world.query(Size, Mass)
            const finalMass = world.getComponent(survivors[0], Mass)!
            const finalSize = world.getComponent(survivors[0], Size)!
            const expectedSize = PhysicsConfig.bodySize(finalMass)

            expect(finalSize).toBeCloseTo(expectedSize, 1)
        })
    })

    describe('Thermal Simulation', () => {
        it('should cool bodies via radiation', () => {
            const initialTemp = 1000

            const entity = createBody(0, 0, 0, 0, 1e14, initialTemp)

            // Run many steps to see cooling
            for (let i = 0; i < 100; i++) {
                GravitySystemSimple.update(world, 1.0)
            }

            const finalTemp = world.getComponent(entity, Temperature)!
            expect(finalTemp).toBeLessThan(initialTemp)
        })

        it('should not cool below minimum temperature', () => {
            const entity = createBody(0, 0, 0, 0, 1e14, 10) // Start cold

            // Run many steps
            for (let i = 0; i < 1000; i++) {
                GravitySystemSimple.update(world, 1.0)
            }

            const finalTemp = world.getComponent(entity, Temperature)!
            expect(finalTemp).toBeGreaterThanOrEqual(PhysicsConfig.minTemperature)
        })

        it('should cool hot bodies faster than cool bodies', () => {
            const hotEntity = createBody(0, 0, 0, 0, 1e14, 10000)
            const coolEntity = createBody(100000, 0, 0, 0, 1e14, 100) // Far apart

            const hotInitial = world.getComponent(hotEntity, Temperature)!
            const coolInitial = world.getComponent(coolEntity, Temperature)!

            GravitySystemSimple.update(world, 1.0)

            const hotFinal = world.getComponent(hotEntity, Temperature)!
            const coolFinal = world.getComponent(coolEntity, Temperature)!

            const hotCooling = hotInitial - hotFinal
            const coolCooling = coolInitial - coolFinal

            // Stefan-Boltzmann: P ∝ T⁴, so hot bodies cool much faster
            expect(hotCooling).toBeGreaterThan(coolCooling * 100)
        })
    })

    describe('Velocity Verlet Integration', () => {
        it('should conserve energy better than Euler for orbits', () => {
            // Set up a simple two-body orbital system
            const centralMass = 1e16
            const orbitMass = 1e10 // Much smaller
            const orbitRadius = 10000
            // Circular orbit velocity: v = sqrt(GM/r)
            const orbitVelocity = Math.sqrt(PhysicsConfig.G * centralMass / orbitRadius)

            createBody(0, 0, 0, 0, centralMass, 100)
            const orbiter = createBody(orbitRadius, 0, 0, orbitVelocity, orbitMass, 100)

            // Calculate initial energy
            const calcEnergy = () => {
                const pos = world.getComponent(orbiter, Position)!
                const vel = world.getComponent(orbiter, Velocity)!
                const dist = pos.len()
                const kinetic = 0.5 * orbitMass * (vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
                const potential = -PhysicsConfig.G * centralMass * orbitMass / dist
                return kinetic + potential
            }

            const initialEnergy = calcEnergy()

            // Run for many steps (fraction of an orbit)
            for (let i = 0; i < 100; i++) {
                GravitySystemSimple.update(world, 0.1)
            }

            const finalEnergy = calcEnergy()

            // Energy should be conserved within ~1%
            const energyError = Math.abs((finalEnergy - initialEnergy) / initialEnergy)
            expect(energyError).toBeLessThan(0.01)
        })
    })

    describe('Edge Cases', () => {
        it('should handle single entity (no interactions)', () => {
            const entity = createBody(0, 0, 100, 0, 1e14)

            // Should not throw
            GravitySystemSimple.update(world, 1.0)

            // Velocity should be unchanged (no other bodies to attract)
            const vel = world.getComponent(entity, Velocity)!
            expect(vel.x).toBe(100) // Position updates happen in Verlet
        })

        it('should handle empty world', () => {
            // Should not throw
            GravitySystemSimple.update(world, 1.0)
        })

        it('should handle multiple simultaneous collisions', () => {
            // Create cluster of overlapping bodies
            createBody(0, 0, 0, 0, 1e14)
            createBody(50, 0, 0, 0, 1e14)
            createBody(100, 0, 0, 0, 1e14)
            createBody(50, 50, 0, 0, 1e14)

            // Should merge without errors
            GravitySystemSimple.update(world, 1.0)
            world.flush()

            // At least some should have merged
            expect(world.getEntityCount()).toBeLessThan(4)
        })
    })
})
