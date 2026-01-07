/**
 * Settings Panel for simulation configuration
 * Toggle with 'S' key
 */

export interface SimSettings {
    bodyCount: number
    radiusMin: number
    radiusMax: number
    massMin: number
    massMax: number
    orbitVelocity: number
    initialTemp: number
}

export const DEFAULT_SETTINGS: SimSettings = {
    bodyCount: 300,
    radiusMin: 10000,
    radiusMax: 500000,
    massMin: 1e14,
    massMax: 4e14,
    orbitVelocity: 100000,
    initialTemp: 100
}

export type SettingsChangeCallback = (settings: SimSettings) => void

export function createSettingsPanel(onApply: SettingsChangeCallback): HTMLElement {
    const panel = document.createElement('div')
    panel.id = 'settings-panel'
    panel.className = 'hidden'
    panel.innerHTML = `
        <style>
            #settings-panel {
                position: fixed;
                top: 50px;
                left: 10px;
                background: rgba(0, 0, 0, 0.9);
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                padding: 15px;
                border-radius: 6px;
                z-index: 1000;
                min-width: 220px;
                transition: opacity 0.2s, transform 0.2s;
            }
            #settings-panel.hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateX(-10px);
            }
            #settings-panel h3 {
                margin: 0 0 12px 0;
                font-size: 14px;
                color: #0af;
                border-bottom: 1px solid #333;
                padding-bottom: 8px;
            }
            #settings-panel .field {
                margin: 10px 0;
            }
            #settings-panel label {
                display: block;
                color: #888;
                font-size: 11px;
                margin-bottom: 4px;
            }
            #settings-panel input {
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #444;
                border-radius: 4px;
                background: #222;
                color: #fff;
                font-size: 13px;
                box-sizing: border-box;
            }
            #settings-panel input:focus {
                outline: none;
                border-color: #0af;
            }
            #settings-panel .row {
                display: flex;
                gap: 10px;
            }
            #settings-panel .row .field {
                flex: 1;
            }
            #settings-panel button {
                width: 100%;
                padding: 8px;
                margin-top: 12px;
                border: none;
                border-radius: 4px;
                background: #0af;
                color: #000;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
            }
            #settings-panel button:hover {
                background: #0cf;
            }
            #settings-panel .hint {
                color: #555;
                font-size: 10px;
                text-align: center;
                margin-top: 10px;
            }
        </style>
        <h3>Simulation Settings</h3>
        <div class="field">
            <label>Body Count</label>
            <input type="number" id="set-bodyCount" value="${DEFAULT_SETTINGS.bodyCount}" min="10" max="5000" step="50">
        </div>
        <div class="row">
            <div class="field">
                <label>Radius Min</label>
                <input type="number" id="set-radiusMin" value="${DEFAULT_SETTINGS.radiusMin}" min="1000" step="1000">
            </div>
            <div class="field">
                <label>Radius Max</label>
                <input type="number" id="set-radiusMax" value="${DEFAULT_SETTINGS.radiusMax}" min="10000" step="10000">
            </div>
        </div>
        <div class="row">
            <div class="field">
                <label>Mass Min (×10¹⁴)</label>
                <input type="number" id="set-massMin" value="1" min="0.1" step="0.1">
            </div>
            <div class="field">
                <label>Mass Max (×10¹⁴)</label>
                <input type="number" id="set-massMax" value="4" min="0.1" step="0.1">
            </div>
        </div>
        <div class="field">
            <label>Orbit Velocity</label>
            <input type="number" id="set-orbitVelocity" value="${DEFAULT_SETTINGS.orbitVelocity}" min="1000" step="10000">
        </div>
        <div class="field">
            <label>Initial Temperature (K)</label>
            <input type="number" id="set-initialTemp" value="${DEFAULT_SETTINGS.initialTemp}" min="3" step="100">
        </div>
        <button id="settings-apply">Apply & Reset</button>
        <div class="hint">Press S to toggle</div>
    `

    // Setup keyboard toggle
    document.addEventListener('keydown', (e) => {
        if (e.key === 's' || e.key === 'S') {
            // Don't toggle if typing in an input
            if (document.activeElement?.tagName === 'INPUT') return
            panel.classList.toggle('hidden')
        }
    })

    // Setup apply button
    setTimeout(() => {
        const applyBtn = document.getElementById('settings-apply')
        applyBtn?.addEventListener('click', () => {
            const settings = getSettingsFromPanel()
            onApply(settings)
        })
    }, 0)

    return panel
}

export function getSettingsFromPanel(): SimSettings {
    const getValue = (id: string, fallback: number) => {
        const el = document.getElementById(id) as HTMLInputElement
        return el ? parseFloat(el.value) || fallback : fallback
    }

    return {
        bodyCount: getValue('set-bodyCount', DEFAULT_SETTINGS.bodyCount),
        radiusMin: getValue('set-radiusMin', DEFAULT_SETTINGS.radiusMin),
        radiusMax: getValue('set-radiusMax', DEFAULT_SETTINGS.radiusMax),
        massMin: getValue('set-massMin', 1) * 1e14,
        massMax: getValue('set-massMax', 4) * 1e14,
        orbitVelocity: getValue('set-orbitVelocity', DEFAULT_SETTINGS.orbitVelocity),
        initialTemp: getValue('set-initialTemp', DEFAULT_SETTINGS.initialTemp)
    }
}

export function toggleSettingsPanel(visible?: boolean): void {
    const panel = document.getElementById('settings-panel')
    if (!panel) return

    if (visible === undefined) {
        panel.classList.toggle('hidden')
    } else if (visible) {
        panel.classList.remove('hidden')
    } else {
        panel.classList.add('hidden')
    }
}
