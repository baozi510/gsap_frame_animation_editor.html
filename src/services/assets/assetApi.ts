import type { AssetFolder, ProjectAsset } from '@/types/editor'

const API_BASE_KEY = 'motionframe-asset-api-base'
const API_TOKEN_KEY = 'motionframe-asset-api-token'

interface ApiEnvelope<T> {
  data?: T
}

function unwrap<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T
  }
  return payload as T
}

function normalizeList<T>(payload: unknown, preferredKeys: string[] = []): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []

  const record = payload as Record<string, unknown>
  if ('data' in record) return normalizeList<T>(record.data, preferredKeys)

  const keys = [...preferredKeys, 'items', 'results', 'list']
  for (const key of keys) {
    if (key in record) return normalizeList<T>(record[key], preferredKeys)
  }
  return []
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

  const text = await response.text()
  if (!text.trim()) return undefined as T

  try {
    return unwrap<T>(JSON.parse(text) as T | ApiEnvelope<T>)
  } catch {
    throw new Error('素材接口返回了无法识别的数据')
  }
}

export async function listAssetFolders(parentId?: string | null): Promise<AssetFolder[]> {
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : ''
  const payload = await request<unknown>(`/api/v1/folders${query}`)
  return normalizeList<AssetFolder>(payload, ['folders'])
}

export async function createAssetFolder(name: string, parentId?: string | null) {
  const folder = await request<AssetFolder>('/api/v1/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  })
  if (!folder?.id) throw new Error('目录创建成功，但接口没有返回目录信息')
  return folder
}

export async function listRemoteAssets(folderId?: string | null): Promise<ProjectAsset[]> {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
  const payload = await request<unknown>(`/api/v1/assets${query}`)
  return normalizeList<ProjectAsset>(payload, ['assets'])
}

export async function getRemoteAsset(assetId: string) {
  return request<ProjectAsset>(`/api/v1/assets/${encodeURIComponent(assetId)}`)
}

export async function uploadRemoteAsset(file: File, folderId?: string | null) {
  const form = new FormData()
  form.append('file', file)
  if (folderId) form.append('folderId', folderId)
  const asset = await request<ProjectAsset>('/api/v1/assets', {
    method: 'POST',
    body: form,
  })
  if (!asset?.id) throw new Error('上传完成，但接口没有返回素材信息')
  return asset
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
