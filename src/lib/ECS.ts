
type Constr<T> = { new(...args: unknown[]): T }

export class ComponentManager<T extends Component>
{
    components: T[] = []
    
    constructor(private TCreator: { new (): T }) {}
    
    add(id: number, data?: Partial<T>) {
        const component = new this.TCreator()
        Object.assign(component, data)
        this.components[id] = component
    }

    remove(id: number) {
        delete this.components[id]
    }

    get(id: number): T
    {
        return this.components[id]
    }
}

export abstract class Component
{
    static Manager: ComponentManager<unknown>
}

export abstract class System
{
    world: World
    queryResults: number[]
    
    updateQuery(entities: number[]) {}
    update(dt: number) {}
}

export class World
{
    components: Set<Constr<any>> = new Set()
    timeFactor = 1.0

    registerComponent<C>(constr: Constr<C>)
    {
        this.components.add(constr)
    }

    getComponent<C>(constr: Constr<C>): C
    {
        for (const comp of this.components) {
            if (comp instanceof constr) {
                return comp as C
            }
        }
    }

    registerSystem(system: System) {
        system.world = this
        this.systems.push(system)
    }
    addEntity(id: number) {
        this.entities.add(id)
        this.updateEntityList()
    }
    removeEntity(id: number) {
        this.entities.delete(id)
        this.updateEntityList()
    }
    addEntities(ids: number[]) {
        ids.forEach(id => this.entities.add(id))
        this.updateEntityList()
    }
    removeEntities(ids: number[]) {
        ids.forEach(id => this.entities.delete(id))
        this.updateEntityList()
    }
    update() {
        const dt = 1 / 60
        this.systems.forEach(system => system.update(dt))
    }

    private entities: Set<number> = new Set()

    private systems: System[]
    
    private _entityList: number[]

    private updateEntityList() {
        this._entityList = Array.from(this.entities)
        this.systems.forEach(system => system.updateQuery(this._entityList))
    }
}