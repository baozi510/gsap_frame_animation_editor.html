import type { ProjectAsset } from '@/types/editor'
import { downloadRemoteAsset } from './assetApi'

const DB_NAME = 'motionframe-assets-v1'
const STORE_NAME = 'assets'
const DB_VERSION = 1

interface CachedAsset {
  id: string
  hash?: string
  mimeType: string
  blob: Blob
  updatedAt: number
}

const objectUrls = new Map<string, string>()
let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
    })
  }
  return dbPromise
}

async function runStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = action(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getCachedAsset(assetId: string) {
  return runStore<CachedAsset | undefined>('readonly', (store) => store.get(assetId))
}

export async function hasCachedAsset(asset: ProjectAsset) {
  const cached = await getCachedAsset(asset.id)
  return Boolean(cached && (!asset.hash || !cached.hash || cached.hash === asset.hash))
}

export async function cacheAssetBlob(asset: ProjectAsset, blob: Blob) {
  const cached: CachedAsset = {
    id: asset.id,
    hash: asset.hash,
    mimeType: asset.mimeType || blob.type,
    blob,
    updatedAt: Date.now(),
  }
  await runStore<IDBValidKey>('readwrite', (store) => store.put(cached))
  const previous = objectUrls.get(asset.id)
  if (previous) URL.revokeObjectURL(previous)
  objectUrls.delete(asset.id)
}

export async function removeCachedAsset(assetId: string) {
  await runStore<undefined>('readwrite', (store) => store.delete(assetId) as IDBRequest<undefined>)
  const previous = objectUrls.get(assetId)
  if (previous) URL.revokeObjectURL(previous)
  objectUrls.delete(assetId)
}

export async function resolveAssetSource(asset: ProjectAsset, fallbackSrc?: string) {
  const existingUrl = objectUrls.get(asset.id)
  if (existingUrl) return existingUrl

  let cached = await getCachedAsset(asset.id)
  if (cached && asset.hash && cached.hash && cached.hash !== asset.hash) cached = undefined
  if (!cached) {
    const blob = await downloadRemoteAsset(asset)
    await cacheAssetBlob(asset, blob)
    cached = await getCachedAsset(asset.id)
  }
  if (!cached) {
    if (fallbackSrc) return fallbackSrc
    throw new Error(`素材缺失：${asset.name}`)
  }
  const url = URL.createObjectURL(cached.blob)
  objectUrls.set(asset.id, url)
  return url
}
