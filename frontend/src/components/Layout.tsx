import { useLocation, NavLink, Outlet } from 'react-router-dom'

import { getStaffToken } from '../api'
import { useGroceryList } from '../context/GroceryContext'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold ${
    isActive
      ? 'bg-white text-pantry-leaf shadow-sm'
      : 'text-white/90 hover:bg-white/10'
  }`

export function Layout() {
  const { items } = useGroceryList()
  // Re-check the staff session on each navigation, including View catalog.
  useLocation()
  const staffSignedIn = Boolean(getStaffToken())

  return (
    <div className="min-h-svh bg-pantry-paper text-pantry-ink">
      <header className="bg-pantry-leaf text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
              UF Fork and Field Pantry
            </p>
            <h1 className="text-2xl font-bold tracking-tight">myPantry</h1>
          </div>
          <nav className="flex gap-2">
            <NavLink to="/" end className={navClass}>
              Catalog
            </NavLink>
            <NavLink to="/list" className={navClass}>
              Grocery list
              {items.length > 0 ? (
                <span className="ml-2 rounded-full bg-pantry-orange px-2 py-0.5 text-xs text-white">
                  {items.length}
                </span>
              ) : null}
            </NavLink>
            {staffSignedIn ? (
              <NavLink to="/volunteer" className={navClass}>
                Shelf photos
              </NavLink>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-sm text-pantry-muted">
          <p>
            Hours listed here are a placeholder until pantry staff confirm them.
            Example: open weekdays; check Fork and Field for the current schedule.
          </p>
          <p>
            If you take the last item of a type off the shelf, please tell the
            checkout volunteer so they can update availability.
          </p>
        </div>
      </footer>
    </div>
  )
}
