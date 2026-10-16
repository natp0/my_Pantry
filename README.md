# myPantry

A website for the **UF Fork and Field Pantry**. Students waiting in line can see what is on the shelves, check point values, and build a grocery list. Volunteers update inventory in Django Admin.

This started as a mobile-app idea and is now a phone-friendly website.

## What is here

| Path | Role |
| --- | --- |
| `backend/` | Django, SQLite, REST API, volunteer Admin |
| `frontend/` | React + Tailwind catalog and grocery list |
| `docs/product.md` | Product goals and later ideas |
| `docs/architecture.md` | How the pieces fit together |

## Prerequisites

- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/) for Python environments and packages
- Node.js 20 or newer (includes npm)

On macOS with Homebrew:

```bash
brew install uv node
```

## Run locally

Use two terminals: one for Django, one for the React site.

### 1. Backend (Django)

```bash
cd backend
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py seed_catalog
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

- API and Admin: http://127.0.0.1:8000/admin/
- Item list API: http://127.0.0.1:8000/api/items/
- Category API: http://127.0.0.1:8000/api/categories/

`seed_catalog` adds pantry-style categories and a few sample items. It is safe to run more than once; it will not duplicate existing rows.

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173/

Vite proxies `/api` and `/media` to Django on port 8000, so keep the backend running.

### 3. Add a first item with a photo

1. Sign in at http://127.0.0.1:8000/admin/
2. Open **Items** → **Add item**
3. Choose a category, points, availability (high / low / out of stock), and upload a photo
4. Save, then refresh the catalog in the browser

Availability is an estimate for students planning in line, not a barcode count.

### 4. Identify a shelf photo

Staff can also open http://127.0.0.1:5173/volunteer (it is not linked from the student catalog).

1. Sign in with the same staff account as Admin
2. Take or upload a shelf photo
3. Edit each product Gemini finds: name, category, points, availability, and description
4. Choose **Update existing** when it matches something already in the catalog, or **Add as a new item**
5. Save, then refresh the catalog

Set `GEMINI_API_KEY` in `backend/.env` first. The key stays on the server. Point values are not guessed; the volunteer enters them. New items require points. Updates start from the current catalog values, and the photo suggestions can be applied one field at a time.

## Environment variables

Copy `backend/.env.example` to `backend/.env`. Important keys:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Django secret. Change this before any shared or production use. |
| `DEBUG` | `True` for local development |
| `DB_ENGINE` | Defaults to SQLite. Set `django.db.backends.postgresql` later if needed |
| `DB_NAME` | SQLite file name, or PostgreSQL database name |
| `GEMINI_API_KEY` | Google AI Studio key for shelf-photo identification. Leave blank to disable it. |
| `GEMINI_MODEL` | Defaults to `gemini-3.8-flash` |

Do not commit `backend/.env` or `backend/db.sqlite3`.

## Common commands

```bash
# Backend tests / sanity check
cd backend
uv run python manage.py check

# Recreate sample categories and items (skips ones that already exist)
uv run python manage.py seed_catalog

# Frontend production build
cd frontend
npm run build
```

## Troubleshooting

**Catalog says it could not load.** Django is not running, or it is not on port 8000. Start `uv run python manage.py runserver` in `backend/`.

**Photos do not show on the website.** Confirm the item has an image in Admin and that Vite is proxying `/media` (use `npm run dev`, not a static file open). Django only serves media when `DEBUG=True`.

**Admin login fails after a fresh clone.** Run `migrate` and `createsuperuser` again. The SQLite file is local and not in git.

**Port already in use.** Change Django with `uv run python manage.py runserver 8001` and update the proxy in `frontend/vite.config.ts`.

## Later work (not in this scaffold)

Barcode scanning, student accounts, PostgreSQL, volunteer signup, and a home-pantry variant are documented in [docs/product.md](docs/product.md). Shelf-photo identification is available to staff at `/volunteer`.
