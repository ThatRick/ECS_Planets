/**
 * Client-side Performance Monitor
 *
 * Tracks and displays real-time performance metrics:
 * - FPS (frames per second)
 * - Frame time (ms)
 * - Physics step time (ms)
 * - Entity count
 */
export class PerfMonitor {
    frameCount = 0;
    lastFpsUpdate = performance.now();
    fps = 0;
    frameTimes = [];
    physicsTimes = [];
    lastFrameStart = 0;
    physicsStartTime = 0;
    // Rolling window size for averaging
    windowSize = 60;
    // Callback for stats updates
    onUpdate;
    /**
     * Call at the start of each frame
     */
    frameStart() {
        this.lastFrameStart = performance.now();
    }
    /**
     * Call before physics update
     */
    physicsStart() {
        this.physicsStartTime = performance.now();
    }
    /**
     * Call after physics update
     */
    physicsEnd() {
        const elapsed = performance.now() - this.physicsStartTime;
        this.physicsTimes.push(elapsed);
        if (this.physicsTimes.length > this.windowSize) {
            this.physicsTimes.shift();
        }
    }
    /**
     * Call at the end of each frame
     */
    frameEnd(entityCount) {
        const now = performance.now();
        const frameTime = now - this.lastFrameStart;
        this.frameTimes.push(frameTime);
        if (this.frameTimes.length > this.windowSize) {
            this.frameTimes.shift();
        }
        this.frameCount++;
        // Update FPS every 500ms
        if (now - this.lastFpsUpdate >= 500) {
            this.fps = this.frameCount / ((now - this.lastFpsUpdate) / 1000);
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            // Calculate averages
            const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
            const avgPhysicsTime = this.physicsTimes.length > 0
                ? this.physicsTimes.reduce((a, b) => a + b, 0) / this.physicsTimes.length
                : 0;
            if (this.onUpdate) {
                this.onUpdate({
                    fps: this.fps,
                    frameTime: avgFrameTime,
                    physicsTime: avgPhysicsTime,
                    entityCount
                });
            }
        }
    }
    /**
     * Get current stats snapshot
     */
    getStats(entityCount) {
        const avgFrameTime = this.frameTimes.length > 0
            ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
            : 0;
        const avgPhysicsTime = this.physicsTimes.length > 0
            ? this.physicsTimes.reduce((a, b) => a + b, 0) / this.physicsTimes.length
            : 0;
        return {
            fps: this.fps,
            frameTime: avgFrameTime,
            physicsTime: avgPhysicsTime,
            entityCount
        };
    }
    /**
     * Reset all statistics
     */
    reset() {
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fps = 0;
        this.frameTimes = [];
        this.physicsTimes = [];
    }
}
/**
 * Create a performance overlay UI element
 */
export function createPerfOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'perf-overlay';
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
                transition: opacity 0.2s;
            }
            #perf-overlay.hidden {
                opacity: 0;
                pointer-events: none;
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
            #perf-overlay .hint {
                color: #555;
                font-size: 10px;
                text-align: center;
                margin-top: 6px;
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
        <div class="hint">Press P to toggle</div>
    `;
    // Setup keyboard toggle
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            overlay.classList.toggle('hidden');
        }
    });
    return overlay;
}
/**
 * Toggle performance overlay visibility
 */
export function togglePerfOverlay(visible) {
    const overlay = document.getElementById('perf-overlay');
    if (!overlay)
        return;
    if (visible === undefined) {
        overlay.classList.toggle('hidden');
    }
    else if (visible) {
        overlay.classList.remove('hidden');
    }
    else {
        overlay.classList.add('hidden');
    }
}
/**
 * Update the performance overlay with new stats
 */
export function updatePerfOverlay(stats) {
    const fpsEl = document.getElementById('perf-fps');
    const frameEl = document.getElementById('perf-frame');
    const physicsEl = document.getElementById('perf-physics');
    const entitiesEl = document.getElementById('perf-entities');
    if (fpsEl) {
        const fps = Math.round(stats.fps);
        fpsEl.textContent = String(fps);
        fpsEl.className = 'value ' + (fps >= 55 ? 'good' : fps >= 30 ? 'warn' : 'bad');
    }
    if (frameEl) {
        const ms = stats.frameTime.toFixed(1);
        frameEl.textContent = `${ms} ms`;
        frameEl.className = 'value ' + (stats.frameTime <= 16 ? 'good' : stats.frameTime <= 33 ? 'warn' : 'bad');
    }
    if (physicsEl) {
        const ms = stats.physicsTime.toFixed(1);
        physicsEl.textContent = `${ms} ms`;
        physicsEl.className = 'value ' + (stats.physicsTime <= 10 ? 'good' : stats.physicsTime <= 20 ? 'warn' : 'bad');
    }
    if (entitiesEl) {
        entitiesEl.textContent = String(stats.entityCount);
    }
}
