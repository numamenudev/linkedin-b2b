# LinkedIn-b2b Automation Platform

An automated LinkedIn outreach platform for B2B prospecting. It manages multiple LinkedIn
identities ("agents"), discovers prospects via LinkedIn search, sends connection requests
and personalised follow-up messages, and tracks the full funnel through a React dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 20+, Express 4.18, TypeScript 5.3 |
| **ORM** | Prisma 7 (`@prisma/adapter-pg`, output in `src/generated/prisma`) |
| **Database** | PostgreSQL 16 |
| **Cache / Locks** | Redis 7 (ioredis) |
| **Frontend** | React 18, Vite 5, TanStack Query 5, Tailwind CSS 3.4 |
| **AI** | OpenAI SDK 6.x (Responses API) |
| **LinkedIn** | Unipile REST API |
| **Notifications** | Telegram Bot API, Resend (email) |

---

## Architecture

```
linkedin-b2b/                   # npm workspaces monorepo
├── package.json                # root — workspaces: ["backend", "frontend"]
├── docker-compose.yml          # PostgreSQL 16 + Redis 7
├── backend/
│   ├── package.json
│   ├── prisma.config.ts        # Prisma 7 config (datasource URL, seed)
│   ├── prisma/
│   │   ├── schema.prisma       # database schema
│   │   ├── migrations/         # SQL migrations
│   │   └── seed.ts             # initial admin user + settings seeder
│   └── src/
│       ├── app.ts              # Express entry point (port 3001)
│       ├── agents/             # orchestrator, budget allocator, agent runner
│       ├── api/
│       │   ├── routes/         # auth, agents, identities, prospects, search-structures,
│       │   │                   # analytics, logs, settings
│       │   └── middleware/     # JWT auth, rate-limit, webhook HMAC verification
│       ├── automation/
│       │   └── jobs/           # morning, midday, afternoon, evening, sunday
│       ├── db/
│       │   └── prisma.client.ts # Prisma singleton (with @prisma/adapter-pg)
│       ├── generated/prisma/   # Prisma generated client (DO NOT edit)
│       ├── integrations/       # Unipile, OpenAI, Telegram, Email (Resend)
│       ├── types/              # shared TypeScript interfaces
│       ├── utils/              # logger, scheduler, rate-limiter, job-lock
│       └── websocket/          # real-time log stream over WebSocket (/ws)
└── frontend/
    ├── package.json
    ├── vite.config.ts          # dev server port 3000, proxy /api → localhost:3001
    └── src/
        ├── main.tsx            # React entry point
        ├── App.tsx             # routes (lazy-loaded pages)
        ├── components/         # shared UI (Sidebar, Layout, etc.)
        ├── hooks/              # TanStack Query hooks (useAgents, useAuth, ...)
        ├── lib/                # API client (fetch wrapper with JWT cookie)
        └── pages/              # route-level page components
```

---

## Quick Start (step-by-step)

### Prerequisites

| Dependency | Version | Check command |
|---|---|---|
| Node.js | >= 20 | `node -v` |
| npm | >= 9 | `npm -v` |
| Docker + Docker Compose | any recent | `docker compose version` |

