import { gsap } from 'gsap'
import type { EditorElement, RuntimeState, Scene } from '@/types/editor'
import { clamp } from '@/utils/helpers'

export interface TimelineRenderer {
  applyRuntime(states: Map<string, RuntimeState>): void
  setControlsVisible?(visible: boolean): void
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

    scene.elements.forEach((element) => this.addElementAnimation(timeline, element))
    timeline.to({}, { duration: scene.duration }, 0)
    this.timeline = timeline
    this.seek(clamp(previousTime, 0, scene.duration))
  }

  private addElementAnimation(timeline: gsap.core.Timeline, element: EditorElement) {
    const base = this.baseState(element)
    const state: RuntimeState = { ...base, visible: false }
    this.states.set(element.id, state)

    const enterState = this.enterState(element, base)
    const exitState = this.exitState(element, base)
    const enterStart = element.start
    const enterEnd = enterStart + element.enter.duration
    const holdEnd = enterEnd + element.hold.duration
    const exitEnd = holdEnd + element.exit.duration

    timeline.set(state, { ...enterState, visible: element.visible }, enterStart)
    timeline.to(state, {
      ...base,
      duration: element.enter.duration,
      ease: element.enter.ease,
    }, enterStart)

    this.addHold(timeline, state, element, base, enterEnd, holdEnd)
    timeline.set(state, base, holdEnd)
    timeline.to(state, {
      ...exitState,
      duration: element.exit.duration,
      ease: element.exit.ease,
    }, holdEnd)
    timeline.set(state, { visible: false }, exitEnd)
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

  private enterState(element: EditorElement, base: RuntimeState): RuntimeState {
    const distance = (element.enter.intensity || 100) / 100
    const state = { ...base }
    switch (element.enter.preset) {
      case 'fade': state.alpha = 0; break
      case 'left': state.x -= 420 * distance; break
      case 'right': state.x += 420 * distance; break
      case 'up': state.y += 360 * distance; break
      case 'down': state.y -= 360 * distance; break
      case 'pop': state.scaleX = state.scaleY = Math.max(0.05, 1 - 0.8 * distance); state.alpha = 0; break
      case 'zoom': state.scaleX = state.scaleY = 1 + 0.55 * distance; state.alpha = 0; break
      case 'rotate': state.rotation -= 180 * distance; state.scaleX = state.scaleY = 0.45; state.alpha = 0; break
    }
    return state
  }

  private exitState(element: EditorElement, base: RuntimeState): RuntimeState {
    const distance = (element.exit.intensity || 100) / 100
    const state = { ...base }
    switch (element.exit.preset) {
      case 'fade': state.alpha = 0; break
      case 'left': state.x -= 420 * distance; break
      case 'right': state.x += 420 * distance; break
      case 'up': state.y -= 360 * distance; break
      case 'down': state.y += 360 * distance; break
      case 'pop': state.scaleX = state.scaleY = Math.max(0.05, 1 - 0.8 * distance); state.alpha = 0; break
      case 'zoom': state.scaleX = state.scaleY = 1 + 0.65 * distance; state.alpha = 0; break
      case 'rotate': state.rotation += 180 * distance; state.scaleX = state.scaleY = 0.4; state.alpha = 0; break
    }
    return state
  }

  private addHold(
    timeline: gsap.core.Timeline,
    state: RuntimeState,
    element: EditorElement,
    base: RuntimeState,
    start: number,
    end: number,
  ) {
    const segment = element.hold
    const duration = Math.max(0.01, end - start)
    const strength = segment.intensity || 0
    if (segment.preset === 'none') return

    if (segment.preset === 'float') {
      timeline.to(state, {
        y: base.y - strength,
        duration: 0.8,
        ease: segment.ease,
        repeat: Math.max(0, Math.floor(duration / 1.6) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (segment.preset === 'pulse') {
      timeline.to(state, {
        scaleX: 1 + strength / 100,
        scaleY: 1 + strength / 100,
        duration: 0.65,
        ease: segment.ease,
        repeat: Math.max(0, Math.floor(duration / 1.3) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (segment.preset === 'swing') {
      timeline.to(state, {
        rotation: base.rotation + strength,
        duration: 0.55,
        ease: segment.ease,
        repeat: Math.max(0, Math.floor(duration / 1.1) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (segment.preset === 'shake') {
      timeline.to(state, {
        x: base.x - strength,
        duration: 0.08,
        ease: 'none',
        repeat: Math.max(1, Math.floor(duration / 0.16) * 2 - 1),
        yoyo: true,
      }, start)
    }
    if (segment.preset === 'zoom') {
      timeline.to(state, {
        scaleX: 1 + strength / 100,
        scaleY: 1 + strength / 100,
        duration,
        ease: 'none',
      }, start)
    }
  }

  seek(time: number) {
    if (!this.scene || !this.timeline) return
    this.time = clamp(time, 0, this.scene.duration)
    this.timeline.pause().seek(this.time, false)
    this.renderer.applyRuntime(this.states)
    this.renderer.renderNow?.()
    this.onTimeChange?.(this.time)
    this.setPlaying(false)
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
    let start = element.start
    let end = start + element.enter.duration
    if (phase === 'hold') {
      start = end
      end = start + element.hold.duration
    } else if (phase === 'exit') {
      start = end + element.hold.duration
      end = start + element.exit.duration
    }
    this.renderer.setControlsVisible?.(false)
    this.timeline.pause().seek(start, false)
    this.timeline.tweenFromTo(start, end, {
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
