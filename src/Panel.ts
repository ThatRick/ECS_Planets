/**
 * Reusable draggable panel system
 * Provides createPanel() factory and enableDragging() for all floating UI panels.
 */

export interface PanelOptions {
    id: string
    title: string
    closable?: boolean          // default: true
    startHidden?: boolean       // default: true
    position?: {
        top?: string
        bottom?: string
        left?: string
        right?: string
    }
    zIndex?: number             // default: 1000
    minWidth?: string           // default: '180px'
    onClose?: () => void
}

export interface PanelHandle {
    element: HTMLElement
    header: HTMLElement
    content: HTMLElement
    show: () => void
    hide: () => void
    toggle: (visible?: boolean) => void
    isVisible: () => boolean
    destroy: () => void
}

let stylesInjected = false

function injectBaseStyles(): void {
    if (stylesInjected) return
    stylesInjected = true

    const style = document.createElement('style')
    style.id = 'panel-base-styles'
    style.textContent = `
        .panel-base {
            position: fixed;
            background: rgba(20, 20, 22, 0.95);
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            border: 1px solid #333;
            overflow: hidden;
        }
        .panel-base.hidden {
            display: none !important;
        }
        .panel-base .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: #222;
            border-bottom: 1px solid #333;
            border-radius: 10px 10px 0 0;
            cursor: grab;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
        }
        .panel-base .panel-header.dragging {
            cursor: grabbing;
        }
        .panel-base .panel-title {
            font-size: 11px;
            font-weight: 600;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .panel-base .close-btn {
            background: none;
            border: none;
            color: #888;
            font-size: 20px;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            transition: color 0.15s;
        }
        .panel-base .close-btn:hover {
            color: #fff;
        }
        .panel-base .panel-content {
            padding: 10px 14px;
        }
    `
    document.head.appendChild(style)
}

export function createPanel(options: PanelOptions): PanelHandle {
    injectBaseStyles()

    const {
        id,
        title,
        closable = true,
        startHidden = true,
        position = {},
        zIndex = 1000,
        minWidth = '180px',
        onClose
    } = options

    const element = document.createElement('div')
    element.id = id
    element.className = 'panel-base' + (startHidden ? ' hidden' : '')

    // Position
    element.style.zIndex = String(zIndex)
    element.style.minWidth = minWidth
    if (position.top) element.style.top = position.top
    if (position.bottom) element.style.bottom = position.bottom
    if (position.left) element.style.left = position.left
    if (position.right) element.style.right = position.right

    // Header
    const header = document.createElement('div')
    header.className = 'panel-header'

    const titleEl = document.createElement('span')
    titleEl.className = 'panel-title'
    titleEl.textContent = title
    header.appendChild(titleEl)

    if (closable) {
        const closeBtn = document.createElement('button')
        closeBtn.className = 'close-btn'
        closeBtn.setAttribute('aria-label', 'Close')
        closeBtn.innerHTML = '&times;'
        closeBtn.addEventListener('click', () => {
            handle.hide()
            onClose?.()
        })
        header.appendChild(closeBtn)
    }

    // Content
    const content = document.createElement('div')
    content.className = 'panel-content'

    element.appendChild(header)
    element.appendChild(content)

    // Dragging
    const cleanupDrag = enableDragging(element, header)

    const handle: PanelHandle = {
        element,
        header,
        content,
        show() {
            element.classList.remove('hidden')
        },
        hide() {
            element.classList.add('hidden')
        },
        toggle(visible?: boolean) {
            if (visible === undefined) {
                element.classList.toggle('hidden')
            } else if (visible) {
                element.classList.remove('hidden')
            } else {
                element.classList.add('hidden')
            }
        },
        isVisible() {
            return !element.classList.contains('hidden')
        },
        destroy() {
            cleanupDrag()
            element.remove()
        }
    }

    return handle
}

/**
 * Attach drag-to-move behaviour to any panel element via its header handle.
 * Returns a cleanup function that removes all listeners.
 */
export function enableDragging(panel: HTMLElement, handle: HTMLElement): () => void {
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0
    let dragging = false

    function onPointerDown(e: PointerEvent): void {
        // Only primary button
        if (e.button !== 0) return
        // Don't drag if clicking a button inside the header
        if ((e.target as HTMLElement).closest('button')) return

        dragging = true
        handle.classList.add('dragging')

        startX = e.clientX
        startY = e.clientY

        // Convert to pixel-based positioning
        const rect = panel.getBoundingClientRect()
        startLeft = rect.left
        startTop = rect.top

        panel.style.left = rect.left + 'px'
        panel.style.top = rect.top + 'px'
        panel.style.right = 'auto'
        panel.style.bottom = 'auto'
        panel.style.margin = '0'

        handle.setPointerCapture(e.pointerId)
        e.preventDefault()
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragging) return

        const dx = e.clientX - startX
        const dy = e.clientY - startY

        let newLeft = startLeft + dx
        let newTop = startTop + dy

        // Clamp to viewport
        const maxLeft = window.innerWidth - panel.offsetWidth
        const maxTop = window.innerHeight - panel.offsetHeight
        newLeft = Math.max(0, Math.min(maxLeft, newLeft))
        newTop = Math.max(0, Math.min(maxTop, newTop))

        panel.style.left = newLeft + 'px'
        panel.style.top = newTop + 'px'
    }

    function onPointerUp(): void {
        if (!dragging) return
        dragging = false
        handle.classList.remove('dragging')
    }

    handle.addEventListener('pointerdown', onPointerDown)
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
    handle.addEventListener('pointercancel', onPointerUp)

    return () => {
        handle.removeEventListener('pointerdown', onPointerDown)
        handle.removeEventListener('pointermove', onPointerMove)
        handle.removeEventListener('pointerup', onPointerUp)
        handle.removeEventListener('pointercancel', onPointerUp)
    }
}
