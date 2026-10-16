import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { Link } from 'react-router-dom'

import {
  StaffAuthError,
  clearStaffToken,
  confirmIntake,
  getCategories,
  getStaffToken,
  identifyShelf,
  loginStaff,
} from '../api'
import { CatalogEditor } from '../components/CatalogEditor'
import type {
  Availability,
  Category,
  IntakeDraft,
  IntakeSuggestion,
  SavedIntakeItem,
} from '../types'

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out of stock' },
]

const fieldClass =
  'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-pantry-ink'

export function VolunteerPage() {
  const [authed, setAuthed] = useState(() => Boolean(getStaffToken()))
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [captureId, setCaptureId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<IntakeDraft[]>([])
  const [saved, setSaved] = useState<SavedIntakeItem[] | null>(null)
  const [catalogVersion, setCatalogVersion] = useState(0)

  useEffect(() => {
    if (!authed) {
      return
    }
    let cancelled = false
    getCategories()
      .then((data) => {
        if (!cancelled) {
          setCategories(data)
          setCategoryError(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryError('Could not load categories. Start Django on port 8000 and refresh.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [authed])

  function logout() {
    clearStaffToken()
    setAuthed(false)
    setCaptureId(null)
    setDrafts([])
    setSaved(null)
  }

  const handleUnauthorized = useCallback(() => {
    setAuthed(false)
    setCaptureId(null)
    setDrafts([])
  }, [])

  if (!authed) {
    return (
      <LoginForm
        onSuccess={() => {
          setAuthed(true)
        }}
      />
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Shelf photo</h2>
          <p className="mt-1 max-w-2xl text-pantry-muted">
            Take a photo of a shelf, or edit an item already in the catalog.
            Students see saved changes the next time they open the catalog.
            Point values are yours to enter.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm font-semibold text-pantry-muted hover:text-pantry-ink"
        >
          Log out
        </button>
      </div>

      {categoryError ? <ErrorBanner message={categoryError} /> : null}

      {saved ? (
        <SavedPanel
          saved={saved}
          onAnother={() => {
            setSaved(null)
            setCaptureId(null)
            setDrafts([])
          }}
        />
      ) : captureId === null ? (
        <PhotoStep
          onUnauthorized={handleUnauthorized}
          onIdentified={(id, suggestions) => {
            setCaptureId(id)
            setDrafts(suggestions.map(fieldsFor))
          }}
        />
      ) : (
        <ReviewStep
          categories={categories}
          drafts={drafts}
          setDrafts={setDrafts}
          onUnauthorized={handleUnauthorized}
          onBack={() => {
            setCaptureId(null)
            setDrafts([])
          }}
          onSaved={(items) => {
            setSaved(items)
            setCatalogVersion((version) => version + 1)
          }}
          captureId={captureId}
        />
      )}

      {captureId === null ? (
        <CatalogEditor
          categories={categories}
          refreshKey={catalogVersion}
          onUnauthorized={handleUnauthorized}
        />
      ) : null}
    </section>
  )
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await loginStaff(username.trim(), password)
      onSuccess()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Volunteer sign in</h2>
        <p className="mt-1 text-pantry-muted">
          Use the same staff account as Django Admin. This page is for adding
          shelf photos, not for students.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          void onSubmit(event)
        }}
        className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <label className="block text-sm font-semibold">
          Username
          <input
            className={fieldClass}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-semibold">
          Password
          <input
            type="password"
            className={fieldClass}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <ErrorBanner message={error} /> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-pantry-leaf px-3 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark disabled:cursor-default disabled:bg-stone-300"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

function PhotoStep({
  onIdentified,
  onUnauthorized,
}: {
  onIdentified: (id: number, suggestions: IntakeSuggestion[]) => void
  onUnauthorized: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [identifying, setIdentifying] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function identify() {
    if (!file) {
      return
    }
    setIdentifying(true)
    setError(null)
    try {
      const result = await identifyShelf(file)
      if (result.suggestions.length === 0) {
        setError(
          result.detail ??
            'No products were found in that photo. Try a closer or brighter picture.',
        )
        return
      }
      onIdentified(result.id, result.suggestions)
    } catch (caught) {
      if (caught instanceof StaffAuthError) {
        onUnauthorized()
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not identify that photo.')
    } finally {
      setIdentifying(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold">
        Shelf photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-sm text-pantry-muted file:mr-3 file:rounded-full file:border-0 file:bg-pantry-leaf/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-pantry-leaf"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null
            setFile(next)
            setError(null)
            setPreviewUrl(next ? URL.createObjectURL(next) : null)
          }}
        />
      </label>
      <p className="text-sm text-pantry-muted">
        On a phone this opens the camera. Each product is cropped into its own
        catalog photo after you confirm the details.
      </p>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Selected shelf"
          className="max-h-80 w-full rounded-xl object-contain bg-stone-100"
        />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      <button
        type="button"
        disabled={!file || identifying}
        onClick={() => {
          void identify()
        }}
        className="rounded-xl bg-pantry-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark disabled:cursor-default disabled:bg-stone-300"
      >
        {identifying ? 'Looking at the shelf…' : 'Identify products'}
      </button>
    </div>
  )
}

function ReviewStep({
  captureId,
  categories,
  drafts,
  setDrafts,
  onBack,
  onSaved,
  onUnauthorized,
}: {
  captureId: number
  categories: Category[]
  drafts: IntakeDraft[]
  setDrafts: Dispatch<SetStateAction<IntakeDraft[]>>
  onBack: () => void
  onSaved: (items: SavedIntakeItem[]) => void
  onUnauthorized: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function patch(index: number, changes: Partial<IntakeDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.index === index ? { ...draft, ...changes } : draft)),
    )
  }

  function changeAction(index: number, action: 'update' | 'create') {
    setDrafts((current) =>
      current.map((draft) =>
        draft.index === index ? fieldsFor({ ...draft, action }) : draft,
      ),
    )
  }

  async function save() {
    const problem = validateDrafts(drafts)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await confirmIntake(
        captureId,
        drafts.map((draft) => ({
          action: draft.action,
          item_id: draft.action === 'update' ? draft.match?.id : undefined,
          name: draft.name.trim(),
          category_id: Number(draft.categoryId),
          points: Number(draft.points),
          availability: draft.availability,
          description: draft.description.trim(),
          box_2d: draft.box_2d,
        })),
      )
      onSaved(result.saved)
    } catch (caught) {
      if (caught instanceof StaffAuthError) {
        onUnauthorized()
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save these items.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-pantry-muted">
          {drafts.length} {drafts.length === 1 ? 'product' : 'products'} found.
          Remove any crop that is wrong.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-pantry-muted hover:text-pantry-ink"
        >
          Use a different photo
        </button>
      </div>
      {drafts.map((draft) => (
        <ReviewCard
          key={draft.index}
          draft={draft}
          categories={categories}
          updateTaken={drafts.some(
            (other) =>
              other.index !== draft.index &&
              other.action === 'update' &&
              draft.match !== null &&
              other.match?.id === draft.match.id,
          )}
          onPatch={(changes) => patch(draft.index, changes)}
          onAction={(action) => changeAction(draft.index, action)}
          onRemove={() => {
            setDrafts((current) => current.filter((item) => item.index !== draft.index))
          }}
        />
      ))}
      {error ? <ErrorBanner message={error} /> : null}
      <button
        type="button"
        disabled={saving || drafts.length === 0}
        onClick={() => {
          void save()
        }}
        className="rounded-xl bg-pantry-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark disabled:cursor-default disabled:bg-stone-300"
      >
        {saving ? 'Saving…' : 'Save to catalog'}
      </button>
    </div>
  )
}

function ReviewCard({
  draft,
  categories,
  updateTaken,
  onPatch,
  onAction,
  onRemove,
}: {
  draft: IntakeDraft
  categories: Category[]
  updateTaken: boolean
  onPatch: (changes: Partial<IntakeDraft>) => void
  onAction: (action: 'update' | 'create') => void
  onRemove: () => void
}) {
  const categoryName = categories.find(
    (category) => category.id === draft.detected.category_id,
  )?.name

  return (
    <article className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:grid-cols-[180px_1fr]">
      <img
        src={draft.preview_url}
        alt=""
        className="aspect-square w-full rounded-xl bg-stone-100 object-cover"
      />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-pantry-muted">Detected as {draft.detected.name}</p>
          <button
            type="button"
            onClick={onRemove}
            className="text-sm font-semibold text-pantry-muted hover:text-red-700"
          >
            Remove
          </button>
        </div>

        {draft.match ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">What should happen to this crop?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`action-${draft.index}`}
                className="mt-1 accent-pantry-leaf"
                checked={draft.action === 'update'}
                disabled={updateTaken}
                onChange={() => onAction('update')}
              />
              <span>Update existing: {draft.match.name}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`action-${draft.index}`}
                className="mt-1 accent-pantry-leaf"
                checked={draft.action === 'create'}
                onChange={() => onAction('create')}
              />
              <span>Add as a new item</span>
            </label>
            {updateTaken ? (
              <p className="text-sm text-pantry-muted">
                Another product in this photo is already updating {draft.match.name}.
              </p>
            ) : (
              <p className="text-sm text-pantry-muted">
                Update fills in the current catalog entry. Add as new fills in the
                photo suggestion, and you enter the points.
              </p>
            )}
          </fieldset>
        ) : (
          <p className="text-sm text-pantry-muted">This will be added as a new catalog item.</p>
        )}

        <label className="block text-sm font-semibold">
          Name
          <input
            className={fieldClass}
            value={draft.name}
            onChange={(event) => onPatch({ name: event.target.value })}
          />
        </label>
        {draft.action === 'update' && draft.detected.name !== draft.name ? (
          <SuggestionButton
            label={`Use suggested name: ${draft.detected.name}`}
            onClick={() => onPatch({ name: draft.detected.name })}
          />
        ) : null}

        <label className="block text-sm font-semibold">
          Category
          <select
            className={fieldClass}
            value={draft.categoryId === '' ? '' : String(draft.categoryId)}
            onChange={(event) => {
              const value = event.target.value
              onPatch({ categoryId: value === '' ? '' : Number(value) })
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
        {draft.action === 'update' &&
        draft.detected.category_id &&
        draft.detected.category_id !== draft.categoryId &&
        categoryName ? (
          <SuggestionButton
            label={`Use suggested category: ${categoryName}`}
            onClick={() => onPatch({ categoryId: draft.detected.category_id ?? '' })}
          />
        ) : null}

        <label className="block text-sm font-semibold">
          Points
          <input
            className={fieldClass}
            inputMode="numeric"
            value={draft.points}
            onChange={(event) => onPatch({ points: event.target.value })}
            placeholder={draft.action === 'create' ? 'Enter points' : undefined}
          />
        </label>

        <label className="block text-sm font-semibold">
          Availability
          <select
            className={fieldClass}
            value={draft.availability}
            onChange={(event) =>
              onPatch({ availability: event.target.value as Availability })
            }
          >
            {AVAILABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {draft.action === 'update' && draft.detected.availability !== draft.availability ? (
          <SuggestionButton
            label={`Use suggested availability: ${availabilityLabel(draft.detected.availability)}`}
            onClick={() => onPatch({ availability: draft.detected.availability })}
          />
        ) : null}

        <label className="block text-sm font-semibold">
          Description
          <textarea
            className={fieldClass}
            rows={3}
            value={draft.description}
            onChange={(event) => onPatch({ description: event.target.value })}
          />
        </label>
        {draft.action === 'update' &&
        draft.detected.description &&
        draft.detected.description !== draft.description ? (
          <SuggestionButton
            label="Use suggested description"
            onClick={() => onPatch({ description: draft.detected.description })}
          />
        ) : null}
      </div>
    </article>
  )
}

function SavedPanel({
  saved,
  onAnother,
}: {
  saved: SavedIntakeItem[]
  onAnother: () => void
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold">
        Saved {saved.length} {saved.length === 1 ? 'item' : 'items'}
      </h3>
      {saved.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-pantry-muted">
          {saved.map((item) => (
            <li key={item.id}>
              {item.name} ({item.action === 'update' ? 'updated' : 'added'})
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-pantry-muted">Nothing from that photo was added.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          className="rounded-xl bg-pantry-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark"
        >
          View catalog
        </Link>
        <button
          type="button"
          onClick={onAnother}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-pantry-muted ring-1 ring-stone-200 hover:bg-stone-50"
        >
          Identify another photo
        </button>
      </div>
    </div>
  )
}

function SuggestionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-semibold text-pantry-leaf hover:text-pantry-leaf-dark"
    >
      {label}
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {message}
    </p>
  )
}

function fieldsFor(suggestion: IntakeSuggestion): IntakeDraft {
  if (suggestion.action === 'update' && suggestion.match) {
    const match = suggestion.match
    return {
      ...suggestion,
      name: match.name,
      categoryId: match.category_id,
      points: String(match.points),
      availability: match.availability,
      description: match.description,
    }
  }
  return {
    ...suggestion,
    action: 'create',
    name: suggestion.detected.name,
    categoryId: suggestion.detected.category_id ?? '',
    points: '',
    availability: suggestion.detected.availability,
    description: suggestion.detected.description,
  }
}

function validateDrafts(drafts: IntakeDraft[]) {
  for (const draft of drafts) {
    const label = draft.name.trim()
    if (!label) {
      return 'Every item needs a name.'
    }
    if (draft.categoryId === '') {
      return `${label} needs a category.`
    }
    if (!/^\d+$/.test(draft.points.trim())) {
      return `${label} needs a point value.`
    }
    if (draft.action === 'update' && !draft.match) {
      return `${label} is not matched to a catalog item. Add it as new instead.`
    }
  }
  return null
}

function availabilityLabel(value: Availability) {
  return AVAILABILITY_OPTIONS.find((option) => option.value === value)?.label ?? value
}
