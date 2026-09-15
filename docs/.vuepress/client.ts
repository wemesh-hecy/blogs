import { defineClientConfig, useRoute } from 'vuepress/client'
import { onMounted, watch } from 'vue'

import './theme/styles/custom.css'
import './theme/styles/knowledge.css'

const KEEP_OPEN_KEY = 'knowledge-graph-keep-open'
const PLUGIN_OPEN_KEY = 'knowledge-graph-sidebar-open'
const POS_KEY = 'knowledge-graph-ball-pos'
const SIZE_KEY = 'knowledge-graph-float-size'

const DEFAULT_LOCAL_DEPTH = 3
const MIN_WIDTH = 300
const MIN_HEIGHT = 240
const EDGE = 10
const DRAG_THRESHOLD = 4
const CLOSE_ANIM_MS = 320
const MAX_FIT_ZOOM = 2.2

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface Point {
  left: number
  top: number
}

interface Size {
  width: number
  height: number
}

type HAnchor = 'left' | 'right'
type VAnchor = 'top' | 'bottom'

function isSidebarOpen(): boolean {
  return Boolean(document.querySelector('#knowledge-graph-sidebar.kg-sidebar.open'))
}

function setKeepOpen(open: boolean): void {
  localStorage.setItem(KEEP_OPEN_KEY, open ? '1' : '0')
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  }
  catch {
    return null
  }
}

function ballEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.kg-floating-button')
}

function sidebarEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#knowledge-graph-sidebar')
}

function ballSize(): Size {
  const ball = ballEl()
  return {
    width: Math.round(ball?.offsetWidth || 88),
    height: Math.round(ball?.offsetHeight || 38),
  }
}

function clampSize(width: number, height: number): Size {
  return {
    width: Math.min(Math.max(MIN_WIDTH, width), window.innerWidth - EDGE * 2),
    height: Math.min(Math.max(MIN_HEIGHT, height), window.innerHeight - EDGE * 2),
  }
}

function clampBall(left: number, top: number): Point {
  const size = ballSize()
  return {
    left: Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - size.width - EDGE)),
    top: Math.min(Math.max(EDGE, top), Math.max(EDGE, window.innerHeight - size.height - EDGE)),
  }
}

function preferredSize(): Size {
  const root = document.documentElement
  return clampSize(
    Number.parseFloat(root.style.getPropertyValue('--kg-float-w')) || 380,
    Number.parseFloat(root.style.getPropertyValue('--kg-float-h')) || 520,
  )
}

function applySize(size: Size, refresh = true): void {
  const next = clampSize(size.width, size.height)
  const root = document.documentElement
  root.style.setProperty('--kg-float-w', `${next.width}px`)
  root.style.setProperty('--kg-float-h', `${next.height}px`)
  if (!refresh)
    return
  const rect = ballEl()?.getBoundingClientRect()
  if (rect)
    applyBallPos(rect.left, rect.top, true)
}

function currentAnchors(): { h: HAnchor, v: VAnchor } {
  const root = document.documentElement
  return {
    h: root.classList.contains('kg-anchor-left') ? 'left' : 'right',
    v: root.classList.contains('kg-anchor-top') ? 'top' : 'bottom',
  }
}

function ballFromPanel(panel: Rect, h: HAnchor, v: VAnchor): Point {
  const b = ballSize()
  return clampBall(
    h === 'right' ? panel.left + panel.width - b.width : panel.left,
    v === 'bottom' ? panel.top + panel.height : panel.top - b.height,
  )
}

function writeFrame(panel: Rect, ball: Point, h: HAnchor, v: VAnchor): void {
  const b = ballSize()
  const root = document.documentElement
  applyAnchors(h, v)
  root.classList.add('kg-ball-ready')
  root.style.setProperty('--kg-float-w', `${panel.width}px`)
  root.style.setProperty('--kg-float-h', `${panel.height}px`)
  root.style.setProperty('--kg-panel-left', `${panel.left}px`)
  root.style.setProperty('--kg-panel-top', `${panel.top}px`)
  root.style.setProperty('--kg-panel-w', `${panel.width}px`)
  root.style.setProperty('--kg-panel-h', `${panel.height}px`)
  root.style.setProperty('--kg-ball-left', `${ball.left}px`)
  root.style.setProperty('--kg-ball-top', `${ball.top}px`)
  root.style.setProperty('--kg-ball-w', `${b.width}px`)
  root.style.setProperty('--kg-ball-h', `${b.height}px`)
  root.style.setProperty('--kg-origin', `${v === 'bottom' ? 'bottom' : 'top'} ${h === 'right' ? 'right' : 'left'}`)
}

