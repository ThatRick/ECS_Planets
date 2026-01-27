/**
 * Client-side Performance Monitor
 *
 * Tracks and displays real-time performance metrics:
 * - FPS (frames per second)
 * - Frame time (ms)
 * - Physics step time (ms)
 * - Simulation update rate (Hz)
 * - Entity count
 * - Detailed breakdown (gravity, collision, rendering)
 */

export interface PerfStats {
    fps: number
    frameTime: number
    physicsTime: number
    simRate: number        // Actual simulation updates per second
    entityCount: number
    // Detailed breakdown
    gravityTime: number
    collisionTime: number
    renderTime: number
}

export class PerfMonitor {
    private frameCount = 0
    private simCount = 0
    private lastFpsUpdate = performance.now()
    private fps = 0
    private simRate = 0
    private frameTimes: number[] = []
    private physicsTimes: number[] = []
    private gravityTimes: number[] = []
    private collisionTimes: number[] = []
    private renderTimes: number[] = []
    private lastFrameStart = 0
    private physicsStartTime = 0
    private renderStartTime = 0

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
     * Call when a simulation tick happens
     */
    simTick(): void {
        this.simCount++
    }

    /**
     * Record gravity calculation time
     */
    recordGravityTime(ms: number): void {
        this.gravityTimes.push(ms)
        if (this.gravityTimes.length > this.windowSize) {
            this.gravityTimes.shift()
        }
    }

    /**
     * Record collision detection time
     */
    recordCollisionTime(ms: number): void {
        this.collisionTimes.push(ms)
        if (this.collisionTimes.length > this.windowSize) {
            this.collisionTimes.shift()
        }
    }

    /**
     * Call before rendering
     */
    renderStart(): void {
        this.renderStartTime = performance.now()
    }

    /**
     * Call after rendering
     */
    renderEnd(): void {
        const elapsed = performance.now() - this.renderStartTime
        this.renderTimes.push(elapsed)
        if (this.renderTimes.length > this.windowSize) {
            this.renderTimes.shift()
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
            const elapsed = (now - this.lastFpsUpdate) / 1000
            this.fps = this.frameCount / elapsed
            this.simRate = this.simCount / elapsed
            this.frameCount = 0
            this.simCount = 0
            this.lastFpsUpdate = now

            // Calculate averages
            const avgFrameTime = this.average(this.frameTimes)
            const avgPhysicsTime = this.average(this.physicsTimes)
            const avgGravityTime = this.average(this.gravityTimes)
            const avgCollisionTime = this.average(this.collisionTimes)
            const avgRenderTime = this.average(this.renderTimes)

            // Update top bar displays
            this.updateTopBar()

            if (this.onUpdate) {
                this.onUpdate({
                    fps: this.fps,
                    frameTime: avgFrameTime,
                    physicsTime: avgPhysicsTime,
                    simRate: this.simRate,
                    entityCount,
                    gravityTime: avgGravityTime,
                    collisionTime: avgCollisionTime,
                    renderTime: avgRenderTime
                })
            }
        }
    }

    private average(arr: number[]): number {
        if (arr.length === 0) return 0
        return arr.reduce((a, b) => a + b, 0) / arr.length
    }

    private updateTopBar(): void {
        const fpsEl = document.getElementById('fpsDisplay')
        const simRateEl = document.getElementById('simRateDisplay')

        if (fpsEl) {
            const fps = Math.round(this.fps)
            fpsEl.textContent = String(fps)
            // Color code FPS
            if (fps >= 55) {
                fpsEl.style.color = '#8f8'
            } else if (fps >= 30) {
                fpsEl.style.color = '#ff8'
            } else {
                fpsEl.style.color = '#f88'
            }
        }

        if (simRateEl) {
            const rate = Math.round(this.simRate)
            simRateEl.textContent = String(rate)
            // Color code sim rate (target is 100Hz)
            if (rate >= 90) {
                simRateEl.style.color = '#8f8'
            } else if (rate >= 50) {
                simRateEl.style.color = '#ff8'
            } else {
                simRateEl.style.color = '#f88'
            }
        }
    }

