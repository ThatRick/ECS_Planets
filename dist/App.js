import Vec2 from './lib/Vector2.js';
import { World, Position, Velocity, Mass, Size, Temperature, CameraComponent, PhysicsConfig, GravitySystem, createCameraMovementSystem, createPlanetRenderer } from './ECS/index.js';
export default class App {
    canvas;
    world;
    constructor(canvas, width, height) {
        canvas.width = width;
        canvas.height = height;
        this.canvas = canvas;
        this.world = new World(100); // 100 Hz physics
        this.setup();
        // Main render loop
        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        loop();
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
        world.registerSystem(GravitySystem);
        // Visual systems (run on requestAnimationFrame)
        world.registerSystem(createCameraMovementSystem(this.canvas));
        world.registerSystem(createPlanetRenderer(this.canvas));
        // Bind UI controls
        world.bindControls();
        console.log(`Created ${config.bodyCount} planets`);
    }
    update() {
        this.world.updateVisuals();
    }
}
