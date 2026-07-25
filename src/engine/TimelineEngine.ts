import { gsap } from 'gsap'
import type { AnimationClip, EditorElement, MotionClip, RuntimeState, Scene } from '@/types/editor'
import { clamp } from '@/utils/helpers'
import { getMotionClips } from '@/utils/motionClips'

export interface TimelineRenderer {
  applyRuntime(states: Map<string, RuntimeState>): void
  setControlsVisible?(visible: boolean): void
  setMediaTime?(time: number): void
  prepareFrame?(time: number): Promise<void>
  renderNow?(): void
}

export interface TimelineCanvasSize {
  width: number
  height: number
}

interface MotionRuntime {
  x: number
  y: number
  rotation: number
  scale: number
  opacity: number
}

export class TimelineEngine {
  private renderer: TimelineRenderer
  private getCanvasSize: () => TimelineCanvasSize
  private scene: Scene | null = null
  private timeline: gsap.core.Timeline | null = null
  private previewTween: gsap.core.Tween | null = null
  private states = new Map<string, RuntimeState>()
  private composedStates = new Map<string, RuntimeState>()
  private motionLayers = new Map<string, MotionRuntime[]>()
  time = 0
  playing = false
  loop = false
  onTimeChange?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void

  constructor(renderer: TimelineRenderer, getCanvasSize: () => TimelineCanvasSize) {
    this.renderer = renderer
    this.getCanvasSize = getCanvasSize
  }

  compile(scene: Scene, keepTime = true) {
    const previousTime = keepTime ? this.time : 0
    this.stopPreview(false)
    this.timeline?.kill()
    this.scene = scene
    this.states.clear()
    this.composedStates.clear()
    this.motionLayers.clear()
    this.setPlaying(false)

    const timeline = gsap.timeline({
      paused: true,
      onUpdate: () => {
        this.time = timeline.time()
        this.applyComposedRuntime()
        this.renderer.setMediaTime?.(this.time)
        this.renderer.renderNow?.()
        this.onTimeChange?.(this.time)
      },
      onComplete: () => {
        if (this.loop) {
          timeline.restart()
        } else {
          this.setPlaying(false)
          this.renderer.setControlsVisible?.(true)
        }
      },
    })

    scene.elements.forEach((element) => this.addElement(timeline, element))
    timeline.to({}, { duration: scene.duration }, 0)
    this.timeline = timeline
    this.seek(clamp(previousTime, 0, scene.duration))
  }

  private addElement(timeline: gsap.core.Timeline, element: EditorElement) {
    const base = this.baseState(element)
    const state: RuntimeState = { ...base, visible: false }
    this.states.set(element.id, state)
    this.motionLayers.set(element.id, [])

    const sceneDuration = this.scene?.duration ?? element.start + element.duration
    const elementStart = clamp(element.start, 0, sceneDuration)
    const elementEnd = clamp(element.start + element.duration, elementStart, sceneDuration)
    timeline.set(state, { ...base, visible: element.visible }, elementStart)

    if (elementEnd < sceneDuration - 0.0001) {
      timeline.set(state, { visible: false }, elementEnd)
    }

    const clips = [...element.animations].sort((a, b) => a.offset - b.offset)
    clips.forEach((clip) => this.addAnimationClip(timeline, state, element, base, clip, elementStart, elementEnd))

    const motionClips = getMotionClips(element).slice().sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
    motionClips.forEach((clip) => this.addMotionClip(timeline, element, clip, elementStart, elementEnd))
  }

  private addAnimationClip(
    timeline: gsap.core.Timeline,
    state: RuntimeState,
    element: EditorElement,
    base: RuntimeState,
    clip: AnimationClip,
    elementStart: number,
    elementEnd: number,
  ) {
    const start = clamp(elementStart + clip.offset, elementStart, elementEnd)
    const end = clamp(start + clip.duration, start, elementEnd)
    const duration = Math.max(0.01, end - start)

    if (clip.phase === 'enter') {
      timeline.set(state, { ...this.effectState(clip, base, element, 'enter'), visible: element.visible }, start)
      timeline.to(state, { ...base, visible: element.visible, duration, ease: clip.ease }, start)
      return
    }

    if (clip.phase === 'exit') {
      timeline.set(state, { ...base, visible: element.visible }, start)
      timeline.to(state, { ...this.effectState(clip, base, element, 'exit'), duration, ease: clip.ease }, start)
      timeline.set(state, { visible: false }, end)
      return
    }

    this.addHoldClip(timeline, state, clip, base, element, start, duration)
  }

