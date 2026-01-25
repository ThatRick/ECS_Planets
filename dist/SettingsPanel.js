/**
 * Settings Panel for simulation configuration
 * Toggle with 'S' key or settings button
 */
export const DEFAULT_SETTINGS = {
    bodyCount: 300,
    radiusMin: 10, // 10 km
    radiusMax: 500, // 500 km
    massMin: 1, // displayed as 1 (×10¹⁴ kg)
    massMax: 4, // displayed as 4 (×10¹⁴ kg)
    velocityMode: 'collapse',
    velocityScale: 0.3,
    initialTemp: 100
};
// Unit conversions
const KM_TO_M = 1000;
const MASS_UNIT = 1e14; // 10¹⁴ kg
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
                min-width: 280px;
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
            #settings-panel .unit {
                color: #666;
                font-size: 10px;
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
            #settings-panel .mode-desc {
                color: #666;
                font-size: 10px;
                margin-top: 4px;
                line-height: 1.4;
            }
            #settings-panel input[type="range"] {
                padding: 0;
                height: 6px;
                -webkit-appearance: none;
                background: #333;
                border: none;
                border-radius: 3px;
            }
            #settings-panel input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #0af;
                cursor: pointer;
            }
            #settings-panel .range-value {
                display: inline-block;
                min-width: 40px;
                text-align: right;
                color: #8cf;
                font-weight: 500;
            }
            #settings-panel .range-row {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            #settings-panel .range-row input {
                flex: 1;
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
                    font-size: 16px;
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
                        <option value="optimized" selected>O(n²) Direct</option>
                        <option value="barnes-hut">O(n log n) Barnes-Hut</option>
                    </select>
                </div>
                <div class="field">
                    <label>Number of Bodies</label>
                    <input type="number" id="set-bodyCount" value="${DEFAULT_SETTINGS.bodyCount}" min="10" max="5000" step="10">
                </div>
            </div>

            <div class="section">
                <div class="section-title">Initial Velocity</div>
                <div class="field">
                    <label>Mode</label>
                    <select id="set-velocityMode">
                        <option value="collapse">Cloud Collapse</option>
                        <option value="orbital">Orbital (around center)</option>
                        <option value="static">Static (no velocity)</option>
                    </select>
                    <div class="mode-desc" id="velocity-mode-desc">Random slow velocities - bodies collapse under gravity</div>
                </div>
                <div class="field" id="velocity-scale-field">
                    <label>Velocity Scale</label>
                    <div class="range-row">
                        <input type="range" id="set-velocityScale" value="0.3" min="0" max="1.5" step="0.05">
                        <span class="range-value" id="velocity-scale-value">0.3</span>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Spawn Area</div>
                <div class="row">
                    <div class="field">
                        <label>Inner Radius <span class="unit">(km)</span></label>
                        <input type="number" id="set-radiusMin" value="${DEFAULT_SETTINGS.radiusMin}" min="0" step="10">
                    </div>
                    <div class="field">
                        <label>Outer Radius <span class="unit">(km)</span></label>
                        <input type="number" id="set-radiusMax" value="${DEFAULT_SETTINGS.radiusMax}" min="10" step="50">
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Body Properties</div>
                <div class="row">
                    <div class="field">
                        <label>Mass Min <span class="unit">(×10¹⁴ kg)</span></label>
                        <input type="number" id="set-massMin" value="${DEFAULT_SETTINGS.massMin}" min="0.1" step="0.5">
                    </div>
                    <div class="field">
                        <label>Mass Max <span class="unit">(×10¹⁴ kg)</span></label>
                        <input type="number" id="set-massMax" value="${DEFAULT_SETTINGS.massMax}" min="0.1" step="0.5">
                    </div>
                </div>
                <div class="field">
                    <label>Temperature <span class="unit">(K)</span></label>
                    <input type="number" id="set-initialTemp" value="${DEFAULT_SETTINGS.initialTemp}" min="3" step="50">
                </div>
            </div>

            <button class="apply-btn" id="settings-apply">Apply & Reset</button>
            <div class="hint">Press S to toggle • Space to play/pause</div>
        </div>
    `;
    // Setup event listeners
    const closeBtn = panel.querySelector('#settings-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
        });
    }
    // Gravity algorithm change
    const gravitySelect = panel.querySelector('#set-gravityAlgo');
    if (gravitySelect) {
        gravitySelect.addEventListener('change', () => {
            onGravityChange(gravitySelect.value);
        });
    }
    // Velocity mode change - update description
    const velocityModeSelect = panel.querySelector('#set-velocityMode');
    const modeDesc = panel.querySelector('#velocity-mode-desc');
    const velocityScaleField = panel.querySelector('#velocity-scale-field');
    const modeDescriptions = {
        'collapse': 'Random slow velocities - bodies collapse under gravity',
        'orbital': 'Circular orbits around center - velocity depends on distance',
        'static': 'No initial velocity - pure gravitational collapse'
    };
    if (velocityModeSelect && modeDesc) {
        velocityModeSelect.addEventListener('change', () => {
            const mode = velocityModeSelect.value;
            modeDesc.textContent = modeDescriptions[mode];
            // Hide velocity scale for static mode
            if (velocityScaleField) {
                velocityScaleField.style.display = mode === 'static' ? 'none' : 'block';
            }
        });
    }
    // Velocity scale slider
    const velocityScaleSlider = panel.querySelector('#set-velocityScale');
    const velocityScaleValue = panel.querySelector('#velocity-scale-value');
    if (velocityScaleSlider && velocityScaleValue) {
        velocityScaleSlider.addEventListener('input', () => {
            velocityScaleValue.textContent = velocityScaleSlider.value;
        });
    }
    // Apply button
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
    const getSelect = (id, fallback) => {
        const el = document.getElementById(id);
        return el ? el.value : fallback;
    };
    return {
        bodyCount: getValue('set-bodyCount', DEFAULT_SETTINGS.bodyCount),
        radiusMin: getValue('set-radiusMin', DEFAULT_SETTINGS.radiusMin) * KM_TO_M,
        radiusMax: getValue('set-radiusMax', DEFAULT_SETTINGS.radiusMax) * KM_TO_M,
        massMin: getValue('set-massMin', DEFAULT_SETTINGS.massMin) * MASS_UNIT,
        massMax: getValue('set-massMax', DEFAULT_SETTINGS.massMax) * MASS_UNIT,
        velocityMode: getSelect('set-velocityMode', DEFAULT_SETTINGS.velocityMode),
        velocityScale: getValue('set-velocityScale', DEFAULT_SETTINGS.velocityScale),
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
    const setSelect = (id, value) => {
        const el = document.getElementById(id);
        if (el)
            el.value = value;
    };
    setValue('set-bodyCount', settings.bodyCount);
    setValue('set-radiusMin', settings.radiusMin / KM_TO_M);
    setValue('set-radiusMax', settings.radiusMax / KM_TO_M);
    setValue('set-massMin', settings.massMin / MASS_UNIT);
    setValue('set-massMax', settings.massMax / MASS_UNIT);
    setSelect('set-velocityMode', settings.velocityMode);
    setValue('set-velocityScale', settings.velocityScale);
    setValue('set-initialTemp', settings.initialTemp);
    // Update velocity scale display
    const velocityScaleValue = document.getElementById('velocity-scale-value');
    if (velocityScaleValue) {
        velocityScaleValue.textContent = String(settings.velocityScale);
    }
}
export function setGravityAlgoValue(gravityType) {
    const select = document.getElementById('set-gravityAlgo');
    if (select)
        select.value = gravityType;
}