function applyFrame(panel: Rect): void {
  const { h, v } = currentAnchors()
  const next: Rect = {
    width: Math.min(Math.max(MIN_WIDTH, panel.width), window.innerWidth - EDGE * 2),
    height: Math.min(Math.max(MIN_HEIGHT, panel.height), window.innerHeight - EDGE * 2),
    left: panel.left,
    top: panel.top,
  }
  next.left = Math.min(Math.max(EDGE, next.left), window.innerWidth - next.width - EDGE)
  next.top = Math.min(Math.max(EDGE, next.top), window.innerHeight - next.height - EDGE)
  writeFrame(next, ballFromPanel(next, h, v), h, v)
}

function resizeRect(edge: ResizeEdge, dx: number, dy: number, start: Rect): Rect {
  let left = start.left
  let top = start.top
  let right = start.left + start.width
  let bottom = start.top + start.height
  const north = edge === 'n' || edge === 'nw' || edge === 'ne'
  const south = edge === 's' || edge === 'sw' || edge === 'se'
  const west = edge === 'w' || edge === 'nw' || edge === 'sw'
  const east = edge === 'e' || edge === 'ne' || edge === 'se'

  if (east)
    right = start.left + start.width + dx
  if (west)
    left = start.left + dx
  if (south)
    bottom = start.top + start.height + dy
  if (north)
    top = start.top + dy

  left = Math.max(EDGE, left)
  top = Math.max(EDGE, top)
  right = Math.min(window.innerWidth - EDGE, right)
  bottom = Math.min(window.innerHeight - EDGE, bottom)

  if (right - left < MIN_WIDTH) {
    if (west)
      left = right - MIN_WIDTH
    else
      right = left + MIN_WIDTH
  }
  if (bottom - top < MIN_HEIGHT) {
    if (north)
      top = bottom - MIN_HEIGHT
    else
      bottom = top + MIN_HEIGHT
  }

  return { left, top, width: right - left, height: bottom - top }
}

function applyAnchors(h: HAnchor, v: VAnchor): void {
  const root = document.documentElement
  root.classList.toggle('kg-anchor-left', h === 'left')
  root.classList.toggle('kg-anchor-right', h === 'right')
  root.classList.toggle('kg-anchor-top', v === 'top')
  root.classList.toggle('kg-anchor-bottom', v === 'bottom')
}

function applyBallPos(left: number, top: number, freeze = false): void {
  const ball = clampBall(left, top)
  const b = ballSize()
  const pref = preferredSize()
  const root = document.documentElement
  const h: HAnchor = freeze
    ? (root.classList.contains('kg-anchor-left') ? 'left' : 'right')
    : (ball.left + b.width / 2 >= window.innerWidth / 2 ? 'right' : 'left')
  const v: VAnchor = freeze
    ? (root.classList.contains('kg-anchor-top') ? 'top' : 'bottom')
    : (ball.top + b.height / 2 >= window.innerHeight / 2 ? 'bottom' : 'top')

  let panelW = pref.width
  let panelH = pref.height
  let panelLeft = ball.left
  let panelTop = ball.top

  if (v === 'bottom') {
    panelH = Math.min(panelH, Math.max(MIN_HEIGHT, ball.top - EDGE))
    panelTop = ball.top - panelH
  }
  else {
    panelH = Math.min(panelH, Math.max(MIN_HEIGHT, window.innerHeight - (ball.top + b.height) - EDGE))
    panelTop = ball.top + b.height
  }

  if (h === 'right') {
    panelW = Math.min(panelW, Math.max(MIN_WIDTH, ball.left + b.width - EDGE))
    panelLeft = ball.left + b.width - panelW
  }
  else {
    panelW = Math.min(panelW, Math.max(MIN_WIDTH, window.innerWidth - ball.left - EDGE))
    panelLeft = ball.left
  }

  applyAnchors(h, v)
  root.classList.add('kg-ball-ready')
  root.style.setProperty('--kg-ball-left', `${ball.left}px`)
  root.style.setProperty('--kg-ball-top', `${ball.top}px`)
  root.style.setProperty('--kg-ball-w', `${b.width}px`)
  root.style.setProperty('--kg-ball-h', `${b.height}px`)
  root.style.setProperty('--kg-panel-left', `${panelLeft}px`)
  root.style.setProperty('--kg-panel-top', `${panelTop}px`)
  root.style.setProperty('--kg-panel-w', `${panelW}px`)
  root.style.setProperty('--kg-panel-h', `${panelH}px`)
  root.style.setProperty('--kg-origin', `${v === 'bottom' ? 'bottom' : 'top'} ${h === 'right' ? 'right' : 'left'}`)
}

