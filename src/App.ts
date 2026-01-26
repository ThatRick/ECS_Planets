import Vec3 from './lib/Vector3.js'
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
     * Calculate initial velocity based on mode (3D)
     * - Static: Small random velocities in all directions
     * - Orbital: Tangential velocity in XZ plane (thin disc)
     * - Collapse: Random velocities scaled by distance
     */
    private calculateVelocity(
        pos: Vec3,
        r: number,
        mode: VelocityMode,
        scale: number,
        totalMass: number
    ): Vec3 {
        switch (mode) {
            case 'orbital': {
                // Keplerian orbital velocity in XZ plane: v = sqrt(G * M / r)
                // Scale adjusts how circular the orbit is (1.0 = circular)
                const G = PhysicsConfig.G
                // Use distance in XZ plane for orbital calculation
                const rXZ = Math.sqrt(pos.x * pos.x + pos.z * pos.z)
                const orbitalSpeed = Math.sqrt(G * totalMass / Math.max(rXZ, 1)) * scale
                // Perpendicular to radius in XZ plane (tangential)
                const angle = Math.atan2(pos.z, pos.x)
                return new Vec3(
                    -Math.sin(angle) * orbitalSpeed,
                    0,  // No Y velocity for disc
                    Math.cos(angle) * orbitalSpeed
                )
            }
            case 'collapse': {
                // Random velocity scaled by distance (more uniform cloud)
                // Small random velocities for interesting collapse dynamics
                const maxSpeed = Math.sqrt(r) * scale * 0.5
                return new Vec3(
                    (Math.random() - 0.5) * maxSpeed,
                    (Math.random() - 0.5) * maxSpeed,
                    (Math.random() - 0.5) * maxSpeed
                )
            }
            case 'static':
            default: {
                // Small random velocities for 3D point cloud
                const smallSpeed = scale * 10  // Small random velocities
                return new Vec3(
                    (Math.random() - 0.5) * smallSpeed,
                    (Math.random() - 0.5) * smallSpeed,
                    (Math.random() - 0.5) * smallSpeed
                )
            }
        }
    }

    /**
     * Generate 3D position based on velocity mode
     * - Static: Spherical distribution (3D point cloud)
     * - Orbital: Thin disc in XZ plane
     * - Collapse: Spherical shell (annulus in 3D)
     */
    private generatePosition(
        radiusMin: number,
        radiusMax: number,
        mode: VelocityMode
    ): Vec3 {
        const r = radiusMin + Math.random() * (radiusMax - radiusMin)

        if (mode === 'orbital') {
            // Thin disc: small Y variation, full XZ distribution
            const angle = Math.random() * Math.PI * 2
            const discThickness = (radiusMax - radiusMin) * 0.05  // 5% of radius range
            return new Vec3(
                Math.cos(angle) * r,
                (Math.random() - 0.5) * discThickness,
                Math.sin(angle) * r
            )
        } else {
            // Spherical distribution for static and collapse modes
            // Use rejection sampling for uniform sphere distribution
            let x, y, z, lenSq
            do {
                x = Math.random() * 2 - 1
                y = Math.random() * 2 - 1
                z = Math.random() * 2 - 1
                lenSq = x * x + y * y + z * z
            } while (lenSq > 1 || lenSq === 0)

            const len = Math.sqrt(lenSq)
            return new Vec3(
                (x / len) * r,
                (y / len) * r,
                (z / len) * r
            )
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

            // Generate 3D position based on mode
            const pos = this.generatePosition(
                settings.radiusMin,
                settings.radiusMax,
                settings.velocityMode
            )
            const r = pos.len()

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

        // Update camera distance based on new radius
        const cameraEntity = this.world.querySingle(CameraComponent)
        if (cameraEntity !== undefined) {
            const camera = this.world.getComponent(cameraEntity, CameraComponent)!
            camera.distance = settings.radiusMax * 3
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

        // Create camera entity with 3D spherical coordinates
        const cameraEntity = world.createEntity()
        world.addComponent(cameraEntity, CameraComponent, {
            distance: config.radiusMax * 3,  // Camera distance from origin
            theta: Math.PI / 4,              // Horizontal rotation (45°)
            phi: Math.PI / 6,                // Vertical rotation (30° elevation)
            zoom: 1.0                        // FOV zoom factor
        })

        // Estimate total mass for orbital calculations
        const avgMass = (config.massMin + config.massMax) / 2
        const totalMass = avgMass * config.bodyCount

        // Create planet entities
        for (let i = 0; i < config.bodyCount; i++) {
            const entity = world.createEntity()

            // Generate 3D position based on mode
            const pos = this.generatePosition(
                config.radiusMin,
                config.radiusMax,
                config.velocityMode
            )
            const r = pos.len()

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

        // Use WebGL renderer (required for 3D)
        if (isWebGL2Available()) {
            world.registerSystem(createPlanetRendererWebGL(this.canvas))
            this.currentRenderer = 'webgl'
            console.log('Using WebGL 2 renderer (3D)')
        } else {
            console.error('WebGL 2 not available - 3D rendering requires WebGL 2')
            this.currentRenderer = 'canvas'
        }
        this.updateRendererBadge()

        // Update body count when entities are removed
        world.on('entityRemoved', () => this.updateBodyCount())
        this.updateBodyCount()

        // Update settings panel with initial values
        updateSettingsPanelValues(config)

        console.log(`Created ${config.bodyCount} planets (${config.velocityMode} mode) in 3D`)
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
