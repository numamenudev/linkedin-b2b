# LinkedIn-b2b Automation Platform

An automated LinkedIn outreach platform for B2B prospecting. It manages multiple LinkedIn
identities ("agents"), discovers prospects via LinkedIn search, sends connection requests
and personalised follow-up messages, and tracks the full funnel through a React dashboard.

---

## Architecture

```
linkedin-b2b/
├── backend/          # Node.js / Express API + automation engine
│   ├── src/
│   │   ├── agents/           # Orchestrator, budget allocator, agent runner
│   │   ├── api/              # Express routes + middleware (auth, validation, rate-limit)
│   │   ├── automation/       # Jobs (morning/midday/afternoon/evening), outreach agent,
│   │   │                     # connection sender, follow-up manager, deduplication
│   │   ├── db/               # Prisma client singleton
│   │   ├── integrations/     # Unipile (LinkedIn), Claude AI, Telegram, Email (Resend)
│   │   ├── types/            # Shared TypeScript interfaces
│   │   ├── utils/            # Logger, scheduler, rate-limiter, job-lock, helpers
│   │   └── websocket/        # Real-time log stream over WebSocket
│   └── prisma/
│       ├── schema.prisma     # Database schema
│       └── seed.ts           # Initial admin user seeder
└── frontend/         # React 18 + Vite + TanStack Query + Tailwind CSS
    └── src/
        ├── components/       # Shared UI components (Sidebar, etc.)
        ├── hooks/            # TanStack Query hooks (useAgents, useAuth, …)
        ├── lib/              # API client (fetch wrapper)
        └── pages/            # Route-level page components
```

---

## Local Setup

### Prerequisites

- Node.js >= 20
- PostgreSQL >= 15
- Redis >= 7
- A [Unipile](https://unipile.com) account with a LinkedIn account connected
- An [Anthropic](https://anthropic.com) API key

### 1. Clone and install

```bash
git clone <repo-url>
cd linkedin-b2b
npm install --prefix backend
npm install --prefix frontend
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with real values (see [Environment Variables](#environment-variables) below).

### 3. Database

```bash
cd backend
npx prisma migrate dev   # apply migrations
npx prisma db seed       # create the initial admin user
```

### 4. Start development servers

```bash
# Terminal 1 — backend API (port 3000)
npm --prefix backend run dev

# Terminal 2 — frontend dev server (port 5173)
npm --prefix frontend run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with the admin credentials from your `.env`.

### 5. Build for production

```bash
npm --prefix backend run build    # outputs to backend/dist/
npm --prefix frontend run build   # outputs to frontend/dist/ (served as SPA by Express)
NODE_ENV=production node backend/dist/app.js
```

---

## Environment Variables

All variables live in `backend/.env`. See `backend/.env.example` for the full list.

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | yes | `development` or `production` |
| `PORT` | no | HTTP port (default `3000`) |
| `JWT_SECRET` | yes | Secret for signing JWTs — min 32 chars |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `REDIS_URL` | yes | Redis connection string |
| `UNIPILE_API_KEY` | yes | Unipile REST API key |
| `UNIPILE_ACCOUNT_ID` | yes | Unipile LinkedIn account ID |
| `UNIPILE_WEBHOOK_SECRET` | yes | HMAC secret for webhook verification |
| `CLAUDE_API_KEY` | yes | Anthropic Claude API key |
| `TELEGRAM_BOT_TOKEN` | no | Telegram bot token for daily reports |
| `TELEGRAM_CHAT_ID` | no | Telegram chat/group ID for reports |
| `ADMIN_EMAIL` | yes | Admin account email (used by seed) |
| `ADMIN_PASSWORD` | yes | Admin account password (used by seed) |
| `DASHBOARD_URL` | no | Frontend URL for CORS (default `http://localhost:5173`) |
| `RESEND_API_KEY` | no | Resend API key for email reports |

---

## Daily Automation Jobs

Four cron jobs run each day. Their fire times are configurable in Settings and are
randomised by ±15 minutes to simulate human behaviour:

| Job | Default time | Purpose |
|---|---|---|
| **Morning** | 09:00 | Acceptance checks, profile analysis, follow-up timer transitions |
| **Midday** | 11:30 | LinkedIn search, prospect discovery and scoring |
| **Afternoon** | 14:00 | Connection requests + intro/follow-up message sending |
| **Evening** | 18:30 | Daily log compilation, Telegram/email reports, maintenance |

---

## Key Design Constraints

- **LinkedIn Free limits**: max 25 connection requests per day, 200 per week.
- **No notes on invitations** (C9 — LinkedIn Free restriction).
- **Automation stops on any reply** (C8 — prospects that respond are excluded from further automation).
- **HMAC-signed webhooks** (DC-02 — Unipile webhook requests are verified with SHA-256).
- **HttpOnly JWT cookie** — tokens are never stored in localStorage.
- **Redis SETNX distributed locks** (DC-08 — prevents concurrent job execution).
