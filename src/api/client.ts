import { Person, Post, PostWithAuthor, MediaItem } from '../types'

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
  media?: MediaItem[]
}

export async function createPost(data: CreatePostData): Promise<Post> {
  return fetchJson<Post>('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updatePost(id: string, data: Partial<CreatePostData>): Promise<Post> {
  return fetchJson<Post>(`/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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
