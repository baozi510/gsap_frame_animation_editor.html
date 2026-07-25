import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js'
import type { EditorElement, Project, RuntimeState, Scene } from '@/types/editor'
import { resolveAssetSource } from '@/services/assets'
import { clamp, degrees, radians } from '@/utils/helpers'
import { resizeFromHandle, type ResizeHandleName, type ResizeSnapshot } from '@/utils/eightPointResize'

interface RenderNode {
  container: Container
  visual: Sprite | Graphics | Text
  video?: HTMLVideoElement
  elementId: string
}

interface DragState {
  type: 'move' | 'resize' | 'rotate'
  startX?: number
  startY?: number
  x?: number
  y?: number
  resizeHandle?: ResizeHandleName
  resizeSnapshot?: ResizeSnapshot
  before: string
}

export interface RendererCallbacks {
  onSelect?: (id: string | null) => void
  onTransformStart?: () => string
  onTransformLive?: (id: string, updater: (element: EditorElement) => void) => void
  onTransformEnd?: (before: string) => void
  onAssetError?: (message: string) => void
}

const HANDLE_CURSORS: Record<ResizeHandleName, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

export class PixiEditorRenderer {
  app: Application | null = null
  private project: Project
  private getScene: () => Scene
  private getSelectedId: () => string | null
  private host: HTMLElement | null = null
  private sceneLayer = new Container()
  private controlLayer = new Container()
  private nodes = new Map<string, RenderNode>()
  private selection = new Container()
  private border = new Graphics()
  private resizeHandles = new Map<ResizeHandleName, Graphics>()
  private rotateHandle = new Graphics()
  private drag: DragState | null = null
  private renderToken = 0
  callbacks: RendererCallbacks = {}

  constructor(project: Project, getScene: () => Scene, getSelectedId: () => string | null) {
    this.project = project
    this.getScene = getScene
    this.getSelectedId = getSelectedId
  }

  async mount(host: HTMLElement) {
    this.host = host
    this.app = new Application()
    await this.app.init({
      width: this.project.width,
      height: this.project.height,
      background: this.getScene().background,
      antialias: true,
      autoStart: false,
      resolution: 1,
      preference: 'webgl',
      preserveDrawingBuffer: true,
    })
    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = new Rectangle(0, 0, this.project.width, this.project.height)
    host.replaceChildren(this.app.canvas)
    this.app.stage.addChild(this.sceneLayer, this.controlLayer)
    this.createSelectionControls()
    this.bindPointerEvents()
    await this.renderScene()
  }

  async resize() {
    if (!this.app) return
    this.app.renderer.resize(this.project.width, this.project.height)
    this.app.stage.hitArea = new Rectangle(0, 0, this.project.width, this.project.height)
    await this.renderScene()
  }

  async renderScene() {
    if (!this.app) return
    const token = ++this.renderToken
    this.sceneLayer.removeChildren().forEach((child) => child.destroy({ children: true }))
    this.nodes.forEach((node) => {
      if (node.video) {
        node.video.pause()
        node.video.removeAttribute('src')
        node.video.load()
      }
    })
    this.nodes.clear()
    this.app.renderer.background.color = this.getScene().background
    const elements = [...this.getScene().elements].sort((a, b) => a.z - b.z)
    for (const element of elements) {
      const node = await this.createNode(element)
      if (token !== this.renderToken) {
        node.container.destroy({ children: true })
        return
      }
      this.sceneLayer.addChild(node.container)
      this.nodes.set(element.id, node)
    }
    this.updateSelection()
    this.renderNow()
  }

  private async resolveElementSource(element: EditorElement) {
    if (!element.assetId) return element.src
    const asset = this.project.assets.find((item) => item.id === element.assetId)
    if (!asset) throw new Error(`项目缺少素材信息：${element.name}`)
    return resolveAssetSource(asset, element.src)
  }

