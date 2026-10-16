export type Availability = 'high' | 'low' | 'out'

export type Category = {
  id: number
  name: string
  slug: string
  sort_order: number
}

export type CatalogItem = {
  id: number
  name: string
  category: Category
  points: number
  availability: Availability
  image_url: string | null
  description: string
  updated_at: string
}

export type StaffCatalogItem = CatalogItem & {
  is_active: boolean
  source_image_url: string | null
  crop_box: [number, number, number, number] | null
}

export type GroceryListItem = {
  id: number
  name: string
  points: number
  availability: Availability
  checked: boolean
}

export type IntakeAction = 'update' | 'create'

export type DetectedProduct = {
  name: string
  category_id: number | null
  description: string
  availability: Availability
}

export type IntakeMatch = {
  id: number
  name: string
  category_id: number
  points: number
  availability: Availability
  description: string
}

export type IntakeSuggestion = {
  index: number
  preview_url: string
  box_2d: [number, number, number, number]
  detected: DetectedProduct
  match: IntakeMatch | null
  action: IntakeAction
}

export type IntakeDraft = IntakeSuggestion & {
  name: string
  categoryId: number | ''
  points: string
  availability: Availability
  description: string
}

export type SavedIntakeItem = {
  id: number
  name: string
  action: IntakeAction
}
