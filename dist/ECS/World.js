import { ALL_COMPONENTS } from './Components.js';
/**
 * ECS World with sparse-set component storage.
 *
 * Features:
 * - Type-safe component access via symbols
 * - Efficient entity queries using sparse sets
 * - Deferred entity removal for safe iteration
 * - Event system for lifecycle hooks
 * - Dual update loops (simulation + visual)
 */
export class World {
    nextEntityId = 0;
    entities = new Set();
    components = new Map();
    pendingRemoval = new Set();
    // Event system
    eventListeners = new Map();
    // Systems
    simulationSystems = [];
    visualSystems = [];
    // Time management
    ticker;
    _lastVisualUpdate = 0;
    constructor(simulationFrequency = 60) {
        this.ticker = new Ticker(simulationFrequency, () => this.tickSimulation());
        // Initialize component storage for all known components
        for (const key of ALL_COMPONENTS) {
            this.components.set(key, new Map());
        }
    }
    // ==================== Time Factor ====================
    set timeFactor(factor) {
        this.ticker.timeFactor = factor;
        const el = document.getElementById('timeFactor');
        if (el)
            el.textContent = factor.toFixed(2);
    }
    get timeFactor() {
        return this.ticker.timeFactor;
    }
    // ==================== Simulation Control ====================
    start() {
        this.ticker.start();
        console.log('Simulation started');
    }
    stop() {
        this.ticker.stop();
        console.log('Simulation stopped');
    }
    tickSimulation() {
        const dt = this.ticker.getDeltaTime();
        for (const system of this.simulationSystems) {
            system.update(this, dt);
        }
        this.flush();
    }
    updateVisuals() {
        const now = performance.now();
        const dt = (now - this._lastVisualUpdate) / 1000 || 0;
        this._lastVisualUpdate = now;
        for (const system of this.visualSystems) {
            system.update(this, dt);
        }
    }
    // ==================== Entity Management ====================
    createEntity() {
        const id = this.nextEntityId++;
        this.entities.add(id);
        this.emit('entityCreated', { entity: id });
        return id;
    }
    removeEntity(entity) {
        this.pendingRemoval.add(entity);
    }
    hasEntity(entity) {
        return this.entities.has(entity) && !this.pendingRemoval.has(entity);
    }
    getEntityCount() {
        return this.entities.size - this.pendingRemoval.size;
    }
    /**
     * Process pending entity removals.
     * Called automatically after each simulation tick.
     */
    flush() {
        for (const entity of this.pendingRemoval) {
            // Remove all components
            for (const storage of this.components.values()) {
                storage.delete(entity);
            }
            this.entities.delete(entity);
            this.emit('entityRemoved', { entity });
        }
        this.pendingRemoval.clear();
    }
    // ==================== Component Management ====================
    addComponent(entity, key, value) {
        const storage = this.components.get(key);
        if (!storage) {
            throw new Error(`Unknown component type: ${String(key)}`);
        }
        storage.set(entity, value);
        this.emit('componentAdded', { entity, component: key });
    }
    removeComponent(entity, key) {
        const storage = this.components.get(key);
        if (storage?.has(entity)) {
            storage.delete(entity);
            this.emit('componentRemoved', { entity, component: key });
        }
    }
    getComponent(entity, key) {
        return this.components.get(key)?.get(entity);
    }
    hasComponent(entity, key) {
        return this.components.get(key)?.has(entity) ?? false;
    }
    /**
     * Set or update a component value.
     * Creates the component if it doesn't exist.
     */
    setComponent(entity, key, value) {
        this.addComponent(entity, key, value);
    }
    // ==================== Queries ====================
    /**
     * Query entities that have ALL specified components.
     * Uses the smallest component set for efficiency.
     */
    query(...keys) {
        if (keys.length === 0) {
            return Array.from(this.entities).filter(id => !this.pendingRemoval.has(id));
        }
        // Find the smallest component storage for initial iteration
        let smallest;
        let smallestSize = Infinity;
        for (const key of keys) {
            const storage = this.components.get(key);
            if (!storage || storage.size === 0) {
                return []; // No entities have this component
            }
            if (storage.size < smallestSize) {
                smallest = storage;
                smallestSize = storage.size;
            }
        }
        if (!smallest)
            return [];
        // Filter to entities that have all components and aren't pending removal
        return Array.from(smallest.keys()).filter(entity => {
            if (this.pendingRemoval.has(entity))
                return false;
            return keys.every(key => this.components.get(key)?.has(entity));
        });
    }
    /**
     * Query for a single entity with the specified components.
     * Useful for singleton components like Camera.
     */
    querySingle(...keys) {
        const results = this.query(...keys);
        return results[0];
    }
    // ==================== System Management ====================
    registerSystem(system) {
        system.init?.(this);
        if (system.phase === 'visual') {
            this.visualSystems.push(system);
        }
        else {
            this.simulationSystems.push(system);
        }
    }
    registerSystems(systems) {
        for (const system of systems) {
            this.registerSystem(system);
        }
    }
    // ==================== Events ====================
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }
    off(event, callback) {
        this.eventListeners.get(event)?.delete(callback);
    }
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const callback of listeners) {
                callback(data);
            }
        }
    }
    // ==================== UI Bindings ====================
    bindControls() {
        document.getElementById('startButton')?.addEventListener('click', () => this.start());
        document.getElementById('stopButton')?.addEventListener('click', () => this.stop());
        document.getElementById('slowerButton')?.addEventListener('click', () => this.timeFactor *= 0.5);
        document.getElementById('fasterButton')?.addEventListener('click', () => this.timeFactor *= 2);
    }
}
/**
 * Fixed-timestep ticker for physics simulation.
 */
class Ticker {
    frequency;
    callback;
    interval;
    timer = null;
    timeFactor = 1.0;
    constructor(frequency, callback) {
        this.frequency = frequency;
        this.callback = callback;
        this.interval = Math.round(1000 / frequency);
    }
    start() {
        if (this.timer !== null)
            return;
        this.timer = window.setInterval(() => this.callback(), this.interval);
    }
    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    getDeltaTime() {
        return (this.interval / 1000) * this.timeFactor;
    }
}
