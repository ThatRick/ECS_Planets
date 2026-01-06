import { describe, it, expect, beforeEach, vi } from 'vitest'
import { World } from './World'
import { Position, Velocity, Mass, Size, Temperature, CameraComponent } from './Components'
import Vec2 from '../lib/Vector2'

describe('World', () => {
    let world: World

    beforeEach(() => {
        // Mock DOM elements for bindControls
        vi.stubGlobal('document', {
            getElementById: () => ({
                addEventListener: vi.fn(),
                textContent: ''
            })
        })
        world = new World(60)
    })

    describe('Entity Management', () => {
        it('should create entities with unique IDs', () => {
            const e1 = world.createEntity()
            const e2 = world.createEntity()
            const e3 = world.createEntity()

            expect(e1).toBe(0)
            expect(e2).toBe(1)
            expect(e3).toBe(2)
        })

        it('should track entity count correctly', () => {
            expect(world.getEntityCount()).toBe(0)

            world.createEntity()
            world.createEntity()
            expect(world.getEntityCount()).toBe(2)
        })

        it('should remove entities after flush', () => {
            const e1 = world.createEntity()
            const e2 = world.createEntity()

            expect(world.getEntityCount()).toBe(2)

            world.removeEntity(e1)
            // Entity still exists until flush
            expect(world.hasEntity(e1)).toBe(false) // Pending removal
            expect(world.getEntityCount()).toBe(1)

            world.flush()
            expect(world.getEntityCount()).toBe(1)
            expect(world.hasEntity(e2)).toBe(true)
        })

        it('should handle removing non-existent entities gracefully', () => {
            world.removeEntity(999)
            world.flush()
            expect(world.getEntityCount()).toBe(0)
        })
    })

    describe('Component Management', () => {
        it('should add and retrieve components', () => {
            const entity = world.createEntity()
            const pos = new Vec2(10, 20)

            world.addComponent(entity, Position, pos)

            const retrieved = world.getComponent(entity, Position)
            expect(retrieved).toBe(pos)
            expect(retrieved?.x).toBe(10)
            expect(retrieved?.y).toBe(20)
        })

        it('should return undefined for missing components', () => {
            const entity = world.createEntity()
            const retrieved = world.getComponent(entity, Position)
            expect(retrieved).toBeUndefined()
        })

        it('should check component existence', () => {
            const entity = world.createEntity()

            expect(world.hasComponent(entity, Position)).toBe(false)

            world.addComponent(entity, Position, new Vec2(0, 0))
            expect(world.hasComponent(entity, Position)).toBe(true)
        })

        it('should remove components', () => {
            const entity = world.createEntity()
            world.addComponent(entity, Position, new Vec2(0, 0))

            expect(world.hasComponent(entity, Position)).toBe(true)

            world.removeComponent(entity, Position)
            expect(world.hasComponent(entity, Position)).toBe(false)
        })

        it('should update components with setComponent', () => {
            const entity = world.createEntity()
            world.addComponent(entity, Mass, 100)

            world.setComponent(entity, Mass, 200)
            expect(world.getComponent(entity, Mass)).toBe(200)
        })

        it('should remove all components when entity is removed', () => {
            const entity = world.createEntity()
            world.addComponent(entity, Position, new Vec2(0, 0))
            world.addComponent(entity, Velocity, new Vec2(1, 1))
            world.addComponent(entity, Mass, 100)

            world.removeEntity(entity)
            world.flush()

            expect(world.getComponent(entity, Position)).toBeUndefined()
            expect(world.getComponent(entity, Velocity)).toBeUndefined()
            expect(world.getComponent(entity, Mass)).toBeUndefined()
        })
    })

    describe('Queries', () => {
        it('should query entities with single component', () => {
            const e1 = world.createEntity()
            const e2 = world.createEntity()
            const e3 = world.createEntity()

            world.addComponent(e1, Position, new Vec2(0, 0))
            world.addComponent(e2, Position, new Vec2(1, 1))
            // e3 has no Position

            const result = world.query(Position)
            expect(result).toHaveLength(2)
            expect(result).toContain(e1)
            expect(result).toContain(e2)
            expect(result).not.toContain(e3)
        })

        it('should query entities with multiple components', () => {
            const e1 = world.createEntity()
            const e2 = world.createEntity()
            const e3 = world.createEntity()

            // e1: Position, Velocity
            world.addComponent(e1, Position, new Vec2(0, 0))
            world.addComponent(e1, Velocity, new Vec2(1, 0))

            // e2: Position only
            world.addComponent(e2, Position, new Vec2(1, 1))

            // e3: Velocity only
            world.addComponent(e3, Velocity, new Vec2(0, 1))

            const result = world.query(Position, Velocity)
            expect(result).toHaveLength(1)
            expect(result).toContain(e1)
        })

        it('should return empty array when no entities match', () => {
            world.createEntity()
            const result = world.query(Position, Velocity, Mass)
            expect(result).toHaveLength(0)
        })

        it('should exclude pending removal entities from queries', () => {
            const e1 = world.createEntity()
            const e2 = world.createEntity()

            world.addComponent(e1, Position, new Vec2(0, 0))
            world.addComponent(e2, Position, new Vec2(1, 1))

            world.removeEntity(e1)

            const result = world.query(Position)
            expect(result).toHaveLength(1)
            expect(result).toContain(e2)
        })

        it('should find single entity with querySingle', () => {
            const camera = world.createEntity()
            world.addComponent(camera, CameraComponent, {
                offset: new Vec2(0, 0),
                zoom: 1
            })

            const result = world.querySingle(CameraComponent)
            expect(result).toBe(camera)
        })

        it('should return undefined when querySingle finds nothing', () => {
            const result = world.querySingle(CameraComponent)
            expect(result).toBeUndefined()
        })
    })

    describe('Events', () => {
        it('should emit entityCreated event', () => {
            const callback = vi.fn()
            world.on('entityCreated', callback)

            const entity = world.createEntity()

            expect(callback).toHaveBeenCalledWith({ entity })
        })

        it('should emit entityRemoved event after flush', () => {
            const callback = vi.fn()
            world.on('entityRemoved', callback)

            const entity = world.createEntity()
            world.removeEntity(entity)

            expect(callback).not.toHaveBeenCalled()

            world.flush()
            expect(callback).toHaveBeenCalledWith({ entity })
        })

        it('should emit componentAdded event', () => {
            const callback = vi.fn()
            world.on('componentAdded', callback)

            const entity = world.createEntity()
            world.addComponent(entity, Position, new Vec2(0, 0))

            expect(callback).toHaveBeenCalledWith({
                entity,
                component: Position
            })
        })

        it('should emit componentRemoved event', () => {
            const callback = vi.fn()
            world.on('componentRemoved', callback)

            const entity = world.createEntity()
            world.addComponent(entity, Position, new Vec2(0, 0))
            world.removeComponent(entity, Position)

            expect(callback).toHaveBeenCalledWith({
                entity,
                component: Position
            })
        })

        it('should allow unsubscribing from events', () => {
            const callback = vi.fn()
            world.on('entityCreated', callback)
            world.off('entityCreated', callback)

            world.createEntity()
            expect(callback).not.toHaveBeenCalled()
        })
    })

    describe('Time Factor', () => {
        it('should get and set time factor', () => {
            world.timeFactor = 2.0
            expect(world.timeFactor).toBe(2.0)

            world.timeFactor = 0.5
            expect(world.timeFactor).toBe(0.5)
        })
    })
})
