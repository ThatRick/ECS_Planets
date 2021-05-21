import Vec2 from './lib/Vector2.js';
import * as ECS from './ECS/ECS.js';
import { PlanetBodyRenderer, GravitySystem, MovementSystem, CameraMovementSystem, } from './ECS/systems/index.js';
export default class App {
    constructor(canvas, width, heigth) {
        this.ecs = new ECS.World(100);
        canvas.width = width;
        canvas.height = heigth;
        this.canvas = canvas;
        this.setup();
        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        loop();
    }
    setup() {
        const { width, height } = this.canvas;
        const massMin = 1e14;
        const massMax = 4e14;
        const bodyCount = 300;
        const radiusMin = 1000;
        const radiusMax = 500000;
        this.ecs.timeFactor = 100;
        const points = Array.from({ length: bodyCount }).map(i => {
            const r = radiusMin + (Math.random() * (radiusMax - radiusMin));
            const ang = Vec2.randomRay();
            const pos = Vec2.scale(ang, r);
            const vel = Vec2.rotate(ang, Math.PI / 2).scale(Math.sqrt(100 / r));
            const mass = massMin + (massMax - massMin) * Math.random();
            const size = GravitySystem.bodySize(mass);
            return {
                pos,
                vel,
                size,
                mass
            };
        });
        const camera = {
            camera: {
                zoom: height / radiusMax * 0.5,
                offset: new Vec2(width / 2, height / 2)
            }
        };
        this.ecs.addEntity(camera);
        const entities = points.map(body => ({
            ...body,
            temperature: 100
        }));
        this.ecs.addEntities(entities);
        this.renderer = new PlanetBodyRenderer(this.canvas);
        this.ecs.registerSystems([
            new GravitySystem(),
            new MovementSystem(),
        ]);
        this.ecs.registerSystems([
            new CameraMovementSystem(this.canvas),
            this.renderer,
        ], true);
        //this.ecs.start()
    }
    update() {
        this.ecs.updateVisuals();
    }
}
