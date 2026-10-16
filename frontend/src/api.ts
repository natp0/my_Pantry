import type {
  Availability,
  CatalogItem,
  Category,
  IntakeSuggestion,
  SavedIntakeItem,
  StaffCatalogItem,
} from './types'

const STAFF_TOKEN_KEY = 'mypantry-staff-token'

export class StaffAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaffAuthError'
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function getCategories() {
  return fetchJson<Category[]>('/api/categories/')
}

export function getItems(categorySlug?: string) {
  const query = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : ''
  return fetchJson<CatalogItem[]>(`/api/items/${query}`)
}

export function getStaffToken() {
  return sessionStorage.getItem(STAFF_TOKEN_KEY)
}

export function clearStaffToken() {
  sessionStorage.removeItem(STAFF_TOKEN_KEY)
}

export async function loginStaff(username: string, password: string) {
  const response = await fetch('/api/auth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const body = (await response.json()) as { token: string; username: string }
  sessionStorage.setItem(STAFF_TOKEN_KEY, body.token)
  return body
}

export async function identifyShelf(file: File) {
  const form = new FormData()
  form.append('image', file)
  const response = await staffFetch('/api/intake/', { method: 'POST', body: form })
  if (response.status === 401) {
    throw new StaffAuthError(await readError(response))
  }
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json() as Promise<{
    id: number
    suggestions: IntakeSuggestion[]
    detail?: string
  }>
}

export async function confirmIntake(
  captureId: number,
  items: Array<{
    action: 'update' | 'create'
    item_id?: number
    name: string
    category_id: number
    points: number
    availability: string
    description: string
    box_2d: [number, number, number, number]
  }>,
) {
  const response = await staffFetch(`/api/intake/${captureId}/confirm/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (response.status === 401) {
    throw new StaffAuthError(await readError(response))
  }
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json() as Promise<{ saved: SavedIntakeItem[] }>
}

export async function getStaffItems() {
  const response = await staffFetch('/api/staff/items/', { method: 'GET' })
  if (response.status === 401) {
    throw new StaffAuthError(await readError(response))
  }
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json() as Promise<StaffCatalogItem[]>
}

export async function updateStaffItem(
  itemId: number,
  item: {
    name: string
    category_id: number
    points: number
    availability: Availability
    description: string
    is_active: boolean
  },
  photo?: {
    file?: File
    box: [number, number, number, number]
  },
) {
  const response = await staffFetch(`/api/staff/items/${itemId}/`, {
    method: 'PATCH',
    ...(photo
      ? { body: staffItemForm(item, photo) }
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        }),
  })
  if (response.status === 401) {
    throw new StaffAuthError(await readError(response))
  }
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json() as Promise<StaffCatalogItem>
}

function staffItemForm(
  item: {
    name: string
    category_id: number
    points: number
    availability: Availability
    description: string
    is_active: boolean
  },
  photo: {
    file?: File
    box: [number, number, number, number]
  },
) {
  const form = new FormData()
  form.append('name', item.name)
  form.append('category_id', String(item.category_id))
  form.append('points', String(item.points))
  form.append('availability', item.availability)
  form.append('description', item.description)
  form.append('is_active', item.is_active ? 'true' : 'false')
  form.append('box_2d', JSON.stringify(photo.box))
  if (photo.file) {
    form.append('image', photo.file)
  }
  return form
}

async function staffFetch(path: string, options: RequestInit) {
  const headers = new Headers(options.headers)
  const token = getStaffToken()
  if (token) {
    headers.set('Authorization', `Token ${token}`)
  }
  const response = await fetch(path, { ...options, headers })
  if (response.status === 401) {
    clearStaffToken()
  }
  return response
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail) {
      return body.detail
    }
  } catch {
    // The response was not JSON.
  }
  return `Request failed (${response.status})`
}
