<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { editorStore } from '@/store/editorStore'
import { clamp } from '@/utils/helpers'
import { getElementMaxDuration, refreshSceneDuration } from '@/utils/editorCommands'
import type { EditorElement } from '@/types/editor'

const props = defineProps<{ currentTime: number; playing: boolean; loop: boolean }>()
const emit = defineEmits<{
  seek: [value: number]
  toggle: []
  frame: [direction: -1 | 1]
  loop: []
}>()

type DragMode = 'scrub' | 'move' | 'resize-start' | 'resize-end'
interface DragState {
  mode: DragMode
  pointerId: number
  startClientX: number
  elementId?: string
  originalStart?: number
  originalDuration?: number
  before?: string
}

const scene = computed(() => editorStore.currentScene.value)
const viewport = ref<HTMLElement | null>(null)
const viewportWidth = ref(900)
const timelineZoom = ref(1)
const dragState = ref<DragState | null>(null)
let resizeObserver: ResizeObserver | null = null

const elements = computed(() => [...scene.value.elements].sort((a, b) => b.z - a.z))
const timelineWidth = computed(() => Math.max(700, viewportWidth.value * timelineZoom.value))
const pixelsPerSecond = computed(() => timelineWidth.value / Math.max(0.01, scene.value.duration))
const playheadLeft = computed(() => `${timeToPx(props.currentTime)}px`)
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

  const row = target.closest<HTMLElement>('.track-row')
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
    element.start = clamp(originalStart + delta, 0, Math.max(0, scene.value.duration - originalDuration))
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
    element.duration = clamp(nextDuration, 0.1, scene.value.duration - nextStart)
    clampAnimations(element)
  } else {
    const maxDuration = getElementMaxDuration(element, scene.value)
    element.duration = clamp(originalDuration + delta, 0.1, maxDuration)
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

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportWidth.value = Math.max(1, entry.contentRect.width)
  })
  if (viewport.value) resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section class="timeline-panel">
    <div class="timeline-head">
      <div class="transport">
        <button @click="emit('frame', -1)">│◀</button>
        <button class="play-button" @click="emit('toggle')">{{ playing ? 'Ⅱ' : '▶' }}</button>
        <button @click="emit('frame', 1)">▶│</button>
        <button :class="{ active: loop }" @click="emit('loop')">↻</button>
      </div>
      <strong>{{ currentTime.toFixed(2) }}s</strong>
      <span>/ {{ scene.duration.toFixed(2) }}s</span>
      <div class="timeline-spacer" />
      <span class="timeline-hint">拖动片段移动 · 拖左右边缘调整时长</span>
      <div class="timeline-legend">
        <span><i class="enter" />进场</span>
        <span><i class="hold" />强调</span>
        <span><i class="exit" />退场</span>
      </div>
      <div class="timeline-zoom">
        <button title="缩小时间轨" @click="setTimelineZoom(timelineZoom - 0.25)">－</button>
        <input aria-label="时间轨缩放" type="range" min="1" max="4" step="0.25" :value="timelineZoom" @input="setTimelineZoom(Number(($event.target as HTMLInputElement).value))" />
        <button title="放大时间轨" @click="setTimelineZoom(timelineZoom + 0.25)">＋</button>
        <span>{{ Math.round(timelineZoom * 100) }}%</span>
      </div>
      <span>{{ editorStore.project.fps }} FPS</span>
    </div>

    <div class="timeline-body">
      <div class="timeline-labels">
        <div class="ruler-label">图层</div>
        <button v-for="element in elements" :key="element.id" :class="{ active: element.id === editorStore.selectedId.value }" @click="editorStore.select(element.id)">
          <span>{{ element.name }}</span><small>{{ element.duration.toFixed(1) }}s</small>
        </button>
      </div>

      <div ref="viewport" class="timeline-tracks">
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

          <div v-for="element in elements" :key="element.id" class="track-row" :class="{ selected: element.id === editorStore.selectedId.value }" :data-element-id="element.id" :style="gridStyle">
            <div class="element-span" :data-element-id="element.id" :style="clipStyle(element.start, element.duration)" :title="`${element.name} · ${element.duration.toFixed(2)}s`">
              <i class="span-handle start" data-side="start" />
              <span>{{ element.name }}</span>
              <i class="span-handle end" data-side="end" />
            </div>
            <div v-for="clip in element.animations" :key="clip.id" class="animation-overlay" :class="clip.phase" :style="animationStyle(element.start, clip.offset, clip.duration)" :title="`${phaseLabel(clip.phase)} · ${clip.preset} · ${clip.duration.toFixed(2)}s`" />
          </div>

          <div class="playhead" :style="{ left: playheadLeft }"><i /></div>
        </div>
      </div>
    </div>
  </section>
</template>