function saveBallPos(left: number, top: number): void {
  localStorage.setItem(POS_KEY, JSON.stringify(clampBall(left, top)))
}

function restoreLayout(): void {
  applyAnchors('right', 'bottom')
  const savedSize = readJSON<Size>(SIZE_KEY)
  if (savedSize)
    applySize(savedSize, false)

  const savedPos = readJSON<Point>(POS_KEY)
  if (savedPos) {
    applyBallPos(savedPos.left, savedPos.top)
    return
  }

  const rect = ballEl()?.getBoundingClientRect()
  if (rect)
    applyBallPos(rect.left, rect.top)
}

interface KgSetup {
  graph?: {
    width: (n: number) => unknown
    height: (n: number) => unknown
    zoom?: (k?: number, ms?: number) => number
  }
  localDepth?: number
  resizeGraph?: () => void
  fitGraph?: (duration?: number) => void
}

function kgSetup(): KgSetup | null {
  const shell = document.querySelector('#knowledge-graph-sidebar .kg-shell') as { __vueParentComponent?: { setupState?: KgSetup } } | null
  return shell?.__vueParentComponent?.setupState ?? null
}

function patchGraphMeasure(): void {
  const stage = document.querySelector<HTMLElement>('#knowledge-graph-sidebar .kg-renderer')
  if (!stage || stage.dataset.kgMeasure === '1')
    return
  stage.dataset.kgMeasure = '1'
  const orig = stage.getBoundingClientRect.bind(stage)
  stage.getBoundingClientRect = () => {
    const rect = orig()
    return new DOMRect(rect.x, rect.y, stage.clientWidth, stage.clientHeight)
  }
}

function resizeGraphToLayout(): void {
  patchGraphMeasure()
  const setup = kgSetup()
  const stage = document.querySelector<HTMLElement>('#knowledge-graph-sidebar .kg-renderer')
  if (!stage)
    return
  const width = stage.clientWidth
  const height = stage.clientHeight
  if (width < 40 || height < 40)
    return
  if (setup?.graph?.width && setup.graph.height) {
    setup.graph.width(width)
    setup.graph.height(height)
    return
  }
  setup?.resizeGraph?.()
}

const cappedGraphs = new WeakSet<object>()

function capGraphZoom(): void {
  const graph = kgSetup()?.graph
  const zoom = graph?.zoom?.()
  if (typeof zoom === 'number' && zoom > MAX_FIT_ZOOM)
    graph.zoom!(MAX_FIT_ZOOM, 0)
}

function patchGraphZoom(): void {
  const graph = kgSetup()?.graph
  if (!graph?.zoom || cappedGraphs.has(graph))
    return
  cappedGraphs.add(graph)
  const orig = graph.zoom.bind(graph)
  graph.zoom = ((k?: number, ms?: number) => {
    if (typeof k === 'number')
      return orig(Math.min(k, MAX_FIT_ZOOM), k > MAX_FIT_ZOOM ? 0 : ms)
    return orig()
  }) as NonNullable<KgSetup['graph']>['zoom']
  capGraphZoom()
}

let defaultDepthApplied = false

function applyDefaultDepth(): void {
  if (defaultDepthApplied)
    return
  const setup = kgSetup()
  const depth = setup?.localDepth as unknown
  if (depth == null)
    return
  if (typeof depth === 'object' && depth !== null && 'value' in depth)
    (depth as { value: number }).value = DEFAULT_LOCAL_DEPTH
  else
    setup!.localDepth = DEFAULT_LOCAL_DEPTH
  defaultDepthApplied = true
}

