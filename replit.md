# Project Overview

A React + TypeScript frontend application built with Vite, Tailwind CSS, and shadcn/ui components. Originally created in Lovable and migrated to Replit.

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

## Notes

- The `lovable-tagger` devDependency has been removed from the Vite plugin pipeline (it was Lovable-specific tooling)
- Deployment targets static hosting; build output goes to `dist/`
