<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat2,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import { editorStore } from '@/store/editorStore'
import { clamp } from '@/utils/helpers'
import { getElementMaxDuration, refreshSceneDuration } from '@/utils/editorCommands'
import { clampMotionClips, getMotionClips } from '@/utils/motionClips'
import type { AnimationClip, EditorElement, MotionClip, Scene } from '@/types/editor'

const props = defineProps<{ currentTime: number; playing: boolean; loop: boolean }>()
const emit = defineEmits<{
  seek: [value: number]
  toggle: []
  frame: [direction: -1 | 1]
  loop: []
  preview: [animationId: string]
}>()

type DragMode = 'scrub' | 'move' | 'resize-start' | 'resize-end'
type RowKind = 'element' | 'motion' | 'effect'
interface DragState {
  mode: DragMode
  pointerId: number
  startClientX: number
  elementId?: string
  originalStart?: number
  originalDuration?: number
  before?: string
}
interface TimelineRow {
  key: string
  kind: RowKind
  element: EditorElement
  motion?: MotionClip
  effect?: AnimationClip
}

const scene = computed(() => editorStore.currentScene.value)
const labelsViewport = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const viewportWidth = ref(900)
const timelineZoom = ref(1)
const dragState = ref<DragState | null>(null)
const expanded = ref<Record<string, boolean>>({})
let resizeObserver: ResizeObserver | null = null
let syncingScroll = false

const elements = computed(() => [...scene.value.elements].sort((a, b) => b.z - a.z))
const totalProjectDuration = computed(() => editorStore.project.scenes.reduce((total, item) => total + item.duration, 0))
const timelineWidth = computed(() => Math.max(700, viewportWidth.value * timelineZoom.value))
const pixelsPerSecond = computed(() => timelineWidth.value / Math.max(0.01, scene.value.duration))
const playheadLeft = computed(() => `${timeToPx(props.currentTime)}px`)
const rows = computed<TimelineRow[]>(() => {
  const output: TimelineRow[] = []
  for (const element of elements.value) {
    output.push({ key: `element:${element.id}`, kind: 'element', element })
    if (!expanded.value[element.id]) continue
    for (const clip of getMotionClips(element).slice().sort((a, b) => a.offset - b.offset)) {
      output.push({ key: `motion:${clip.id}`, kind: 'motion', element, motion: clip })
    }
    for (const clip of [...element.animations].sort((a, b) => a.offset - b.offset)) {
      output.push({ key: `effect:${clip.id}`, kind: 'effect', element, effect: clip })
    }
  }
  return output
})
const tickStep = computed(() => {
  if (pixelsPerSecond.value >= 220) return 0.25
  if (pixelsPerSecond.value >= 120) return 0.5
  return 1
})
const ticks = computed(() => {
  const result: number[] = []
  const step = tickStep.value
  for (let value = 0; value <= scene.value.duration + 0.0001; value += step) result.push(Number(value.toFixed(2)))
  if (Math.abs((result.at(-1) ?? 0) - scene.value.duration) > 0.01) result.push(scene.value.duration)
  return result
})
const gridStyle = computed(() => ({
  backgroundSize: `${Math.max(12, pixelsPerSecond.value * tickStep.value)}px 100%`,
}))

function timeToPx(time: number) {
  return (clamp(time, 0, scene.value.duration) / Math.max(0.01, scene.value.duration)) * timelineWidth.value
}

function clipStyle(start: number, duration: number) {
  const safeStart = clamp(start, 0, scene.value.duration)
  const safeEnd = clamp(start + duration, safeStart, scene.value.duration)
  return {
    left: `${timeToPx(safeStart)}px`,
    width: `${Math.max(2, timeToPx(safeEnd) - timeToPx(safeStart))}px`,
  }
}

function animationStyle(elementStart: number, offset: number, duration: number) {
  return clipStyle(elementStart + offset, duration)
}

function sceneSegmentStyle(item: Scene) {
  const total = Math.max(0.01, totalProjectDuration.value)
  return { flexBasis: `${Math.max(6, item.duration / total * 100)}%` }
}

