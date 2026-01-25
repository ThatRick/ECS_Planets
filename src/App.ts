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
    GravitySystemOptimized,
    GravitySystemBarnesHut,
    createCameraMovementSystem,
    createPlanetRenderer,
    createPlanetRendererWebGL,
    isWebGL2Available
} from './ECS/index.js'
import { PerfMonitor, createPerfOverlay, updatePerfOverlay, togglePerfOverlay } from './PerfMonitor.js'
import { createSettingsPanel, SimSettings, DEFAULT_SETTINGS, toggleSettingsPanel, updateSettingsPanelValues, VelocityMode } from './SettingsPanel.js'
import { System } from './ECS/System.js'

export type GravityType = 'optimized' | 'barnes-hut'
export type RendererType = 'webgl' | 'canvas'

const GRAVITY_SYSTEMS: Record<GravityType, System> = {
    'optimized': GravitySystemOptimized,
    'barnes-hut': GravitySystemBarnesHut
}

// Unit conversions (matching SettingsPanel)
const KM_TO_M = 1000
const MASS_UNIT = 1e14

export default class App {
    canvas: HTMLCanvasElement
    world: World
    private bodyCountEl: HTMLElement | null
    private perfMonitor: PerfMonitor
    private currentGravityType: GravityType = 'optimized'
    private currentRenderer: RendererType = 'canvas'
    private isRunning: boolean = false
    private playPauseBtn: HTMLElement | null

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.bodyCountEl = document.getElementById('bodyCount')
        this.playPauseBtn = document.getElementById('playPauseBtn')
        this.perfMonitor = new PerfMonitor()

        // Add performance overlay (hidden by default)
        const overlay = createPerfOverlay()
        document.body.appendChild(overlay)
        this.perfMonitor.onUpdate = updatePerfOverlay

        // Add settings panel
        const settingsPanel = createSettingsPanel(
            (settings) => this.resetSimulation(settings),
            (gravityType) => this.switchGravitySystem(gravityType)
        )
        document.body.appendChild(settingsPanel)