function prepareGraph(): void {
  applyDefaultDepth()
  patchGraphMeasure()
  patchGraphZoom()
  resizeGraphToLayout()
  capGraphZoom()
}

function scheduleGraphResize(): void {
  prepareGraph()
}

function ensureChrome(sidebar: Element): void {
  const header = sidebar.querySelector('.kg-sidebar-header')
  if (!header)
    return

  header.title = '拖动移动图谱'
  sidebar.querySelector('.kg-edge-actions')?.remove()
  header.querySelector('.kg-layout-actions')?.remove()
  header.querySelector('.kg-layout-button')?.remove()
  header.querySelector('.kg-collapse-button')?.remove()
  header.querySelector('.kg-drag-grip')?.remove()
  sidebar.querySelectorAll(':scope > .kg-edge-left, :scope > .kg-edge-right').forEach(el => el.remove())

  sidebar.querySelector('.kg-float-resize')?.remove()
  if (sidebar.querySelector('.kg-resizers'))
    return

  const box = document.createElement('div')
  box.className = 'kg-resizers'
  const edges: ResizeEdge[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']
  for (const edge of edges) {
    const handle = document.createElement('button')
    handle.type = 'button'
    handle.className = `kg-resize kg-resize-${edge}`
    handle.dataset.kgEdge = edge
    handle.tabIndex = -1
    handle.title = '拖动调整大小'
    handle.setAttribute('aria-label', '拖动调整图谱大小')
    box.appendChild(handle)
  }
  sidebar.appendChild(box)
}

let wasOpen = false
let closeTimer = 0

function syncFloatState(): void {
  const sidebar = sidebarEl()
  const open = Boolean(sidebar?.classList.contains('open'))
  const root = document.documentElement

  if (!open && wasOpen) {
    root.classList.add('kg-closing')
    window.clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => {
      root.classList.remove('kg-closing')
      if (!isSidebarOpen())
        root.classList.remove('kg-sidebar-open')
    }, CLOSE_ANIM_MS)
  }

  if (open) {
    window.clearTimeout(closeTimer)
    root.classList.remove('kg-closing')
  }

  if (open && !wasOpen) {
    restoreLayout()
    scheduleGraphResize()
  }

  root.classList.toggle('kg-sidebar-open', open || root.classList.contains('kg-closing'))
  wasOpen = open
}

function reopenIfPinned(): void {
  if (localStorage.getItem(KEEP_OPEN_KEY) !== '1' || isSidebarOpen())
    return
  ballEl()?.click()
}

let suppressClick = false
let dragging = false
let resizing = false
let windowBound = false

