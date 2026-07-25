<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { editorStore } from '@/store/editorStore'
import type { EditorElement, MotionClip, MotionRelation } from '@/types/editor'
import { clamp } from '@/utils/helpers'
import {
  clampMotionClips,
  createMotionClip,
  ensureMotionClips,
  getMotionClips,
  normalizeMotionClips,
  reflowMotionClips,
} from '@/utils/motionClips'

const emit = defineEmits<{ preview: [clipId: string] }>()
const selectedMotionId = ref<string | null>(null)
let previewTimer = 0

const element = computed(() => editorStore.selectedElement.value)
const clips = computed(() => getMotionClips(element.value).slice().sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id)))
const selectedClip = computed(() => clips.value.find((clip) => clip.id === selectedMotionId.value) ?? clips.value[0] ?? null)
const eases = ['none','power1.out','power2.out','power3.out','power2.in','power3.in','power2.inOut','power3.inOut','back.out(1.7)','elastic.out(1,0.45)','sine.inOut']

watch(() => element.value?.id, () => {
  if (element.value) normalizeMotionClips(element.value)
  selectedMotionId.value = getMotionClips(element.value)[0]?.id ?? null
}, { immediate: true })

watch(() => clips.value.map((clip) => clip.id).join(','), () => {
  if (!clips.value.some((clip) => clip.id === selectedMotionId.value)) selectedMotionId.value = clips.value[0]?.id ?? null
})

function eventValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function eventNumber(event: Event) {
  return Number(eventValue(event))
}

function queuePreview(delay = 120) {
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    if (selectedClip.value) emit('preview', selectedClip.value.id)
  }, delay)
}

function commitMotion(mutator: (clip: MotionClip, element: EditorElement) => void, preview = true) {
  const clipId = selectedClip.value?.id
  if (!element.value || !clipId) return
  editorStore.updateElement((target) => {
    const targetClip = ensureMotionClips(target).find((clip) => clip.id === clipId)
    if (!targetClip) return
    mutator(targetClip, target)
    clampMotionClips(target)
  })
  if (preview) queuePreview()
}

async function addMotion(relation: MotionRelation) {
  if (!element.value) return
  const anchor = selectedClip.value ?? clips.value.at(-1)
  let nextId = ''
  editorStore.updateElement((target) => {
    const targetAnchor = anchor ? ensureMotionClips(target).find((clip) => clip.id === anchor.id) : undefined
    const clip = createMotionClip(target, relation, targetAnchor)
    ensureMotionClips(target).push(clip)
    reflowMotionClips(target)
    nextId = clip.id
  })
  selectedMotionId.value = nextId
  await nextTick()
  queuePreview(40)
}

function removeMotion() {
  const clipId = selectedClip.value?.id
  if (!element.value || !clipId) return
  window.clearTimeout(previewTimer)
  editorStore.updateElement((target) => {
    const clips = ensureMotionClips(target)
    target.style.motionAnimations = clips.filter((clip) => clip.id !== clipId)
    target.style.motionAnimations.forEach((clip) => {
      if (clip.linkedTo === clipId) {
        clip.relation = 'free'
        delete clip.linkedTo
      }
    })
    reflowMotionClips(target)
  })
}

function detachMotion() {
  commitMotion((clip) => {
    clip.relation = 'free'
    delete clip.linkedTo
  })
}

function updateOffset(value: number) {
  commitMotion((clip, target) => {
    clip.relation = 'free'
    delete clip.linkedTo
    clip.offset = clamp(value, 0, Math.max(0, target.duration - clip.duration))
  })
}

function setPreset(name: 'right' | 'left' | 'up' | 'down' | 'grow' | 'shrink' | 'rotate' | 'fade' | 'reset') {
  commitMotion((clip) => {
    clip.x = 0
    clip.y = 0
    clip.scale = 100
    clip.rotation = 0
    clip.opacity = 0
    if (name === 'right') clip.x = 200
    if (name === 'left') clip.x = -200
    if (name === 'up') clip.y = -200
    if (name === 'down') clip.y = 200
    if (name === 'grow') clip.scale = 125
    if (name === 'shrink') clip.scale = 75
    if (name === 'rotate') clip.rotation = 90
    if (name === 'fade') clip.opacity = -100
  })
}

function relationLabel(clip: MotionClip) {
  if (clip.relation === 'chain') return '接续'
  if (clip.relation === 'parallel') return '并列'
  return '自由'
}

onBeforeUnmount(() => window.clearTimeout(previewTimer))
</script>

