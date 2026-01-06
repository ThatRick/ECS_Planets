import type { World } from './World.js'

export type SystemPhase = 'simulate' | 'visual'

/**
 * System interface for ECS processing.
 *
 * Systems can be either:
 * - 'simulate': Run on fixed timestep (physics, game logic)
 * - 'visual': Run on requestAnimationFrame (rendering, input)
 */
export interface System {
    /** Unique name for debugging */
    name: string

    /** Execution phase */
    phase: SystemPhase

    /** Called once when system is registered */
    init?(world: World): void

    /** Called each frame/tick with delta time */
    update(world: World, dt: number): void
}

/**
 * Create a simple system from a configuration object.
 */
export function createSystem(config: {
    name: string
    phase: SystemPhase
    init?: (world: World) => void
    update: (world: World, dt: number) => void
}): System {
    return config
}
