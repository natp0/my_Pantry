import { useEffect, useState } from 'react'

import { getCategories, getItems } from '../api'
import { ItemCard } from '../components/ItemCard'
import type { CatalogItem, Category } from '../types'

export function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<CatalogItem[]>([])
  const [activeSlug, setActiveSlug] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [categoryData, itemData] = await Promise.all([
          getCategories(),
          getItems(activeSlug === 'all' ? undefined : activeSlug),
        ])
        if (!cancelled) {
          setCategories(categoryData)
          setItems(itemData)
        }
      } catch {
        if (!cancelled) {
          setError(
            'Could not load the catalog. Start the Django server on port 8000 and refresh.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeSlug])

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">What is on the shelves</h2>
        <p className="mt-1 max-w-2xl text-pantry-muted">
          Browse by category and add items to a grocery list while you wait in
          line. Point values are what volunteers entered in admin.
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <CategoryTab
          label="All"
          active={activeSlug === 'all'}
          onClick={() => setActiveSlug('all')}
        />
        {categories.map((category) => (
          <CategoryTab
            key={category.id}
            label={category.name}
            active={activeSlug === category.slug}
            onClick={() => setActiveSlug(category.slug)}
          />
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-pantry-muted">Loading catalog…</p>
      ) : items.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="font-semibold">No items in this category yet</p>
          <p className="mt-1 text-sm text-pantry-muted">
            Volunteers can add food and photos in Django Admin at /admin/.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
        active
          ? 'bg-pantry-leaf text-white'
          : 'bg-white text-pantry-ink ring-1 ring-stone-200 hover:bg-stone-50'
      }`}
    >
      {label}
    </button>
  )
}
