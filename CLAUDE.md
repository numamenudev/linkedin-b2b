# Memory

## Me
NuMa — utente del workspace linkedin_B2B.

## Preferenze di lavoro

| Preferenza | Dettaglio |
|------------|-----------|
| **Git commit dopo design** | Quando si finisce di fare modifiche a file di design, eseguire commit su git |

## Workflow
- **File di design → git commit**: Al termine di qualsiasi modifica a file di design (es. `.fig`, `.sketch`, `.psd`, `.ai`, `.svg`, file UI/UX, ecc.), ricordare di fare commit su git prima di considerare il lavoro concluso.

→ Dettagli estesi: memory/glossary.md

## Lezioni apprese (errori passati)

### Prisma 7 — Breaking changes da v5
- **`url` rimosso da `datasource`**: In `schema.prisma` non usare più `url = env("DATABASE_URL")`. La connection string va in `prisma.config.ts` sotto `datasource.url`.
- **`dotenv` non auto-caricato**: Prisma 7 NON carica `.env` automaticamente. Serve `import 'dotenv/config'` esplicito in ogni entry point (`prisma.client.ts`, `seed.ts`, `prisma.config.ts`).
- **Generator provider cambiato**: Usare `provider = "prisma-client"` (non `"prisma-client-js"`). Aggiungere `output = "../src/generated/prisma"`.
- **Import path cambiato**: Tutti gli import vanno da `'@prisma/client'` a `'../generated/prisma/client.js'` (path relativo all'output del generator).
- **Adapter obbligatorio**: Serve `@prisma/adapter-pg` + `pg`. Il `PrismaClient` richiede `new PrismaClient({ adapter })` con `new PrismaPg({ connectionString })`.
- **`prisma generate` non automatico**: `migrate dev` e `db push` non eseguono più `prisma generate`. Lo script `build` deve includerlo: `"build": "prisma generate && tsc"`.
- **Seed non in `package.json`**: La config del seed va in `prisma.config.ts` sotto `migrations.seed`, non più nel campo `prisma.seed` di `package.json`.
- **Lockfile**: Dopo upgrade major di Prisma, rigenerare `package-lock.json` (`rm package-lock.json && npm install`).

### OpenAI — Responses API (non chat/completions)
- **Endpoint**: Usare `client.responses.create()` (non `client.chat.completions.create()`).
- **Parametri**: `instructions` (system prompt), `input` (user message), `max_output_tokens` (non `max_tokens`).
- **Risposta**: `response.output_text` (non `response.choices[0].message.content`).
- **Service tier**: Parametro `service_tier` accetta `'auto'`, `'flex'`, `'priority'`.
- **Versione SDK**: Serve `openai@^4.85` minimo per la Responses API (attuale: v6.x).
- **Test endpoint REST**: `POST https://api.openai.com/v1/responses` con header `Authorization: Bearer <key>`.

### Docker
- Per raggruppare container in Docker Desktop, usare `docker-compose.yml` (non `docker run` singoli).
- `version: '3.8'` è obsoleto in Docker Compose moderno — rimuoverlo per evitare warning.

### Dipendenze mancanti
- Se `seed.ts` usa `import 'dotenv/config'`, il pacchetto `dotenv` deve essere nelle dependencies (`npm install dotenv`).
