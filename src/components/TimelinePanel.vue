<script setup lang="ts">
import { computed } from 'vue'
import { editorStore } from '@/store/editorStore'

const props = defineProps<{ currentTime: number; playing: boolean; loop: boolean }>()
const emit = defineEmits<{
  seek: [value: number]
  toggle: []
  frame: [direction: -1 | 1]
  loop: []
}>()

const scene = computed(() => editorStore.currentScene.value)
const playheadPercent = computed(() => `${(props.currentTime / scene.value.duration) * 100}%`)
const ticks = computed(() => Array.from({ length: Math.floor(scene.value.duration) + 1 }, (_, index) => index))

function seekFromEvent(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  emit('seek', ((event.clientX - rect.left) / rect.width) * scene.value.duration)
}
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
      <span>{{ editorStore.project.fps }} FPS</span>
    </div>

    <div class="timeline-body">
      <div class="timeline-labels">
        <div class="ruler-label">图层</div>
        <button
          v-for="element in [...scene.elements].sort((a,b) => b.z-a.z)"
          :key="element.id"
          :class="{ active: element.id === editorStore.selectedId.value }"
          @click="editorStore.select(element.id)"
        >{{ element.name }}</button>
      </div>
      <div class="timeline-tracks" @pointerdown="seekFromEvent">
        <div class="ruler">
          <span v-for="tick in ticks" :key="tick" :style="{ left: `${tick / scene.duration * 100}%` }">{{ tick }}s</span>
        </div>
        <div
          v-for="element in [...scene.elements].sort((a,b) => b.z-a.z)"
          :key="element.id"
          class="track-row"
        >
          <div
            class="clip enter"
            :style="{ left: `${element.start / scene.duration * 100}%`, width: `${element.enter.duration / scene.duration * 100}%` }"
          />
          <div
            class="clip hold"
            :style="{ left: `${(element.start + element.enter.duration) / scene.duration * 100}%`, width: `${element.hold.duration / scene.duration * 100}%` }"
          />
          <div
            class="clip exit"
            :style="{ left: `${(element.start + element.enter.duration + element.hold.duration) / scene.duration * 100}%`, width: `${element.exit.duration / scene.duration * 100}%` }"
          />
        </div>
        <div class="playhead" :style="{ left: playheadPercent }"><i /></div>
      </div>
    </div>
  </section>
</template>
