import Vec3 from './lib/Vector3.js'
import { getStarlinkOrbitStatusCode } from './data/starlinkStatus.js'
import {
    World,
    Position,
    Velocity,
    Mass,
    Size,
    Color,
    Temperature,
    EarthTag,
    Orbit,
    CameraComponent,
    PhysicsConfig,
    GravitySystemSimple,
    GravitySystemBarnesHut,
    OrbitSystem,
    createCameraMovementSystem,
    createPlanetRenderer,
    createPlanetRendererWebGL,
    isWebGL2Available
} from './ECS/index.js'
import { PerfMonitor, createPerfOverlay, updatePerfOverlay, togglePerfOverlay } from './PerfMonitor.js'
import { createSettingsPanel, SimSettings, toggleSettingsPanel, updateSettingsPanelValues, VelocityMode, setGravityAlgoValue } from './SettingsPanel.js'
import { System } from './ECS/System.js'
import type { StarlinkOrbitStatusCode } from './data/starlinkStatus.js'

export type GravityType = 'simple' | 'barnes-hut'
export type RendererType = 'webgl' | 'canvas'
export type SceneId = 'proto-planets' | 'starlinks'

const GRAVITY_SYSTEMS: Record<GravityType, System> = {
    'simple': GravitySystemSimple,
    'barnes-hut': GravitySystemBarnesHut
}

// Unit conversions (matching SettingsPanel)
const KM_TO_M = 1000
const MASS_UNIT = 1e14

export default class App {
    canvas: HTMLCanvasElement
    world: World
    private bodyCountEl: HTMLElement | null
    private sceneNameEl: HTMLElement | null
    private sceneSelectEl: HTMLSelectElement | null
    private loadSceneBtn: HTMLButtonElement | null
    private simTimeStatusEl: HTMLElement | null
    private simTimeEl: HTMLElement | null
    private nowBtn: HTMLButtonElement | null
    private perfMonitor: PerfMonitor
    private currentGravityType: GravityType = 'barnes-hut'
    private currentRenderer: RendererType = 'canvas'
    private currentScene: SceneId = 'proto-planets'
    private isRunning: boolean = false
    private playPauseBtn: HTMLElement | null
    private sharedCameraSystem: System
    private sharedRendererSystem: System | null = null

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.bodyCountEl = document.getElementById('bodyCount')
        this.sceneNameEl = document.getElementById('sceneName')
        this.sceneSelectEl = document.getElementById('sceneSelect') as HTMLSelectElement | null
        this.loadSceneBtn = document.getElementById('loadSceneBtn') as HTMLButtonElement | null
        this.simTimeStatusEl = document.getElementById('simTimeStatus')
        this.simTimeEl = document.getElementById('simTimeDisplay')
        this.nowBtn = document.getElementById('nowButton') as HTMLButtonElement | null
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

        // Create shared visual systems once (avoid duplicated event listeners / GL init)
        this.sharedCameraSystem = createCameraMovementSystem(this.canvas)

        if (isWebGL2Available()) {
            this.sharedRendererSystem = createPlanetRendererWebGL(this.canvas)
            this.currentRenderer = 'webgl'
            console.log('Using WebGL 2 renderer (3D)')
        } else {
            console.warn('WebGL 2 not available - falling back to Canvas 2D renderer')
            this.sharedRendererSystem = createPlanetRenderer(this.canvas)
            this.currentRenderer = 'canvas'
        }
        this.updateRendererBadge()

        // Start with the default scene
        this.world = new World(100)
        this.setupProtoPlanets(this.world)
        this.wireWorldCallbacks(this.world)
        this.setSettingsEnabled(true)
        this.perfMonitor.reset()
        this.bindControls()
        this.updateStarlinksTimeUiVisibility()

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
        if (this.currentScene !== 'proto-planets') return
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
        if (this.currentScene !== 'proto-planets') return
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

