<script setup lang="ts">
import type { ExportProgress } from '@/types/editor'

defineProps<{ progress: ExportProgress }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div v-if="progress.active" class="modal-backdrop">
    <div class="export-dialog">
      <div class="export-orbit" :style="{ background: `conic-gradient(var(--accent) ${progress.percent}%, #292e38 0)` }"><span>{{ Math.round(progress.percent) }}%</span></div>
      <h2>{{ progress.title }}</h2>
      <p>{{ progress.detail }}</p>
      <div class="export-progress"><i :style="{ width: `${progress.percent}%` }" /></div>
      <button v-if="progress.percent >= 100 || progress.error" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>
