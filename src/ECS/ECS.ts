import Vec2 from "../lib/Vector2"

import { Camera } from './components/index.js'

export * from './components/index.js'

export interface Entity
{
    name?: string
    visible?: boolean
    color?: string

    pos?: Vec2    
    vel?: Vec2
    
    mass?: number
    size?: number
    temperature?: number

    camera?: Camera
}

export abstract class SystemBase
{
    world: World
    
    abstract updateQuery(entities: Entity[])
    abstract update(dt: number)
}

class Ticker
{
    systems: SystemBase[]
    freq: number
    timeFactor = 1.0
    timer: number
    interval: number

    constructor(freq: number, systems: SystemBase[]) {
        this.systems = systems
        this.freq = freq
        this.interval = Math.round(1000 / freq)
    }
    start() {
        this.timer = setInterval(this.tick.bind(this), this.interval)
    }
    stop() {
        clearInterval(this.timer)
    }
    tick() {
        const dt = (this.interval / 1000) * this.timeFactor
        this.systems.forEach(sys => sys.update(dt))
    }
}

export class World
{
    private ticker: Ticker

    set timeFactor(factor: number) {
        this.ticker.timeFactor = factor
        document.getElementById('timeFactor').textContent = this.timeFactor.toFixed(2)
    }
    get timeFactor() { return this.ticker.timeFactor }
    
    start() {
        this.ticker.start()
        console.log('simulation started')
    }
    stop() {
        this.ticker.stop()
        console.log('simulation stopped')
    }
    tick() { this.ticker.tick() }

    private _entities: Set<Entity> = new Set()
    get entities() { return this._entityList }

    private simulationSystems: SystemBase[] = []
    private visualSystems: SystemBase[] = []

    constructor(freq: number)
    {
        console.log(this.simulationSystems.length)
        this.ticker = new Ticker(freq, this.simulationSystems)

        document.getElementById('startButton').addEventListener('click', () => this.start())
        document.getElementById('stopButton').addEventListener('click', () => this.stop())
        document.getElementById('slowerButton').addEventListener('click', () => this.timeFactor *= 0.5)
        document.getElementById('fasterButton').addEventListener('click', () => this.timeFactor *= 2)
    }

    registerSystems(systems: SystemBase[], useVisualUpdateLoop = false) {
        systems.forEach(sys => this.registerSystem(sys, useVisualUpdateLoop))
    }
    registerSystem(system: SystemBase, useVisualUpdateLoop = false) {
        if (useVisualUpdateLoop)
            this.visualSystems.push(system)
        else
            this.simulationSystems.push(system)

        system.updateQuery(this._entityList)
        system.world = this
    }
    addEntity(entity: Entity) {
        this._entities.add(entity)
        this.updateEntityList()
    }
    removeEntity(entity: Entity) {
        this._entities.delete(entity)
        this.updateEntityList()
    }
    addEntities(entities: Entity[]) {
        entities.forEach(entity => this._entities.add(entity))
        this.updateEntityList()
    }
    removeEntities(entities: Entity[]) {
        entities.forEach(entity => this._entities.delete(entity))
        this.updateEntityList()
    }
    updateVisuals() {
        const now = performance.now()
        const dt = now - this._lastUpdateTime || now
        this._lastUpdateTime = now
        
        this.visualSystems.forEach(system => system.update(dt / 1000))
    }

    private _lastUpdateTime: number

    private _entityList: Entity[]

    private updateEntityList() {
        this._entityList = Array.from(this._entities)
        this.simulationSystems.forEach(system => system.updateQuery(this._entityList))
        this.visualSystems.forEach(system => system.updateQuery(this._entityList))
    }
}