function bindWidget(): void {
  const sidebar = sidebarEl()
  const ball = ballEl()
  if (!sidebar || !ball)
    return

  ensureChrome(sidebar)
  if (ball.dataset.kgInteractive === '1' && sidebar.dataset.kgInteractive === '1')
    return
  ball.dataset.kgInteractive = '1'
  sidebar.dataset.kgInteractive = '1'

  let moved = false
  let startX = 0
  let startY = 0
  let startWidth = 0
  let startHeight = 0
  let startLeft = 0
  let startTop = 0
  let startBallLeft = 0
  let startBallTop = 0
  let lastX = 0
  let lastY = 0
  let resizeEdge: ResizeEdge | null = null
  let lastGraphResize = 0

  const currentBallPoint = (): Point => {
    const rect = ball.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  }

  const stop = (event?: PointerEvent): void => {
    if (!dragging && !resizing)
      return
    document.documentElement.classList.remove('kg-dragging')
    document.documentElement.removeAttribute('data-kg-resize')
    if (dragging && moved) {
      const point = currentBallPoint()
      applyBallPos(point.left, point.top)
      saveBallPos(point.left, point.top)
    }
    if (resizing) {
      const rect = sidebar.getBoundingClientRect()
      const size = clampSize(rect.width, rect.height)
      localStorage.setItem(SIZE_KEY, JSON.stringify(size))
      const ballPoint = currentBallPoint()
      saveBallPos(ballPoint.left, ballPoint.top)
      applyFrame({ left: rect.left, top: rect.top, width: size.width, height: size.height })
      resizeGraphToLayout()
    }
    if (moved)
      suppressClick = true
    dragging = false
    resizing = false
    resizeEdge = null
  }

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target || event.button !== 0)
      return

    const ballRect = ball.getBoundingClientRect()
    const sideRect = sidebar.getBoundingClientRect()
    startX = event.clientX
    startY = event.clientY
    startBallLeft = ballRect.left
    startBallTop = ballRect.top
    startWidth = sideRect.width
    startHeight = sideRect.height
    startLeft = sideRect.left
    startTop = sideRect.top
    lastX = event.clientX
    lastY = event.clientY
    moved = false
    resizeEdge = null

    const handle = target.closest<HTMLElement>('[data-kg-edge]')
    if (handle?.dataset.kgEdge) {
      event.preventDefault()
      resizing = true
      resizeEdge = handle.dataset.kgEdge as ResizeEdge
      document.documentElement.classList.add('kg-dragging')
      document.documentElement.dataset.kgResize = resizeEdge
      return
    }

    if (target.closest('.kg-floating-button') || (target.closest('.kg-sidebar-header') && !target.closest('button'))) {
      dragging = true
      document.documentElement.classList.add('kg-dragging')
    }
  }

  ball.addEventListener('pointerdown', onPointerDown)
  sidebar.addEventListener('pointerdown', onPointerDown)

  if (!windowBound) {
    windowBound = true
    window.addEventListener('pointermove', (event) => {
      if (!dragging && !resizing)
        return
      lastX = event.clientX
      lastY = event.clientY
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
        moved = true

      if (dragging) {
        applyBallPos(startBallLeft + dx, startBallTop + dy, true)
        return
      }

      if (!resizeEdge)
        return
      applyFrame(resizeRect(resizeEdge, dx, dy, {
        left: startLeft,
        top: startTop,
        width: startWidth,
        height: startHeight,
      }))
      const now = performance.now()
      if (now - lastGraphResize > 90) {
        lastGraphResize = now
        resizeGraphToLayout()
      }
    })

    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const blockDragClick = (event: MouseEvent): void => {
    if (!moved && !suppressClick)
      return
    if ((event.target as HTMLElement | null)?.closest('.kg-floating-button, .kg-sidebar-header, .kg-resize')) {
      event.preventDefault()
      event.stopPropagation()
    }
    moved = false
    suppressClick = false
  }

  ball.addEventListener('click', blockDragClick, true)
  sidebar.addEventListener('click', blockDragClick, true)
}

export default defineClientConfig({
  setup() {
    if (typeof window === 'undefined')
      return

    const route = useRoute()

    onMounted(() => {
      applyAnchors('right', 'bottom')

      if (localStorage.getItem(PLUGIN_OPEN_KEY) === '1')
        setKeepOpen(true)

      document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null
        if (!target)
          return

        if (target.closest('.kg-floating-button')) {
          if (suppressClick)
            return
          setKeepOpen(!isSidebarOpen())
          return
        }
        if (target.closest('.kg-sidebar-header button[title="关闭"], .kg-sidebar-mask'))
          setKeepOpen(false)
      }, true)

      const observer = new MutationObserver(() => {
        bindWidget()
        prepareGraph()
        syncFloatState()
      })

      const attach = (): void => {
        if (!sidebarEl() || !ballEl()) {
          requestAnimationFrame(attach)
          return
        }
        bindWidget()
        restoreLayout()
        observer.observe(sidebarEl()!, { attributes: true, attributeFilter: ['class', 'style'] })
        syncFloatState()
        const waitGraph = (): void => {
          prepareGraph()
          if (!kgSetup()?.graph)
            requestAnimationFrame(waitGraph)
        }
        waitGraph()
      }

      attach()
      window.addEventListener('resize', () => {
        const savedPos = readJSON<Point>(POS_KEY)
        if (savedPos) {
          applyBallPos(savedPos.left, savedPos.top)
          return
        }
        const rect = ballEl()?.getBoundingClientRect()
        if (rect)
          applyBallPos(rect.left, rect.top)
      })
    })

    watch(() => route.path, () => {
      window.setTimeout(reopenIfPinned, 0)
    })
  },
})