    private updateStarlinksTimeUiVisibility(): void {
        const isStarlinks = this.currentScene === 'starlinks'
        this.simTimeStatusEl?.classList.toggle('hidden', !isStarlinks)
        this.nowBtn?.classList.toggle('hidden', !isStarlinks)
    }

    private updateStarlinksTimeUi(): void {
        if (this.currentScene !== 'starlinks') return
        if (!this.simTimeEl) return
        this.simTimeEl.textContent = formatUtcTimeMs(this.world.simTimeMs)
    }

    private jumpStarlinksToNow(): void {
        if (this.currentScene !== 'starlinks') return
        this.world.simTimeMs = Date.now()
        OrbitSystem.update(this.world, 0)
        this.updateStarlinksTimeUi()
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

    private setSettingsEnabled(enabled: boolean): void {
        const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement | null
        if (settingsBtn) {
            settingsBtn.disabled = !enabled
            settingsBtn.style.opacity = enabled ? '1' : '0.5'
            settingsBtn.style.cursor = enabled ? 'pointer' : 'default'
        }
        if (!enabled) {
            toggleSettingsPanel(false)
        }
    }

    private wireWorldCallbacks(world: World): void {
        world.on('entityRemoved', () => this.updateBodyCount())
        this.updateBodyCount()

        // Hook up simulation tick tracking for performance monitoring
        world.onSimTick = () => this.perfMonitor.simTick()
        world.onPhysicsStart = () => this.perfMonitor.physicsStart()
        world.onPhysicsEnd = () => this.perfMonitor.physicsEnd()
        world.onGravityTime = (ms) => this.perfMonitor.recordGravityTime(ms)
        world.onCollisionTime = (ms) => this.perfMonitor.recordCollisionTime(ms)
    }

    private setupProtoPlanets(world: World): void {
        // Initial configuration (matching SettingsPanel defaults)
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
        world.registerSystem(GRAVITY_SYSTEMS[this.currentGravityType])
        world.registerSystem(this.sharedCameraSystem)
        if (this.sharedRendererSystem) {
            world.registerSystem(this.sharedRendererSystem)
        }

        // Update settings panel with initial values
        updateSettingsPanelValues(config)
        setGravityAlgoValue(this.currentGravityType)

        console.log(`Created ${config.bodyCount} planets (${config.velocityMode} mode) in 3D`)
    }

    private async setupStarlinks(world: World): Promise<void> {
        const EARTH_RADIUS_M = 6_371_000
        const MU_EARTH = 3.986004418e14 // m^3 / s^2
        const MAX_SATELLITES = 2500
        const SAT_SIZE_M = 30_000

        world.timeFactor = 100
        world.simTimeMs = Date.now()

        // Camera focused on Earth
        const cameraEntity = world.createEntity()
        world.addComponent(cameraEntity, CameraComponent, {
            distance: EARTH_RADIUS_M * 3.2,
            theta: Math.PI / 4,
            phi: Math.PI / 7,
            zoom: 1.0
        })

        // Earth at origin
        const earth = world.createEntity()
        world.addComponent(earth, Position, new Vec3(0, 0, 0))
        world.addComponent(earth, Size, EARTH_RADIUS_M)
        world.addComponent(earth, Color, new Vec3(0.12, 0.35, 0.95))
        world.addComponent(earth, Temperature, 300)
        world.addComponent(earth, EarthTag, true)

        // Load live Starlink orbital data and spawn satellites
        let created = 0
        try {
            const candidates = await fetchStarlinkOrbits(MU_EARTH, MAX_SATELLITES)

            // Deterministic-ish shuffle so we don't bias toward any ordering
            shuffleInPlace(candidates)

            // Start simulation time from the dataset epoch (use the newest epoch across the set)
            let startEpochMs = 0
            for (const o of candidates) {
                if (Number.isFinite(o.epochMs) && o.epochMs > startEpochMs) startEpochMs = o.epochMs
            }
            if (startEpochMs > 0) {
                world.simTimeMs = startEpochMs
            }

            for (let i = 0; i < candidates.length && created < MAX_SATELLITES; i++) {
                const orbit = candidates[i]

                const entity = world.createEntity()
                const pos = new Vec3(0, 0, 0)
                world.addComponent(entity, Position, pos)
                world.addComponent(entity, Size, SAT_SIZE_M)
                world.addComponent(entity, Color, starlinkStatusToColor(getStarlinkOrbitStatusCode(orbit.noradId)))
                world.addComponent(entity, Temperature, 1000)
                const orbitComp = orbitToComponent(orbit)
                setOrbitTimeMs(orbitComp, world.simTimeMs)
                world.addComponent(entity, Orbit, orbitComp)

                // Set initial position even if the sim is paused
                setPositionFromOrbit(pos, orbitComp)

                created++
            }
        } catch (err) {
            console.warn('Failed to load live Starlink data; falling back to synthetic orbits.', err)

            // Fallback: synthetic shell
            for (let i = 0; i < Math.min(800, MAX_SATELLITES); i++) {
                const entity = world.createEntity()
                const pos = new Vec3(0, 0, 0)

                const altitude = 550_000 + (Math.random() - 0.5) * 50_000
                const a = EARTH_RADIUS_M + altitude
                const e = 0
                const meanMotionRadPerSec = Math.sqrt(MU_EARTH / (a * a * a))
                const M = Math.random() * Math.PI * 2
                const incl = degToRad(53 + (Math.random() - 0.5) * 4)
                const raan = Math.random() * Math.PI * 2
                const argPeri = Math.random() * Math.PI * 2

                const orbit = orbitToComponent({
                    noradId: 0,
                    semiMajorAxis: a,
                    eccentricity: e,
                    meanMotionRadPerSec,
                    epochMs: world.simTimeMs,
                    meanAnomalyAtEpoch: M,
                    inclinationRad: incl,
                    raanRad: raan,
                    argPeriapsisRad: argPeri
                })
                setOrbitTimeMs(orbit, world.simTimeMs)

                world.addComponent(entity, Position, pos)
                world.addComponent(entity, Size, SAT_SIZE_M)
                world.addComponent(entity, Color, new Vec3(1, 1, 1))
                world.addComponent(entity, Temperature, 1000)
                world.addComponent(entity, Orbit, orbit)

                setPositionFromOrbit(pos, orbit)
                created++
            }
        }

        world.registerSystem(OrbitSystem)
        world.registerSystem(this.sharedCameraSystem)
        if (this.sharedRendererSystem) {
            world.registerSystem(this.sharedRendererSystem)
        }

        console.log(`Starlinks scene loaded (${created} satellites)`)
    }

    async loadScene(scene: SceneId): Promise<void> {
        if (scene === this.currentScene) return

        const wasRunning = this.isRunning
        if (this.isRunning) {
            this.world.stop()
            this.isRunning = false
            this.updatePlayPauseButton()
        }

        if (this.loadSceneBtn) {
            this.loadSceneBtn.disabled = true
            this.loadSceneBtn.textContent = 'Loading…'
        }
        if (this.sceneSelectEl) {
            this.sceneSelectEl.disabled = true
        }

        const newWorld = new World(scene === 'proto-planets' ? 100 : 60)
        try {
            if (scene === 'proto-planets') {
                this.setupProtoPlanets(newWorld)
                this.setSettingsEnabled(true)
            } else {
                await this.setupStarlinks(newWorld)
                this.setSettingsEnabled(false)
            }

            this.world = newWorld
            this.currentScene = scene
            this.wireWorldCallbacks(newWorld)
            this.updateStarlinksTimeUiVisibility()
            this.updateStarlinksTimeUi()

            if (this.sceneNameEl) {
                this.sceneNameEl.textContent = scene === 'proto-planets' ? 'Proto planets' : 'Starlinks'
            }
            if (this.sceneSelectEl) {
                this.sceneSelectEl.value = scene
            }

            this.perfMonitor.reset()

            if (wasRunning) {
                this.world.start()
                this.isRunning = true
                this.updatePlayPauseButton()
            }
        } finally {
            if (this.loadSceneBtn) {
                this.loadSceneBtn.disabled = false
                this.loadSceneBtn.textContent = 'Load'
            }
            if (this.sceneSelectEl) {
                this.sceneSelectEl.disabled = false
            }
        }
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

        const nowBtn = document.getElementById('nowButton')
        if (nowBtn) {
            nowBtn.addEventListener('click', () => this.jumpStarlinksToNow())
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

        // Scene loader
        const loadSceneBtn = document.getElementById('loadSceneBtn')
        const sceneSelect = document.getElementById('sceneSelect') as HTMLSelectElement | null
        if (loadSceneBtn && sceneSelect) {
            loadSceneBtn.addEventListener('click', () => {
                void this.loadScene(sceneSelect.value as SceneId)
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
                    if (this.currentScene === 'proto-planets') {
                        toggleSettingsPanel()
                    }
                    break
                case 'p':
                    togglePerfOverlay()
                    break
            }
        })
    }

    private updateBodyCount(): void {
        if (this.bodyCountEl) {
            // Count renderable entities (Position + Size)
            const count = this.world.query(Position, Size).length
            this.bodyCountEl.textContent = String(count)
        }
    }

    update(): void {
        this.perfMonitor.frameStart()

        // Track visual systems (camera + rendering) time
        this.perfMonitor.renderStart()
        this.world.updateVisuals()
        this.perfMonitor.renderEnd()

        this.updateStarlinksTimeUi()

        const entityCount = this.world.query(Position, Size).length
        this.perfMonitor.frameEnd(entityCount)
    }
}

type SpaceXStarlinkRecord = {
    spaceTrack?: Record<string, unknown> | null
}

type TleApiResponse = {
    member?: TleApiTleRecord[]
    view?: { next?: string }
}

type TleApiTleRecord = {
    satelliteId?: number
    name?: string
    date?: string
    line1?: string
    line2?: string
}

type ParsedOrbit = {
    noradId: number
    semiMajorAxis: number
    eccentricity: number
    meanMotionRadPerSec: number
    epochMs: number
    meanAnomalyAtEpoch: number
    inclinationRad: number
    raanRad: number
    argPeriapsisRad: number
}

async function fetchStarlinkOrbits(muEarth: number, max: number): Promise<ParsedOrbit[]> {
    try {
        const orbits = await fetchStarlinkOrbitsFromTleApi(muEarth, max)
        if (orbits.length > 0) return orbits
    } catch (err) {
        console.warn('TLE API fetch failed; falling back to SpaceX API.', err)
    }

    const starlinks = await fetchStarlinks()
    return starlinks
        .map((rec) => parseStarlinkOrbit(rec, muEarth))
        .filter((o): o is ParsedOrbit => !!o)
        .slice(0, max)
}

async function fetchStarlinkOrbitsFromTleApi(muEarth: number, max: number): Promise<ParsedOrbit[]> {
    const pageSize = 100
    const maxPages = 60 // safety bound

    const seenIds = new Set<number>()
    const results: ParsedOrbit[] = []

    for (let page = 1; page <= maxPages && results.length < max; page++) {
        const url = `https://tle.ivanstanojevic.me/api/tle/?search=STARLINK&sort=popularity&sort-dir=desc&page-size=${pageSize}&page=${page}`
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`TLE API request failed: ${res.status} ${res.statusText}`)
        }

        const data = (await res.json()) as TleApiResponse
        const member = Array.isArray(data.member) ? data.member : []
        if (member.length === 0) break

        for (const rec of member) {
            const line1 = typeof rec.line1 === 'string' ? rec.line1 : ''
            const line2 = typeof rec.line2 === 'string' ? rec.line2 : ''
            const orbit = parseTleOrbit(line1, line2, muEarth)
            if (!orbit) continue
            if (seenIds.has(orbit.noradId)) continue
            seenIds.add(orbit.noradId)

            results.push(orbit)
            if (results.length >= max) break
        }

        if (!data.view?.next) break
    }

