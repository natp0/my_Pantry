import { useGroceryList } from '../context/GroceryContext'
import type { CatalogItem } from '../types'
import { AvailabilityBadge } from './AvailabilityBadge'

type Props = {
  item: CatalogItem
}

export function ItemCard({ item }: Props) {
  const { items, addItem } = useGroceryList()
  const onList = items.some((entry) => entry.id === item.id)

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-stone-100">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-pantry-muted">
            No photo yet
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-pantry-ink">{item.name}</h2>
            <p className="text-sm text-pantry-muted">{item.category.name}</p>
          </div>
          <p className="shrink-0 rounded-lg bg-pantry-leaf/10 px-2 py-1 text-sm font-semibold text-pantry-leaf">
            {item.points} {item.points === 1 ? 'pt' : 'pts'}
          </p>
        </div>
        <AvailabilityBadge value={item.availability} />
        {item.description ? (
          <p className="text-sm leading-relaxed text-pantry-muted">{item.description}</p>
        ) : null}
        <button
          type="button"
          onClick={() => addItem(item)}
          disabled={onList}
          className="mt-auto rounded-xl bg-pantry-leaf px-3 py-2 text-sm font-semibold text-white hover:bg-pantry-leaf-dark disabled:cursor-default disabled:bg-stone-300"
        >
          {onList ? 'On grocery list' : 'Add to grocery list'}
        </button>
      </div>
    </article>
  )
}
