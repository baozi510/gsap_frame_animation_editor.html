<script setup lang="ts">
import { ref } from 'vue'
import { demoAssets } from '@/utils/assets'
import { editorStore } from '@/store/editorStore'

const props = defineProps<{ currentTime: number }>()
const tab = ref<'assets' | 'scenes' | 'layers'>('assets')
const fileInput = ref<HTMLInputElement | null>(null)

function onUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  void upload(input.files?.[0])
}

async function upload(file?: File) {
  if (!file) return
  await editorStore.addUploadedImage(file, props.currentTime)
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <aside class="left-panel panel">
    <div class="panel-tabs">
      <button :class="{ active: tab === 'assets' }" @click="tab = 'assets'">素材</button>
      <button :class="{ active: tab === 'scenes' }" @click="tab = 'scenes'">场景</button>
      <button :class="{ active: tab === 'layers' }" @click="tab = 'layers'">图层</button>
    </div>

    <div v-if="tab === 'assets'" class="panel-scroll asset-panel">
      <input ref="fileInput" hidden type="file" accept="image/png,image/jpeg,image/webp" @change="onUploadChange" />
      <button class="upload-zone" @click="fileInput?.click()">
        <strong>上传图片素材</strong>
        <span>PNG、JPG、WebP</span>
      </button>
      <div class="section-label">演示素材</div>
      <div class="asset-grid">
        <button v-for="asset in demoAssets" :key="asset.id" class="asset-card" @click="editorStore.addDemoAsset(asset.id, currentTime)">
          <img :src="asset.src" :alt="asset.name" />
          <span>{{ asset.name }}</span>
        </button>
      </div>
      <div class="section-label">基础挂件</div>
      <div class="asset-grid basic-grid">
        <button class="basic-card" @click="editorStore.addShape('rect', currentTime)"><i class="shape rect" /><span>矩形</span></button>
        <button class="basic-card" @click="editorStore.addShape('circle', currentTime)"><i class="shape circle" /><span>圆形</span></button>
        <button class="basic-card" @click="editorStore.addShape('text', currentTime)"><i class="text-icon">Aa</i><span>文字</span></button>
        <button class="basic-card" @click="editorStore.addShape('star', currentTime)"><i class="star-icon">★</i><span>贴纸</span></button>
      </div>
    </div>

    <div v-else-if="tab === 'scenes'" class="panel-scroll scene-panel">
      <button
        v-for="(scene, index) in editorStore.project.scenes"
        :key="scene.id"
        class="scene-row"
        :class="{ active: scene.id === editorStore.project.currentSceneId }"
        @click="editorStore.switchScene(scene.id)"
      >
        <span class="scene-index">{{ index + 1 }}</span>
        <span class="scene-copy"><strong>{{ scene.name }}</strong><small>{{ scene.elements.length }} 个元素</small></span>
        <span class="scene-duration">{{ scene.duration.toFixed(1) }}s</span>
      </button>
      <div class="scene-actions">
        <button @click="editorStore.addScene">＋ 新场景</button>
        <button @click="editorStore.duplicateScene">复制</button>
        <button @click="editorStore.deleteScene">删除</button>
      </div>
    </div>

    <div v-else class="panel-scroll layer-panel">
      <button
        v-for="element in [...editorStore.currentScene.value.elements].sort((a,b) => b.z-a.z)"
        :key="element.id"
        class="layer-row"
        :class="{ active: element.id === editorStore.selectedId.value }"
        @click="editorStore.select(element.id)"
      >
        <span class="layer-eye" @click.stop="editorStore.commit(() => element.visible = !element.visible)">{{ element.visible ? '◉' : '○' }}</span>
        <span class="layer-type">{{ element.type === 'image' ? '图' : element.type === 'shape' ? '形' : '字' }}</span>
        <span class="layer-name">{{ element.name }}</span>
        <span class="layer-lock" @click.stop="editorStore.commit(() => element.locked = !element.locked)">{{ element.locked ? '锁' : '开' }}</span>
      </button>
    </div>
  </aside>
</template>