<template>
  <div class="motion-editor">
    <section class="inspector-section motion-intro">
      <header><strong>普通动画</strong><small>多段组合</small></header>
      <p>一段动画可同时设置位移、缩放、旋转和透明度。接续会排在当前段之后，并列会与当前段同时开始。</p>
      <div class="motion-add-actions">
        <button @click="addMotion('chain')">＋ 接续添加</button>
        <button @click="addMotion('parallel')">＋ 并列添加</button>
        <button @click="addMotion('free')">＋ 自由添加</button>
      </div>
    </section>

    <section v-if="clips.length" class="inspector-section motion-list-section">
      <header><strong>动画片段</strong><small>{{ clips.length }} 段</small></header>
      <div class="motion-clip-list">
        <button
          v-for="(clip, index) in clips"
          :key="clip.id"
          :class="{ active: clip.id === selectedClip?.id }"
          @click="selectedMotionId = clip.id; emit('preview', clip.id)"
        >
          <span><b>{{ index + 1 }}</b>{{ clip.name }}</span>
          <small>{{ relationLabel(clip) }} · {{ clip.offset.toFixed(2) }}–{{ (clip.offset + clip.duration).toFixed(2) }}s</small>
        </button>
      </div>
    </section>

    <section v-if="selectedClip" class="inspector-section motion-settings">
      <header>
        <strong>{{ selectedClip.name }}</strong>
        <button class="preview-link" @click="emit('preview', selectedClip.id)">循环预览</button>
      </header>

      <div class="motion-preset-grid">
        <button @click="setPreset('right')">向右</button><button @click="setPreset('left')">向左</button>
        <button @click="setPreset('up')">向上</button><button @click="setPreset('down')">向下</button>
        <button @click="setPreset('grow')">放大</button><button @click="setPreset('shrink')">缩小</button>
        <button @click="setPreset('rotate')">旋转</button><button @click="setPreset('fade')">淡出</button>
        <button @click="setPreset('reset')">重置</button>
      </div>

      <label class="field-row"><span>名称</span><input :value="selectedClip.name" @change="commitMotion(clip => clip.name = eventValue($event), false)" /></label>
      <label class="field-row"><span>相对开始</span><input type="number" min="0" :max="element?.duration ?? 0" step="0.05" :value="selectedClip.offset" @change="updateOffset(eventNumber($event))" /></label>
      <label class="field-row"><span>持续时间</span><input type="number" min="0.05" :max="element?.duration ?? 0" step="0.05" :value="selectedClip.duration" @change="commitMotion(clip => clip.duration = eventNumber($event))" /></label>
      <label class="field-row"><span>缓动曲线</span><select :value="selectedClip.ease" @change="commitMotion(clip => clip.ease = eventValue($event))"><option v-for="ease in eases" :key="ease" :value="ease">{{ ease }}</option></select></label>

      <div class="motion-property-grid">
        <label><span>水平位移 px</span><input type="number" step="1" :value="selectedClip.x" @change="commitMotion(clip => clip.x = eventNumber($event))" /></label>
        <label><span>垂直位移 px</span><input type="number" step="1" :value="selectedClip.y" @change="commitMotion(clip => clip.y = eventNumber($event))" /></label>
        <label><span>缩放 %</span><input type="number" min="1" max="500" step="1" :value="selectedClip.scale" @change="commitMotion(clip => clip.scale = eventNumber($event))" /></label>
        <label><span>旋转 °</span><input type="number" step="1" :value="selectedClip.rotation" @change="commitMotion(clip => clip.rotation = eventNumber($event))" /></label>
        <label class="wide"><span>透明度变化 %</span><input type="number" min="-100" max="100" step="1" :value="selectedClip.opacity" @change="commitMotion(clip => clip.opacity = eventNumber($event))" /></label>
      </div>

      <p class="field-help">同一段里填写多个属性，就是组合动画；多个并列片段会叠加计算，多个接续片段会保留上一段结果继续执行。</p>
      <div class="motion-bottom-actions">
        <button v-if="selectedClip.relation !== 'free'" @click="detachMotion">解除关联</button>
        <button class="danger" @click="removeMotion">删除片段</button>
      </div>
    </section>

    <section v-else class="inspector-section animation-empty">
      <strong>这个元素还没有普通动画</strong>
      <span>先添加一段，随后可以继续接续或并列其他动画。</span>
      <button @click="addMotion('free')">＋ 添加第一段普通动画</button>
    </section>
  </div>
</template>