    return results
}

async function fetchStarlinks(): Promise<SpaceXStarlinkRecord[]> {
    const res = await fetch('https://api.spacexdata.com/v4/starlink')
    if (!res.ok) {
        throw new Error(`Starlink API request failed: ${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<SpaceXStarlinkRecord[]>
}

function parseStarlinkOrbit(rec: SpaceXStarlinkRecord, muEarth: number): ParsedOrbit | null {
    const st = rec.spaceTrack
    if (!st) return null

    // Ignore decayed objects when present
    const decay = st['DECAY_DATE']
    if (typeof decay === 'string' && decay.length > 0) return null

    const noradId = toNumber(st['NORAD_CAT_ID'])
    const epochRaw = st['EPOCH']
    const meanMotionRevPerDay = toNumber(st['MEAN_MOTION'])
    const eccentricity = toNumber(st['ECCENTRICITY'])
    const inclinationDeg = toNumber(st['INCLINATION'])
    const raanDeg = toNumber(st['RA_OF_ASC_NODE'])
    const argPeriDeg = toNumber(st['ARG_OF_PERICENTER'])
    const meanAnomalyDeg = toNumber(st['MEAN_ANOMALY'])

    if (
        !Number.isFinite(meanMotionRevPerDay) ||
        !Number.isFinite(eccentricity) ||
        !Number.isFinite(inclinationDeg) ||
        !Number.isFinite(raanDeg) ||
        !Number.isFinite(argPeriDeg) ||
        !Number.isFinite(meanAnomalyDeg)
    ) {
        return null
    }
    if (!Number.isFinite(noradId) || noradId <= 0) return null

    const meanMotionRadPerSec = (meanMotionRevPerDay * Math.PI * 2) / 86400
    if (!Number.isFinite(meanMotionRadPerSec) || meanMotionRadPerSec <= 0) return null

    // a = cbrt(mu / n^2)
    const semiMajorAxis = Math.cbrt(muEarth / (meanMotionRadPerSec * meanMotionRadPerSec))
    if (!Number.isFinite(semiMajorAxis) || semiMajorAxis <= 0) return null

    const epochMs = typeof epochRaw === 'string' ? Date.parse(epochRaw) : NaN
    if (!Number.isFinite(epochMs)) return null

    const inclinationRad = degToRad(inclinationDeg)
    const raanRad = degToRad(raanDeg)
    const argPeriapsisRad = degToRad(argPeriDeg)
    const meanAnomalyAtEpoch = wrapAngleRad(degToRad(meanAnomalyDeg))

    return {
        noradId,
        semiMajorAxis,
        eccentricity: Math.max(0, Math.min(0.99, eccentricity)),
        meanMotionRadPerSec,
        epochMs,
        meanAnomalyAtEpoch,
        inclinationRad,
        raanRad,
        argPeriapsisRad
    }
}

function parseTleOrbit(line1: string, line2: string, muEarth: number): ParsedOrbit | null {
    // TLE line 1 epoch: columns 19-32 (1-based), format YYDDD.DDDDDDDD
    if (line1.length < 32 || line2.length < 63) return null

    const noradMatch = line1.match(/^1\\s+(\\d{1,6})/)
    const noradId = noradMatch ? parseInt(noradMatch[1], 10) : NaN
    if (!Number.isFinite(noradId) || noradId <= 0) return null

    const epochField = line1.substring(18, 32).trim()
    const epochMs = parseTleEpochMs(epochField)
    if (!Number.isFinite(epochMs)) return null

    const inclinationDeg = toNumber(line2.substring(8, 16))
    const raanDeg = toNumber(line2.substring(17, 25))
    const eccentricity = parseFloat(`0.${line2.substring(26, 33).trim()}`)
    const argPeriDeg = toNumber(line2.substring(34, 42))
    const meanAnomalyDeg = toNumber(line2.substring(43, 51))
    const meanMotionRevPerDay = toNumber(line2.substring(52, 63))

    if (
        !Number.isFinite(inclinationDeg) ||
        !Number.isFinite(raanDeg) ||
        !Number.isFinite(eccentricity) ||
        !Number.isFinite(argPeriDeg) ||
        !Number.isFinite(meanAnomalyDeg) ||
        !Number.isFinite(meanMotionRevPerDay)
    ) {
        return null
    }

    const meanMotionRadPerSec = (meanMotionRevPerDay * Math.PI * 2) / 86400
    if (!Number.isFinite(meanMotionRadPerSec) || meanMotionRadPerSec <= 0) return null

    const semiMajorAxis = Math.cbrt(muEarth / (meanMotionRadPerSec * meanMotionRadPerSec))
    if (!Number.isFinite(semiMajorAxis) || semiMajorAxis <= 0) return null

    const inclinationRad = degToRad(inclinationDeg)
    const raanRad = degToRad(raanDeg)
    const argPeriapsisRad = degToRad(argPeriDeg)
    const meanAnomalyAtEpoch = wrapAngleRad(degToRad(meanAnomalyDeg))

    return {
        noradId,
        semiMajorAxis,
        eccentricity: Math.max(0, Math.min(0.99, eccentricity)),
        meanMotionRadPerSec,
        epochMs,
        meanAnomalyAtEpoch,
        inclinationRad,
        raanRad,
        argPeriapsisRad
    }
}

function parseTleEpochMs(epoch: string): number {
    // YYDDD.DDDDDDDD
    if (epoch.length < 5) return NaN

    const yy = parseInt(epoch.slice(0, 2), 10)
    if (!Number.isFinite(yy)) return NaN
    const year = yy < 57 ? 2000 + yy : 1900 + yy

    const dayOfYear = parseFloat(epoch.slice(2))
    if (!Number.isFinite(dayOfYear)) return NaN

    const day = Math.floor(dayOfYear)
    const dayFraction = dayOfYear - day

    // UTC
    const msAtYearStart = Date.UTC(year, 0, 1, 0, 0, 0, 0)
    const ms = msAtYearStart
        + (day - 1) * 86400 * 1000
        + dayFraction * 86400 * 1000

    return ms
}

function orbitToComponent(orbit: ParsedOrbit) {
    const cosO = Math.cos(orbit.raanRad)
    const sinO = Math.sin(orbit.raanRad)
    const cosI = Math.cos(orbit.inclinationRad)
    const sinI = Math.sin(orbit.inclinationRad)
    const cosW = Math.cos(orbit.argPeriapsisRad)
    const sinW = Math.sin(orbit.argPeriapsisRad)

    // Perifocal -> inertial rotation (only XY columns needed since z=0)
    const m11 = cosO * cosW - sinO * sinW * cosI
    const m12 = -cosO * sinW - sinO * cosW * cosI
    const m21 = sinO * cosW + cosO * sinW * cosI
    const m22 = -sinO * sinW + cosO * cosW * cosI
    const m31 = sinW * sinI
    const m32 = cosW * sinI

    return {
        semiMajorAxis: orbit.semiMajorAxis,
        eccentricity: orbit.eccentricity,
        meanMotionRadPerSec: orbit.meanMotionRadPerSec,
        meanAnomaly: orbit.meanAnomalyAtEpoch,
        epochMs: orbit.epochMs,
        meanAnomalyAtEpoch: orbit.meanAnomalyAtEpoch,
        m11,
        m12,
        m21,
        m22,
        m31,
        m32
    }
}

function setOrbitTimeMs(orbit: {
    meanMotionRadPerSec: number
    epochMs: number
    meanAnomalyAtEpoch: number
    meanAnomaly: number
}, simTimeMs: number): void {
    const dtSec = (simTimeMs - orbit.epochMs) / 1000
    orbit.meanAnomaly = wrapAngleRad(orbit.meanAnomalyAtEpoch + orbit.meanMotionRadPerSec * dtSec)
}

function setPositionFromOrbit(pos: Vec3, orbit: {
    semiMajorAxis: number
    eccentricity: number
    meanAnomaly: number
    m11: number
    m12: number
    m21: number
    m22: number
    m31: number
    m32: number
}): void {
    const e = orbit.eccentricity
    const a = orbit.semiMajorAxis
    const M = orbit.meanAnomaly

    let xPerif: number
    let yPerif: number

    if (e < 1e-6) {
        xPerif = a * Math.cos(M)
        yPerif = a * Math.sin(M)
    } else {
        const E = solveKeplerE(M, e)
        const cosE = Math.cos(E)
        const sinE = Math.sin(E)
        const sqrtOneMinusESq = Math.sqrt(1 - e * e)
        xPerif = a * (cosE - e)
        yPerif = a * (sqrtOneMinusESq * sinE)
    }

    const xEci = orbit.m11 * xPerif + orbit.m12 * yPerif
    const yEci = orbit.m21 * xPerif + orbit.m22 * yPerif
    const zEci = orbit.m31 * xPerif + orbit.m32 * yPerif

    pos.x = xEci
    pos.y = zEci
    pos.z = yEci
}

function solveKeplerE(M: number, e: number): number {
    let E = M
    for (let i = 0; i < 6; i++) {
        const f = E - e * Math.sin(E) - M
        const fp = 1 - e * Math.cos(E)
        E -= f / fp
    }
    return E
}

const STARLINK_STATUS_COLORS: Record<string, Vec3> = {
    // Working / in-service-ish
    O: new Vec3(0.25, 0.95, 0.35), // operational shell
    A: new Vec3(0.25, 0.75, 1.0),  // ascent
    D: new Vec3(0.35, 0.45, 1.0),  // drift
    T: new Vec3(0.7, 0.45, 1.0),   // reserve / relocating
    S: new Vec3(1.0, 0.45, 0.9),   // special

    // Maneuvering / out-of-constellation
    L: new Vec3(1.0, 0.95, 0.25),  // lowered
    R: new Vec3(1.0, 0.65, 0.25),  // retiring / disposal underway
    U: new Vec3(1.0, 0.35, 0.25),  // anomalous

    // Failed / decaying / down
    F: new Vec3(1.0, 0.15, 0.15),  // screened / early deorbit
    M: new Vec3(0.75, 0.15, 0.15), // dead / uncontrolled decay
    f: new Vec3(0.6, 0.6, 0.6),    // failed to orbit
    G: new Vec3(0.5, 0.5, 0.5),    // graveyard

    unknown: new Vec3(0.85, 0.85, 0.85)
}

function starlinkStatusToColor(code: StarlinkOrbitStatusCode | undefined): Vec3 {
    return STARLINK_STATUS_COLORS[code ?? 'unknown'] ?? STARLINK_STATUS_COLORS.unknown
}

function formatUtcTimeMs(ms: number): string {
    if (!Number.isFinite(ms)) return '--'
    try {
        const iso = new Date(ms).toISOString()
        return iso.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
    } catch {
        return '--'
    }
}

function toNumber(v: unknown): number {
    if (typeof v === 'number') return v
    if (typeof v === 'string') return parseFloat(v)
    return NaN
}

function degToRad(deg: number): number {
    return (deg * Math.PI) / 180
}

function wrapAngleRad(rad: number): number {
    const TWO_PI = Math.PI * 2
    rad %= TWO_PI
    if (rad < 0) rad += TWO_PI
    return rad
}

function shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = arr[i]
        arr[i] = arr[j]
        arr[j] = tmp
    }
}
