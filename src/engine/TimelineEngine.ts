import { gsap } from 'gsap'
import type { AnimationClip, EditorElement, RuntimeState, Scene } from '@/types/editor'
import { clamp } from '@/utils/helpers'

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

export class TimelineEngine {
  private renderer: TimelineRenderer
  private getCanvasSize: () => TimelineCanvasSize
  private scene: Scene | null = null
  private timeline: gsap.core.Timeline | null = null
  private states = new Map<string, RuntimeState>()
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
    this.timeline?.kill()
    this.scene = scene
    this.states.clear()

    const timeline = gsap.timeline({
      paused: true,
      onUpdate: () => {
        this.time = timeline.time()
        this.renderer.applyRuntime(this.states)
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

    const elementStart = clamp(element.start, 0, this.scene?.duration ?? element.start)
    const elementEnd = clamp(element.start + element.duration, elementStart, this.scene?.duration ?? element.start + element.duration)
    timeline.set(state, { ...base, visible: element.visible }, elementStart)
    timeline.set(state, { visible: false }, elementEnd)

    const clips = [...element.animations].sort((a, b) => a.offset - b.offset)
    clips.forEach((clip) => this.addAnimationClip(timeline, state, element, base, clip, elementStart, elementEnd))
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
    if (clip.preset === 'float') {
      timeline.to(state, {
        y: base.y - element.height * 0.25 * percent,
        duration: Math.min(0.8, duration / 2),
        ease: clip.ease,
        repeat: Math.max(1, Math.floor(duration / Math.min(1.6, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'pulse') {
      timeline.to(state, {
        scaleX: 1 + 0.2 * percent,
        scaleY: 1 + 0.2 * percent,
        duration: Math.min(0.65, duration / 2),
        ease: clip.ease,
        repeat: Math.max(1, Math.floor(duration / Math.min(1.3, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'swing') {
      timeline.to(state, {
        rotation: base.rotation + 15 * percent,
        duration: Math.min(0.55, duration / 2),
        ease: clip.ease,
        repeat: Math.max(1, Math.floor(duration / Math.min(1.1, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'shake') {
      timeline.to(state, {
        x: base.x - element.width * 0.08 * percent,
        duration: Math.min(0.08, duration / 2),
        ease: 'none',
        repeat: Math.max(1, Math.floor(duration / Math.min(0.16, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'zoom') {
      timeline.to(state, {
        scaleX: 1 + 0.25 * percent,
        scaleY: 1 + 0.25 * percent,
        duration,
        ease: clip.ease,
        yoyo: true,
        repeat: 1,
      }, start)
    }
    timeline.set(state, base, start + duration)
  }

  seek(time: number) {
    if (!this.scene || !this.timeline) return
    this.time = clamp(time, 0, this.scene.duration)
    this.timeline.pause().seek(this.time, false)
    this.renderer.applyRuntime(this.states)
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
    if (this.time >= this.scene.duration - 0.001) this.seek(0)
    this.renderer.setControlsVisible?.(false)
    this.timeline.play()
    this.setPlaying(true)
  }

  pause() {
    this.timeline?.pause()
    this.renderer.setControlsVisible?.(true)
    this.setPlaying(false)
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  previewSegment(element: EditorElement, phase: 'enter' | 'hold' | 'exit') {
    if (!this.timeline) return
    const clip = element.animations.find((item) => item.phase === phase)
    if (!clip) return
    const start = element.start + clip.offset
    const end = start + clip.duration
    this.renderer.setControlsVisible?.(false)
    this.timeline.pause().seek(start, false)
    this.timeline.tweenFromTo(start, end, {
      onUpdate: () => this.renderer.setMediaTime?.(this.timeline?.time() ?? start),
      onComplete: () => {
        this.renderer.setControlsVisible?.(true)
        this.seek(end)
      },
    })
    this.setPlaying(true)
  }

  destroy() {
    this.timeline?.kill()
    this.timeline = null
    this.states.clear()
  }

  private setPlaying(value: boolean) {
    this.playing = value
    this.onPlayingChange?.(value)
  }
}
