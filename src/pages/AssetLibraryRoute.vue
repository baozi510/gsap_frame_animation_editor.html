<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AssetManagerPage from '@/components/AssetManagerPage.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import UploadDialog from '@/components/UploadDialog.vue'
import { workspaceTime } from '@/state/workspaceState'

const router = useRouter()
const uploadOpen = ref(false)
const settingsOpen = ref(false)

function openUploadSettings() {
  uploadOpen.value = false
  settingsOpen.value = true
}
</script>

<template>
  <main class="route-page asset-library-route">
    <AssetManagerPage
      :current-time="workspaceTime"
      @back="router.push('/')"
      @upload="uploadOpen = true"
      @settings="settingsOpen = true"
    />
    <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
    <UploadDialog :open="uploadOpen" @close="uploadOpen = false" @settings="openUploadSettings" />
  </main>
</template>
