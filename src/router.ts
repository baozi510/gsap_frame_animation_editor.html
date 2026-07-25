import { createRouter, createWebHashHistory } from 'vue-router'
import EditorPage from '@/pages/EditorPage.vue'
import AssetLibraryRoute from '@/pages/AssetLibraryRoute.vue'

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'editor', component: EditorPage },
    { path: '/assets', name: 'assets', component: AssetLibraryRoute },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
