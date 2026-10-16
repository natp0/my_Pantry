import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { CatalogItem, GroceryListItem } from '../types'

const STORAGE_KEY = 'mypantry-grocery-list'

function loadList(): GroceryListItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GroceryListItem[]) : []
  } catch {
    return []
  }
}

type GroceryContextValue = {
  items: GroceryListItem[]
  addItem: (item: CatalogItem) => boolean
  removeItem: (id: number) => void
  toggleChecked: (id: number) => void
  clearList: () => void
  plannedPoints: number
  remainingPoints: number
}

const GroceryContext = createContext<GroceryContextValue | null>(null)

export function GroceryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<GroceryListItem[]>(loadList)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((item: CatalogItem) => {
    const exists = items.some((entry) => entry.id === item.id)
    if (exists) {
      return false
    }
    setItems((current) => [
      ...current,
      {
        id: item.id,
        name: item.name,
        points: item.points,
        availability: item.availability,
        checked: false,
      },
    ])
    return true
  }, [items])

  const removeItem = useCallback((id: number) => {
    setItems((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const toggleChecked = useCallback((id: number) => {
    setItems((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, checked: !entry.checked } : entry,
      ),
    )
  }, [])

  const clearList = useCallback(() => setItems([]), [])

  const plannedPoints = useMemo(
    () => items.reduce((sum, entry) => sum + entry.points, 0),
    [items],
  )
  const remainingPoints = useMemo(
    () =>
      items
        .filter((entry) => !entry.checked)
        .reduce((sum, entry) => sum + entry.points, 0),
    [items],
  )

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      toggleChecked,
      clearList,
      plannedPoints,
      remainingPoints,
    }),
    [items, addItem, removeItem, toggleChecked, clearList, plannedPoints, remainingPoints],
  )

  return <GroceryContext.Provider value={value}>{children}</GroceryContext.Provider>
}

export function useGroceryList() {
  const context = useContext(GroceryContext)
  if (!context) {
    throw new Error('useGroceryList must be used inside GroceryProvider')
  }
  return context
}
