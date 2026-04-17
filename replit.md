# Project Overview

A full-stack application with a React + TypeScript frontend and a FastAPI Python backend. Originally created in Lovable and migrated to Replit.

## Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui component library
- **Routing**: React Router DOM v6
- **State/Data**: TanStack React Query
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts

## Running the App

The app runs via the "Start application" workflow using `npm run dev`, which starts Vite on port 5000.

## Key Configuration

- `vite.config.ts` — Vite config; host set to `0.0.0.0` and port `5000` for Replit compatibility
- `src/` — All application source code
- `public/` — Static assets

## Backend

- **Framework**: FastAPI (Python 3.11)
- **Server**: Uvicorn with `--reload` for development
- **Port**: 8000
- Entry point: `backend/app/main.py`
- Dependencies listed in `backend/requirements.txt`

### Backend structure

```
backend/
  app/
    main.py       # FastAPI app, routes, CORS config
    database.py   # Database setup (placeholder)
  requirements.txt
```

### Running the backend independently

From the project root:
```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or install dependencies first if starting fresh:
```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Notes

- The `lovable-tagger` devDependency has been removed from the Vite plugin pipeline (it was Lovable-specific tooling)
- Frontend runs on port 5000, backend on port 8000
- CORS is currently open to all origins (`*`) — restrict in production