        // Set up responsive canvas
        this.resizeCanvas()
        window.addEventListener('resize', () => this.resizeCanvas())
        // Handle orientation change on mobile
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.resizeCanvas(), 100)
        })

        this.world = new World(100) // 100 Hz physics
        this.setup()
        this.bindControls()

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

    getGravityType(): GravityType {
        return this.currentGravityType
    }

    switchGravitySystem(type: GravityType): void {
        if (type === this.currentGravityType) return

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

    /**
     * Calculate initial velocity based on mode
     */
    private calculateVelocity(
        pos: Vec2,
        r: number,
        mode: VelocityMode,
        scale: number,
        totalMass: number
    ): Vec2 {
        switch (mode) {
            case 'orbital': {
                // Keplerian orbital velocity: v = sqrt(G * M / r)
                // Scale adjusts how circular the orbit is (1.0 = circular)
                const G = PhysicsConfig.G
                const orbitalSpeed = Math.sqrt(G * totalMass / r) * scale
                // Perpendicular to radius
                const angle = Math.atan2(pos.y, pos.x)
                return new Vec2(
                    -Math.sin(angle) * orbitalSpeed,
                    Math.cos(angle) * orbitalSpeed
                )
            }
            case 'collapse': {
                // Random velocity scaled by distance (more uniform cloud)
                // Small random velocities for interesting collapse dynamics
                const maxSpeed = Math.sqrt(r) * scale * 0.5
                return new Vec2(
                    (Math.random() - 0.5) * maxSpeed,
                    (Math.random() - 0.5) * maxSpeed
                )
            }
            case 'static':
            default:
                return new Vec2(0, 0)
        }
    }

    private resetSimulation(settings: SimSettings): void {
        // Clear all entities except camera
        const entities = this.world.query(Position, Velocity, Mass)
        for (const id of entities) {
            this.world.removeEntity(id)
        }
        this.world.flush()

        // Estimate total mass for orbital calculations
        const avgMass = (settings.massMin + settings.massMax) / 2
        const totalMass = avgMass * settings.bodyCount

        for (let i = 0; i < settings.bodyCount; i++) {
            const entity = this.world.createEntity()

            // Random position in annulus (ring between radiusMin and radiusMax)
            const r = settings.radiusMin + Math.random() * (settings.radiusMax - settings.radiusMin)
            const angle = Math.random() * Math.PI * 2
            const pos = new Vec2(Math.cos(angle) * r, Math.sin(angle) * r)

            // Calculate velocity based on mode
            const vel = this.calculateVelocity(
                pos, r,
                settings.velocityMode,
                settings.velocityScale,
                totalMass
            )

            // Random mass
            const mass = settings.massMin + (settings.massMax - settings.massMin) * Math.random()
            const size = PhysicsConfig.bodySize(mass)

            this.world.addComponent(entity, Position, pos)
            this.world.addComponent(entity, Velocity, vel)
            this.world.addComponent(entity, Mass, mass)
            this.world.addComponent(entity, Size, size)
            this.world.addComponent(entity, Temperature, settings.initialTemp)
        }

        // Update camera zoom based on new radius
        const cameraEntity = this.world.querySingle(CameraComponent)
        if (cameraEntity !== undefined) {
            const camera = this.world.getComponent(cameraEntity, CameraComponent)!
            camera.zoom = this.canvas.height / settings.radiusMax * 0.4
        }

        this.updateBodyCount()
        this.perfMonitor.reset()
        console.log(`Reset: ${settings.bodyCount} bodies, mode=${settings.velocityMode}, scale=${settings.velocityScale}`)
    }

    private updateRendererBadge(): void {
        const badge = document.getElementById('rendererBadge')
        if (badge) {
            badge.textContent = this.currentRenderer === 'webgl' ? 'WebGL 2' : 'Canvas 2D'
            badge.className = `renderer-badge ${this.currentRenderer}`
        }
    }

    private updatePlayPauseButton(): void {
        if (this.playPauseBtn) {
            this.playPauseBtn.textContent = this.isRunning ? 'Pause' : 'Start'
            this.playPauseBtn.classList.toggle('running', this.isRunning)
        }
    }

    private togglePlayPause(): void {
        if (this.isRunning) {
            this.world.stop()
            this.isRunning = false
        } else {
            this.world.start()
            this.isRunning = true
        }
        this.updatePlayPauseButton()
    }

    setup(): void {
        const { width, height } = this.canvas
        const world = this.world

        // Initial configuration (matching DEFAULT_SETTINGS in SettingsPanel)
        const config: SimSettings = {
            bodyCount: 300,
            radiusMin: 10 * KM_TO_M,      // 10 km in meters
            radiusMax: 500 * KM_TO_M,     // 500 km in meters
            massMin: 1 * MASS_UNIT,       // 1 × 10¹⁴ kg
            massMax: 4 * MASS_UNIT,       // 4 × 10¹⁴ kg
            velocityMode: 'collapse',
            velocityScale: 0.3,
            initialTemp: 100
        }

        // Time factor for simulation speed
        world.timeFactor = 100

        // Create camera entity
        const cameraEntity = world.createEntity()
        world.addComponent(cameraEntity, CameraComponent, {
            zoom: height / config.radiusMax * 0.4,
            offset: new Vec2(width / 2, height / 2)
        })

        // Estimate total mass for orbital calculations
        const avgMass = (config.massMin + config.massMax) / 2
        const totalMass = avgMass * config.bodyCount

        // Create planet entities
        for (let i = 0; i < config.bodyCount; i++) {
            const entity = world.createEntity()

            // Random position in annulus
            const r = config.radiusMin + Math.random() * (config.radiusMax - config.radiusMin)
            const angle = Math.random() * Math.PI * 2
            const pos = new Vec2(Math.cos(angle) * r, Math.sin(angle) * r)

            // Calculate velocity based on mode
            const vel = this.calculateVelocity(
                pos, r,
                config.velocityMode,
                config.velocityScale,
                totalMass
            )

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

        // Use WebGL renderer if available, fallback to Canvas 2D
        if (isWebGL2Available()) {
            world.registerSystem(createPlanetRendererWebGL(this.canvas))
            this.currentRenderer = 'webgl'
            console.log('Using WebGL 2 renderer')
        } else {
            world.registerSystem(createPlanetRenderer(this.canvas))
            this.currentRenderer = 'canvas'
            console.log('WebGL 2 not available, using Canvas 2D renderer')
        }
        this.updateRendererBadge()

        // Update body count when entities are removed
        world.on('entityRemoved', () => this.updateBodyCount())
        this.updateBodyCount()

        // Update settings panel with initial values
        updateSettingsPanelValues(config)

        console.log(`Created ${config.bodyCount} planets (${config.velocityMode} mode)`)
    }

    private bindControls(): void {
        // Play/Pause button
        const playPauseBtn = document.getElementById('playPauseBtn')
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayPause())
        }

        // Time controls
        const slowerBtn = document.getElementById('slowerButton')
        if (slowerBtn) {
            slowerBtn.addEventListener('click', () => {
                this.world.timeFactor *= 0.5
            })
        }

        const fasterBtn = document.getElementById('fasterButton')
        if (fasterBtn) {
            fasterBtn.addEventListener('click', () => {
                this.world.timeFactor *= 2
            })
        }

        // Settings button
        const settingsBtn = document.getElementById('settingsBtn')
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                toggleSettingsPanel()
            })
        }

        // Performance button
        const perfBtn = document.getElementById('perfBtn')
        if (perfBtn) {
            perfBtn.addEventListener('click', () => {
                togglePerfOverlay()
            })
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            if (document.activeElement?.tagName === 'INPUT') return

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault()
                    this.togglePlayPause()
                    break
                case 's':
                    toggleSettingsPanel()
                    break
                case 'p':
                    togglePerfOverlay()
                    break
            }
        })
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
