import { SystemBase, Entity } from '../ECS.js'
import Vec2, {vec2} from '../../lib/Vector2.js'

interface PlanetEntity
{
    pos: Vec2
    vel: Vec2
    mass: number
    size: number
    temperature: number
}

export class GravitySystem extends SystemBase
{
    static G = 6.674e-11
    static heatCapacity = 2000 // J/kg
    static bolzmannConst = 5.670367e-8
    static density = 1e5
    static bodySize(mass: number) { return Math.pow((3*(mass/GravitySystem.density) / (4*Math.PI)), 1/3) }

    planets: PlanetEntity[]
    
    update(dt: number)
    {
        const accelerations: Map<PlanetEntity, Vec2> = new Map()
        const mergedColliders: Set<PlanetEntity> = new Set()

        this.planets.forEach((planet, i) => {
            let accSum = new Vec2(0, 0)
            this.planets.forEach((otherPlanet, j) => {
                if (planet !== otherPlanet) {
                    const dist = Vec2.distance(planet.pos, otherPlanet.pos)
                    // Check for collision
                    if (dist < planet.size + otherPlanet.size && planet.mass > 0 && otherPlanet.mass > 0) {
                        // Merge body with higher id to body with lower id
                        if (i < j) {
                            const combinedMass = planet.mass + otherPlanet.mass
                            const combinedVel = Vec2.scale(Vec2.add(Vec2.scale(planet.vel, planet.mass),
                                                                    Vec2.scale(otherPlanet.vel, otherPlanet.mass)),
                                                           1 / combinedMass)
                            const velDiff = Vec2.sub(planet.vel, otherPlanet.vel).len()
                            const initKineticEnergy = 0.5 * planet.mass * planet.vel.len()**2
                                                + 0.5 * otherPlanet.mass * otherPlanet.vel.len()**2

                            const resultKineticEnergy = 0.5 * combinedMass * combinedVel.len()**2
                            const kineticEnergyLoss = initKineticEnergy - resultKineticEnergy
                            const combinedTemp = (planet.temperature * planet.mass + otherPlanet.temperature * otherPlanet.mass) / combinedMass
                            const impactHeat = kineticEnergyLoss / (combinedMass * GravitySystem.heatCapacity)
                            planet.temperature = combinedTemp + impactHeat
                            
                            planet.pos = Vec2.scale(Vec2.add(Vec2.scale(planet.pos, planet.mass),
                                                             Vec2.scale(otherPlanet.pos, otherPlanet.mass)),
                                                    1 / combinedMass)
                            planet.vel = combinedVel
                            planet.mass = combinedMass
                            planet.size = GravitySystem.bodySize(planet.mass)
                            
                            otherPlanet.mass = 0
                            
                            mergedColliders.add(otherPlanet)

                            console.log(`M ${(combinedMass).toExponential(1)} kg, dv ${velDiff.toFixed(0)} m/s, E ${kineticEnergyLoss.toExponential(1)} J, T ${planet.temperature.toFixed(1)} K, left ${this.planets.length}`)
                        }
                    }
                    // Calculate scalar acceleration by gravity
                    else {
                        const a = GravitySystem.G * otherPlanet.mass / (dist**2)
                        // Calculate acceleration vector
                        const acc = Vec2.sub(otherPlanet.pos, planet.pos).normalize().scale(a)
                        accSum.add(acc)
                    }
                }
            })
            accelerations.set(planet, accSum)
        })

        this.planets.forEach(planet => {
            // Apply accelerations
            const acc = accelerations.get(planet)
            const dVel = Vec2.scale(acc, dt)
            planet.vel.add(dVel)

            // Calculate black body radiation
            const bodyArea = 4*Math.PI * (planet.size**2)
            const radPower = bodyArea * GravitySystem.bolzmannConst * (planet.temperature**4)
            const cooling = (radPower * dt) / (planet.mass * GravitySystem.heatCapacity)
            planet.temperature -= cooling
            planet.temperature = Math.max(planet.temperature, 3)
        })

        // Remove merged entities
        this.world.removeEntities([...mergedColliders])
    }

    updateQuery(entities: Entity[]) {
        this.planets = entities.filter(ent =>
            ent.pos &&
            ent.vel &&
            ent.mass &&
            ent.size &&
            ent.temperature) as PlanetEntity[]
    }
}
