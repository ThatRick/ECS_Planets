import Vec2 from './lib/Vector2.js'
import {
    World,
    Position,
    Velocity,
    Mass,
    Size,
    Temperature,
    CameraComponent,
    PhysicsConfig,
    GravitySystem,
    GravitySystemOptimized,
    GravitySystemBarnesHut,
    createCameraMovementSystem,
    createPlanetRenderer
} from './ECS/index.js'
import { PerfMonitor, createPerfOverlay, updatePerfOverlay } from './PerfMonitor.js'
import { createSettingsPanel, SimSettings, DEFAULT_SETTINGS } from './SettingsPanel.js'
import { System } from './ECS/System.js'

type GravityType = 'original' | 'optimized' | 'barnes-hut'

const GRAVITY_SYSTEMS: Record<GravityType, System> = {
    'original': GravitySystem,
    'optimized': GravitySystemOptimized,
    'barnes-hut': GravitySystemBarnesHut
}

export default class App {
    canvas: HTMLCanvasElement
    world: World
    private bodyCountEl: HTMLElement | null
    private perfMonitor: PerfMonitor
    private currentGravityType: GravityType = 'optimized'

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.bodyCountEl = document.getElementById('bodyCount')
        this.perfMonitor = new PerfMonitor()

        // Add performance overlay
        const overlay = createPerfOverlay()
        document.body.appendChild(overlay)
        this.perfMonitor.onUpdate = updatePerfOverlay

        // Add settings panel
        const settingsPanel = createSettingsPanel((settings) => {
            this.resetSimulation(settings)
        })
        document.body.appendChild(settingsPanel)

        // Set up responsive canvas
        this.resizeCanvas()
        window.addEventListener('resize', () => this.resizeCanvas())

        this.world = new World(100) // 100 Hz physics
        this.setup()
        this.setupBenchmarkControls()

