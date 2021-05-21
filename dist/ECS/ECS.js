export * from './components/index.js';
export class SystemBase {
}
class Ticker {
    constructor(freq, systems) {
        this.timeFactor = 1.0;
        this.systems = systems;
        this.freq = freq;
        this.interval = Math.round(1000 / freq);
    }
    start() {
        this.timer = setInterval(this.tick.bind(this), this.interval);
    }
    stop() {
        clearInterval(this.timer);
    }
    tick() {
        const dt = (this.interval / 1000) * this.timeFactor;
        this.systems.forEach(sys => sys.update(dt));
    }
}
export class World {
    constructor(freq) {
        this._entities = new Set();
        this.simulationSystems = [];
        this.visualSystems = [];
        console.log(this.simulationSystems.length);
        this.ticker = new Ticker(freq, this.simulationSystems);
        document.getElementById('startButton').addEventListener('click', () => this.start());
        document.getElementById('stopButton').addEventListener('click', () => this.stop());
        document.getElementById('slowerButton').addEventListener('click', () => this.timeFactor *= 0.5);
        document.getElementById('fasterButton').addEventListener('click', () => this.timeFactor *= 2);
    }
    set timeFactor(factor) {
        this.ticker.timeFactor = factor;
        document.getElementById('timeFactor').textContent = this.timeFactor.toFixed(2);
    }
    get timeFactor() { return this.ticker.timeFactor; }
    start() {
        this.ticker.start();
        console.log('simulation started');
    }
    stop() {
        this.ticker.stop();
        console.log('simulation stopped');
    }
    tick() { this.ticker.tick(); }
    get entities() { return this._entityList; }
    registerSystems(systems, useVisualUpdateLoop = false) {
        systems.forEach(sys => this.registerSystem(sys, useVisualUpdateLoop));
    }
    registerSystem(system, useVisualUpdateLoop = false) {
        if (useVisualUpdateLoop)
            this.visualSystems.push(system);
        else
            this.simulationSystems.push(system);
        system.updateQuery(this._entityList);
        system.world = this;
    }
    addEntity(entity) {
        this._entities.add(entity);
        this.updateEntityList();
    }
    removeEntity(entity) {
        this._entities.delete(entity);
        this.updateEntityList();
    }
    addEntities(entities) {
        entities.forEach(entity => this._entities.add(entity));
        this.updateEntityList();
    }
    removeEntities(entities) {
        entities.forEach(entity => this._entities.delete(entity));
        this.updateEntityList();
    }
    updateVisuals() {
        const now = performance.now();
        const dt = now - this._lastUpdateTime || now;
        this._lastUpdateTime = now;
        this.visualSystems.forEach(system => system.update(dt / 1000));
    }
    updateEntityList() {
        this._entityList = Array.from(this._entities);
        this.simulationSystems.forEach(system => system.updateQuery(this._entityList));
        this.visualSystems.forEach(system => system.updateQuery(this._entityList));
    }
}
