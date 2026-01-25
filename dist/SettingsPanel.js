/**
 * Settings Panel for simulation configuration
 * Toggle with 'S' key or settings button
 */
export const DEFAULT_SETTINGS = {
    bodyCount: 300,
    radiusMin: 10000,
    radiusMax: 500000,
    massMin: 1e14,
    massMax: 4e14,
    orbitVelocity: 100000,
    initialTemp: 100
};
export function createSettingsPanel(onApply, onGravityChange) {
    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'hidden';
    panel.innerHTML = `
        <style>
            #settings-panel {
                position: fixed;
                top: 60px;
                left: 10px;
                left: max(10px, env(safe-area-inset-left));
                background: rgba(20, 20, 22, 0.95);
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                padding: 0;
                border-radius: 10px;
                z-index: 1000;
                min-width: 260px;
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 80px);
                max-height: calc(100dvh - 80px);
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                transition: opacity 0.2s, transform 0.2s;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                border: 1px solid #333;
            }
            #settings-panel.hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateX(-10px);
            }
            #settings-panel .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 14px;
                background: #222;
                border-bottom: 1px solid #333;
                border-radius: 10px 10px 0 0;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            #settings-panel .panel-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: #fff;
            }
            #settings-panel .close-btn {
                background: none;
                border: none;
                color: #888;
                font-size: 20px;
                cursor: pointer;
                padding: 0 4px;
                line-height: 1;
                transition: color 0.15s;
            }
            #settings-panel .close-btn:hover {
                color: #fff;
            }
            #settings-panel .panel-content {
                padding: 14px;
            }
            #settings-panel .section {
                margin-bottom: 16px;
            }
            #settings-panel .section:last-child {
                margin-bottom: 0;
            }
            #settings-panel .section-title {
                font-size: 11px;
                font-weight: 600;
                color: #0af;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 10px;
                padding-bottom: 6px;
                border-bottom: 1px solid #333;
            }
            #settings-panel .field {
                margin: 10px 0;
            }
            #settings-panel label {
                display: block;
                color: #999;
                font-size: 11px;
                margin-bottom: 4px;
            }
            #settings-panel input,
            #settings-panel select {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid #444;
                border-radius: 6px;
                background: #1a1a1a;
                color: #fff;
                font-size: 13px;
                box-sizing: border-box;
                transition: border-color 0.15s;
            }
            #settings-panel input:focus,
            #settings-panel select:focus {
                outline: none;
                border-color: #0af;
            }
            #settings-panel select {
                cursor: pointer;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 10px center;
                padding-right: 30px;
            }
            #settings-panel .row {
                display: flex;
                gap: 10px;
            }
            #settings-panel .row .field {
                flex: 1;
            }
            #settings-panel .apply-btn {
                width: 100%;
                padding: 10px;
                margin-top: 14px;
                border: none;
                border-radius: 6px;
                background: #0af;
                color: #000;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s;
            }
            #settings-panel .apply-btn:hover {
                background: #0cf;
            }
            #settings-panel .apply-btn:active {
                background: #09d;
            }
            #settings-panel .hint {
                color: #555;
                font-size: 10px;
                text-align: center;
                margin-top: 12px;
            }

            @media (max-width: 600px) {
                #settings-panel {
                    left: 6px;
                    right: 6px;
                    min-width: auto;
                    max-width: none;
                    width: auto;
                }
                #settings-panel .panel-content {
                    padding: 12px;
                }
                #settings-panel input,
                #settings-panel select {
                    padding: 10px 12px;
                    font-size: 16px; /* Prevent zoom on iOS */
                }
            }
        </style>
        <div class="panel-header">
            <h3>Settings</h3>
            <button class="close-btn" id="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="panel-content">
            <div class="section">
                <div class="section-title">Simulation</div>
                <div class="field">
                    <label>Gravity Algorithm</label>
                    <select id="set-gravityAlgo">
                        <option value="optimized" selected>O(n²) Optimized</option>
                        <option value="barnes-hut">O(n log n) Barnes-Hut</option>
                    </select>
                </div>
                <div class="field">
                    <label>Body Count</label>
                    <input type="number" id="set-bodyCount" value="${DEFAULT_SETTINGS.bodyCount}" min="10" max="5000" step="50">
                </div>
            </div>

            <div class="section">
                <div class="section-title">Distribution</div>
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
            </div>

            <button class="apply-btn" id="settings-apply">Apply & Reset</button>
            <div class="hint">Press S to toggle • Space to play/pause</div>
        </div>
    `;
    // Setup event listeners using querySelector on the panel
    const closeBtn = panel.querySelector('#settings-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
        });
    }
    // Setup gravity algorithm change (instant, no reset needed)
    const gravitySelect = panel.querySelector('#set-gravityAlgo');
    if (gravitySelect) {
        gravitySelect.addEventListener('change', () => {
            onGravityChange(gravitySelect.value);
        });
    }
    // Setup apply button
    const applyBtn = panel.querySelector('#settings-apply');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const settings = getSettingsFromPanel();
            onApply(settings);
        });
    }
    return panel;
}
export function getSettingsFromPanel() {
    const getValue = (id, fallback) => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || fallback : fallback;
    };
    return {
        bodyCount: getValue('set-bodyCount', DEFAULT_SETTINGS.bodyCount),
        radiusMin: getValue('set-radiusMin', DEFAULT_SETTINGS.radiusMin),
        radiusMax: getValue('set-radiusMax', DEFAULT_SETTINGS.radiusMax),
        massMin: getValue('set-massMin', 1) * 1e14,
        massMax: getValue('set-massMax', 4) * 1e14,
        orbitVelocity: getValue('set-orbitVelocity', DEFAULT_SETTINGS.orbitVelocity),
        initialTemp: getValue('set-initialTemp', DEFAULT_SETTINGS.initialTemp)
    };
}
export function toggleSettingsPanel(visible) {
    const panel = document.getElementById('settings-panel');
    if (!panel)
        return;
    if (visible === undefined) {
        panel.classList.toggle('hidden');
    }
    else if (visible) {
        panel.classList.remove('hidden');
    }
    else {
        panel.classList.add('hidden');
    }
}
export function updateSettingsPanelValues(settings) {
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el)
            el.value = String(value);
    };
    setValue('set-bodyCount', settings.bodyCount);
    setValue('set-radiusMin', settings.radiusMin);
    setValue('set-radiusMax', settings.radiusMax);
    setValue('set-massMin', settings.massMin / 1e14);
    setValue('set-massMax', settings.massMax / 1e14);
    setValue('set-orbitVelocity', settings.orbitVelocity);
    setValue('set-initialTemp', settings.initialTemp);
}
export function setGravityAlgoValue(gravityType) {
    const select = document.getElementById('set-gravityAlgo');
    if (select)
        select.value = gravityType;
}
