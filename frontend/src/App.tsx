import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { GroceryProvider } from './context/GroceryContext'
import { CatalogPage } from './pages/CatalogPage'
import { GroceryListPage } from './pages/GroceryListPage'
import { VolunteerPage } from './pages/VolunteerPage'

export default function App() {
  return (
    <GroceryProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<CatalogPage />} />
            <Route path="list" element={<GroceryListPage />} />
            <Route path="volunteer" element={<VolunteerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GroceryProvider>
  )
}