  private addMotionClip(
    timeline: gsap.core.Timeline,
    element: EditorElement,
    clip: MotionClip,
    elementStart: number,
    elementEnd: number,
  ) {
    const start = clamp(elementStart + Number(clip.offset || 0), elementStart, elementEnd)
    const end = clamp(start + Number(clip.duration || 0.8), start, elementEnd)
    const duration = Math.max(0.01, end - start)
    const layer: MotionRuntime = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 0 }
    this.motionLayers.get(element.id)?.push(layer)

    timeline.to(layer, {
      x: Number(clip.x || 0),
      y: Number(clip.y || 0),
      rotation: Number(clip.rotation || 0),
      scale: clamp(Number(clip.scale ?? 100), 1, 500) / 100,
      opacity: clamp(Number(clip.opacity || 0), -100, 100) / 100,
      duration,
      ease: clip.ease || 'power2.inOut',
    }, start)
  }

  private applyComposedRuntime() {
    this.composedStates.clear()
    this.states.forEach((state, id) => {
      const output: RuntimeState = { ...state }
      const layers = this.motionLayers.get(id) ?? []
      for (const layer of layers) {
        output.x += layer.x
        output.y += layer.y
        output.rotation += layer.rotation
        output.scaleX *= layer.scale
        output.scaleY *= layer.scale
        output.alpha = clamp(output.alpha + layer.opacity, 0, 1)
      }
      this.composedStates.set(id, output)
    })
    this.renderer.applyRuntime(this.composedStates)
  }

  private baseState(element: EditorElement): RuntimeState {
    return {
      x: element.x,
      y: element.y,
      rotation: element.rotation,
      scaleX: 1,
      scaleY: 1,
      alpha: element.alpha,
      visible: element.visible,
    }
  }

  private effectState(
    clip: AnimationClip,
    base: RuntimeState,
    element: EditorElement,
    phase: 'enter' | 'exit',
  ): RuntimeState {
    const percent = Math.max(0, Number(clip.intensity ?? 100)) / 100
    const visibilityPercent = Math.min(1, percent)
    const state = { ...base }
    const canvas = this.getCanvasSize()
    const interpolate = (from: number, target: number) => from + (target - from) * percent

    switch (clip.preset) {
      case 'fade':
        state.alpha = base.alpha * (1 - visibilityPercent)
        break
      case 'left':
        state.x = interpolate(base.x, -element.width / 2)
        break
      case 'right':
        state.x = interpolate(base.x, canvas.width + element.width / 2)
        break
      case 'up': {
        const targetY = phase === 'enter'
          ? canvas.height + element.height / 2
          : -element.height / 2
        state.y = interpolate(base.y, targetY)
        break
      }
      case 'down': {
        const targetY = phase === 'enter'
          ? -element.height / 2
          : canvas.height + element.height / 2
        state.y = interpolate(base.y, targetY)
        break
      }
      case 'pop':
        state.scaleX = state.scaleY = Math.max(0.02, 1 - 0.8 * percent)
        state.alpha = base.alpha * (1 - visibilityPercent)
        break
      case 'zoom':
        state.scaleX = state.scaleY = 1 + (phase === 'enter' ? 0.55 : 0.65) * percent
        state.alpha = base.alpha * (1 - visibilityPercent)
        break
      case 'rotate':
        state.rotation += (phase === 'enter' ? -180 : 180) * percent
        state.scaleX = state.scaleY = Math.max(0.05, 1 - 0.55 * visibilityPercent)
        state.alpha = base.alpha * (1 - visibilityPercent)
        break
    }
    return state
  }

  private automaticHoldCycles(clip: AnimationClip, duration: number) {
    const cycleSeconds: Record<string, number> = {
      float: 1.6,
      pulse: 1.3,
      swing: 1.1,
      shake: 0.16,
      zoom: 1.6,
    }
    return clamp(Math.round(duration / (cycleSeconds[clip.preset] ?? 1.2)), 1, 100)
  }

  private addHoldClip(
    timeline: gsap.core.Timeline,
    state: RuntimeState,
    clip: AnimationClip,
    base: RuntimeState,
    element: EditorElement,
    start: number,
    duration: number,
  ) {
    const percent = Math.max(0, Number(clip.intensity ?? 0)) / 100
    const cycles = clip.loop === false
      ? clamp(Math.round(Number(clip.iterations ?? 1)), 1, 50)
      : this.automaticHoldCycles(clip, duration)
    const halfCycleDuration = Math.max(0.001, duration / (cycles * 2))
    const repeat = cycles * 2 - 1
    const common = {
      duration: halfCycleDuration,
      ease: clip.ease,
      repeat,
      yoyo: true,
    }

    if (clip.preset === 'float') {
      timeline.to(state, {
        y: base.y - element.height * 0.25 * percent,
        ...common,
      }, start)
    }
    if (clip.preset === 'pulse') {
      timeline.to(state, {
        scaleX: 1 + 0.2 * percent,
        scaleY: 1 + 0.2 * percent,
        ...common,
      }, start)
    }
    if (clip.preset === 'swing') {
      timeline.to(state, {
        rotation: base.rotation + 15 * percent,
        ...common,
      }, start)
    }
    if (clip.preset === 'shake') {
      timeline.to(state, {
        x: base.x - element.width * 0.08 * percent,
        ...common,
        ease: 'none',
      }, start)
    }
    if (clip.preset === 'zoom') {
      timeline.to(state, {
        scaleX: 1 + 0.25 * percent,
        scaleY: 1 + 0.25 * percent,
        ...common,
      }, start)
    }
    timeline.set(state, base, start + duration)
  }

  seek(time: number) {
    if (!this.scene || !this.timeline) return
    this.stopPreview(false)
    this.time = clamp(time, 0, this.scene.duration)
    this.timeline.pause().seek(this.time, false)
    this.applyComposedRuntime()
    this.renderer.setMediaTime?.(this.time)
    this.renderer.renderNow?.()
    this.onTimeChange?.(this.time)
    this.setPlaying(false)
  }

  async prepareFrame(time: number) {
    this.seek(time)
    await this.renderer.prepareFrame?.(this.time)
    this.renderer.renderNow?.()
  }

  play() {
    if (!this.timeline || !this.scene) return
    this.stopPreview(false)
    if (this.time >= this.scene.duration - 0.001) this.seek(0)
    this.renderer.setControlsVisible?.(false)
    this.timeline.play()
    this.setPlaying(true)
  }

  pause() {
    this.stopPreview(false)
    this.timeline?.pause()
    this.renderer.setControlsVisible?.(true)
    this.setPlaying(false)
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  previewAnimation(element: EditorElement, animationId: string) {
    if (!this.timeline) return
    const standard = element.animations.find((item) => item.id === animationId)
    const motion = getMotionClips(element).find((item) => item.id === animationId)
    const clip = standard ?? motion
    if (!clip) return
    const start = element.start + clip.offset
    const end = Math.min(element.start + element.duration, start + clip.duration)
    if (end <= start) return

    this.stopPreview(false)
    this.renderer.setControlsVisible?.(false)
    this.timeline.pause().seek(start, false)
    this.previewTween = this.timeline.tweenFromTo(start, end, {
      ease: 'none',
      repeat: -1,
      onRepeat: () => this.renderer.setMediaTime?.(start),
    })
    this.setPlaying(true)
  }

  private stopPreview(showControls = true) {
    if (!this.previewTween) return
    this.previewTween.kill()
    this.previewTween = null
    this.timeline?.pause()
    if (showControls) this.renderer.setControlsVisible?.(true)
  }

  destroy() {
    this.stopPreview(false)
    this.timeline?.kill()
    this.timeline = null
    this.states.clear()
    this.composedStates.clear()
    this.motionLayers.clear()
  }

  private setPlaying(value: boolean) {
    this.playing = value
    this.onPlayingChange?.(value)
  }
}
