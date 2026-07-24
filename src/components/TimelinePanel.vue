<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { editorStore } from '@/store/editorStore'
import { clamp } from '@/utils/helpers'

const props = defineProps<{ currentTime: number; playing: boolean; loop: boolean }>()
const emit = defineEmits<{
  seek: [value: number]
  toggle: []
  frame: [direction: -1 | 1]
  loop: []
}>()

const scene = computed(() => editorStore.currentScene.value)
const viewport = ref<HTMLElement | null>(null)
const viewportWidth = ref(900)
const timelineZoom = ref(1)
const scrubbing = ref(false)
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
  for (let value = 0; value <= scene.value.duration + 0.0001; value += step) {
    result.push(Number(value.toFixed(2)))
  }
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

function elementSpanStyle(element: (typeof elements.value)[number]) {
  const duration = element.enter.duration + element.hold.duration + element.exit.duration
  return clipStyle(element.start, duration)
}

function seekFromPointer(event: PointerEvent) {
  const surface = event.currentTarget as HTMLElement
  const rect = surface.getBoundingClientRect()
  const value = ((event.clientX - rect.left) / Math.max(1, rect.width)) * scene.value.duration
  emit('seek', clamp(value, 0, scene.value.duration))
}

function startScrub(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  const row = target.closest<HTMLElement>('.track-row')
  if (row?.dataset.elementId) editorStore.select(row.dataset.elementId)
  scrubbing.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  seekFromPointer(event)
}

function moveScrub(event: PointerEvent) {
  if (scrubbing.value) seekFromPointer(event)
}

function stopScrub(event: PointerEvent) {
  if (!scrubbing.value) return
  scrubbing.value = false
  const surface = event.currentTarget as HTMLElement
  if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
}

function setTimelineZoom(value: number) {
  timelineZoom.value = clamp(value, 1, 4)
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
      <div class="timeline-zoom">
        <button title="缩小时间轨" @click="setTimelineZoom(timelineZoom - 0.25)">－</button>
        <input
          aria-label="时间轨缩放"
          type="range"
          min="1"
          max="4"
          step="0.25"
          :value="timelineZoom"
          @input="setTimelineZoom(Number(($event.target as HTMLInputElement).value))"
        />
        <button title="放大时间轨" @click="setTimelineZoom(timelineZoom + 0.25)">＋</button>
        <span>{{ Math.round(timelineZoom * 100) }}%</span>
      </div>
      <span>{{ editorStore.project.fps }} FPS</span>
    </div>

    <div class="timeline-body">
      <div class="timeline-labels">
        <div class="ruler-label">图层</div>
        <button
          v-for="element in elements"
          :key="element.id"
          :class="{ active: element.id === editorStore.selectedId.value }"
          @click="editorStore.select(element.id)"
        >{{ element.name }}</button>
      </div>

      <div ref="viewport" class="timeline-tracks">
        <div
          class="timeline-surface"
          :class="{ scrubbing }"
          :style="{ width: `${timelineWidth}px` }"
          @pointerdown="startScrub"
          @pointermove="moveScrub"
          @pointerup="stopScrub"
          @pointercancel="stopScrub"
        >
          <div class="ruler" :style="gridStyle">
            <span
              v-for="tick in ticks"
              :key="tick"
              :class="{ major: Number.isInteger(tick) }"
              :style="{ left: `${timeToPx(tick)}px` }"
            >{{ Number.isInteger(tick) ? `${tick}s` : tick }}</span>
          </div>

          <div
            v-for="element in elements"
            :key="element.id"
            class="track-row"
            :class="{ selected: element.id === editorStore.selectedId.value }"
            :data-element-id="element.id"
            :style="gridStyle"
          >
            <div class="clip enter" :style="clipStyle(element.start, element.enter.duration)" />
            <div class="clip hold" :style="clipStyle(element.start + element.enter.duration, element.hold.duration)" />
            <div class="clip exit" :style="clipStyle(element.start + element.enter.duration + element.hold.duration, element.exit.duration)" />
            <div class="clip-label" :style="elementSpanStyle(element)" :title="element.name">
              <span>{{ element.name }}</span>
            </div>
          </div>

          <div class="playhead" :style="{ left: playheadLeft }"><i /></div>
        </div>
      </div>
    </div>
  </section>
</template>
