/**
 * Client-side Performance Monitor
 *
 * Tracks and displays real-time performance metrics:
 * - FPS (frames per second)
 * - Frame time (ms)
 * - Physics step time (ms)
 * - Entity count
 */

export interface PerfStats {
    fps: number
    frameTime: number
    physicsTime: number
    entityCount: number
}

export class PerfMonitor {
    private frameCount = 0
    private lastFpsUpdate = performance.now()
    private fps = 0
    private frameTimes: number[] = []
    private physicsTimes: number[] = []
    private lastFrameStart = 0
    private physicsStartTime = 0

    // Rolling window size for averaging
    private readonly windowSize = 60

    // Callback for stats updates
    onUpdate?: (stats: PerfStats) => void

    /**
     * Call at the start of each frame
     */
    frameStart(): void {
        this.lastFrameStart = performance.now()
    }

    /**
     * Call before physics update
     */
    physicsStart(): void {
        this.physicsStartTime = performance.now()
    }

    /**
     * Call after physics update
     */
    physicsEnd(): void {
        const elapsed = performance.now() - this.physicsStartTime
        this.physicsTimes.push(elapsed)
        if (this.physicsTimes.length > this.windowSize) {
            this.physicsTimes.shift()
        }
    }

    /**
     * Call at the end of each frame
     */
    frameEnd(entityCount: number): void {
        const now = performance.now()
        const frameTime = now - this.lastFrameStart

        this.frameTimes.push(frameTime)
        if (this.frameTimes.length > this.windowSize) {
            this.frameTimes.shift()
        }

        this.frameCount++

        // Update FPS every 500ms
        if (now - this.lastFpsUpdate >= 500) {
            this.fps = this.frameCount / ((now - this.lastFpsUpdate) / 1000)
            this.frameCount = 0
            this.lastFpsUpdate = now

            // Calculate averages
            const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
            const avgPhysicsTime = this.physicsTimes.length > 0
                ? this.physicsTimes.reduce((a, b) => a + b, 0) / this.physicsTimes.length
                : 0

            if (this.onUpdate) {
                this.onUpdate({
                    fps: this.fps,
                    frameTime: avgFrameTime,
                    physicsTime: avgPhysicsTime,
                    entityCount
                })
            }
        }
    }

    /**
     * Get current stats snapshot
     */
    getStats(entityCount: number): PerfStats {
        const avgFrameTime = this.frameTimes.length > 0
            ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
            : 0
        const avgPhysicsTime = this.physicsTimes.length > 0
            ? this.physicsTimes.reduce((a, b) => a + b, 0) / this.physicsTimes.length
            : 0

        return {
            fps: this.fps,
            frameTime: avgFrameTime,
            physicsTime: avgPhysicsTime,
            entityCount
        }
    }

    /**
     * Reset all statistics
     */
    reset(): void {
        this.frameCount = 0
        this.lastFpsUpdate = performance.now()
        this.fps = 0
        this.frameTimes = []
        this.physicsTimes = []
    }
}

/**
 * Create a performance overlay UI element
 */
export function createPerfOverlay(): HTMLElement {
    const overlay = document.createElement('div')
    overlay.id = 'perf-overlay'
    overlay.innerHTML = `
        <style>
            #perf-overlay {
                position: fixed;
                top: 50px;
                right: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: #0f0;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                padding: 10px;
                border-radius: 4px;
                z-index: 1000;
                min-width: 180px;
            }
            #perf-overlay .label {
                color: #888;
            }
            #perf-overlay .value {
                float: right;
                font-weight: bold;
            }
            #perf-overlay .good { color: #0f0; }
            #perf-overlay .warn { color: #ff0; }
            #perf-overlay .bad { color: #f00; }
            #perf-overlay .row {
                margin: 2px 0;
                clear: both;
            }
            #perf-overlay .divider {
                border-top: 1px solid #333;
                margin: 6px 0;
            }
        </style>
        <div class="row">
            <span class="label">FPS:</span>
            <span class="value" id="perf-fps">--</span>
        </div>
        <div class="row">
            <span class="label">Frame:</span>
            <span class="value" id="perf-frame">-- ms</span>
        </div>
        <div class="row">
            <span class="label">Physics:</span>
            <span class="value" id="perf-physics">-- ms</span>
        </div>
        <div class="divider"></div>
        <div class="row">
            <span class="label">Entities:</span>
            <span class="value" id="perf-entities">--</span>
        </div>
    `
    return overlay
}

/**
 * Update the performance overlay with new stats
 */
export function updatePerfOverlay(stats: PerfStats): void {
    const fpsEl = document.getElementById('perf-fps')
    const frameEl = document.getElementById('perf-frame')
    const physicsEl = document.getElementById('perf-physics')
    const entitiesEl = document.getElementById('perf-entities')

    if (fpsEl) {
        const fps = Math.round(stats.fps)
        fpsEl.textContent = String(fps)
        fpsEl.className = 'value ' + (fps >= 55 ? 'good' : fps >= 30 ? 'warn' : 'bad')
    }

    if (frameEl) {
        const ms = stats.frameTime.toFixed(1)
        frameEl.textContent = `${ms} ms`
        frameEl.className = 'value ' + (stats.frameTime <= 16 ? 'good' : stats.frameTime <= 33 ? 'warn' : 'bad')
    }

    if (physicsEl) {
        const ms = stats.physicsTime.toFixed(1)
        physicsEl.textContent = `${ms} ms`
        physicsEl.className = 'value ' + (stats.physicsTime <= 10 ? 'good' : stats.physicsTime <= 20 ? 'warn' : 'bad')
    }

    if (entitiesEl) {
        entitiesEl.textContent = String(stats.entityCount)
    }
}
