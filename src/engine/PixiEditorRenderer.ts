import {
  Application,
  Assets,
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
import { degrees, radians } from '@/utils/helpers'

interface RenderNode {
  container: Container
  visual: Sprite | Graphics | Text
}

interface DragState {
  type: 'move' | 'resize' | 'rotate'
  startX?: number
  startY?: number
  x?: number
  y?: number
  before: string
}

export interface RendererCallbacks {
  onSelect?: (id: string | null) => void
  onTransformStart?: () => string
  onTransformLive?: (id: string, updater: (element: EditorElement) => void) => void
  onTransformEnd?: (before: string) => void
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
  private resizeHandle = new Graphics()
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
    this.nodes.clear()
    this.app.renderer.background.color = this.getScene().background
    const elements = [...this.getScene().elements].sort((a, b) => a.z - b.z)
    for (const element of elements) {
      const node = await this.createNode(element)
      if (token !== this.renderToken) return
      this.sceneLayer.addChild(node.container)
      this.nodes.set(element.id, node)
    }
    this.updateSelection()
    this.renderNow()
  }

  private async createNode(element: EditorElement): Promise<RenderNode> {
    const container = new Container()
    container.label = element.id
    container.eventMode = element.locked ? 'none' : 'static'
    container.cursor = element.locked ? 'not-allowed' : 'move'
    container.hitArea = new Rectangle(-element.width / 2, -element.height / 2, element.width, element.height)

    let visual: Sprite | Graphics | Text
    if (element.type === 'image') {
      let texture = Texture.WHITE
      if (element.src) {
        try {
          texture = await Assets.load(element.src)
        } catch {
          texture = Texture.WHITE
        }
      }
      const sprite = new Sprite(texture)
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
    return { container, visual }
  }

  private createShape(element: EditorElement) {
    return new Graphics()
      .roundRect(-element.width / 2, -element.height / 2, element.width, element.height, Math.min(element.style.radius ?? 0, Math.min(element.width, element.height) / 2))
      .fill(element.style.fill ?? '#7a61ff')
  }

  private createSelectionControls() {
    this.selection.visible = false
    this.selection.eventMode = 'passive'
    this.resizeHandle.rect(-13, -13, 26, 26).fill('#7a61ff').stroke({ color: '#ffffff', width: 3 })
    this.rotateHandle.circle(0, 0, 15).fill('#7a61ff').stroke({ color: '#ffffff', width: 3 })
    this.resizeHandle.eventMode = 'static'
    this.rotateHandle.eventMode = 'static'
    this.resizeHandle.cursor = 'nwse-resize'
    this.rotateHandle.cursor = 'grab'
    this.resizeHandle.on('pointerdown', (event) => this.beginControl(event, 'resize'))
    this.rotateHandle.on('pointerdown', (event) => this.beginControl(event, 'rotate'))
    this.selection.addChild(this.border, this.resizeHandle, this.rotateHandle)
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

  private beginControl(event: FederatedPointerEvent, type: 'resize' | 'rotate') {
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
      if (this.drag?.type === 'resize') {
        const dx = pointer.x - target.x
        const dy = pointer.y - target.y
        const cos = Math.cos(-radians(target.rotation))
        const sin = Math.sin(-radians(target.rotation))
        const localX = dx * cos - dy * sin
        const localY = dx * sin + dy * cos
        target.width = Math.max(40, Math.abs(localX) * 2)
        target.height = Math.max(40, Math.abs(localY) * 2)
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
  }

  updateSelection() {
    const selectedId = this.getSelectedId()
    const element = this.getScene().elements.find((item) => item.id === selectedId)
    const node = selectedId ? this.nodes.get(selectedId) : null
    if (!element || !node || !element.visible) {
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
    this.resizeHandle.position.set(element.width / 2, element.height / 2)
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
    this.app?.destroy(true, { children: true })
    this.app = null
    this.nodes.clear()
    this.host = null
  }
}
