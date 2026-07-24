export type ElementType = 'image' | 'shape' | 'text'
export type AnimationPhase = 'enter' | 'hold' | 'exit'
export type EnterPreset = 'fade' | 'left' | 'right' | 'up' | 'down' | 'pop' | 'zoom' | 'rotate'
export type HoldPreset = 'none' | 'float' | 'pulse' | 'swing' | 'shake' | 'zoom'
export type ExitPreset = EnterPreset
export type EditorFontWeight =
  | 'normal'
  | 'bold'
  | 'bolder'
  | 'lighter'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'

export interface AnimationSegment<TPreset extends string = string> {
  preset: TPreset
  duration: number
  ease: string
  intensity: number
}

export interface ElementStyle {
  fill?: string
  radius?: number
  color?: string
  fontSize?: number
  fontWeight?: EditorFontWeight
  fontFamily?: string
  align?: 'left' | 'center' | 'right'
}

export interface EditorElement {
  id: string
  type: ElementType
  name: string
  src?: string
  text?: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  alpha: number
  z: number
  visible: boolean
  locked: boolean
  start: number
  enter: AnimationSegment<EnterPreset>
  hold: AnimationSegment<HoldPreset>
  exit: AnimationSegment<ExitPreset>
  style: ElementStyle
}

export interface Scene {
  id: string
  name: string
  duration: number
  background: string
  elements: EditorElement[]
}

export interface Project {
  version: number
  name: string
  width: number
  height: number
  fps: number
  currentSceneId: string
  scenes: Scene[]
}

export interface RuntimeState {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  alpha: number
  visible: boolean
}

export interface ExportProgress {
  active: boolean
  percent: number
  title: string
  detail: string
  error?: string
}
