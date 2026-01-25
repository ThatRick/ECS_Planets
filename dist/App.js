import Vec2 from './lib/Vector2.js';
import { World, Position, Velocity, Mass, Size, Temperature, CameraComponent, PhysicsConfig, GravitySystemOptimized, GravitySystemBarnesHut, createCameraMovementSystem, createPlanetRenderer, createPlanetRendererWebGL, isWebGL2Available } from './ECS/index.js';
import { PerfMonitor, createPerfOverlay, updatePerfOverlay, togglePerfOverlay } from './PerfMonitor.js';
import { createSettingsPanel, toggleSettingsPanel, updateSettingsPanelValues } from './SettingsPanel.js';
const GRAVITY_SYSTEMS = {
    'optimized': GravitySystemOptimized,
    'barnes-hut': GravitySystemBarnesHut
};
export default class App {
    canvas;
    world;
    bodyCountEl;
    perfMonitor;
    currentGravityType = 'optimized';
    currentRenderer = 'canvas';
    isRunning = false;
    playPauseBtn;
    constructor(canvas) {
        this.canvas = canvas;
        this.bodyCountEl = document.getElementById('bodyCount');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.perfMonitor = new PerfMonitor();
        // Add performance overlay (hidden by default)
        const overlay = createPerfOverlay();
        document.body.appendChild(overlay);
        this.perfMonitor.onUpdate = updatePerfOverlay;
        // Add settings panel
        const settingsPanel = createSettingsPanel((settings) => this.resetSimulation(settings), (gravityType) => this.switchGravitySystem(gravityType));
        document.body.appendChild(settingsPanel);
        // Set up responsive canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        // Handle orientation change on mobile
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.resizeCanvas(), 100);
        });
        this.world = new World(100); // 100 Hz physics
        this.setup();
        this.bindControls();
        // Main render loop
        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        loop();
    }
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
    }
    getGravityType() {
        return this.currentGravityType;
    }
    switchGravitySystem(type) {
        if (type === this.currentGravityType)
            return;
        // Remove current gravity system
        const currentSystem = GRAVITY_SYSTEMS[this.currentGravityType];
        this.world.unregisterSystem(currentSystem.name);
        // Add new gravity system
        const newSystem = GRAVITY_SYSTEMS[type];
        this.world.registerSystem(newSystem);
        this.currentGravityType = type;
        console.log(`Switched to ${type} gravity system`);
        this.perfMonitor.reset();
    }
    resetSimulation(settings) {
        // Clear all entities except camera
        const entities = this.world.query(Position, Velocity, Mass);
        for (const id of entities) {
            this.world.removeEntity(id);
        }
        this.world.flush();
        for (let i = 0; i < settings.bodyCount; i++) {
            const entity = this.world.createEntity();
            const r = settings.radiusMin + Math.random() * (settings.radiusMax - settings.radiusMin);
            const angle = Vec2.randomRay();
            const pos = Vec2.scale(angle, r);
            const vel = Vec2.rotate(angle, Math.PI / 2).scale((settings.orbitVelocity / r) ** 1.1);
            const mass = settings.massMin + (settings.massMax - settings.massMin) * Math.random();
            const size = PhysicsConfig.bodySize(mass);
            this.world.addComponent(entity, Position, pos);
            this.world.addComponent(entity, Velocity, vel);
            this.world.addComponent(entity, Mass, mass);
            this.world.addComponent(entity, Size, size);
            this.world.addComponent(entity, Temperature, settings.initialTemp);
        }
        this.updateBodyCount();
        this.perfMonitor.reset();
        console.log(`Reset with ${settings.bodyCount} entities`);
    }
    updateRendererBadge() {
        const badge = document.getElementById('rendererBadge');
        if (badge) {
            badge.textContent = this.currentRenderer === 'webgl' ? 'WebGL 2' : 'Canvas 2D';
            badge.className = `renderer-badge ${this.currentRenderer}`;
        }
    }
    updatePlayPauseButton() {
        if (this.playPauseBtn) {
            this.playPauseBtn.textContent = this.isRunning ? 'Pause' : 'Start';
            this.playPauseBtn.classList.toggle('running', this.isRunning);
        }
    }
    togglePlayPause() {
        if (this.isRunning) {
            this.world.stop();
            this.isRunning = false;
        }
        else {
            this.world.start();
            this.isRunning = true;
        }
        this.updatePlayPauseButton();
    }
    setup() {
        const { width, height } = this.canvas;
        const world = this.world;
        // Configuration
        const config = {
            bodyCount: 300,
            massMin: 1e14,
            massMax: 4e14,
            radiusMin: 10000,
            radiusMax: 500000,
            orbitVel: 100000,
            initialTemp: 100
        };
        // Time factor for simulation speed
        world.timeFactor = 100;
        // Create camera entity
        const cameraEntity = world.createEntity();
        world.addComponent(cameraEntity, CameraComponent, {
            zoom: height / config.radiusMax * 0.5,
            offset: new Vec2(width / 2, height / 2)
        });
        // Create planet entities
        for (let i = 0; i < config.bodyCount; i++) {
            const entity = world.createEntity();
            // Random position in disk
            const r = config.radiusMin + Math.random() * (config.radiusMax - config.radiusMin);
            const angle = Vec2.randomRay();
            const pos = Vec2.scale(angle, r);
            // Velocity perpendicular to radius for quasi-orbital motion
            // Using r^(-1.1) for slightly steeper than circular orbit
            const vel = Vec2.rotate(angle, Math.PI / 2).scale((config.orbitVel / r) ** 1.1);
            // Random mass
            const mass = config.massMin + (config.massMax - config.massMin) * Math.random();
            const size = PhysicsConfig.bodySize(mass);
            world.addComponent(entity, Position, pos);
            world.addComponent(entity, Velocity, vel);
            world.addComponent(entity, Mass, mass);
            world.addComponent(entity, Size, size);
            world.addComponent(entity, Temperature, config.initialTemp);
        }
        // Register systems
        // Simulation systems (run on fixed timestep)
        world.registerSystem(GravitySystemOptimized);
        // Visual systems (run on requestAnimationFrame)
        world.registerSystem(createCameraMovementSystem(this.canvas));
        // Use WebGL renderer if available, fallback to Canvas 2D
        if (isWebGL2Available()) {
            world.registerSystem(createPlanetRendererWebGL(this.canvas));
            this.currentRenderer = 'webgl';
            console.log('Using WebGL 2 renderer');
        }
        else {
            world.registerSystem(createPlanetRenderer(this.canvas));
            this.currentRenderer = 'canvas';
            console.log('WebGL 2 not available, using Canvas 2D renderer');
        }
        this.updateRendererBadge();
        // Update body count when entities are removed
        world.on('entityRemoved', () => this.updateBodyCount());
        this.updateBodyCount();
        // Update settings panel with initial values
        updateSettingsPanelValues({
            bodyCount: config.bodyCount,
            radiusMin: config.radiusMin,
            radiusMax: config.radiusMax,
            massMin: config.massMin,
            massMax: config.massMax,
            orbitVelocity: config.orbitVel,
            initialTemp: config.initialTemp
        });
        console.log(`Created ${config.bodyCount} planets`);
    }
    bindControls() {
        // Play/Pause button
        this.playPauseBtn?.addEventListener('click', () => this.togglePlayPause());
        // Time controls
        document.getElementById('slowerButton')?.addEventListener('click', () => {
            this.world.timeFactor *= 0.5;
        });
        document.getElementById('fasterButton')?.addEventListener('click', () => {
            this.world.timeFactor *= 2;
        });
        // Settings button
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            toggleSettingsPanel();
        });
        // Performance button
        document.getElementById('perfBtn')?.addEventListener('click', () => {
            togglePerfOverlay();
        });
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            if (document.activeElement?.tagName === 'INPUT')
                return;
            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 's':
                    toggleSettingsPanel();
                    break;
                case 'p':
                    togglePerfOverlay();
                    break;
            }
        });
    }
    updateBodyCount() {
        if (this.bodyCountEl) {
            // Count entities with Mass component (planets only, not camera)
            const count = this.world.query(Mass).length;
            this.bodyCountEl.textContent = String(count);
        }
    }
    update() {
        this.perfMonitor.frameStart();
        this.perfMonitor.physicsStart();
        // Physics runs inside updateVisuals via fixed timestep
        this.world.updateVisuals();
        this.perfMonitor.physicsEnd();
        const entityCount = this.world.query(Mass).length;
        this.perfMonitor.frameEnd(entityCount);
    }
}
