# Service Tracker 2.0

Business income & expense tracker — React (Vite) front end with a Node/Express API and Postgres database, deployed on Vercel.

## Features
- Email + password accounts, with a security question to reset a forgotten password
- Add / edit / delete income and expenses
- Home dashboard (revenue, expenses, profit, margin, ROI), Graphs, Growth (month-over-month & year-over-year), History with search and filters
- Income and expense categories (add, rename, recolour, delete)
- Settings: currency (15), currency position, date format, separators, cents, start page, light/dark theme
- CSV export, JSON backup & restore
- Mobile friendly (bottom tabs) and desktop layout (sidebar)

## Deploy (Vercel)
1. Import this repo in Vercel.
2. Storage → Create Database → Neon (Postgres) → connect to the project (adds `DATABASE_URL`).
3. Redeploy. Tables are created automatically on first request.

## Local development
```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/db npm run dev
```
Open http://localhost:3000

## API
| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | status |
| POST | /api/auth/signup, /api/auth/login, /api/auth/logout | accounts |
| GET | /api/auth/me | current user |
| POST | /api/auth/forgot/question, /api/auth/forgot/reset | password reset |
| PUT | /api/auth/password | change password |
| PUT | /api/settings | save settings |
| GET/POST/PUT/DELETE | /api/categories[/:id] | categories |
| GET/POST/PUT/DELETE | /api/transactions[/:id] | transactions |
| GET | /api/backup · POST /api/restore | backup / restore |