function hasChildren(element: EditorElement) {
  return getMotionClips(element).length + element.animations.length > 0
}

function toggleExpanded(element: EditorElement) {
  if (!hasChildren(element)) return
  expanded.value = { ...expanded.value, [element.id]: !expanded.value[element.id] }
}

function switchScene(sceneId: string) {
  if (sceneId === editorStore.project.currentSceneId) return
  editorStore.switchScene(sceneId)
  emit('seek', 0)
}

function rowLabel(row: TimelineRow) {
  if (row.kind === 'motion') return row.motion?.name ?? '普通动画'
  if (row.kind === 'effect') return phaseLabel(row.effect?.phase ?? 'hold')
  return row.element.name
}

function rowMeta(row: TimelineRow) {
  if (row.kind === 'motion' && row.motion) return `${row.motion.duration.toFixed(2)}s`
  if (row.kind === 'effect' && row.effect) return `${row.effect.duration.toFixed(2)}s`
  return `${row.element.duration.toFixed(1)}s`
}

function previewRow(row: TimelineRow) {
  editorStore.select(row.element.id)
  const id = row.motion?.id ?? row.effect?.id
  if (id) emit('preview', id)
}

function seekFromPointer(event: PointerEvent) {
  const surface = event.currentTarget as HTMLElement
  const rect = surface.getBoundingClientRect()
  const value = ((event.clientX - rect.left) / Math.max(1, rect.width)) * scene.value.duration
  emit('seek', clamp(value, 0, scene.value.duration))
}

function clampAnimations(element: EditorElement) {
  element.animations.forEach((clip) => {
    clip.duration = clamp(clip.duration, 0.05, element.duration)
    clip.offset = clamp(clip.offset, 0, Math.max(0, element.duration - clip.duration))
  })
  clampMotionClips(element)
}

function startPointer(event: PointerEvent) {
  if (event.button !== 0) return
  const surface = event.currentTarget as HTMLElement
  const target = event.target as HTMLElement
  const span = target.closest<HTMLElement>('.element-span')

  if (span?.dataset.elementId) {
    const element = scene.value.elements.find((item) => item.id === span.dataset.elementId)
    if (!element) return
    editorStore.select(element.id)
    const handle = target.closest<HTMLElement>('.span-handle')
    const mode: DragMode = handle?.dataset.side === 'start'
      ? 'resize-start'
      : handle?.dataset.side === 'end'
        ? 'resize-end'
        : 'move'
    dragState.value = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      elementId: element.id,
      originalStart: element.start,
      originalDuration: element.duration,
      before: JSON.stringify(editorStore.serializeProject()),
    }
    surface.setPointerCapture(event.pointerId)
    event.preventDefault()
    return
  }

  const row = target.closest<HTMLElement>('.timeline-track-row')
  if (row?.dataset.elementId) editorStore.select(row.dataset.elementId)
  dragState.value = { mode: 'scrub', pointerId: event.pointerId, startClientX: event.clientX }
  surface.setPointerCapture(event.pointerId)
  seekFromPointer(event)
}

function movePointer(event: PointerEvent) {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId) return
  if (drag.mode === 'scrub') {
    seekFromPointer(event)
    return
  }

  const element = scene.value.elements.find((item) => item.id === drag.elementId)
  if (!element) return
  const originalStart = drag.originalStart ?? element.start
  const originalDuration = drag.originalDuration ?? element.duration
  const delta = (event.clientX - drag.startClientX) / Math.max(1, pixelsPerSecond.value)

  if (drag.mode === 'move') {
    const maxStart = scene.value.autoDuration === false ? Math.max(0, scene.value.duration - originalDuration) : 600
    element.start = clamp(originalStart + delta, 0, maxStart)
  } else if (drag.mode === 'resize-start') {
    const originalEnd = originalStart + originalDuration
    let nextStart = clamp(originalStart + delta, 0, originalEnd - 0.1)
    let nextDuration = originalEnd - nextStart
    const sourceLimit = element.type === 'video' && element.assetId
      ? editorStore.project.assets.find((item) => item.id === element.assetId)?.duration
      : undefined
    if (sourceLimit && nextDuration > sourceLimit) {
      nextDuration = sourceLimit
      nextStart = originalEnd - nextDuration
    }
    element.start = nextStart
    element.duration = clamp(nextDuration, 0.1, getElementMaxDuration(element, scene.value))
    clampAnimations(element)
  } else {
    element.duration = clamp(originalDuration + delta, 0.1, getElementMaxDuration(element, scene.value))
    clampAnimations(element)
  }
}

