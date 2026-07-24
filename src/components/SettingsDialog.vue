<script setup lang="ts">
import { ref, watch } from 'vue'
import { editorStore } from '@/store/editorStore'
import {
  getAssetApiBase,
  getAssetApiToken,
  setAssetApiBase,
  setAssetApiToken,
} from '@/services/assets'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const apiBase = ref('')
const apiToken = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  apiBase.value = getAssetApiBase()
  apiToken.value = getAssetApiToken()
}, { immediate: true })

function save() {
  setAssetApiBase(apiBase.value.trim())
  setAssetApiToken(apiToken.value.trim())
  window.dispatchEvent(new CustomEvent('motionframe:asset-settings'))
  editorStore.notify('素材服务器设置已保存')
  emit('close')
}
</script>

<template>
  <div v-if="open" class="settings-backdrop" @mousedown.self="emit('close')">
    <section class="settings-page" role="dialog" aria-modal="true" aria-label="设置">
      <header class="settings-header">
        <div><strong>设置</strong><small>MotionFrame 编辑器配置</small></div>
        <button class="settings-close" title="关闭设置" @click="emit('close')">×</button>
      </header>

      <div class="settings-layout">
        <nav class="settings-nav">
          <button class="active"><span>▣</span>素材服务器</button>
        </nav>

        <div class="settings-content">
          <section class="settings-section">
            <header><strong>图片与视频服务器</strong><small>自定义 NAS 素材 API</small></header>
            <p>上传、文件夹和素材下载都使用这里的服务器地址。项目 JSON 只保存 assetId，素材文件继续缓存在浏览器 IndexedDB。</p>
            <label>
              <span>API 地址</span>
              <input v-model="apiBase" placeholder="https://nas.example.com" autocomplete="off" />
              <small>接口前缀固定为 /api/v1，请填写服务器根地址。</small>
            </label>
            <label>
              <span>访问令牌</span>
              <input v-model="apiToken" type="password" placeholder="可选 Bearer Token" autocomplete="off" />
              <small>没有鉴权时可以留空。</small>
            </label>
          </section>
        </div>
      </div>

      <footer class="settings-footer">
        <button @click="emit('close')">取消</button>
        <button class="primary" @click="save">保存设置</button>
      </footer>
    </section>
  </div>
</template>