        // Main render loop
        const loop = () => {
            this.update()
            requestAnimationFrame(loop)
        }
        loop()
    }

    private resizeCanvas(): void {
        const container = this.canvas.parentElement
        if (container) {
            this.canvas.width = container.clientWidth
            this.canvas.height = container.clientHeight
        }
    }

    private setupBenchmarkControls(): void {
        // Add benchmark controls to the UI
        const controls = document.getElementById('controls')
        if (!controls) return

        // Create gravity system selector
        const gravitySelect = document.createElement('select')
        gravitySelect.id = 'gravitySelect'
        gravitySelect.innerHTML = `
            <option value="original">O(n²) Original</option>
            <option value="optimized" selected>O(n²) Optimized</option>
            <option value="barnes-hut">O(n log n) Barnes-Hut</option>
        `
        gravitySelect.style.cssText = 'padding: 8px; border-radius: 4px; background: #444; color: #fff; border: none;'
        gravitySelect.addEventListener('change', () => {
            this.switchGravitySystem(gravitySelect.value as GravityType)
        })

        // Create entity count input
        const entityLabel = document.createElement('label')
        entityLabel.style.cssText = 'color: #888; font-size: 12px;'
        entityLabel.innerHTML = 'Entities: '

        const entityInput = document.createElement('input')
        entityInput.type = 'number'
        entityInput.id = 'entityCount'
        entityInput.value = '300'
        entityInput.min = '10'
        entityInput.max = '5000'
        entityInput.step = '100'
        entityInput.style.cssText = 'width: 70px; padding: 8px; border-radius: 4px; background: #444; color: #fff; border: none;'

        // Reset button
        const resetBtn = document.createElement('button')
        resetBtn.textContent = 'Reset'
        resetBtn.addEventListener('click', () => {
            const count = parseInt(entityInput.value) || 300
            this.resetSimulation({ ...DEFAULT_SETTINGS, bodyCount: count })
        })

        // Add to controls
        const separator = document.createElement('span')
        separator.style.cssText = 'border-left: 1px solid #444; height: 24px; margin: 0 8px;'

        controls.insertBefore(separator, controls.querySelector('#stats'))
        controls.insertBefore(gravitySelect, controls.querySelector('#stats'))
        controls.insertBefore(entityLabel, controls.querySelector('#stats'))
        entityLabel.appendChild(entityInput)
        controls.insertBefore(resetBtn, controls.querySelector('#stats'))
    }

    private switchGravitySystem(type: GravityType): void {
        // Remove current gravity system
        const currentSystem = GRAVITY_SYSTEMS[this.currentGravityType]
        this.world.unregisterSystem(currentSystem.name)

        // Add new gravity system
        const newSystem = GRAVITY_SYSTEMS[type]
        this.world.registerSystem(newSystem)
        this.currentGravityType = type

        console.log(`Switched to ${type} gravity system`)
        this.perfMonitor.reset()
    }

    private resetSimulation(settings: SimSettings): void {
        // Clear all entities except camera
        const entities = this.world.query(Position, Velocity, Mass)
        for (const id of entities) {
            this.world.removeEntity(id)
        }
        this.world.flush()

        for (let i = 0; i < settings.bodyCount; i++) {
            const entity = this.world.createEntity()

            const r = settings.radiusMin + Math.random() * (settings.radiusMax - settings.radiusMin)
            const angle = Vec2.randomRay()
            const pos = Vec2.scale(angle, r)
            const vel = Vec2.rotate(angle, Math.PI / 2).scale((settings.orbitVelocity / r) ** 1.1)
            const mass = settings.massMin + (settings.massMax - settings.massMin) * Math.random()
            const size = PhysicsConfig.bodySize(mass)

            this.world.addComponent(entity, Position, pos)
            this.world.addComponent(entity, Velocity, vel)
            this.world.addComponent(entity, Mass, mass)
            this.world.addComponent(entity, Size, size)
            this.world.addComponent(entity, Temperature, settings.initialTemp)
        }

        // Update entity count input to match
        const entityInput = document.getElementById('entityCount') as HTMLInputElement
        if (entityInput) entityInput.value = String(settings.bodyCount)

        this.updateBodyCount()
        this.perfMonitor.reset()
        console.log(`Reset with ${settings.bodyCount} entities`)
    }

    setup(): void {
        const { width, height } = this.canvas
        const world = this.world

        // Configuration
        const config = {
            bodyCount: 300,
            massMin: 1e14,
            massMax: 4e14,
            radiusMin: 10000,
            radiusMax: 500000,
            orbitVel: 100000,
            initialTemp: 100
        }

        // Time factor for simulation speed
        world.timeFactor = 100

        // Create camera entity
        const cameraEntity = world.createEntity()
        world.addComponent(cameraEntity, CameraComponent, {
            zoom: height / config.radiusMax * 0.5,
            offset: new Vec2(width / 2, height / 2)
        })

        // Create planet entities
        for (let i = 0; i < config.bodyCount; i++) {
            const entity = world.createEntity()

            // Random position in disk
            const r = config.radiusMin + Math.random() * (config.radiusMax - config.radiusMin)
            const angle = Vec2.randomRay()
            const pos = Vec2.scale(angle, r)

            // Velocity perpendicular to radius for quasi-orbital motion
            // Using r^(-1.1) for slightly steeper than circular orbit
            const vel = Vec2.rotate(angle, Math.PI / 2).scale((config.orbitVel / r) ** 1.1)

            // Random mass
            const mass = config.massMin + (config.massMax - config.massMin) * Math.random()
            const size = PhysicsConfig.bodySize(mass)

            world.addComponent(entity, Position, pos)
            world.addComponent(entity, Velocity, vel)
            world.addComponent(entity, Mass, mass)
            world.addComponent(entity, Size, size)
            world.addComponent(entity, Temperature, config.initialTemp)
        }

        // Register systems
        // Simulation systems (run on fixed timestep)
        world.registerSystem(GravitySystemOptimized)

        // Visual systems (run on requestAnimationFrame)
        world.registerSystem(createCameraMovementSystem(this.canvas))
        world.registerSystem(createPlanetRenderer(this.canvas))

        // Bind UI controls
        world.bindControls()

        // Update body count when entities are removed
        world.on('entityRemoved', () => this.updateBodyCount())
        this.updateBodyCount()

        console.log(`Created ${config.bodyCount} planets`)
    }

    private updateBodyCount(): void {
        if (this.bodyCountEl) {
            // Count entities with Mass component (planets only, not camera)
            const count = this.world.query(Mass).length
            this.bodyCountEl.textContent = String(count)
        }
    }

    update(): void {
        this.perfMonitor.frameStart()
        this.perfMonitor.physicsStart()

        // Physics runs inside updateVisuals via fixed timestep
        this.world.updateVisuals()

        this.perfMonitor.physicsEnd()

        const entityCount = this.world.query(Mass).length
        this.perfMonitor.frameEnd(entityCount)
    }
}