    /**
     * Get current stats snapshot
     */
    getStats(entityCount: number): PerfStats {
        return {
            fps: this.fps,
            frameTime: this.average(this.frameTimes),
            physicsTime: this.average(this.physicsTimes),
            simRate: this.simRate,
            entityCount,
            gravityTime: this.average(this.gravityTimes),
            collisionTime: this.average(this.collisionTimes),
            renderTime: this.average(this.renderTimes)
        }
    }

    /**
     * Reset all statistics
     */
    reset(): void {
        this.frameCount = 0
        this.simCount = 0
        this.lastFpsUpdate = performance.now()
        this.fps = 0
        this.simRate = 0
        this.frameTimes = []
        this.physicsTimes = []
        this.gravityTimes = []
        this.collisionTimes = []
        this.renderTimes = []
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
                min-width: 180px;
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
            #perf-overlay .section-title {
                color: #666;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-top: 8px;
                margin-bottom: 4px;
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
                    min-width: 160px;
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
                <span class="label">Sim Rate</span>
                <span class="value" id="perf-simrate">-- Hz</span>
            </div>
            <div class="divider"></div>
            <div class="section-title">Frame Budget</div>
            <div class="row">
                <span class="label">Frame Total</span>
                <span class="value" id="perf-frame">-- ms</span>
            </div>
            <div class="row">
                <span class="label">Physics</span>
                <span class="value" id="perf-physics">-- ms</span>
            </div>
            <div class="row">
                <span class="label">Render</span>
                <span class="value" id="perf-render">-- ms</span>
            </div>
            <div class="divider"></div>
            <div class="section-title">Physics Breakdown</div>
            <div class="row">
                <span class="label">Gravity</span>
                <span class="value" id="perf-gravity">-- ms</span>
            </div>
            <div class="row">
                <span class="label">Collision</span>
                <span class="value" id="perf-collision">-- ms</span>
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
    const simRateEl = document.getElementById('perf-simrate')
    const frameEl = document.getElementById('perf-frame')
    const physicsEl = document.getElementById('perf-physics')
    const renderEl = document.getElementById('perf-render')
    const gravityEl = document.getElementById('perf-gravity')
    const collisionEl = document.getElementById('perf-collision')
    const entitiesEl = document.getElementById('perf-entities')

    if (fpsEl) {
        const fps = Math.round(stats.fps)
        fpsEl.textContent = String(fps)
        fpsEl.className = 'value ' + (fps >= 55 ? 'good' : fps >= 30 ? 'warn' : 'bad')
    }

    if (simRateEl) {
        const rate = Math.round(stats.simRate)
        simRateEl.textContent = `${rate} Hz`
        simRateEl.className = 'value ' + (rate >= 90 ? 'good' : rate >= 50 ? 'warn' : 'bad')
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

    if (renderEl) {
        const ms = stats.renderTime.toFixed(1)
        renderEl.textContent = `${ms} ms`
        renderEl.className = 'value ' + (stats.renderTime <= 5 ? 'good' : stats.renderTime <= 10 ? 'warn' : 'bad')
    }

    if (gravityEl) {
        const ms = stats.gravityTime.toFixed(1)
        gravityEl.textContent = `${ms} ms`
        gravityEl.className = 'value ' + (stats.gravityTime <= 8 ? 'good' : stats.gravityTime <= 15 ? 'warn' : 'bad')
    }

    if (collisionEl) {
        const ms = stats.collisionTime.toFixed(1)
        collisionEl.textContent = `${ms} ms`
        collisionEl.className = 'value ' + (stats.collisionTime <= 2 ? 'good' : stats.collisionTime <= 5 ? 'warn' : 'bad')
    }

    if (entitiesEl) {
        entitiesEl.textContent = String(stats.entityCount)
    }
}
