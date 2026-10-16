# Architecture

```
myPantry/
  backend/     Django API + Admin + SQLite
  frontend/    Vite + React + TypeScript + Tailwind CSS
  docs/        Product and architecture notes
```

## How a request flows

1. A student opens the React site (port 5173 in development).
2. The catalog fetches `GET /api/categories/` and `GET /api/items/`.
3. Vite proxies `/api` and `/media` to Django (port 8000).
4. Django reads SQLite and returns JSON. Image paths look like `/media/items/...`.
5. A volunteer signs in to `/admin/` on Django, uploads a photo, and changes availability. The next catalog refresh shows the update.
6. A staff member can instead open `/volunteer`, photograph a shelf, and confirm Gemini's suggestions. Django crops each product and creates or updates catalog items. Students see them on the next catalog load.

Students do not need an account. The grocery list lives in `localStorage` under the key `mypantry-grocery-list`. Clearing site data or using another browser starts a new list.

## Why Django Admin vs React

- **Django Admin** is the volunteer tool for manual inventory edits. Inventory updates are a small number of trusted people, and Admin already handles login, forms, filters, and image uploads.
- **`/volunteer`** is the staff shelf-photo flow. It uses the same staff accounts, calls Gemini on the server, and lets the volunteer edit each suggestion before save.
- **React** is the student website: catalog, category tabs, and a list they can check off on a phone.

Tailwind styles the React site. Admin keeps Django’s own CSS.

## Backend

- Package manager: **uv** (`backend/pyproject.toml`, `backend/uv.lock`)
- Settings: `backend/config/settings.py`
- App: `backend/inventory`

### Models

**Category:** `name`, `slug`, `sort_order`

**Item:** `name`, `category`, `points`, `availability` (`high` | `low` | `out`), optional `image`, `description`, `is_active`, timestamps

Inactive items are hidden from the public API but still editable in Admin.

### API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/categories/` | All categories |
| GET | `/api/items/` | Active items only |
| GET | `/api/items/?category=produce` | Filter by category slug |
| POST | `/api/auth/token/` | Staff username and password. Returns a token. |
| POST | `/api/intake/` | Staff only. Shelf photo in. Suggestions, crops, and catalog matches out. |
| POST | `/api/intake/<id>/confirm/` | Staff only. Saves edited rows as new or updated items. Confirming twice does not duplicate them. |

`GEMINI_API_KEY` is read on the server. Shelf originals are stored under `media/shelves/`, and catalog crops use the same item image field as Admin uploads.

`image_url` is a relative media path so the Vite proxy can serve photos in development.

### SQLite → PostgreSQL

Local development uses SQLite (`DB_ENGINE=django.db.backends.sqlite3`). Settings already read `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`. To move later:

1. Add a PostgreSQL driver (for example `psycopg`) with uv
2. Set `DB_ENGINE=django.db.backends.postgresql` and the `DB_*` values in `.env`
3. Run migrations against the new database

No model rewrite is required for that switch.

## Frontend

- Vite + React + TypeScript
- Tailwind CSS v4 via `@tailwindcss/vite`
- React Router: `/` catalog, `/list` grocery list, `/volunteer` staff shelf photos (not linked in the student nav)
- `GroceryProvider` keeps the list in memory and writes it to `localStorage`

## Media files

Uploads go to `backend/media/` (`MEDIA_ROOT`). That folder is gitignored. Django serves it only when `DEBUG=True`. A later production deploy would use a real file store or web server for media.
