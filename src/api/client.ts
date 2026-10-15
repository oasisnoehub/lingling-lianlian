import { Person, Post, PostWithAuthor, MediaItem, PostLocation } from '../types'

const API_BASE = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      ...options?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function getPersons(): Promise<Person[]> {
  return fetchJson<Person[]>('/persons')
}

export async function getTimeline(): Promise<PostWithAuthor[]> {
  return fetchJson<PostWithAuthor[]>('/timeline')
}

export interface CreatePostData {
  author_id: string
  content: string
  emotion?: string
  media?: MediaItem[]
  location?: PostLocation | null
}

export interface ReverseLocationResult {
  formatted_address: string
  nearest_poi?: string
  latitude: number
  longitude: number
}

export async function reverseLocation(latitude: number, longitude: number): Promise<ReverseLocationResult> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  })
  const res = await fetch(`${API_BASE}/location/reverse?${query}`)
  let result: ReverseLocationResult & { error?: string }
  try {
    result = await res.json() as ReverseLocationResult & { error?: string }
  } catch {
    throw new Error('定位服务响应异常，请稍后重试')
  }

  if (!res.ok) {
    throw new Error(result.error || '地址获取失败，请稍后重试')
  }
  return result
}

export async function createPost(data: CreatePostData): Promise<Post> {
  return fetchJson<Post>('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updatePost(
  id: string,
  content: string,
  emotion?: string,
  media?: MediaItem[],
  location?: PostLocation | null
): Promise<Post> {
  return fetchJson<Post>(`/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, emotion, media, location }),
  })
}

export async function deletePost(id: string): Promise<void> {
  await fetch(`${API_BASE}/posts/${id}`, { method: 'DELETE' })
}

export async function uploadImage(file: File): Promise<MediaItem> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload/image`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`)
  }
  return res.json()
}

export async function uploadVideo(file: File): Promise<MediaItem> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload/video`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`)
  }
  return res.json()
}
