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
    overlay.className = 'hidden' // Start hidden
    overlay.innerHTML = `
        <style>
            #perf-overlay {
                position: fixed;
                top: 60px;
                right: 10px;
                right: max(10px, env(safe-area-inset-right));
                background: rgba(20, 20, 22, 0.95);
                color: #0f0;
                font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
                font-size: 12px;
                padding: 0;
                border-radius: 10px;
                z-index: 1000;
                min-width: 160px;
                transition: opacity 0.2s, transform 0.2s;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                border: 1px solid #333;
            }
            #perf-overlay.hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateX(10px);
            }
            #perf-overlay .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #222;
                border-bottom: 1px solid #333;
                border-radius: 10px 10px 0 0;
            }
            #perf-overlay .panel-header span {
                font-size: 11px;
                font-weight: 600;
                color: #888;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            #perf-overlay .close-btn {
                background: none;
                border: none;
                color: #888;
                font-size: 18px;
                cursor: pointer;
                padding: 0 2px;
                line-height: 1;
                transition: color 0.15s;
            }
            #perf-overlay .close-btn:hover {
                color: #fff;
            }
            #perf-overlay .panel-content {
                padding: 10px 12px;
            }
            #perf-overlay .label {
                color: #888;
            }
            #perf-overlay .value {
                float: right;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
            }
            #perf-overlay .good { color: #4f4; }
            #perf-overlay .warn { color: #ff0; }
            #perf-overlay .bad { color: #f44; }
            #perf-overlay .row {
                margin: 4px 0;
                clear: both;
            }
            #perf-overlay .divider {
                border-top: 1px solid #333;
                margin: 8px 0;
            }

            @media (max-width: 600px) {
                #perf-overlay {
                    right: 6px;
                    font-size: 11px;
                    min-width: 140px;
                }
            }
        </style>
        <div class="panel-header">
            <span>Performance</span>
            <button class="close-btn" id="perf-close" aria-label="Close">&times;</button>
        </div>
        <div class="panel-content">
            <div class="row">
                <span class="label">FPS</span>
                <span class="value" id="perf-fps">--</span>
            </div>
            <div class="row">
                <span class="label">Frame</span>
                <span class="value" id="perf-frame">-- ms</span>
            </div>
            <div class="row">
                <span class="label">Physics</span>
                <span class="value" id="perf-physics">-- ms</span>
            </div>
            <div class="divider"></div>
            <div class="row">
                <span class="label">Entities</span>
                <span class="value" id="perf-entities">--</span>
            </div>
        </div>
    `

    // Setup close button using querySelector on the overlay
    const closeBtn = overlay.querySelector('#perf-close')
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.classList.add('hidden')
        })
    }

    return overlay
}

/**
 * Toggle performance overlay visibility
 */
export function togglePerfOverlay(visible?: boolean): void {
    const overlay = document.getElementById('perf-overlay')
    if (!overlay) return

    if (visible === undefined) {
        overlay.classList.toggle('hidden')
    } else if (visible) {
        overlay.classList.remove('hidden')
    } else {
        overlay.classList.add('hidden')
    }
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
