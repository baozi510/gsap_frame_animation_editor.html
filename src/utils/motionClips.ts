import type { EditorElement, MotionClip, MotionRelation } from '@/types/editor'
import { clamp, uid } from '@/utils/helpers'

export function getMotionClips(element: EditorElement | null | undefined): MotionClip[] {
  return element && Array.isArray(element.style.motionAnimations)
    ? element.style.motionAnimations
    : []
}

export function ensureMotionClips(element: EditorElement): MotionClip[] {
  if (!Array.isArray(element.style.motionAnimations)) element.style.motionAnimations = []
  return element.style.motionAnimations
}

export function normalizeMotionClip(clip: Partial<MotionClip>, elementDuration: number): MotionClip {
  const duration = clamp(Number(clip.duration ?? 0.8), 0.05, Math.max(0.05, elementDuration))
  return {
    id: clip.id || uid('motion'),
    name: String(clip.name ?? '普通动画'),
    offset: clamp(Number(clip.offset ?? 0), 0, Math.max(0, elementDuration - duration)),
    duration,
    ease: String(clip.ease ?? 'power2.inOut'),
    x: Number(clip.x ?? 0),
    y: Number(clip.y ?? 0),
    scale: clamp(Number(clip.scale ?? 100), 1, 500),
    rotation: Number(clip.rotation ?? 0),
    opacity: clamp(Number(clip.opacity ?? 0), -100, 100),
    relation: clip.relation ?? 'free',
    linkedTo: typeof clip.linkedTo === 'string' ? clip.linkedTo : undefined,
  }
}

export function normalizeMotionClips(element: EditorElement) {
  const clips = ensureMotionClips(element)
  element.style.motionAnimations = clips.map((clip) => normalizeMotionClip(clip, element.duration))
  reflowMotionClips(element)
  return element.style.motionAnimations
}

export function reflowMotionClips(element: EditorElement) {
  const clips = ensureMotionClips(element)
  const byId = new Map(clips.map((clip) => [clip.id, clip]))
  const resolving = new Set<string>()
  const resolved = new Set<string>()

  const resolve = (clip: MotionClip) => {
    if (resolved.has(clip.id)) return
    if (resolving.has(clip.id)) {
      clip.relation = 'free'
      delete clip.linkedTo
      return
    }
    resolving.add(clip.id)
    const target = clip.linkedTo ? byId.get(clip.linkedTo) : undefined
    if (!target || clip.relation === 'free') {
      clip.relation = 'free'
      delete clip.linkedTo
    } else {
      resolve(target)
      clip.offset = clip.relation === 'parallel'
        ? target.offset
        : target.offset + target.duration
    }
    clip.duration = clamp(Number(clip.duration || 0.8), 0.05, Math.max(0.05, element.duration))
    clip.offset = clamp(Number(clip.offset || 0), 0, Math.max(0, element.duration - clip.duration))
    resolving.delete(clip.id)
    resolved.add(clip.id)
  }

  clips.forEach(resolve)
}

export function clampMotionClips(element: EditorElement) {
  normalizeMotionClips(element)
}

export function createMotionClip(
  element: EditorElement,
  relation: MotionRelation,
  linkedTo?: MotionClip,
): MotionClip {
  const duration = Math.min(0.8, Math.max(0.05, element.duration))
  const rawOffset = relation === 'parallel' && linkedTo
    ? linkedTo.offset
    : relation === 'chain' && linkedTo
      ? linkedTo.offset + linkedTo.duration
      : 0
  return normalizeMotionClip({
    id: uid('motion'),
    name: `普通动画 ${getMotionClips(element).length + 1}`,
    offset: rawOffset,
    duration,
    ease: 'power2.inOut',
    x: 160,
    y: 0,
    scale: 100,
    rotation: 0,
    opacity: 0,
    relation,
    linkedTo: linkedTo?.id,
  }, element.duration)
}