External accounts needed (API keys go into `backend/.env`):
- [Unipile](https://unipile.com) — LinkedIn account connected
- [OpenAI](https://platform.openai.com) — API key
- *(optional)* Telegram Bot — for daily reports
- *(optional)* [Resend](https://resend.com) — for email reports

### Step 1 — Clone and install dependencies

```bash
git clone <repo-url>
cd linkedin-b2b
npm install            # installs root + backend + frontend workspaces
```

> `npm install` at the root uses npm workspaces and installs all three `node_modules`.

### Step 2 — Start infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on `localhost:5432` (user `postgres`, password `postgres`, db `linkedin_platform`)
- **Redis 7** on `localhost:6379`

Verify they are running:

```bash
docker compose ps
```

### Step 3 — Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in the required values. At minimum set:

```dotenv
JWT_SECRET=<random string, min 32 chars>
UNIPILE_API_KEY=<your key>
UNIPILE_ACCOUNT_ID=<your account id>
UNIPILE_WEBHOOK_SECRET=<random string, min 32 chars>
OPENAI_API_KEY=<your key>
ADMIN_EMAIL=admin@example.com
ADMIN_INITIAL_PASSWORD=SomeSecurePassword123
```

The rest has sensible defaults. See the [Environment Variables](#environment-variables) table below.

### Step 4 — Database setup (migrate + seed)

```bash
cd backend
npx prisma generate          # generate Prisma client into src/generated/prisma
npx prisma migrate dev       # apply all migrations to PostgreSQL
npx tsx prisma/seed.ts        # create admin user + singleton Settings row
cd ..
```

> **Prisma 7 note**: `migrate dev` does NOT auto-run `generate`. Always run `prisma generate` first.

### Step 5 — Start development servers

From the repo root:

```bash
npm run dev
```

This runs both backend and frontend concurrently via the `concurrently` package:
- **Backend** (`tsx watch src/app.ts`): [http://localhost:3001](http://localhost:3001)
- **Frontend** (`vite`): [http://localhost:3000](http://localhost:3000)

The Vite dev server proxies `/api/*` and `/ws` to `localhost:3001`, so the frontend talks to the backend transparently.

Open [http://localhost:3000](http://localhost:3000) and log in with the admin credentials from your `.env`.

### Step 6 — (optional) Run individually

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

---

## Build for Production

```bash
npm run build
# equivalent to: npm run build --workspace=frontend && npm run build --workspace=backend
# backend build = prisma generate && tsc → backend/dist/
# frontend build = tsc && vite build → frontend/dist/

NODE_ENV=production node backend/dist/app.js
```

In production the Express server serves the frontend SPA from `frontend/dist/`.

---

## Available npm Scripts

### Root (`package.json`)

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `concurrently "dev:backend" "dev:frontend"` | Start both servers |
| `npm run dev:backend` | delegates to `backend` workspace | Backend only |
| `npm run dev:frontend` | delegates to `frontend` workspace | Frontend only |
| `npm run build` | build frontend then backend | Production build |
| `npm run db:migrate` | `prisma migrate dev` (backend) | Apply migrations |
| `npm run db:seed` | `tsx prisma/seed.ts` (backend) | Seed database |
| `npm test` | vitest in all workspaces | Run all tests |
| `npm run lint` | tsc --noEmit in all workspaces | Type-check |

### Backend (`backend/package.json`)

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `tsx watch src/app.ts` | Dev server with hot-reload |
| `npm run build` | `prisma generate && tsc` | Generate Prisma + compile TS |
| `npm start` | `node dist/app.js` | Run compiled production build |
| `npm run db:migrate` | `prisma migrate dev` | Apply DB migrations |
| `npm run db:push` | `prisma db push` | Push schema without migration files |
| `npm run db:seed` | `tsx prisma/seed.ts` | Seed initial data |
| `npm run db:generate` | `prisma generate` | Regenerate Prisma client |
| `npm test` | `vitest run` | Run tests once |

### Frontend (`frontend/package.json`)

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `vite` | Dev server on port 3000 |
| `npm run build` | `tsc && vite build` | Production build |
| `npm run preview` | `vite preview` | Preview production build locally |
| `npm test` | `vitest` | Run tests |

---

## Environment Variables

All variables live in `backend/.env`. Copy from `backend/.env.example`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | `development` or `production` |
| `PORT` | no | `3001` | Backend HTTP port |
| `JWT_SECRET` | yes | — | Secret for signing JWTs (min 32 chars) |
| `DATABASE_URL` | no | `postgresql://postgres:postgres@localhost:5432/linkedin_platform` | PostgreSQL connection string |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis connection string |
| `UNIPILE_API_KEY` | yes | — | Unipile REST API key |
| `UNIPILE_ACCOUNT_ID` | yes | — | Unipile LinkedIn account ID |
| `UNIPILE_WEBHOOK_SECRET` | yes | — | HMAC-SHA256 secret for webhook verification |
| `UNIPILE_BASE_URL` | no | `https://api.unipile.com` | Unipile API base URL |
| `OPENAI_API_KEY` | yes | — | OpenAI API key |
| `OPENAI_SERVICE_TIER` | no | `auto` | OpenAI service tier (`auto`, `flex`, `priority`) |
| `ADMIN_EMAIL` | yes | — | Admin email (used by seed) |
| `ADMIN_INITIAL_PASSWORD` | yes | — | Admin password (used by seed) |
| `LINKEDIN_MODE` | no | `unipile` | LinkedIn integration mode |
| `DASHBOARD_URL` | no | `http://localhost:3000` | Frontend URL for CORS |
| `TELEGRAM_BOT_TOKEN` | no | — | Telegram bot token for reports |
| `TELEGRAM_CHAT_ID` | no | — | Telegram chat/group ID for reports |
| `RESEND_API_KEY` | no | — | Resend API key for email reports |

---

## Automation Jobs

Five cron jobs run automatically. Their fire times are configurable in the Settings page
and are randomised by +/-15 minutes to simulate human behaviour.

| Job | Default time | Cron schedule | Purpose |
|---|---|---|---|
| **Morning** | 09:00 | Daily | Acceptance checks, profile analysis, follow-up transitions |
| **Midday** | 11:30 | Daily | LinkedIn search, prospect discovery and scoring |
| **Afternoon** | 14:00 | Daily | Connection requests + intro/follow-up message sending |
| **Evening** | 18:30 | Daily | Daily log compilation, Telegram/email reports, maintenance |
| **Sunday** | 08:00 | Sundays only | Network analysis — scan existing connections, score against agents, save prospects |

All jobs use Redis SETNX distributed locks (DC-08) to prevent concurrent execution.

---

## Key Design Constraints

- **LinkedIn Free limits**: max 25 connection requests/day, 200/week.
- **No notes on invitations** (C9 — LinkedIn Free restriction).
- **Automation stops on any reply** (C8 — responding prospects exit the funnel).
- **HMAC-signed webhooks** (DC-02 — Unipile webhook requests verified with SHA-256).
- **HttpOnly JWT cookie** — tokens are never stored in localStorage.
- **Redis SETNX distributed locks** (DC-08 — prevents concurrent job execution).

---

## Prisma 7 Notes

This project uses Prisma 7, which has breaking changes from v5:

- **No `url` in datasource block**: connection string configured in `backend/prisma.config.ts`
- **Generator**: `provider = "prisma-client"` with `output = "../src/generated/prisma"`
- **Imports**: use relative path `../generated/prisma/client.js` (not `@prisma/client`)
- **Adapter required**: uses `@prisma/adapter-pg` + `pg` → `new PrismaClient({ adapter })`
- **`prisma generate` is not automatic**: `migrate dev` and `db push` do NOT run generate
- **`dotenv` not auto-loaded**: every entry point must `import 'dotenv/config'`
- **Seed config**: defined in `prisma.config.ts` under `migrations.seed`, not in `package.json`

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `prisma generate` fails | Ensure `prisma` dev dependency is installed: `npm install` from root |
| DB connection refused | Check `docker compose ps` — PostgreSQL must be running on port 5432 |
| Redis connection refused | Check `docker compose ps` — Redis must be running on port 6379 |
| Frontend shows blank page | Check browser console; ensure backend is running on 3001 |
| `MODULE_NOT_FOUND` for generated Prisma | Run `npx prisma generate` in `backend/` |
| Seed fails with "dotenv not found" | Run `npm install` from root (dotenv is a backend dependency) |
