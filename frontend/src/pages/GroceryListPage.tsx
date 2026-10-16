import { AvailabilityBadge } from '../components/AvailabilityBadge'
import { useGroceryList } from '../context/GroceryContext'

export function GroceryListPage() {
  const {
    items,
    toggleChecked,
    removeItem,
    clearList,
    plannedPoints,
    remainingPoints,
  } = useGroceryList()

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
        <h2 className="text-2xl font-bold">Your grocery list is empty</h2>
        <p className="mt-2 text-pantry-muted">
          Add items from the catalog. The list stays in this browser until you
          clear it.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Grocery list</h2>
          <p className="mt-1 text-pantry-muted">
            Cross items off as you shop. Remaining points count only unchecked
            items.
          </p>
        </div>
        <button
          type="button"
          onClick={clearList}
          className="text-sm font-semibold text-pantry-muted hover:text-pantry-ink"
        >
          Clear list
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <p className="text-sm text-pantry-muted">Planned total</p>
          <p className="text-3xl font-bold text-pantry-ink">{plannedPoints} pts</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <p className="text-sm text-pantry-muted">Still to pick up</p>
          <p className="text-3xl font-bold text-pantry-leaf">{remainingPoints} pts</p>
        </div>
      </div>

      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <input
              id={`item-${item.id}`}
              type="checkbox"
              checked={item.checked}
              onChange={() => toggleChecked(item.id)}
              className="h-5 w-5 accent-pantry-leaf"
            />
            <label
              htmlFor={`item-${item.id}`}
              className={`flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:justify-between ${
                item.checked ? 'text-stone-400 line-through' : ''
              }`}
            >
              <span className="font-semibold">{item.name}</span>
              <span className="flex items-center gap-2 text-sm">
                <AvailabilityBadge value={item.availability} />
                <span>{item.points} pts</span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-sm font-semibold text-pantry-muted hover:text-red-700"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
