# myPantry

A website for the **UF Fork and Field Pantry**. Students waiting in line can see what is on the shelves, check point values, and build a grocery list. Volunteers update inventory in Django Admin.

A phone-friendly website.

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
