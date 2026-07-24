import type { AssetFolder, ProjectAsset } from '@/types/editor'

const API_BASE_KEY = 'motionframe-asset-api-base'
const API_TOKEN_KEY = 'motionframe-asset-api-token'

interface ApiEnvelope<T> {
  data?: T
}

function unwrap<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload && (payload as ApiEnvelope<T>).data !== undefined) {
    return (payload as ApiEnvelope<T>).data as T
  }
  return payload as T
}

export function getAssetApiBase() {
  return (localStorage.getItem(API_BASE_KEY) ?? import.meta.env.VITE_ASSET_API_BASE ?? '').replace(/\/$/, '')
}

export function setAssetApiBase(value: string) {
  localStorage.setItem(API_BASE_KEY, value.trim().replace(/\/$/, ''))
}

export function getAssetApiToken() {
  return localStorage.getItem(API_TOKEN_KEY) ?? ''
}

export function setAssetApiToken(value: string) {
  localStorage.setItem(API_TOKEN_KEY, value.trim())
}

function apiUrl(path: string) {
  const base = getAssetApiBase()
  if (!base) throw new Error('请先设置素材 API 地址')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  const token = getAssetApiToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: authHeaders(init?.headers),
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `素材接口请求失败（${response.status}）`)
  }
  if (response.status === 204) return undefined as T
  return unwrap<T>(await response.json() as T | ApiEnvelope<T>)
}

export async function listAssetFolders(parentId?: string | null) {
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : ''
  return request<AssetFolder[]>(`/api/v1/folders${query}`)
}

export async function createAssetFolder(name: string, parentId?: string | null) {
  return request<AssetFolder>('/api/v1/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  })
}

export async function listRemoteAssets(folderId?: string | null) {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
  return request<ProjectAsset[]>(`/api/v1/assets${query}`)
}

export async function getRemoteAsset(assetId: string) {
  return request<ProjectAsset>(`/api/v1/assets/${encodeURIComponent(assetId)}`)
}

export async function uploadRemoteAsset(file: File, folderId?: string | null) {
  const form = new FormData()
  form.append('file', file)
  if (folderId) form.append('folderId', folderId)
  return request<ProjectAsset>('/api/v1/assets', {
    method: 'POST',
    body: form,
  })
}

export async function deleteRemoteAsset(assetId: string) {
  return request<void>(`/api/v1/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
}

export async function downloadRemoteAsset(asset: ProjectAsset): Promise<Blob> {
  const url = asset.downloadUrl || apiUrl(`/api/v1/assets/${encodeURIComponent(asset.id)}/content`)
  const response = await fetch(url, {
    headers: url.startsWith(getAssetApiBase()) ? authHeaders() : undefined,
  })
  if (!response.ok) throw new Error(`素材下载失败：${asset.name}（${response.status}）`)
  return response.blob()
}
