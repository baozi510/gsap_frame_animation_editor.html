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

export class TimelineEngine {
  private renderer: TimelineRenderer
  private scene: Scene | null = null
  private timeline: gsap.core.Timeline | null = null
  private states = new Map<string, RuntimeState>()
  time = 0
  playing = false
  loop = false
  onTimeChange?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void

  constructor(renderer: TimelineRenderer) {
    this.renderer = renderer
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
      timeline.set(state, { ...this.effectState(clip, base, 'enter'), visible: element.visible }, start)
      timeline.to(state, { ...base, visible: element.visible, duration, ease: clip.ease }, start)
      return
    }

    if (clip.phase === 'exit') {
      timeline.set(state, { ...base, visible: element.visible }, start)
      timeline.to(state, { ...this.effectState(clip, base, 'exit'), duration, ease: clip.ease }, start)
      timeline.set(state, { visible: false }, end)
      return
    }

    this.addHoldClip(timeline, state, clip, base, start, duration)
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

  private effectState(clip: AnimationClip, base: RuntimeState, phase: 'enter' | 'exit'): RuntimeState {
    const distance = (clip.intensity || 100) / 100
    const state = { ...base }
    switch (clip.preset) {
      case 'fade': state.alpha = 0; break
      case 'left': state.x -= 420 * distance; break
      case 'right': state.x += 420 * distance; break
      case 'up': state.y += phase === 'enter' ? 360 * distance : -360 * distance; break
      case 'down': state.y += phase === 'enter' ? -360 * distance : 360 * distance; break
      case 'pop': state.scaleX = state.scaleY = Math.max(0.05, 1 - 0.8 * distance); state.alpha = 0; break
      case 'zoom': state.scaleX = state.scaleY = 1 + (phase === 'enter' ? 0.55 : 0.65) * distance; state.alpha = 0; break
      case 'rotate':
        state.rotation += (phase === 'enter' ? -180 : 180) * distance
        state.scaleX = state.scaleY = phase === 'enter' ? 0.45 : 0.4
        state.alpha = 0
        break
    }
    return state
  }

  private addHoldClip(
    timeline: gsap.core.Timeline,
    state: RuntimeState,
    clip: AnimationClip,
    base: RuntimeState,
    start: number,
    duration: number,
  ) {
    const strength = clip.intensity || 0
    if (clip.preset === 'float') {
      timeline.to(state, {
        y: base.y - strength,
        duration: Math.min(0.8, duration / 2),
        ease: clip.ease,
        repeat: Math.max(1, Math.floor(duration / Math.min(1.6, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'pulse') {
      timeline.to(state, {
        scaleX: 1 + strength / 100,
        scaleY: 1 + strength / 100,
        duration: Math.min(0.65, duration / 2),
        ease: clip.ease,
        repeat: Math.max(1, Math.floor(duration / Math.min(1.3, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'swing') {
      timeline.to(state, {
        rotation: base.rotation + strength,
        duration: Math.min(0.55, duration / 2),
        ease: clip.ease,
        repeat: Math.max(1, Math.floor(duration / Math.min(1.1, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'shake') {
      timeline.to(state, {
        x: base.x - strength,
        duration: Math.min(0.08, duration / 2),
        ease: 'none',
        repeat: Math.max(1, Math.floor(duration / Math.min(0.16, duration)) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (clip.preset === 'zoom') {
      timeline.to(state, {
        scaleX: 1 + strength / 100,
        scaleY: 1 + strength / 100,
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
