export type AssetType = 'image' | 'video'
export type ElementType = AssetType | 'shape' | 'text'
export type AnimationPhase = 'enter' | 'hold' | 'exit'
export type EnterPreset = 'fade' | 'left' | 'right' | 'up' | 'down' | 'pop' | 'zoom' | 'rotate'
export type HoldPreset = 'float' | 'pulse' | 'swing' | 'shake' | 'zoom'
export type ExitPreset = EnterPreset
export type AnimationPreset = EnterPreset | HoldPreset | ExitPreset
export type MotionRelation = 'free' | 'chain' | 'parallel'
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

export interface AnimationClip {
  id: string
  phase: AnimationPhase
  /** Relative to the element's start time. */
  offset: number
  duration: number
  preset: AnimationPreset
  ease: string
  intensity: number
  /** Total emphasis cycles when loop is disabled. */
  iterations?: number
  /** For emphasis clips, automatically repeat throughout the clip duration. */
  loop?: boolean
}

/**
 * A composable ordinary animation. Every property is relative to the state at
 * the clip start. Independent clips are accumulated, so parallel clips can
 * safely animate different or identical properties at the same time.
 */
export interface MotionClip {
  id: string
  name: string
  /** Relative to the element's start time. */
  offset: number
  duration: number
  ease: string
  /** Horizontal and vertical relative movement in canvas pixels. */
  x: number
  y: number
  /** 100 keeps the current scale, 120 enlarges by 20%. */
  scale: number
  /** Relative rotation in degrees. */
  rotation: number
  /** Relative opacity change in percentage points, from -100 to 100. */
  opacity: number
  /** Placement relationship used by the editor when clips are rearranged. */
  relation?: MotionRelation
  linkedTo?: string
}

export interface ProjectAsset {
  id: string
  type: AssetType
  name: string
  mimeType: string
  size: number
  width: number
  height: number
  duration?: number
  hash?: string
  folderId?: string | null
  downloadUrl?: string
  thumbnailUrl?: string
  createdAt?: string
}

export interface AssetFolder {
  id: string
  name: string
  parentId?: string | null
  createdAt?: string
}

export interface ElementStyle {
  fill?: string
  radius?: number
  color?: string
  fontSize?: number
  fontWeight?: EditorFontWeight
  fontFamily?: string
  align?: 'left' | 'center' | 'right'
  /** Stored inside style for backward-compatible project normalization. */
  motionAnimations?: MotionClip[]
}

export interface EditorElement {
  id: string
  type: ElementType
  name: string
  /** Direct source is reserved for built-in/demo assets. Remote assets use assetId. */
  src?: string
  assetId?: string
  text?: string
  /** Internal transform center X. The inspector exposes top-left X. */
  x: number
  /** Internal transform center Y. The inspector exposes top-left Y. */
  y: number
  width: number
  height: number
  rotation: number
  alpha: number
  z: number
  visible: boolean
  locked: boolean
  start: number
  /** Independent visible span on the scene timeline. */
  duration: number
  /** Optional enter, emphasis, and exit overlays. */
  animations: AnimationClip[]
  style: ElementStyle
}

export interface Scene {
  id: string
  name: string
  duration: number
  /** When enabled, duration follows the last element end plus durationOffset. */
  autoDuration?: boolean
  durationOffset?: number
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
  assets: ProjectAsset[]
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
