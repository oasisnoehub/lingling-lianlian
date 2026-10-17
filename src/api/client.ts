import { Person, Post, PostWithAuthor, MediaItem, PostLocation } from '../types'

const API_BASE = '/api'
const TOKEN_KEY = 'linglinglianlian.token'

/** An error whose message is safe (and useful) to show to the user. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* localStorage unavailable (private mode); the session just won't persist */
  }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', 'Bearer ' + token)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    return await fetch(API_BASE + path, { ...options, headers })
  } catch {
    throw new ApiError('网络连接失败，请检查网络后重试', 0)
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  const serverMessage = (payload as { error?: string } | null)?.error
  return new ApiError(serverMessage || '请求失败（' + response.status + '）', response.status)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options)
  if (response.status === 204) return undefined as T
  if (!response.ok) {
    throw await toApiError(response)
  }
  return (await response.json()) as T
}

export interface LoginResult {
  token: string
  person: Person
}

export async function login(personId: string, password: string): Promise<LoginResult> {
  const result = await request<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ personId, password }),
  })
  setToken(result.token)
  return result
}

export async function logout(): Promise<void> {
  setToken(null)
  timelineETag = null
}

export async function getMe(): Promise<Person> {
  const result = await request<{ person: Person }>('/auth/me')
  return result.person
}

/** ETag from the last successful timeline fetch, replayed on the next poll. */
let timelineETag: string | null = null

/**
 * Returns the posts, or null when the server reports nothing has changed since
 * the previous call. This keeps the 15s poll costing a 304 rather than a full
 * copy of the timeline every time.
 */
export async function getTimeline(): Promise<PostWithAuthor[] | null> {
  const headers = new Headers()
  if (timelineETag) headers.set('If-None-Match', timelineETag)

  const response = await apiFetch('/timeline', { headers })
  if (response.status === 304) return null
  if (!response.ok) throw await toApiError(response)

  timelineETag = response.headers.get('ETag')
  return (await response.json()) as PostWithAuthor[]
}

export interface CreatePostData {
  content: string
  emotion?: string
  media?: MediaItem[]
  location?: PostLocation | null
}

export async function createPost(data: CreatePostData): Promise<Post> {
  return request<Post>('/posts', { method: 'POST', body: JSON.stringify(data) })
}

export async function updatePost(
  id: string,
  content: string,
  emotion?: string,
  media?: MediaItem[],
  location?: PostLocation | null,
): Promise<Post> {
  return request<Post>('/posts/' + id, {
    method: 'PUT',
    body: JSON.stringify({ content, emotion, media, location }),
  })
}

export async function deletePost(id: string): Promise<void> {
  await request<void>('/posts/' + id, { method: 'DELETE' })
}

export interface ReverseLocationResult {
  formatted_address: string
  nearest_poi?: string
  latitude: number
  longitude: number
}

export async function reverseLocation(latitude: number, longitude: number): Promise<ReverseLocationResult> {
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) })
  return request<ReverseLocationResult>('/location/reverse?' + query.toString())
}

export interface UploadTask {
  promise: Promise<MediaItem>
  /** Cancels the in-flight request; the promise rejects with an aborted error. */
  abort: () => void
}

/**
 * fetch() cannot report upload progress, so multipart uploads go through XHR.
 * It also gives us a real abort() for when the user cancels mid-upload.
 */
function uploadFile(path: string, file: File, onProgress?: (percent: number) => void): UploadTask {
  const xhr = new XMLHttpRequest()
  let aborted = false

  const promise = new Promise<MediaItem>((resolve, reject) => {
    xhr.open('POST', API_BASE + path)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let payload: unknown = null
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        payload = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as MediaItem)
        return
      }

      const serverMessage = (payload as { error?: string } | null)?.error
      reject(new ApiError(serverMessage || '上传失败（' + xhr.status + '）', xhr.status))
    }

    xhr.onerror = () => reject(new ApiError('上传失败，请检查网络后重试', 0))
    xhr.onabort = () => reject(new ApiError('上传已取消', 0))

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)

    if (aborted) xhr.abort()
  })

  return {
    promise,
    abort: () => {
      aborted = true
      xhr.abort()
    },
  }
}

export function uploadImage(file: File, onProgress?: (percent: number) => void): UploadTask {
  return uploadFile('/upload/image', file, onProgress)
}

export function uploadVideo(file: File, onProgress?: (percent: number) => void): UploadTask {
  return uploadFile('/upload/video', file, onProgress)
}

/**
 * Upload avatar image using XHR for progress reporting.
 * Avatar files are limited to 2MB and must be JPEG, PNG, or WebP.
 */
export interface AvatarUploadResponse {
  avatar_url: string
  avatar_updated_at: number
}

export function uploadAvatar(
  file: File,
  onProgress?: (percent: number) => void,
): UploadTask & { promise: Promise<AvatarUploadResponse> } {
  return uploadFile('/avatar', file, onProgress) as UploadTask & { promise: Promise<AvatarUploadResponse> }
}
