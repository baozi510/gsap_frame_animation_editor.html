import { ref, watch } from 'vue'

const PLAYHEAD_KEY = 'motionframe-playhead-v1'
const stored = Number(sessionStorage.getItem(PLAYHEAD_KEY) ?? 0)

export const workspaceTime = ref(Number.isFinite(stored) && stored >= 0 ? stored : 0)

watch(workspaceTime, (value) => {
  sessionStorage.setItem(PLAYHEAD_KEY, String(Math.max(0, value)))
})