function stopPointer(event: PointerEvent) {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId) return
  const surface = event.currentTarget as HTMLElement
  if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
  dragState.value = null
  if (drag.mode !== 'scrub') refreshSceneDuration(scene.value)
  if (drag.mode !== 'scrub' && drag.before && drag.before !== JSON.stringify(editorStore.serializeProject())) {
    editorStore.finishLiveEdit(drag.before)
  }
}

function setTimelineZoom(value: number) {
  timelineZoom.value = clamp(value, 1, 4)
}

function phaseLabel(phase: string) {
  if (phase === 'enter') return '进场'
  if (phase === 'hold') return '强调'
  return '退场'
}

function syncVerticalScroll(source: 'labels' | 'tracks') {
  if (syncingScroll) return
  const from = source === 'labels' ? labelsViewport.value : viewport.value
  const to = source === 'labels' ? viewport.value : labelsViewport.value
  if (!from || !to) return
  syncingScroll = true
  to.scrollTop = from.scrollTop
  requestAnimationFrame(() => { syncingScroll = false })
}

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportWidth.value = Math.max(1, entry.contentRect.width)
  })
  if (viewport.value) resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section class="timeline-panel capcut-timeline">
    <div class="timeline-head">
      <div class="transport">
        <button title="上一帧" @click="emit('frame', -1)"><ChevronLeft :size="15" /></button>
        <button class="play-button" :title="playing ? '暂停' : '播放'" @click="emit('toggle')"><Pause v-if="playing" :size="15" /><Play v-else :size="15" /></button>
        <button title="下一帧" @click="emit('frame', 1)"><ChevronRight :size="15" /></button>
        <button :class="{ active: loop }" title="循环播放" @click="emit('loop')"><Repeat2 :size="15" /></button>
      </div>
      <strong>{{ currentTime.toFixed(2) }}s</strong>
      <span>/ {{ scene.duration.toFixed(2) }}s</span>
      <div class="timeline-spacer" />
      <span class="timeline-hint">展开元素查看普通动画和特效子轨</span>
      <div class="timeline-zoom">
        <button title="缩小时间轨" @click="setTimelineZoom(timelineZoom - 0.25)"><ZoomOut :size="14" /></button>
        <input aria-label="时间轨缩放" type="range" min="1" max="4" step="0.25" :value="timelineZoom" @input="setTimelineZoom(Number(($event.target as HTMLInputElement).value))" />
        <button title="放大时间轨" @click="setTimelineZoom(timelineZoom + 0.25)"><ZoomIn :size="14" /></button>
        <span>{{ Math.round(timelineZoom * 100) }}%</span>
      </div>
      <span>{{ editorStore.project.fps }} FPS</span>
    </div>

    <div class="scene-sequence-track">
      <div class="scene-track-label"><Clapperboard :size="14" /><span>场景</span></div>
      <div class="scene-track-segments">
        <button
          v-for="(item, index) in editorStore.project.scenes"
          :key="item.id"
          :class="{ active: item.id === editorStore.project.currentSceneId }"
          :style="sceneSegmentStyle(item)"
          :title="`${item.name} · ${item.duration.toFixed(2)}s`"
          @click="switchScene(item.id)"
        ><b>{{ index + 1 }}</b><span>{{ item.name }}</span><small>{{ item.duration.toFixed(1) }}s</small></button>
      </div>
    </div>

    <div class="timeline-body capcut-timeline-body">
      <div ref="labelsViewport" class="timeline-labels" @scroll="syncVerticalScroll('labels')">
        <div class="ruler-label">轨道</div>
        <button
          v-for="row in rows"
          :key="row.key"
          class="timeline-label-row"
          :class="[row.kind, { active: row.element.id === editorStore.selectedId.value }]"
          @click="row.kind === 'element' ? editorStore.select(row.element.id) : previewRow(row)"
        >
          <template v-if="row.kind === 'element'">
            <span class="track-disclosure" :class="{ empty: !hasChildren(row.element) }" @click.stop="toggleExpanded(row.element)"><ChevronDown v-if="expanded[row.element.id]" :size="13" /><ChevronRight v-else :size="13" /></span>
            <span class="track-name">{{ row.element.name }}</span>
          </template>
          <template v-else>
            <span class="subtrack-line" />
            <i :class="row.kind" />
            <span class="track-name">{{ rowLabel(row) }}</span>
          </template>
          <small>{{ rowMeta(row) }}</small>
        </button>
      </div>

      <div ref="viewport" class="timeline-tracks" @scroll="syncVerticalScroll('tracks')">
        <div
          class="timeline-surface"
          :class="{ scrubbing: dragState?.mode === 'scrub', dragging: dragState && dragState.mode !== 'scrub' }"
          :style="{ width: `${timelineWidth}px` }"
          @pointerdown="startPointer"
          @pointermove="movePointer"
          @pointerup="stopPointer"
          @pointercancel="stopPointer"
        >
          <div class="ruler" :style="gridStyle">
            <span v-for="tick in ticks" :key="tick" :class="{ major: Number.isInteger(tick) }" :style="{ left: `${timeToPx(tick)}px` }">{{ Number.isInteger(tick) ? `${tick}s` : tick }}</span>
          </div>

          <div
            v-for="row in rows"
            :key="row.key"
            class="timeline-track-row"
            :class="[row.kind, { selected: row.element.id === editorStore.selectedId.value }]"
            :data-element-id="row.element.id"
            :style="gridStyle"
          >
            <template v-if="row.kind === 'element'">
              <div class="element-span" :data-element-id="row.element.id" :style="clipStyle(row.element.start, row.element.duration)" :title="`${row.element.name} · ${row.element.duration.toFixed(2)}s`">
                <i class="span-handle start" data-side="start" />
                <span>{{ row.element.name }}</span>
                <i class="span-handle end" data-side="end" />
              </div>
              <template v-if="!expanded[row.element.id]">
                <div v-for="clip in row.element.animations" :key="clip.id" class="animation-overlay" :class="clip.phase" :style="animationStyle(row.element.start, clip.offset, clip.duration)" />
                <div v-for="clip in getMotionClips(row.element)" :key="clip.id" class="motion-animation-overlay" :class="clip.relation ?? 'free'" :style="animationStyle(row.element.start, clip.offset, clip.duration)" />
              </template>
            </template>

            <button
              v-else-if="row.kind === 'motion' && row.motion"
              class="subtrack-clip motion-subtrack-clip"
              :class="row.motion.relation ?? 'free'"
              :style="animationStyle(row.element.start, row.motion.offset, row.motion.duration)"
              :title="`${row.motion.name} · 双击循环预览`"
              @dblclick.stop="previewRow(row)"
            ><span>{{ row.motion.name }}</span></button>

            <button
              v-else-if="row.effect"
              class="subtrack-clip effect-subtrack-clip"
              :class="row.effect.phase"
              :style="animationStyle(row.element.start, row.effect.offset, row.effect.duration)"
              :title="`${phaseLabel(row.effect.phase)} · ${row.effect.preset} · 双击循环预览`"
              @dblclick.stop="previewRow(row)"
            ><span>{{ phaseLabel(row.effect.phase) }} · {{ row.effect.preset }}</span></button>
          </div>

          <div class="playhead" :style="{ left: playheadLeft }"><i /></div>
        </div>
      </div>
    </div>
  </section>
</template>