  private async createVideo(source: string) {
    const video = document.createElement('video')
    video.src = source
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    if (!source.startsWith('blob:') && !source.startsWith('data:')) video.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('视频素材加载超时')), 15000)
      video.addEventListener('loadeddata', () => {
        window.clearTimeout(timer)
        resolve()
      }, { once: true })
      video.addEventListener('error', () => {
        window.clearTimeout(timer)
        reject(new Error('视频素材无法加载'))
      }, { once: true })
      video.load()
    })
    video.pause()
    return video
  }

  private async createImageTexture(source: string) {
    const image = document.createElement('img')
    image.decoding = 'async'
    if (!source.startsWith('blob:') && !source.startsWith('data:')) image.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('图片素材加载超时')), 15000)
      image.addEventListener('load', () => {
        window.clearTimeout(timer)
        if (!image.naturalWidth || !image.naturalHeight) reject(new Error('图片素材尺寸无效'))
        else resolve()
      }, { once: true })
      image.addEventListener('error', () => {
        window.clearTimeout(timer)
        reject(new Error('图片素材无法解码'))
      }, { once: true })
      image.src = source
    })
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined)
    return Texture.from(image)
  }

  private async createNode(element: EditorElement): Promise<RenderNode> {
    const container = new Container()
    container.label = element.id
    container.eventMode = element.locked ? 'none' : 'static'
    container.cursor = element.locked ? 'not-allowed' : 'move'
    container.hitArea = new Rectangle(-element.width / 2, -element.height / 2, element.width, element.height)

    let visual: Sprite | Graphics | Text
    let video: HTMLVideoElement | undefined
    if (element.type === 'image' || element.type === 'video') {
      let texture: Texture = Texture.WHITE
      try {
        const source = await this.resolveElementSource(element)
        if (!source) throw new Error(`素材没有可用地址：${element.name}`)
        if (element.type === 'video') {
          video = await this.createVideo(source)
          texture = Texture.from(video)
        } else {
          texture = await this.createImageTexture(source)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `素材加载失败：${element.name}`
        console.error(error)
        this.callbacks.onAssetError?.(message)
        texture = Texture.WHITE
      }
      const sprite = new Sprite(texture || Texture.WHITE)
      sprite.anchor.set(0.5)
      sprite.width = element.width
      sprite.height = element.height
      visual = sprite
    } else if (element.type === 'shape') {
      visual = this.createShape(element)
    } else {
      const text = new Text({
        text: element.text ?? '文字',
        style: new TextStyle({
          fontFamily: element.style.fontFamily ?? 'Microsoft YaHei',
          fontSize: element.style.fontSize ?? 60,
          fontWeight: element.style.fontWeight ?? '700',
          fill: element.style.color ?? '#171923',
          align: element.style.align ?? 'center',
          wordWrap: true,
          wordWrapWidth: element.width,
        }),
      })
      text.anchor.set(0.5)
      if (text.width > element.width) text.scale.set(element.width / text.width)
      visual = text
    }

    container.addChild(visual)
    this.applyBase(container, element)
    container.visible = element.visible
    container.on('pointerdown', (event) => this.beginMove(event, element.id))
    return { container, visual, video, elementId: element.id }
  }

  private createShape(element: EditorElement) {
    return new Graphics()
      .roundRect(-element.width / 2, -element.height / 2, element.width, element.height, Math.min(element.style.radius ?? 0, Math.min(element.width, element.height) / 2))
      .fill(element.style.fill ?? '#7a61ff')
  }

  private createSelectionControls() {
    this.selection.visible = false
    this.selection.eventMode = 'passive'

    const handleNames: ResizeHandleName[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
    for (const name of handleNames) {
      const handle = new Graphics()
      const corner = name.length === 2
      const size = corner ? 22 : 18
      handle.rect(-size / 2, -size / 2, size, size).fill('#7a61ff').stroke({ color: '#ffffff', width: 2 })
      handle.eventMode = 'static'
      handle.cursor = HANDLE_CURSORS[name]
      handle.on('pointerdown', (event) => this.beginResize(event, name))
      this.resizeHandles.set(name, handle)
      this.selection.addChild(handle)
    }

    this.rotateHandle.circle(0, 0, 15).fill('#7a61ff').stroke({ color: '#ffffff', width: 3 })
    this.rotateHandle.eventMode = 'static'
    this.rotateHandle.cursor = 'grab'
    this.rotateHandle.on('pointerdown', (event) => this.beginControl(event, 'rotate'))
    this.selection.addChild(this.border, this.rotateHandle)
    this.controlLayer.addChild(this.selection)
  }

  private bindPointerEvents() {
    if (!this.app) return
    this.app.stage.on('pointerdown', (event) => {
      if (event.target === this.app?.stage) {
        this.callbacks.onSelect?.(null)
        this.updateSelection()
      }
    })
    this.app.stage.on('globalpointermove', (event) => this.pointerMove(event))
    this.app.stage.on('pointerup', () => this.pointerUp())
    this.app.stage.on('pointerupoutside', () => this.pointerUp())
  }

  private beginMove(event: FederatedPointerEvent, id: string) {
    event.stopPropagation()
    const element = this.getScene().elements.find((item) => item.id === id)
    if (!element || element.locked) return
    this.callbacks.onSelect?.(id)
    this.drag = {
      type: 'move',
      startX: event.global.x,
      startY: event.global.y,
      x: element.x,
      y: element.y,
      before: this.callbacks.onTransformStart?.() ?? '',
    }
    this.updateSelection()
  }

  private beginResize(event: FederatedPointerEvent, handle: ResizeHandleName) {
    event.stopPropagation()
    const selectedId = this.getSelectedId()
    const element = this.getScene().elements.find((item) => item.id === selectedId)
    if (!element || element.locked) return
    this.drag = {
      type: 'resize',
      resizeHandle: handle,
      resizeSnapshot: {
        x: element.x,
        y: element.y,
        width: Math.max(1, element.width),
        height: Math.max(1, element.height),
        rotation: radians(element.rotation),
      },
      before: this.callbacks.onTransformStart?.() ?? '',
    }
  }

  private beginControl(event: FederatedPointerEvent, type: 'rotate') {
    event.stopPropagation()
    const selectedId = this.getSelectedId()
    const element = this.getScene().elements.find((item) => item.id === selectedId)
    if (!element || element.locked) return
    this.drag = { type, before: this.callbacks.onTransformStart?.() ?? '' }
  }

  private pointerMove(event: FederatedPointerEvent) {
    if (!this.drag) return
    const selectedId = this.getSelectedId()
    if (!selectedId) return
    const element = this.getScene().elements.find((item) => item.id === selectedId)
    if (!element) return
    const pointer = event.global

    this.callbacks.onTransformLive?.(selectedId, (target) => {
      if (this.drag?.type === 'move') {
        target.x = (this.drag.x ?? target.x) + pointer.x - (this.drag.startX ?? pointer.x)
        target.y = (this.drag.y ?? target.y) + pointer.y - (this.drag.startY ?? pointer.y)
      }
      if (this.drag?.type === 'resize' && this.drag.resizeHandle && this.drag.resizeSnapshot) {
        const next = resizeFromHandle(this.drag.resizeSnapshot, this.drag.resizeHandle, pointer.x, pointer.y)
        target.x = next.x
        target.y = next.y
        target.width = next.width
        target.height = next.height
      }
      if (this.drag?.type === 'rotate') {
        target.rotation = Math.round(degrees(Math.atan2(pointer.y - target.y, pointer.x - target.x)) + 90)
      }
    })
    this.syncElement(element)
  }

  private pointerUp() {
    if (!this.drag) return
    const before = this.drag.before
    this.drag = null
    if (before) this.callbacks.onTransformEnd?.(before)
  }

  syncElement(element: EditorElement) {
    const node = this.nodes.get(element.id)
    if (!node) return
    this.applyBase(node.container, element)
    node.container.visible = element.visible
    node.container.eventMode = element.locked ? 'none' : 'static'
    node.container.hitArea = new Rectangle(-element.width / 2, -element.height / 2, element.width, element.height)

    if (node.visual instanceof Sprite) {
      node.visual.width = element.width
      node.visual.height = element.height
    } else if (node.visual instanceof Graphics) {
      node.visual.clear()
        .roundRect(-element.width / 2, -element.height / 2, element.width, element.height, Math.min(element.style.radius ?? 0, Math.min(element.width, element.height) / 2))
        .fill(element.style.fill ?? '#7a61ff')
    } else {
      node.visual.text = element.text ?? '文字'
      node.visual.style.fontSize = element.style.fontSize ?? 60
      node.visual.style.fill = element.style.color ?? '#171923'
      node.visual.style.fontWeight = element.style.fontWeight ?? '700'
      node.visual.style.align = element.style.align ?? 'center'
      node.visual.style.wordWrapWidth = element.width
      node.visual.scale.set(1)
      if (node.visual.width > element.width) node.visual.scale.set(element.width / node.visual.width)
    }
    this.updateSelection()
    this.renderNow()
  }

  private applyBase(container: Container, element: EditorElement) {
    container.x = element.x
    container.y = element.y
    container.rotation = radians(element.rotation)
    container.alpha = element.alpha
    container.scale.set(1)
  }

  applyRuntime(states: Map<string, RuntimeState>) {
    states.forEach((state, id) => {
      const node = this.nodes.get(id)
      if (!node) return
      node.container.x = state.x
      node.container.y = state.y
      node.container.rotation = radians(state.rotation)
      node.container.scale.set(state.scaleX, state.scaleY)
      node.container.alpha = state.alpha
      node.container.visible = state.visible
    })
    this.updateSelection()
  }

  setMediaTime(time: number) {
    this.nodes.forEach((node, id) => {
      if (!node.video) return
      const element = this.getScene().elements.find((item) => item.id === id)
      if (!element) return
      const localTime = clamp(time - element.start, 0, Math.max(0, Math.min(element.duration, node.video.duration || element.duration)))
      if (Math.abs(node.video.currentTime - localTime) > 0.08) node.video.currentTime = localTime
      node.video.pause()
    })
  }

  async prepareFrame(time: number) {
    const tasks: Promise<void>[] = []
    this.nodes.forEach((node, id) => {
      if (!node.video) return
      const element = this.getScene().elements.find((item) => item.id === id)
      if (!element) return
      const target = clamp(time - element.start, 0, Math.max(0, Math.min(element.duration, node.video.duration || element.duration)))
      if (Math.abs(node.video.currentTime - target) < 0.01) return
      tasks.push(new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1200)
        node.video!.addEventListener('seeked', () => {
          window.clearTimeout(timer)
          resolve()
        }, { once: true })
        node.video!.currentTime = target
      }))
    })
    await Promise.all(tasks)
  }

  updateSelection() {
    const selectedId = this.getSelectedId()
    const element = this.getScene().elements.find((item) => item.id === selectedId)
    const node = selectedId ? this.nodes.get(selectedId) : null
    if (!element || !node || !element.visible || !node.container.visible) {
      this.selection.visible = false
      this.renderNow()
      return
    }
    this.selection.visible = true
    this.selection.x = node.container.x
    this.selection.y = node.container.y
    this.selection.rotation = node.container.rotation
    this.selection.scale.set(1)
    this.border.clear().rect(-element.width / 2, -element.height / 2, element.width, element.height).stroke({ color: '#7a61ff', width: 4, pixelLine: true })

    const positions: Record<ResizeHandleName, [number, number]> = {
      nw: [-element.width / 2, -element.height / 2],
      n: [0, -element.height / 2],
      ne: [element.width / 2, -element.height / 2],
      e: [element.width / 2, 0],
      se: [element.width / 2, element.height / 2],
      s: [0, element.height / 2],
      sw: [-element.width / 2, element.height / 2],
      w: [-element.width / 2, 0],
    }
    for (const [name, handle] of this.resizeHandles) handle.position.set(...positions[name])

    this.rotateHandle.position.set(0, -element.height / 2 - 48)
    this.renderNow()
  }

  setControlsVisible(visible: boolean) {
    this.controlLayer.visible = visible
    this.renderNow()
  }

  renderNow() {
    if (this.app) this.app.renderer.render(this.app.stage)
  }

  destroy() {
    this.nodes.forEach((node) => {
      node.video?.pause()
      node.video?.removeAttribute('src')
      node.video?.load()
    })
    this.app?.destroy(true, { children: true })
    this.app = null
    this.nodes.clear()
    this.host = null
  }
}
