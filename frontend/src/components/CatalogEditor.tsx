import { useEffect, useRef, useState } from 'react'

import { getStaffItems, StaffAuthError, updateStaffItem } from '../api'
import type { Availability, Category, StaffCatalogItem } from '../types'
import { AvailabilityBadge } from './AvailabilityBadge'
import { PhotoCropper, type CropBox } from './PhotoCropper'

const FULL_CROP: CropBox = { top: 0, left: 0, bottom: 1000, right: 1000 }

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out of stock' },
]

const fieldClass =
  'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-pantry-ink'

type Draft = {
  name: string
  categoryId: number | ''
  points: string
  availability: Availability
  description: string
  isActive: boolean
}

type PhotoEdit =
  | { kind: 'keep' }
  | { kind: 'recrop'; box: CropBox }
  | { kind: 'upload'; file: File; previewUrl: string; box: CropBox }

export function CatalogEditor({
  categories,
  refreshKey,
  onUnauthorized,
}: {
  categories: Category[]
  refreshKey: number
  onUnauthorized: () => void
}) {
  const [items, setItems] = useState<StaffCatalogItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)
  const [photo, setPhoto] = useState<PhotoEdit>({ kind: 'keep' })
  const previewRef = useRef<string | null>(null)

  function clearPreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getStaffItems()
      .then((data) => {
        if (!cancelled) {
          setItems(data)
          setError(null)
        }
      })
      .catch((caught) => {
        if (cancelled) {
          return
        }
        if (caught instanceof StaffAuthError) {
          onUnauthorized()
          return
        }
        setError(caught instanceof Error ? caught.message : 'Could not load catalog items.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [onUnauthorized, refreshKey])

  const normalizedQuery = query.trim().toLowerCase()
  const visible = normalizedQuery
    ? items.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
    : items

  function startEdit(item: StaffCatalogItem) {
    clearPreview()
    setPhoto({ kind: 'keep' })
    setSavedName(null)
    setError(null)
    setEditingId(item.id)
    setDraft({
      name: item.name,
      categoryId: item.category.id,
      points: String(item.points),
      availability: item.availability,
      description: item.description,
      isActive: item.is_active,
    })
  }

  async function save(itemId: number) {
    if (!draft) {
      return
    }
    const name = draft.name.trim()
    if (!name) {
      setError('Enter a name.')
      return
    }
    if (draft.categoryId === '') {
      setError('Choose a category.')
      return
    }
    if (!/^\d+$/.test(draft.points.trim())) {
      setError('Enter a point value.')
      return
    }
    setSaving(true)
    setError(null)
    const current = items.find((item) => item.id === itemId)
    const photoChange = current ? photoChangeFor(photo, current) : undefined
    try {
      const updated = await updateStaffItem(
        itemId,
        {
          name,
          category_id: draft.categoryId,
          points: Number(draft.points),
          availability: draft.availability,
          description: draft.description.trim(),
          is_active: draft.isActive,
        },
        photoChange,
      )
      setItems((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((left, right) => left.name.localeCompare(right.name)),
      )
      clearPreview()
      setPhoto({ kind: 'keep' })
      setEditingId(null)
      setDraft(null)
      setSavedName(updated.name)
    } catch (caught) {
      if (caught instanceof StaffAuthError) {
        onUnauthorized()
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save that item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-bold">Existing items</h3>
        <p className="mt-1 text-sm text-pantry-muted">
          Change the name, category, points, availability, description, or photo.
          Adjust crop opens the original picture, so the box can include more
          than the current catalog photo. Students see the update the next time
          they open the catalog.
        </p>
      </div>
      <label className="block text-sm font-semibold">
        Search
        <input
          className={fieldClass}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
        />
      </label>
      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      ) : null}
      {savedName ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Saved {savedName}.
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-pantry-muted">Loading items…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-pantry-muted">
          {items.length === 0 ? 'No catalog items yet.' : 'No items match that search.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              {editingId === item.id && draft ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(item.id)
                  }}
                >
                  <PhotoFields
                    item={item}
                    photo={photo}
                    onBox={(box) => {
                      if (photo.kind === 'keep') {
                        return
                      }
                      setPhoto({ ...photo, box })
                    }}
                    onRecrop={() => {
                      clearPreview()
                      setPhoto({ kind: 'recrop', box: initialRecrop(item) })
                    }}
                    onUpload={(file) => {
                      clearPreview()
                      const previewUrl = URL.createObjectURL(file)
                      previewRef.current = previewUrl
                      setPhoto({ kind: 'upload', file, previewUrl, box: FULL_CROP })
                    }}
                    onKeep={() => {
                      clearPreview()
                      setPhoto({ kind: 'keep' })
                    }}
                  />
                  <label className="block text-sm font-semibold">
                    Name
                    <input
                      className={fieldClass}
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Category
                    <select
                      className={fieldClass}
                      value={draft.categoryId === '' ? '' : String(draft.categoryId)}
                      onChange={(event) => {
                        const value = event.target.value
                        setDraft({
                          ...draft,
                          categoryId: value === '' ? '' : Number(value),
                        })
                      }}
                    >
                      <option value="">Choose a category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Points
                    <input
                      className={fieldClass}
                      inputMode="numeric"
                      value={draft.points}
                      onChange={(event) =>
                        setDraft({ ...draft, points: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Availability
                    <select
                      className={fieldClass}
                      value={draft.availability}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          availability: event.target.value as Availability,
                        })
                      }
                    >
                      {AVAILABILITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Description
                    <textarea
                      className={fieldClass}
                      rows={3}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="accent-pantry-leaf"
                      checked={draft.isActive}
                      onChange={(event) =>
                        setDraft({ ...draft, isActive: event.target.checked })
                      }
                    />
                    Show on the student catalog
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-pantry-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark disabled:cursor-default disabled:bg-stone-300"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearPreview()
                        setPhoto({ kind: 'keep' })
                        setEditingId(null)
                        setDraft(null)
                      }}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-pantry-muted ring-1 ring-stone-200 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-pantry-muted">
                          {item.category.name} · {item.points}{' '}
                          {item.points === 1 ? 'pt' : 'pts'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="shrink-0 rounded-xl bg-pantry-leaf px-3 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AvailabilityBadge value={item.availability} />
                      {item.is_active ? null : (
                        <span className="text-xs font-semibold text-pantry-muted">
                          Hidden from students
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PhotoFields({
  item,
  photo,
  onBox,
  onRecrop,
  onUpload,
  onKeep,
}: {
  item: StaffCatalogItem
  photo: PhotoEdit
  onBox: (box: CropBox) => void
  onRecrop: () => void
  onUpload: (file: File) => void
  onKeep: () => void
}) {
  const source =
    photo.kind === 'upload'
      ? photo.previewUrl
      : photo.kind === 'recrop'
        ? (item.source_image_url ?? item.image_url)
        : item.image_url

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Photo</p>
      {photo.kind === 'keep' && item.image_url ? (
        <img src={item.image_url} alt="" className="max-h-48 rounded-xl object-contain" />
      ) : null}
      {photo.kind === 'keep' && !item.image_url ? (
        <p className="text-sm text-pantry-muted">No photo yet.</p>
      ) : null}
      {photo.kind !== 'keep' && source ? (
        <>
          <PhotoCropper src={source} box={photo.box} onChange={onBox} />
          <p className="text-sm text-pantry-muted">
            {photo.kind === 'recrop' && item.source_image_url
              ? 'The shaded area is the rest of the original photo. Drag a corner outward to include more of it.'
              : 'Drag the box to move it. Drag a corner to resize. The area inside the box is what students will see.'}
          </p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {(item.image_url || item.source_image_url) && photo.kind !== 'recrop' ? (
          <button
            type="button"
            onClick={onRecrop}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-pantry-leaf ring-1 ring-pantry-leaf"
          >
            Adjust crop
          </button>
        ) : null}
        <label className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-pantry-leaf ring-1 ring-pantry-leaf">
          Upload a new photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onUpload(file)
              }
              event.target.value = ''
            }}
          />
        </label>
        {photo.kind !== 'keep' ? (
          <button
            type="button"
            onClick={onKeep}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-pantry-muted ring-1 ring-stone-200"
          >
            Keep current photo
          </button>
        ) : null}
      </div>
    </div>
  )
}

function isFullCrop(box: CropBox) {
  return box.top <= 1 && box.left <= 1 && box.bottom >= 999 && box.right >= 999
}

function initialRecrop(item: StaffCatalogItem): CropBox {
  if (item.source_image_url) {
    return savedBox(item) ?? FULL_CROP
  }
  return FULL_CROP
}

function savedBox(item: StaffCatalogItem): CropBox | null {
  if (!item.crop_box || item.crop_box.length !== 4) {
    return null
  }
  const [top, left, bottom, right] = item.crop_box
  return { top, left, bottom, right }
}

function boxesMatch(left: CropBox, right: CropBox) {
  return (
    Math.abs(left.top - right.top) < 1 &&
    Math.abs(left.left - right.left) < 1 &&
    Math.abs(left.bottom - right.bottom) < 1 &&
    Math.abs(left.right - right.right) < 1
  )
}

function photoChangeFor(photo: PhotoEdit, item: StaffCatalogItem) {
  if (photo.kind === 'upload') {
    return { file: photo.file, box: cropTuple(photo.box) }
  }
  if (photo.kind === 'recrop') {
    const saved = item.source_image_url ? savedBox(item) : null
    if (saved && boxesMatch(photo.box, saved)) {
      return undefined
    }
    if (!item.source_image_url && isFullCrop(photo.box)) {
      return undefined
    }
    return { box: cropTuple(photo.box) }
  }
  return undefined
}

function cropTuple(box: CropBox): [number, number, number, number] {
  return [box.top, box.left, box.bottom, box.right]
}
