export class ComponentManager {
    constructor(TCreator) {
        this.TCreator = TCreator;
        this.components = [];
    }
    add(id, data) {
        const component = new this.TCreator();
        Object.assign(component, data);
        this.components[id] = component;
    }
    remove(id) {
        delete this.components[id];
    }
    get(id) {
        return this.components[id];
    }
}
export class Component {
}
export class System {
    updateQuery(entities) { }
    update(dt) { }
}
export class World {
    constructor() {
        this.components = new Set();
        this.timeFactor = 1.0;
        this.entities = new Set();
    }
    registerComponent(constr) {
        this.components.add(constr);
    }
    getComponent(constr) {
        for (const comp of this.components) {
            if (comp instanceof constr) {
                return comp;
            }
        }
    }
    registerSystem(system) {
        system.world = this;
        this.systems.push(system);
    }
    addEntity(id) {
        this.entities.add(id);
        this.updateEntityList();
    }
    removeEntity(id) {
        this.entities.delete(id);
        this.updateEntityList();
    }
    addEntities(ids) {
        ids.forEach(id => this.entities.add(id));
        this.updateEntityList();
    }
    removeEntities(ids) {
        ids.forEach(id => this.entities.delete(id));
        this.updateEntityList();
    }
    update() {
        const dt = 1 / 60;
        this.systems.forEach(system => system.update(dt));
    }
    updateEntityList() {
        this._entityList = Array.from(this.entities);
        this.systems.forEach(system => system.updateQuery(this._entityList));
    }
}
