/**
 * Application logging system
 * Provides a global AppLog singleton that stores messages and powers the log panel UI.
 */

import { createPanel, type PanelHandle } from './Panel.js'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
    timestamp: number
    level: LogLevel
    message: string
}

type LogListener = (entry: LogEntry) => void

class Logger {
    private entries: LogEntry[] = []
    private listeners: Set<LogListener> = new Set()
    private maxEntries = 500

    info(message: string): void {
        this.add('info', message)
        console.log(`[INFO] ${message}`)
    }

    warn(message: string): void {
        this.add('warn', message)
        console.warn(`[WARN] ${message}`)
    }

    error(message: string): void {
        this.add('error', message)
        console.error(`[ERROR] ${message}`)
    }

    getEntries(): readonly LogEntry[] {
        return this.entries
    }

    clear(): void {
        this.entries = []
        for (const listener of this.listeners) {
            listener({ timestamp: Date.now(), level: 'info', message: '' })
        }
    }

    onEntry(listener: LogListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private add(level: LogLevel, message: string): void {
        const entry: LogEntry = { timestamp: Date.now(), level, message }
        this.entries.push(entry)
        if (this.entries.length > this.maxEntries) {
            this.entries.shift()
        }
        for (const listener of this.listeners) {
            listener(entry)
        }
    }
}

/** Global application logger */
export const AppLog = new Logger()

// ── Log Panel UI ──────────────────────────────────────────

let logStylesInjected = false

function injectLogStyles(): void {
    if (logStylesInjected) return
    logStylesInjected = true

    const style = document.createElement('style')
    style.id = 'log-panel-styles'
    style.textContent = `
        #log-panel .panel-content {
            padding: 0;
        }
        .log-toolbar {
            display: flex;
            justify-content: flex-end;
            padding: 6px 10px;
            border-bottom: 1px solid #333;
        }
        .log-clear-btn {
            background: #333;
            border: none;
            color: #aaa;
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }
        .log-clear-btn:hover {
            background: #444;
            color: #fff;
        }
        .log-entries {
            max-height: 260px;
            overflow-y: auto;
            font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 11px;
            padding: 4px 0;
        }
        .log-entry {
            padding: 2px 10px;
            display: flex;
            gap: 8px;
            line-height: 1.5;
        }
        .log-entry:hover {
            background: rgba(255, 255, 255, 0.03);
        }
        .log-time {
            color: #555;
            flex-shrink: 0;
        }
        .log-msg {
            word-break: break-word;
        }
        .log-info .log-msg { color: #bbb; }
        .log-warn .log-msg { color: #fb0; }
        .log-error .log-msg { color: #f44; }
    `
    document.head.appendChild(style)
}

function formatTime(timestamp: number): string {
    const d = new Date(timestamp)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `${h}:${m}:${s}.${ms}`
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function appendLogEntry(container: HTMLElement, entry: LogEntry): void {
    const row = document.createElement('div')
    row.className = `log-entry log-${entry.level}`
    row.innerHTML = `<span class="log-time">${formatTime(entry.timestamp)}</span><span class="log-msg">${escapeHtml(entry.message)}</span>`
    container.appendChild(row)
}

export function createLogPanel(): PanelHandle {
    injectLogStyles()

    const panel = createPanel({
        id: 'log-panel',
        title: 'Log',
        startHidden: true,
        position: {
            bottom: 'max(12px, env(safe-area-inset-bottom))',
            left: 'max(220px, env(safe-area-inset-left))'
        },
        zIndex: 1000,
        minWidth: '340px'
    })

    // Toolbar
    const toolbar = document.createElement('div')
    toolbar.className = 'log-toolbar'
    const clearBtn = document.createElement('button')
    clearBtn.className = 'log-clear-btn'
    clearBtn.textContent = 'Clear'
    toolbar.appendChild(clearBtn)

    // Log entries container
    const logList = document.createElement('div')
    logList.className = 'log-entries'

    panel.content.appendChild(toolbar)
    panel.content.appendChild(logList)

    // Render existing entries
    for (const entry of AppLog.getEntries()) {
        appendLogEntry(logList, entry)
    }
    logList.scrollTop = logList.scrollHeight

    // Subscribe to new entries
    const unsubscribe = AppLog.onEntry((entry) => {
        if (entry.message === '') {
            // Clear signal
            logList.innerHTML = ''
            return
        }
        appendLogEntry(logList, entry)
        logList.scrollTop = logList.scrollHeight
    })

    // Clear button
    clearBtn.addEventListener('click', () => AppLog.clear())

    // Override destroy to clean up subscription
    const originalDestroy = panel.destroy
    panel.destroy = () => {
        unsubscribe()
        originalDestroy()
    }

    return panel
}
