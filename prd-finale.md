# PRD Finale — LinkedIn Multi-Agent Outreach Platform
### Documento definitivo per lo sviluppo completo

**Versione:** 3.0 — Finale
**Data:** 2026-02-26
**Sostituisce:** prd.md v1 + prd-v2-multiagent.md
**Sviluppatore:** NuMa (self-development con AI assistance)
**Stato:** Pronto per sviluppo

---

## Indice

- [Parte I — Visione e Requisiti](#parte-i)
- [Parte II — Architettura e Stack](#parte-ii)
- [Parte III — Database Schema](#parte-iii)
- [Parte IV — Backend API](#parte-iv)
- [Parte V — Motore di Automazione](#parte-v)
- [Parte VI — Sistema Agenti e Identity Builder](#parte-vi)
- [Parte VII — Frontend](#parte-vii)
- [Parte VIII — Integrazioni Esterne](#parte-viii)
- [Parte IX — Sicurezza e GDPR](#parte-ix)
- [Parte X — Monitoring e Operatività](#parte-x)
- [Parte XI — Deployment e Setup](#parte-xi)
- [Parte XII — Fasi di Sviluppo](#parte-xii)

---

# PARTE I — VISIONE E REQUISITI

## 1. Obiettivo del prodotto

Una piattaforma web che gestisce in autonomia l'outreach LinkedIn tramite agenti AI paralleli, ognuno con una propria identità, target e logica di comunicazione. L'utente — NuMa — supervisiona tramite una dashboard web e interviene solo quando un prospect risponde.

## 2. Agenti attivi (fase MVP)

| ID Agente | Obiettivo | Identità | Target |
|-----------|-----------|----------|--------|
| `numa_b2b` | Vendere NumaMenu | NuMa, co-founder NumaMenu | Proprietari ristoranti, Milano |
| `numa_investor` | Pitch investitori NumaMenu | NuMa, founder (pitch mode) | Business Angel, VC, food tech |
| `ai_training` | Lead gen formazione AI | NuMa, AI business strategist | HR/L&D Manager, aziende Milano |

## 3. Requisiti funzionali

### Gestione agenti
- RF-01: Creare un nuovo agente tramite wizard guidato
- RF-02: Modificare la configurazione di un agente esistente
- RF-03: Mettere in pausa / riprendere un agente
- RF-04: Eliminare un agente e archiviarne i dati
- RF-05: Visualizzare lo stato e le statistiche di ogni agente in tempo reale

### Identity Builder
- RF-06: Caricare documenti (PDF, PPTX, TXT) per costruire un'identità
- RF-07: Rispondere a domande guidate per costruire un'identità senza documenti
- RF-08: Revisionare e approvare l'Identity Card generata dall'AI
- RF-09: Versioning delle identità (ogni modifica crea una nuova versione)
- RF-10: Ereditarietà identità (una identità specializzata estende una base)

### Automazione
- RF-11: Esecuzione automatica dei 4 job giornalieri per ogni agente attivo
- RF-12: Ricerca prospect tramite strutture configurabili (compatibile LinkedIn Free e Sales Navigator)
- RF-13: Invio connection requests con nota personalizzata
- RF-14: Monitoraggio accettazioni/rifiuti (webhook Unipile + polling)
- RF-15: Analisi profilo AI per ogni nuova connessione
- RF-16: Generazione e invio messaggio personalizzato post-accettazione
- RF-17: Gestione follow-up (2 tentativi aggiuntivi con timing e angolo diversi)
- RF-18: Stop automatico di ogni automazione su quel prospect alla prima risposta ricevuta

### Prospect management
- RF-19: Visualizzare e filtrare tutti i prospect per agente, stato, data
- RF-20: Visualizzare la storia completa di ogni prospect (messaggi inviati/ricevuti)
- RF-21: Modificare manualmente lo stato di un prospect
- RF-22: Aggiungere note manuali a un prospect
- RF-23: Esportare prospect in CSV

### Rete esistente (Existing Network)
- RF-24: Analisi settimanale dei collegamenti LinkedIn esistenti (job domenicale)
- RF-25: Classificazione automatica dei collegamenti per agente tramite scoring
- RF-26: Verifica conversazioni pregresse prima di qualsiasi invio
- RF-27: Gestione stato separato per warm outreach (distinguo da cold)
- RF-28: Template messaggi warm distinti dai template cold per ogni agente
- RF-29: Stop automatico se il collegamento ha una conversazione attiva (<30gg)

### Notifiche
- RF-30: Notifica Telegram immediata quando un prospect risponde
- RF-31: Alert Telegram per errori critici o anomalie sistema
- RF-32: **Report email giornaliero** a daniel.dallapalma@gmail.com con il dettaglio completo di ogni azione svolta (inviato alle 19:00)
- RF-33: Il report email include: per ogni agente — inviti inviati, accettazioni, messaggi inviati per tipo (intro/follow-up1/follow-up2/warm), risposte ricevute con anteprima, prospect archiviati, nuovi trovati, contatori settimanali e mensili cumulativi, link diretto alla dashboard

### Monitoring
- RF-34: Log operativi in tempo reale visualizzabili in dashboard
- RF-35: Statistiche per agente (acceptance rate, response rate, funnel)
- RF-36: Grafici storici settimanali/mensili
- RF-37: Monitor salute account LinkedIn (alert se anomalie)

## 4. Requisiti non funzionali

- RNF-01: L'intero sistema deve girare su un singolo VPS (€10-15/mese)
- RNF-02: Il frontend deve essere usabile da mobile (responsive)
- RNF-03: Autenticazione a singolo utente (solo NuMa) con sessione persistente
- RNF-04: Tutti i job devono riprendere correttamente dopo un riavvio del server
- RNF-05: Nessuna azione automatica dopo ricezione risposta da un prospect
- RNF-06: Rate limiting LinkedIn rispettato in ogni circostanza
- RNF-07: I dati dei prospect devono essere cancellabili (compliance GDPR)
- RNF-08: Backup automatico del database ogni 24 ore

## 5. Vincoli di progetto

| Vincolo | Dettaglio |
|---------|-----------|
| LinkedIn Free — ricerca | Ricerche per keyword, nessun filtro avanzato per azienda/settore. Il PRD descrive entrambe le modalità (Free e Sales Navigator). |
| LinkedIn Free — inviti | **~150 inviti/settimana senza messaggio allegato.** Gli inviti vengono inviati SENZA nota. Il messaggio arriva solo dopo l'accettazione. Il budget settimanale viene distribuito tra i 3 agenti: 60 (ristoratori) + 70 (HR/L&D) + 20 (investitori) = 150/settimana. |
| Budget giornaliero | 150/7 ≈ 21 inviti/giorno totali. Ripartizione giornaliera: NUMA-B2B 9/g, AI-TRAINING 10/g, NUMA-INVESTOR 3/g. Il sistema traccia sia il contatore giornaliero che quello settimanale (in Redis) per non sforare mai il limite. |
| Budget infra | Max €150/mese totale (Unipile + VPS + Claude API + eventuali extra) |
| Single developer | Architettura semplice, no microservizi, un solo repository monorepo |
| Privacy | Nessun dato di prospect esposto pubblicamente |

---

# PARTE II — ARCHITETTURA E STACK

## 6. Architettura generale

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (React SPA)                                    │
│  Dashboard Admin — servita da Express su porta 3000      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/REST
┌───────────────────────▼─────────────────────────────────┐
│  BACKEND (Node.js + Express + TypeScript)                │
│  API REST + Job Scheduler + WebSocket per log live       │
└──┬──────────────┬──────────────┬───────────────┬─────────┘
   │              │              │               │
   ▼              ▼              ▼               ▼
┌──────┐    ┌─────────┐   ┌──────────┐   ┌───────────┐
│Postgres│  │  Redis  │   │ Unipile  │   │ Claude    │
│(Supabase│ │(Upstash)│   │   API    │   │   API     │
│ / locale│ │  Queue  │   │(LinkedIn)│   │(Anthropic)│
└──────┘    └─────────┘   └──────────┘   └───────────┘
                                               │
                                         ┌─────▼──────┐
                                         │  Telegram  │
                                         │    Bot     │
                                         └────────────┘
```

## 7. Stack tecnologico

### Backend
| Tecnologia | Versione | Scopo |
|-----------|---------|-------|
| Node.js | 20 LTS | Runtime |
| TypeScript | 5.x | Linguaggio |
| Express | 4.x | HTTP server + API |
| Prisma | 5.x | ORM + migrations |
| BullMQ | 4.x | Job queue + scheduling |
| node-cron | 3.x | Cron trigger per i job |
| jsonwebtoken | 9.x | Auth JWT |
| bcryptjs | 2.x | Hashing password |
| pdf-parse | 1.x | Estrazione testo da PDF |
| officeparser | 4.x | Estrazione testo da PPTX |
| multer | 1.x | Upload file |
| winston | 3.x | Logging strutturato |
| ws | 8.x | WebSocket per log live |
| zod | 3.x | Validazione dati |

### Frontend
| Tecnologia | Versione | Scopo |
|-----------|---------|-------|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Styling |
| shadcn/ui | latest | Componenti UI |
| React Router | 6.x | Routing |
| TanStack Query | 5.x | Data fetching + cache |
| Recharts | 2.x | Grafici analytics |
| React Hook Form | 7.x | Form management |

### Infrastruttura
| Servizio | Piano | Costo |
|---------|-------|-------|
| Railway | Hobby | €5/mese (backend + DB incluso) |
| Upstash Redis | Free | €0 |
| Unipile | Starter | €49/mese |
| Claude API (Anthropic) | Pay-per-use | ~€30-50/mese |
| Telegram Bot | Free | €0 |
| **TOTALE** | | **~€84-104/mese** |

> **Nota Sales Navigator:** aggiungendo LinkedIn Sales Navigator (€79/mese) il sistema
> passa a funzionamento completo. Il codice supporta entrambe le modalità via config.

## 8. Struttura del progetto (monorepo)

```
linkedin-platform/
│
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── agents.routes.ts
│   │   │   │   ├── identities.routes.ts
│   │   │   │   ├── prospects.routes.ts
│   │   │   │   ├── search-structures.routes.ts
│   │   │   │   ├── analytics.routes.ts
│   │   │   │   ├── logs.routes.ts
│   │   │   │   └── settings.routes.ts
│   │   │   └── middleware/
│   │   │       ├── auth.middleware.ts
│   │   │       ├── rateLimit.middleware.ts
│   │   │       └── validation.middleware.ts
│   │   │
│   │   ├── agents/
│   │   │   ├── orchestrator.ts          # Platform orchestrator
│   │   │   ├── agent-runner.ts          # Esegue un singolo agente
│   │   │   ├── budget-allocator.ts      # Distribuisce budget tra agenti
│   │   │   └── agent-lifecycle.ts       # Start/pause/stop agenti
│   │   │
│   │   ├── automation/
│   │   │   ├── jobs/
│   │   │   │   ├── morning.job.ts       # Job mattina
│   │   │   │   ├── midday.job.ts        # Job mezzogiorno
│   │   │   │   ├── afternoon.job.ts     # Job pomeriggio
│   │   │   │   └── evening.job.ts       # Job sera
│   │   │   ├── search-engine.ts         # Esecuzione strutture ricerca
│   │   │   ├── acceptance-monitor.ts    # Monitoraggio accettazioni
│   │   │   ├── connection-sender.ts     # Invio connection requests
│   │   │   ├── profile-analyzer.ts      # Analisi profilo AI
│   │   │   ├── outreach-agent.ts        # Generazione e invio messaggi
│   │   │   ├── followup-manager.ts      # Gestione follow-up
│   │   │   └── deduplication.ts         # Rimozione duplicati
│   │   │
│   │   ├── identity/
│   │   │   ├── identity-builder.ts      # Costruzione identity da documenti
│   │   │   ├── document-processor.ts    # Estrazione testo da PDF/PPTX
│   │   │   └── identity-prompts.ts      # Prompt per identity generation
│   │   │
│   │   ├── integrations/
│   │   │   ├── unipile/
│   │   │   │   ├── unipile.client.ts    # Client Unipile
│   │   │   │   ├── unipile.search.ts    # Search LinkedIn
│   │   │   │   ├── unipile.connect.ts   # Connection requests
│   │   │   │   ├── unipile.message.ts   # Messaggi
│   │   │   │   ├── unipile.profile.ts   # Profile fetching
│   │   │   │   └── unipile.webhook.ts   # Gestione webhook
│   │   │   ├── claude/
│   │   │   │   ├── claude.client.ts     # Client Anthropic
│   │   │   │   ├── claude.prompts.ts    # Tutti i prompt di sistema
│   │   │   │   └── claude.parsers.ts    # Parsing risposte AI
│   │   │   └── telegram/
│   │   │       ├── telegram.bot.ts      # Bot Telegram
│   │   │       └── telegram.messages.ts # Template messaggi Telegram
│   │   │
│   │   ├── db/
│   │   │   └── prisma.client.ts         # Singleton Prisma client
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.ts                # Winston logger
│   │   │   ├── scheduler.ts             # Wrapper node-cron
│   │   │   ├── rate-limiter.ts          # LinkedIn rate limiter
│   │   │   └── helpers.ts               # Utility generiche
│   │   │
│   │   ├── websocket/
│   │   │   └── log-stream.ts            # WebSocket per log live
│   │   │
│   │   └── app.ts                       # Express app entry point
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   ├── uploads/                         # Documenti identità caricati
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Agents/
│   │   │   │   ├── AgentsList.tsx
│   │   │   │   ├── AgentDetail.tsx
│   │   │   │   ├── AgentCreate.tsx
│   │   │   │   └── AgentEdit.tsx
│   │   │   ├── Identities/
│   │   │   │   ├── IdentitiesList.tsx
│   │   │   │   ├── IdentityCreate.tsx
│   │   │   │   └── IdentityDetail.tsx
│   │   │   ├── Prospects/
│   │   │   │   ├── ProspectsList.tsx
│   │   │   │   └── ProspectDetail.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── Logs.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Login.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── agents/
│   │   │   │   ├── AgentCard.tsx
│   │   │   │   ├── AgentStatusBadge.tsx
│   │   │   │   └── AgentWizard/
│   │   │   │       ├── Step1Identity.tsx
│   │   │   │       ├── Step2Target.tsx
│   │   │   │       ├── Step3Messaging.tsx
│   │   │   │       ├── Step4Budget.tsx
│   │   │   │       └── Step5Review.tsx
│   │   │   ├── prospects/
│   │   │   │   ├── ProspectRow.tsx
│   │   │   │   ├── ProspectStatusBadge.tsx
│   │   │   │   └── MessageTimeline.tsx
│   │   │   ├── analytics/
│   │   │   │   ├── FunnelChart.tsx
│   │   │   │   ├── AcceptanceRateChart.tsx
│   │   │   │   └── DailyActivityChart.tsx
│   │   │   └── ui/                      # shadcn/ui components
│   │   ├── hooks/
│   │   │   ├── useAgents.ts
│   │   │   ├── useProspects.ts
│   │   │   └── useLiveLog.ts            # WebSocket hook
│   │   ├── lib/
│   │   │   ├── api.ts                   # Axios instance
│   │   │   └── utils.ts
│   │   └── main.tsx
│   └── package.json
│
├── .gitignore
├── README.md
└── docker-compose.yml                   # Dev locale
```

---

# PARTE III — DATABASE SCHEMA

## 9. Schema Prisma completo

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// AUTENTICAZIONE
// ─────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}

// ─────────────────────────────────────────
// IDENTITÀ
// ─────────────────────────────────────────

model Identity {
  id               String   @id @default(uuid())
  name             String                          // es. "NuMa — NumaMenu B2B"
  parentId         String?                         // ereditarietà
  parent           Identity? @relation("IdentityInheritance", fields: [parentId], references: [id])
  children         Identity[] @relation("IdentityInheritance")

  personaName      String                          // "NuMa"
  role             String                          // "Co-founder, NumaMenu"
  company          String                          // "NumaMenu"
  location         String?

  fullContextPrompt String @db.Text               // System prompt completo generato
  toneProfile      Json                            // { formality, style, avoid[], highlights[] }
  companyContext   Json                            // { description, stage, traction, valueProposition... }
  credibilityMarkers Json                          // []
  doNotSay         Json                            // []

  version          Int      @default(1)
  approvedByUser   Boolean  @default(false)
  approvedAt       DateTime?

  documents        IdentityDocument[]
  agents           Agent[]

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("identities")
}

model IdentityDocument {
  id               String   @id @default(uuid())
  identityId       String
  identity         Identity @relation(fields: [identityId], references: [id], onDelete: Cascade)

  filename         String
  originalName     String
  fileType         String                          // pdf | pptx | txt
  filePath         String                          // path locale

  extractionStatus String   @default("pending")   // pending | processing | done | failed
  extractedText    String?  @db.Text
  extractedFacts   Json?                           // []
  extractionSummary String? @db.Text

  createdAt        DateTime @default(now())

  @@map("identity_documents")
}

// ─────────────────────────────────────────
// AGENTI
// ─────────────────────────────────────────

model Agent {
  id               String   @id @default(uuid())
  name             String
  description      String?
  status           String   @default("paused")    // active | paused | archived

  identityId       String
  identity         Identity @relation(fields: [identityId], references: [id])

  // Configurazione target
  targetConfig     Json                            // { jobTitles[], industries[], companySizes[], locations[], exclusions[] }

  // Configurazione messaggi
  messagingConfig  Json                            // { message1Template, message2Template, message3Template, cta, tone }
                                                  // NOTA: nessuna connection note — gli inviti vengono inviati SENZA messaggio

  // Budget — inviti senza messaggio, limite LinkedIn Free ~150/settimana totale
  weeklyConnectionRequests Int @default(60)        // budget settimanale per questo agente
  dailyConnectionRequests  Int @default(9)         // cap giornaliero (weeklyConnectionRequests / 7, arrotondato)
  dailyMessages    Int      @default(8)            // messaggi (solo post-accettazione)
  priority         Int      @default(2)            // 1=alta, 2=media, 3=bassa

  // LinkedIn mode
  linkedinMode     String   @default("free")       // free | sales_navigator

  // Stats aggregate (denormalizzate per performance)
  statsJson        Json     @default("{}")

  searchStructures SearchStructure[]
  prospects        Prospect[]
  dailyLogs        DailyLog[]

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("agents")
}

// ─────────────────────────────────────────
// STRUTTURE DI RICERCA
// ─────────────────────────────────────────

model SearchStructure {
  id               String   @id @default(uuid())
  agentId          String
  agent            Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)

  name             String                          // es. "Titolare+Ristorante+Navigli"
  queryConfig      Json                            // { titleKeywords[], locationKeywords[], industryKeywords[], modifiers[] }
  fullQueryString  String                          // Stringa query per Unipile
  linkedinMode     String   @default("free")

  enabled          Boolean  @default(true)
  lastExecutedAt   DateTime?
  timesExecuted    Int      @default(0)
  totalResultsFound Int     @default(0)
  newResultsLastRun Int     @default(0)

  createdAt        DateTime @default(now())

  @@map("search_structures")
}

// ─────────────────────────────────────────
// PROSPECT
// ─────────────────────────────────────────

model Prospect {
  id               String   @id @default(uuid())
  agentId          String
  agent            Agent    @relation(fields: [agentId], references: [id])

  // Dati LinkedIn
  linkedinId       String                          // ID univoco LinkedIn
  linkedinUrl      String
  fullName         String
  firstName        String
  lastName         String
  headline         String?
  location         String?
  profilePictureUrl String?
  rawProfileData   Json?                           // Dati grezzi da Unipile

  // Classificazione prospect
  restaurantName   String?
  restaurantType   String?
  estimatedSize    String?
  companyName      String?

  // Scoring
  score            Int      @default(0)
  scoreBreakdown   Json?

  // Stato nel funnel
  status           String   @default("found")
  // Valori COLD (ricerca nuovi):
  //   found | queued | connection_sent | connection_accepted |
  //   connection_rejected | connection_expired | ready_for_outreach |
  //   intro_sent | followup_1_queued | followup_1_sent |
  //   followup_2_queued | followup_2_sent | responded | archived | opted_out
  // Valori WARM (rete esistente):
  //   existing_found | existing_analyzed | existing_queued |
  //   existing_message_sent | existing_followup_1_queued | existing_followup_1_sent |
  //   existing_followup_2_queued | existing_followup_2_sent |
  //   active_conversation |     // conversazione recente (<30gg) → non toccare
  //   responded_manually |      // ha già risposto in passato → non toccare
  //   responded | archived | opted_out

  // Timeline
  discoveredAt     DateTime @default(now())
  connectionRequestSentAt DateTime?
  connectionAcceptedAt    DateTime?
  connectionRejectedAt    DateTime?
  lastActivityAt   DateTime?

  // Source
  searchStructureId String?
  discoveryMethod   String  @default("search")    // search | existing_network | manual

  // Rete esistente — campi aggiuntivi
  hasPriorConversation     Boolean  @default(false)
  priorConversationSummary String?  @db.Text      // sintesi AI degli ultimi messaggi se presente
  lastConversationDate     DateTime?               // data ultimo messaggio nella chat esistente
  existingChatId           String?                 // ID chat Unipile se esiste già

  // Analisi profilo
  profileAnalysis  Json?
  profileAnalyzedAt DateTime?

  // Note manuali
  notes            String?

  messages         Message[]

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([linkedinId, agentId])
  @@map("prospects")
}

model Message {
  id               String   @id @default(uuid())
  prospectId       String
  prospect         Prospect @relation(fields: [prospectId], references: [id], onDelete: Cascade)

  sequenceNumber   Int                             // 1 | 2 | 3
  direction        String   @default("outbound")  // outbound | inbound
  content          String   @db.Text
  unipileMessageId String?

  sentAt           DateTime?
  status           String   @default("pending")   // pending | sent | delivered | read | failed

  // Risposta
  responded        Boolean  @default(false)
  responseReceivedAt DateTime?
  responseContent  String?  @db.Text

  createdAt        DateTime @default(now())

  @@map("messages")
}

// ─────────────────────────────────────────
// LOG E ANALYTICS
// ─────────────────────────────────────────

model DailyLog {
  id               String   @id @default(uuid())
  agentId          String
  agent            Agent    @relation(fields: [agentId], references: [id])
  date             DateTime @db.Date

  searchStructuresRun     Int @default(0)
  newProspectsFound       Int @default(0)
  connectionRequestsSent  Int @default(0)
  connectionsAccepted     Int @default(0)
  connectionsRejected     Int @default(0)
  profilesAnalyzed        Int @default(0)
  messagesSent            Int @default(0)
  responsesReceived       Int @default(0)

  errors           Json     @default("[]")
  rawLog           String?  @db.Text

  createdAt        DateTime @default(now())

  @@unique([agentId, date])
  @@map("daily_logs")
}

model OperationLog {
  id               String   @id @default(uuid())
  agentId          String?
  level            String                          // info | warn | error | debug
  job              String?                         // morning | midday | afternoon | evening
  action           String                          // es. "connection_sent", "profile_analyzed"
  message          String
  meta             Json?
  createdAt        DateTime @default(now())

  @@map("operation_logs")
}

model Settings {
  id               String   @id @default("singleton")
  unipileApiKey    String?
  unipileAccountId String?
  claudeApiKey     String?
  telegramBotToken String?
  telegramChatId   String?
  // Email report
  reportEmail      String   @default("daniel.dallapalma@gmail.com")
  resendApiKey     String?                         // API key Resend per invio email
  reportEmailTime  String   @default("19:00")      // orario invio report giornaliero
  linkedinMode     String   @default("free")      // free | sales_navigator | premium_business
  timezone         String   @default("Europe/Rome")
  morningJobTime   String   @default("09:00")
  middayJobTime    String   @default("11:30")
  afternoonJobTime String   @default("14:00")
  eveningJobTime   String   @default("18:30")
  globalWeeklyConnectionLimit Int @default(150)    // limite LinkedIn Free — inviti senza messaggio
  globalDailyConnectionLimit  Int @default(21)    // 150/7, arrotondato — cap giornaliero di sicurezza
  globalDailyMessageLimit     Int @default(25)    // messaggi post-accettazione
  updatedAt        DateTime @updatedAt

  @@map("settings")
}
```

---

# PARTE IV — BACKEND API

## 10. Autenticazione

Il sistema usa **JWT** con un singolo utente (NuMa). Non c'è registrazione pubblica.

### POST /api/auth/login
```json
Request:  { "email": "...", "password": "..." }
Response: { "token": "jwt...", "expiresIn": 86400 }
```
### POST /api/auth/refresh
```json
Headers: Authorization: Bearer <token>
Response: { "token": "new_jwt...", "expiresIn": 86400 }
```
### POST /api/auth/logout
Invalida il token lato client.

### Middleware Auth
Ogni endpoint protetto verifica il JWT nell'header `Authorization: Bearer <token>`.

## 11. API Endpoints — Agenti

```
GET    /api/agents                    → Lista tutti gli agenti con stats
GET    /api/agents/:id                → Dettaglio agente
POST   /api/agents                    → Crea nuovo agente
PUT    /api/agents/:id                → Aggiorna configurazione agente
DELETE /api/agents/:id                → Elimina agente (soft delete, archivia)
POST   /api/agents/:id/activate       → Attiva agente
POST   /api/agents/:id/pause          → Mette in pausa agente
GET    /api/agents/:id/stats          → Statistiche dettagliate agente
GET    /api/agents/:id/search-structures → Lista strutture di ricerca dell'agente
POST   /api/agents/:id/run-now        → Esegue manualmente un job (per test)
```

## 12. API Endpoints — Identità

```
GET    /api/identities                → Lista identità
GET    /api/identities/:id            → Dettaglio identità + Identity Card
POST   /api/identities                → Crea identità (conversational)
POST   /api/identities/from-documents → Crea identità da documenti caricati
PUT    /api/identities/:id            → Aggiorna identità
POST   /api/identities/:id/approve    → Approva Identity Card generata
POST   /api/identities/:id/regenerate → Rigenera Identity Card
GET    /api/identities/:id/documents  → Lista documenti dell'identità

POST   /api/identities/:id/documents          → Carica documento (multipart/form-data)
DELETE /api/identities/:id/documents/:docId   → Elimina documento
```

## 13. API Endpoints — Prospect

```
GET    /api/prospects                 → Lista prospect (filtri: agentId, status, dateFrom, dateTo)
GET    /api/prospects/:id             → Dettaglio prospect con history messaggi
PUT    /api/prospects/:id             → Aggiorna note/stato manuale
DELETE /api/prospects/:id             → Elimina prospect (GDPR)
GET    /api/prospects/:id/messages    → Lista messaggi prospect
POST   /api/prospects/:id/opt-out     → Segnala opt-out (blocca ogni automazione)
GET    /api/prospects/export          → Export CSV (filtri come lista)
```

## 14. API Endpoints — Strutture di Ricerca

```
GET    /api/search-structures/:agentId           → Lista strutture per agente
POST   /api/search-structures/:agentId           → Crea struttura
PUT    /api/search-structures/:agentId/:id        → Aggiorna struttura
DELETE /api/search-structures/:agentId/:id        → Elimina struttura
POST   /api/search-structures/:agentId/:id/run    → Esegui struttura ora (test)
POST   /api/search-structures/:agentId/bulk       → Import bulk strutture (JSON)
```

## 15. API Endpoints — Analytics

```
GET    /api/analytics/overview        → KPI aggregati tutti gli agenti
GET    /api/analytics/agents/:id      → KPI per singolo agente
GET    /api/analytics/funnel/:agentId → Dati funnel per agente
GET    /api/analytics/daily           → Dati giornalieri per grafici (last 30gg)
GET    /api/analytics/messages        → Stats messaggi (response rate per sequenza)
```

## 16. API Endpoints — Log e Monitoring

```
GET    /api/logs                      → Log operativi (filtri: agentId, level, job, dateFrom)
GET    /api/logs/live                 → WebSocket endpoint per log in tempo reale
GET    /api/logs/daily-reports        → Report giornalieri salvati
```

## 17. API Endpoints — Impostazioni

```
GET    /api/settings                  → Leggi impostazioni (API key mascherate)
PUT    /api/settings                  → Aggiorna impostazioni
POST   /api/settings/test-unipile     → Testa connessione Unipile
POST   /api/settings/test-claude      → Testa connessione Claude API
POST   /api/settings/test-telegram    → Invia messaggio test su Telegram
GET    /api/settings/linkedin-health  → Stato account LinkedIn (SSI, limiti)
```

## 18. API Endpoints — Webhook

```
POST   /api/webhooks/unipile          → Riceve eventi da Unipile
                                        (connection accepted/rejected, message received)
```

---

# PARTE V — MOTORE DI AUTOMAZIONE

## 19. Job Scheduler

Il sistema usa `node-cron` per triggerare i job e `BullMQ` per gestire le code di lavoro interne.

```typescript
// scheduler.ts

const jobs = [
  { name: 'morning',   time: () => getJobTime('morning'),   handler: morningJob   },
  { name: 'midday',    time: () => getJobTime('midday'),    handler: middayJob    },
  { name: 'afternoon', time: () => getJobTime('afternoon'), handler: afternoonJob },
  { name: 'evening',   time: () => getJobTime('evening'),   handler: eveningJob   },
]
```

Gli orari vengono letti da `Settings` e randomizzati di ±15 minuti ad ogni esecuzione per simulare comportamento umano.

## 20. JOB MATTINA — Morning Job

```
Esecuzione: 09:00 ± 15min

1. Per ogni agente ACTIVE:
   a. ACCEPTANCE MONITOR
      → Chiama Unipile: getInvitations({ status: 'accepted', since: yesterday })
      → Per ogni accettazione: aggiorna prospect.status = 'connection_accepted'
      → Chiama Unipile: getInvitations({ status: 'rejected', since: yesterday })
      → Per ogni rifiuto: prospect.status = 'connection_rejected'

   b. PROFILE ANALYSIS QUEUE
      → Trova: prospects WHERE status='connection_accepted' AND profileAnalysis IS NULL
      → Per ognuno: aggiungi a coda 'profile-analysis' in BullMQ

   c. FOLLOWUP CHECK
      → Trova: prospects WHERE status='intro_sent'
               AND connectionAcceptedAt <= NOW() - 3 days
               AND NOT responded
      → Aggiorna status = 'followup_1_queued'

      → Trova: prospects WHERE status='followup_1_sent'
               AND (intro_sent_at + 7 days) <= NOW()
               AND NOT responded
      → Aggiorna status = 'followup_2_queued'

      → Trova: prospects WHERE status='followup_2_sent'
               AND (followup_2_sent_at + 3 days) <= NOW()
               AND NOT responded
      → Aggiorna status = 'archived'
      → Log: "Archiviato prospect [nome] — 3 tentativi senza risposta"

2. Esegui coda 'profile-analysis' (max 20 profili per ciclo)
   → Per ogni profilo: chiama profileAnalyzer.analyze(prospect)

3. Invia Telegram morning report:
   "🌅 Riassunto mattina:
    - N nuove connessioni accettate
    - N profili analizzati
    - N follow-up in coda
    ⚡ [se > 0 risposte ricevute] ATTENZIONE: N prospect hanno risposto!"
```

## 21. JOB MIDDAY — Search Job

```
Esecuzione: 11:30 ± 15min

Per ogni agente ACTIVE:
  1. SELEZIONA STRUTTURA
     → Seleziona struttura non eseguita più di recente (orderBy lastExecutedAt ASC)
     → Max 1 struttura per agente per ciclo

  2. ESEGUI RICERCA
     → Chiama searchEngine.run(structure)
     → Risultati: array di profili LinkedIn

  3. FILTRO PROFILI ANONIMI
     → isAnonymousProfile(profile): restituisce true se:
        * fullName include "Utente LinkedIn", "LinkedIn Member", "LinkedIn User"
        * firstName è assente o vuoto E lastName è assente o vuoto
        * fullName corrisponde a pattern generico: /^(utente|member|user)\s*linkedin$/i
     → Scarta profili anonimi SENZA salvarli in DB
     → Logga il numero di profili scartati per anonimato

  4. DEDUPLICATION
     → Per ogni profilo: check se linkedinId già in prospects (qualsiasi agente)
     → Scarta duplicati

  5. SCORING
     → Per ogni nuovo profilo: scoreProspect(profile, agentConfig)
     → Score >= 50: status = 'queued'
     → Score < 50: status = 'found' (salvato ma non in coda)

  6. SALVA
     → Crea record in DB per ogni nuovo prospect
     → Aggiorna searchStructure.lastExecutedAt, totalResultsFound, newResultsLastRun
```

## 22. JOB POMERIGGIO — Outreach Job

```
Esecuzione: 14:00 ± 15min

1. BUDGET CALCULATION
   → Legge da Redis: inviti_inviati_oggi (contatore giornaliero, reset a mezzanotte)
   → Legge da Redis: inviti_inviati_questa_settimana (contatore settimanale, reset ogni lunedì)
   → Se inviti_settimana >= 150: STOP — budget settimanale esaurito, nessun invito oggi
   → Se inviti_oggi >= 21: STOP — cap giornaliero raggiunto
   → Budget residuo giornaliero = min(21 - inviti_oggi, 150 - inviti_settimana)
   → Distribuzione tra agenti attivi secondo i dailyConnectionRequests configurati:
      NUMA-B2B: 9/g (60/sett), AI-TRAINING: 10/g (70/sett), NUMA-INVESTOR: 3/g (20/sett)

2. Per ogni agente ACTIVE (ordinati per priority):
   a. CONNECTION REQUESTS (inviti SENZA messaggio — limite LinkedIn Free ~150/sett)
      → Prendi prospects[status='queued', orderBy score DESC]
      → Limita a budget.dailyConnectionRequests per questo agente
      → Per ognuno:
         * Chiama unipile.sendInvitation({ account_id, provider_id: prospect.linkedinId })
           // NESSUN campo "message" — invito senza nota
         * prospect.status = 'connection_sent'
         * prospect.connectionRequestSentAt = now()
         * Incrementa contatori Redis: inviti_oggi++, inviti_settimana++
         * Se contatori >= limite: interrompi loop e logga "budget esaurito"
         * Attendi random(120, 300) secondi  // 2-5 minuti tra un invito e l'altro

   b. INTRO MESSAGES
      → Prendi prospects[status='ready_for_outreach']
      → Per ognuno:
         * Genera messaggio: outreachAgent.generateIntro(prospect, identity)
         * Chiama unipile.sendMessage(prospect.linkedinId, content)
         * Crea Message record (sequenceNumber=1)
         * prospect.status = 'intro_sent'
         * Attendi random(180, 420) secondi  // 3-7 minuti

   c. FOLLOWUP MESSAGES
      → Prendi prospects[status='followup_1_queued' OR status='followup_2_queued']
      → Per ognuno:
         * Genera follow-up: outreachAgent.generateFollowup(prospect, identity, sequenceNumber)
         * Invia messaggio
         * Aggiorna status e crea Message record
         * Attendi random(180, 420) secondi
```

## 23. JOB SERA — Evening Job

```
Esecuzione: 18:30 ± 15min

1. COMPILA DAILY LOG
   → Per ogni agente: aggrega metriche del giorno
   → Crea DailyLog record

2. AGGIORNA STATS AGENTE
   → Ricalcola acceptance_rate_7d, response_rate_7d
   → Salva in Agent.statsJson

3. INVIA REPORT TELEGRAM (riepilogo breve)
   "📊 Report [data]
   NUMA-B2B: +N prospect | N inviti | N acc. | N msg | N risp.
   AI-TRAIN:  +N prospect | N inviti | N acc. | N msg | N risp.
   INVESTOR:  +N prospect | N inviti | N acc. | N msg | N risp.
   ⚡ Risposte ricevute oggi: N
   → Report completo in email"

4. INVIA REPORT EMAIL GIORNALIERO
   → Destinatario: daniel.dallapalma@gmail.com
   → Orario: Settings.reportEmailTime (default 19:00)
   → Via Resend API
   → Vedi §35 per il formato completo del report email

5. MANUTENZIONE
   → Archivia OperationLog più vecchi di 30gg
   → Reset contatori giornalieri Redis a mezzanotte (cron separato 00:00)
   → Reset contatori settimanali Redis ogni lunedì 00:00 (cron separato)
```

## 23b. JOB DOMENICA — Network Analysis Job

```
Esecuzione: ogni domenica alle 08:00 (job settimanale)
Scopo: analizzare la rete LinkedIn esistente e trovare collegamenti
       già acquisiti che rispettano i criteri di ricerca degli agenti attivi.

1. FETCH RETE ESISTENTE
   → Chiama unipile.listRelations(accountId)
   → Ottieni lista completa di tutti i collegamenti di primo grado
   → Filtra: escludi linkedinId già presenti nel DB (già tracciati, qualsiasi agente)
   → Risultato: lista di "nuovi da analizzare"

2. FETCH PROFILI (in batch, max 20 per ciclo per non sovraccaricare)
   → Per ogni collegamento da analizzare:
     * Chiama unipile.getProfile(linkedinId) → dati completi
     * Attendi random(10, 30) secondi tra una chiamata e l'altra

3. FILTRO PROFILI ANONIMI
   → Per ogni profilo recuperato: applica isAnonymousProfile(profile)
     * Scarta se fullName include "Utente LinkedIn", "LinkedIn Member", "LinkedIn User"
     * Scarta se firstName e lastName entrambi assenti/vuoti
     * Scarta se pattern: /^(utente|member|user)\s*linkedin$/i
   → Profili scartati: salva come status='existing_irrelevant' (o semplicemente ignora)
   → Non consumano budget né slot di outreach

4. SCORING PER OGNI AGENTE ATTIVO
   → Per ogni profilo recuperato:
     * Applica scoreProspect(profile, agentConfig) per OGNI agente attivo
     * Risultato: { numa_b2b: 72, ai_training: 45, numa_investor: 20 }
     * Assegna al agente con score più alto SE supera la soglia minima (≥50)
     * Se nessun agente supera la soglia: salva come discoveryMethod='existing_network',
       status='existing_irrelevant' → non verrà mai contattato
     * Se qualifica per più agenti con score simile (differenza <10): agente priorità più alta

5. VERIFICA CONVERSAZIONI ESISTENTI
   → Per ogni collegamento qualificato:
     * Chiama unipile.listChats(accountId) → cerca chat con quel linkedinId
     * Se chat trovata:
       - Chiama unipile.getChatMessages(chatId, { limit: 10 })
       - Analizza: c'è un messaggio negli ultimi 30 giorni?
           → SÌ: status = 'active_conversation'  // NON contattare
       - L'utente ha risposto in qualsiasi momento?
           → SÌ: status = 'responded_manually'  // NON contattare
       - Solo vecchi messaggi di NuMa senza risposta (>30gg)?
           → Genera sintesi AI degli ultimi messaggi
           → hasPriorConversation = true
           → priorConversationSummary = [sintesi]
           → status = 'existing_queued'  // contattabile con messaggio warm contestuale
     * Se nessuna chat trovata:
       → hasPriorConversation = false
       → status = 'existing_queued'  // contattabile con messaggio warm standard

6. SALVA NEL CONTACT REPOSITORY
   → Crea record Prospect con:
     * discoveryMethod = 'existing_network'
     * connectionAcceptedAt = data di quando si sono collegati (stimata: discoveredAt)
     * status = come determinato al punto 5
     * agentId = agente assegnato
   → NON invia nulla oggi — i messaggi warm vengono accodati nel JOB POMERIGGIO
     dei giorni successivi, trattati come 'ready_for_outreach' warm

7. LOG E REPORT
   → Logga: N nuovi collegamenti analizzati, N qualificati (per agente),
            N con conversazione attiva (saltati), N pronti per warm outreach
   → Invia notifica Telegram:
     "🔍 Network Analysis completata:
      • N nuovi collegamenti analizzati
      • N qualificati per outreach warm
        (NUMA-B2B: N | AI-TRAINING: N | INVESTOR: N)
      • N saltati (conversazione attiva)
      • N irrilevanti"
```

### Messaggi Warm vs Cold — Differenze chiave

Il flag `discoveryMethod = 'existing_network'` cambia il comportamento dell'Outreach Agent:

```typescript
// outreach-agent.ts

if (prospect.discoveryMethod === 'existing_network') {
  // WARM: sei già collegato, forse vi conoscete
  // Il sistema usa warmMessage1Template invece di message1Template
  // Regole aggiuntive:
  // - Non presentarti (vi conoscete già)
  // - Se hasPriorConversation=true: tieni conto del contesto pregresso
  // - Tono più diretto, meno "pitch", più "confronto tra professionisti"
  // - Se priorConversationSummary presente: usalo per non ripetere
  //   cose già dette e scegliere un angolo completamente nuovo

  if (prospect.hasPriorConversation && prospect.priorConversationSummary) {
    return generateWarmMessageWithContext(prospect, identity)
    // Prompt speciale: "Ecco cosa ti ho già scritto in passato: [summary].
    //  Scrivi un messaggio che NON ripeta gli stessi punti, usando un
    //  angolo completamente diverso."
  } else {
    return generateWarmMessageFresh(prospect, identity)
  }

} else {
  // COLD: primo contatto dopo connection request accettata
  return generateColdIntroMessage(prospect, identity)
}
```

### Configurazione messagingConfig aggiornata (per agente)

```json
{
  "message1Template": "...",          // cold — post accettazione nuova connessione
  "message2Template": "...",          // cold — follow-up giorno 3
  "message3Template": "...",          // cold — last chance giorno 10
  "warmMessage1Template": "...",      // warm — collegamento esistente, no chat pregressa
  "warmMessageWithContextTemplate": "...", // warm — collegamento con chat pregressa
  "warmFollowup1Template": "...",     // warm — follow-up giorno 3
  "warmFollowup2Template": "...",     // warm — last chance giorno 10
  "cta": {
    "cold1": "call_15min",
    "cold2": "send_link",
    "cold3": "minimal_curiosity",
    "warm1": "call_or_coffee",        // più informale per chi già conosci
    "warm2": "send_resource"
  }
}
```

## 24. Search Engine

### Modalità LinkedIn Free
```typescript
// Con LinkedIn Free, la ricerca si basa su keyword
// Unipile: searchPeople({ keywords, location })

function buildFreeQuery(structure: SearchStructure): string {
  const { titleKeywords, locationKeywords } = structure.queryConfig
  // Esempio: "(Titolare OR Proprietario OR Owner) Milano Ristorante"
  return `(${titleKeywords.join(' OR ')}) ${locationKeywords.join(' ')} ${modifiers.join(' ')}`
}
```

**Limitazioni LinkedIn Free:**
- Nessun filtro per industry, company size, seniority
- Risultati limitati (~10 per ricerca)
- Nessuna ricerca booleana avanzata
- Max ~100 profile views/mese visibili in risultati
- **Impatto:** strutture di ricerca meno precise, più falsi positivi, scoring più importante

### Modalità Sales Navigator (quando upgrade)
```typescript
function buildSalesNavQuery(structure: SearchStructure): object {
  return {
    keywords: titleKeywords,
    locations: locationKeywords,
    industries: industryKeywords,
    companyHeadcount: companySizes,
    seniority: seniorityLevels,
    function: jobFunctions
  }
}
```

### Filtro Profili Anonimi & Deduplication

```typescript
// deduplication.ts

// Lista nomi anonimi da escludere (case-insensitive)
const ANONYMOUS_NAME_PATTERNS = [
  /^utente\s+linkedin$/i,
  /^linkedin\s+member$/i,
  /^linkedin\s+user$/i,
  /^membro\s+linkedin$/i,
  /^member$/i,
]

/**
 * Restituisce true se il profilo è anonimo/placeholder.
 * Applicato PRIMA di qualsiasi salvataggio in DB o scoring.
 */
export function isAnonymousProfile(profile: LinkedInProfile): boolean {
  const fullName = (profile.fullName || '').trim()
  const firstName = (profile.firstName || '').trim()
  const lastName = (profile.lastName || '').trim()

  // Nessun nome disponibile
  if (!firstName && !lastName && !fullName) return true

  // Corrisponde a pattern anonimi noti
  if (ANONYMOUS_NAME_PATTERNS.some(pattern => pattern.test(fullName))) return true

  return false
}

/**
 * Deduplication cross-agente: verifica se il linkedinId
 * è già presente in prospects per qualsiasi agente.
 */
export async function isDuplicate(linkedinId: string): Promise<boolean> {
  const existing = await db.prospect.findFirst({
    where: { linkedinId },
    select: { id: true }
  })
  return existing !== null
}

/**
 * Pipeline di pre-filtering: anonimato + deduplication.
 * Restituisce solo i profili nuovi e validi da processare.
 */
export async function filterProfiles(
  profiles: LinkedInProfile[]
): Promise<{ valid: LinkedInProfile[]; skippedAnonymous: number; skippedDuplicates: number }> {
  let skippedAnonymous = 0
  let skippedDuplicates = 0
  const valid: LinkedInProfile[] = []

  for (const profile of profiles) {
    if (isAnonymousProfile(profile)) {
      skippedAnonymous++
      continue
    }
    if (await isDuplicate(profile.linkedinId)) {
      skippedDuplicates++
      continue
    }
    valid.push(profile)
  }

  logger.info(`filterProfiles: ${valid.length} validi | ${skippedAnonymous} anonimi scartati | ${skippedDuplicates} duplicati scartati`)
  return { valid, skippedAnonymous, skippedDuplicates }
}
```

> **Nota:** `filterProfiles()` è chiamata sia dal Search Job (step 3-4) che dal Network Analysis Job (step 3) prima di qualsiasi scoring o salvataggio. I profili anonimi non vengono mai persistiti in DB.

## 25. Acceptance Monitor

Unipile supporta webhook real-time. Come fallback, il sistema fa polling ogni 4 ore.

```typescript
// webhook handler
app.post('/api/webhooks/unipile', async (req) => {
  const event = req.body

  // Unipile evento: nuova connessione accettata
  if (event.type === 'new_relation') {
    const prospect = await db.prospect.findFirst({
      where: { linkedinId: event.account_id, status: 'connection_sent' }
    })
    if (prospect) {
      await db.prospect.update({
        where: { id: prospect.id },
        data: { status: 'connection_accepted', connectionAcceptedAt: new Date() }
      })
    }
  }

  // Unipile evento: nuovo messaggio ricevuto
  if (event.type === 'message_received') {
    const prospect = await db.prospect.findFirst({
      where: { linkedinId: event.fromLinkedinId }
    })
    if (prospect) {
      // Salva risposta
      await db.message.create({ data: { direction: 'inbound', content: event.text, ... } })
      // Ferma automazione
      await db.prospect.update({ where: { id: prospect.id }, data: { status: 'responded' } })
      // Notifica immediata
      await telegram.sendAlert(`⚡ RISPOSTA da ${prospect.fullName}!\n"${event.text.slice(0, 100)}..."`)
    }
  }
})
```

---

# PARTE VI — SISTEMA AGENTI E IDENTITY BUILDER

## 26. Profile Analysis Agent

```typescript
// profile-analyzer.ts

async function analyzeProfile(prospect: Prospect, identity: Identity): Promise<ProfileAnalysis> {
  const systemPrompt = `
Sei un assistente che analizza profili LinkedIn per conto di ${identity.personaName}.
${identity.fullContextPrompt}

Il tuo compito è analizzare il profilo di un prospect e produrre un JSON strutturato.
`

  const userPrompt = `
Analizza questo profilo LinkedIn:

Nome: ${prospect.fullName}
Headline: ${prospect.headline}
Profilo completo: ${JSON.stringify(prospect.rawProfileData)}

Produci un JSON con questa struttura esatta:
{
  "businessContext": "sintesi del business in 2-3 frasi",
  "activityLevel": "high|medium|low",
  "painPoints": ["...", "..."],
  "contactPointsWithUs": ["...", "..."],
  "relevantPosts": ["..."],
  "recommendedAngle": "...",
  "toneRecommendation": "...",
  "notes": "..."
}
`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt
  })

  return JSON.parse(response.content[0].text)
}
```

## 27. Outreach Agent — Generazione Messaggi

```typescript
// outreach-agent.ts

async function generateMessage(
  prospect: Prospect,
  identity: Identity,
  sequenceNumber: 1 | 2 | 3,
  previousMessages?: Message[]
): Promise<string> {

  const systemPrompt = `
Sei ${identity.personaName} (${identity.role}).
${identity.fullContextPrompt}

REGOLE ASSOLUTE PER I MESSAGGI:
- Max 7 righe totali
- Una sola CTA per messaggio
- NON usare frasi generiche tipo "Spero tu stia bene" o "Mi chiamo X e sono..."
- NON menzionare competitor
- Scrivi in prima persona, tono naturale italiano
- Il messaggio deve sembrare scritto a mano, non generato da AI
- ${identity.doNotSay.map(r => `NON fare: ${r}`).join('\n- ')}
`

  let userPrompt = ''

  if (sequenceNumber === 1) {
    userPrompt = `
Scrivi il PRIMO messaggio a ${prospect.firstName} (${prospect.headline}).

Analisi del suo profilo:
${JSON.stringify(prospect.profileAnalysis)}

Angolo raccomandato: ${prospect.profileAnalysis.recommendedAngle}
CTA: chiedi 15 minuti di call questa settimana

Priorità di personalizzazione:
1. Se ci sono post rilevanti, usali come aggancio naturale
2. Se no, usa il nome del locale/azienda + zona
3. Fallback: usa il tipo di ruolo + pain point principale
`
  } else if (sequenceNumber === 2) {
    userPrompt = `
Scrivi il SECONDO messaggio a ${prospect.firstName}.

IMPORTANTE: cambia completamente angolo rispetto al primo messaggio.
NON menzionare che hai già scritto.

Primo messaggio inviato (per coerenza, NON per menzionarlo):
"${previousMessages[0].content}"

Angolo del primo: ${prospect.profileAnalysis.recommendedAngle}
Usa un pain point DIVERSO: ${prospect.profileAnalysis.painPoints[1] || prospect.profileAnalysis.painPoints[0]}
CTA diversa: proponi di mandare una risorsa o il link al progetto
`
  } else {
    userPrompt = `
Scrivi il TERZO e ULTIMO messaggio a ${prospect.firstName}.

Messaggio brevissimo (max 4 righe). È l'ultimo tentativo.
Angolo completamente nuovo rispetto ai precedenti.
Includi il link ${identity.companyContext.website}
CTA minima: solo curiosità, zero pressione
`
  }

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 300,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt
  })

  return response.content[0].text
}
```

## 28. Identity Builder

```typescript
// identity-builder.ts

async function buildIdentityFromDocuments(
  documents: IdentityDocument[],
  agentContext: string
): Promise<IdentityPackage> {

  // Step 1: Estrai testo da ogni documento
  const extractedTexts = await Promise.all(
    documents.map(doc => documentProcessor.extract(doc))
  )

  const combinedText = extractedTexts.join('\n\n---\n\n')

  // Step 2: Chiedi a Claude di sintetizzare
  const systemPrompt = `
Sei un assistente specializzato nell'analizzare documenti aziendali e professionali
per costruire un "Identity Package" strutturato.
`

  const userPrompt = `
Analizza questi documenti e costruisci un Identity Package JSON.

Contesto agente: ${agentContext}

Documenti:
${combinedText}

Produci un JSON con questa struttura:
{
  "personaName": "...",
  "role": "...",
  "company": "...",
  "toneProfile": {
    "formality": "formal|semi-formal|informal",
    "style": "...",
    "avoid": ["...", "..."],
    "highlights": ["...", "..."]
  },
  "companyContext": {
    "description": "...",
    "stage": "...",
    "traction": ["...", "..."],
    "valueProposition": "...",
    "differentiators": ["...", "..."],
    "website": "..."
  },
  "credibilityMarkers": ["...", "..."],
  "doNotSay": ["...", "..."],
  "fullContextPrompt": "...  (system prompt completo, 150-200 parole, in prima persona)"
}
`

  const response = await claude.messages.create({
    model: 'claude-opus-4-5-20251101',  // Opus per questo task critico
    max_tokens: 2000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt
  })

  return JSON.parse(response.content[0].text)
}
```

## 29. Configurazione dei 3 Agenti

### 29.1 Agent: NUMA-B2B

```yaml
id: numa_b2b
name: "NumaMenu — Ristoratori Milano"
status: active
identity: numa_numa_b2b   # da costruire con Identity Builder

targetConfig:
  jobTitles:
    - "Titolare" - "Proprietario" - "Owner" - "CEO" - "Fondatore"
    - "Founder" - "Gestore" - "Patron" - "Ristoratore" - "Chef-Owner"
    - "Managing Director" - "Co-founder" - "Socio" - "Imprenditore"
  locationKeywords:
    - "Milano" - "Milan"
  industryKeywords:
    - "Ristorazione" - "Ristorante" - "Trattoria" - "Osteria" - "Pizzeria"
    - "Bistrot" - "Wine bar" - "F&B" - "HORECA" - "HoReCa" - "Food"
  exclusions:
    - "McDonald's" - "Burger King" - "Pizza Hut"  # grandi franchise
    - profili senza foto
    - profili inattivi da > 6 mesi
    - profili anonimi: "Utente LinkedIn", "LinkedIn Member", "LinkedIn User"
  minScore: 50

messagingConfig:
  connectionNote: "Ciao {firstName}, mi occupo di soluzioni digitali per la ristorazione. Bello connetterci!"
  cta1: "call_15min"
  cta2: "send_link"
  cta3: "minimal_curiosity"
  # NESSUNA connectionNote — gli inviti vengono inviati senza messaggio

weeklyConnectionRequests: 60   # 60 su 150 totali settimanali
dailyConnectionRequests: 9     # 60/7 arrotondato
dailyMessages: 8               # messaggi post-accettazione
priority: 1
linkedinMode: free  # diventa sales_navigator quando upgrade
```

**Strutture di ricerca NUMA-B2B (100 strutture base per LinkedIn Free):**

Le strutture per LinkedIn Free usano combinazioni keyword semplici:
```
"Titolare ristorante Milano"
"Proprietario pizzeria Milano"
"Owner bistrot Milano"
"Fondatore trattoria Milano"
"Gestore osteria Milano"
"Chef owner Milano"
"Ristoratore Milano Navigli"
"Titolare locale Milano Brera"
"Proprietario wine bar Milano"
"Fondatore locale Milano Isola"
[... fino a 100 combinazioni variando titolo + tipo locale + zona]
```

### 29.2 Agent: NUMA-INVESTOR

```yaml
id: numa_investor
name: "NumaMenu — Investitori"
status: active
identity: numa_numa_investor

targetConfig:
  jobTitles:
    - "Business Angel" - "Angel Investor" - "Investor" - "Partner VC"
    - "Venture Capital" - "Early Stage Investor" - "Seed Investor"
    - "Managing Partner" - "Investment Director" - "Portfolio Manager"
  locationKeywords:
    - "Milano" - "Italy" - "Italia"
  industryKeywords:
    - "Food Tech" - "Food" - "HORECA" - "Restaurant" - "Startup"
    - "Venture" - "Investment" - "Angel" - "Seed"
  minScore: 55

weeklyConnectionRequests: 20   # 20 su 150 totali settimanali
dailyConnectionRequests: 3     # 20/7 arrotondato
dailyMessages: 5               # messaggi post-accettazione
priority: 2
```

### 29.3 Agent: AI-TRAINING

```yaml
id: ai_training
name: "AI Training — HR & L&D Milano"
status: paused   # da attivare dopo upload documenti identità

targetConfig:
  jobTitles:
    - "HR Manager" - "HR Director" - "Head of People" - "Chief People Officer"
    - "CPO" - "L&D Manager" - "Learning Development Manager"
    - "Responsabile Formazione" - "Training Manager" - "Head of Learning"
    - "People & Culture" - "Talent Development" - "CLO"
    - "Responsabile Risorse Umane" - "Direttore HR"
  locationKeywords:
    - "Milano"
  companySize:
    - "50-200" - "201-500" - "500+"
  industries:
    - "Consulenza" - "Finance" - "Banking" - "Insurance"
    - "Manufacturing" - "Retail" - "Technology" - "Healthcare"
  minScore: 50

weeklyConnectionRequests: 70   # 70 su 150 totali settimanali
dailyConnectionRequests: 10    # 70/7 arrotondato
dailyMessages: 8               # messaggi post-accettazione
priority: 1

# NOTA: identity.fullContextPrompt da completare dopo upload
# documenti dell'azienda AI di NuMa
```

> **ACTION REQUIRED:** Per attivare AI-TRAINING, caricare i documenti
> dell'azienda di formazione AI nella sezione Identità → Crea identità
> da documenti. L'agente è pre-configurato ma ha bisogno dell'Identity
> Package approvato prima del go-live.

---

# PARTE VII — FRONTEND

## 30. Architettura Frontend

Single Page Application React servita su porta 3000, stessa origine del backend (Express serve i file statici della build in produzione). In sviluppo: Vite su porta 5173 con proxy verso API Express su porta 3001.

## 31. Pagine e Contenuto

### /login
```
┌───────────────────────────────────────────────────────┐
│                                                        │
│              LinkedIn Platform                         │
│                                                        │
│         ┌─────────────────────────────┐               │
│         │  Email                       │               │
│         └─────────────────────────────┘               │
│         ┌─────────────────────────────┐               │
│         │  Password                   │               │
│         └─────────────────────────────┘               │
│         [          Accedi             ]               │
│                                                        │
└───────────────────────────────────────────────────────┘
```

### /dashboard (Home)
```
┌────────────────────────────────────────────────────────┐
│ LinkedIn Platform    [⚡ 2 risposte!]    [🔔] [⚙️] [👤] │
├──────────┬─────────────────────────────────────────────┤
│          │                                             │
│ Dashboard│  ┌─────────────────────────────────────────┐│
│ Agents   │  │ OGGI — 26 Feb 2026                       ││
│ Prospects│  │  Req inviate: 13 │ Accettate: 4 │ Msg: 21││
│ Analytics│  └─────────────────────────────────────────┘│
│ Logs     │                                             │
│ Settings │  ┌──────────────┐ ┌──────────────┐         │
│          │  │ NUMA-B2B  🟢 │ │ AI-TRAINING 🟢│         │
│          │  │ acc: 34%     │ │ acc: 28%      │         │
│          │  │ resp: 12.8%  │ │ resp: 8.1%    │         │
│          │  │ [Pausa][Det] │ │ [Pausa][Det]  │         │
│          │  └──────────────┘ └──────────────┘         │
│          │  ┌──────────────┐                          │
│          │  │ NUMA-INV  🟡 │  [+ Nuovo agente]        │
│          │  │ acc: 21%     │                          │
│          │  │ resp: 6.4%   │                          │
│          │  │ [Pausa][Det] │                          │
│          │  └──────────────┘                          │
│          │                                             │
│          │  ⚡ RISPOSTE RICEVUTE                        │
│          │  ┌──────────────────────────────────────── ┐│
│          │  │ Marco Bianchi (NUMA-B2B) — 2h fa        ││
│          │  │ "Certo, mi piacerebbe..."  [Apri]       ││
│          │  ├─────────────────────────────────────────┤│
│          │  │ Laura Rossi (AI-TRAINING) — 4h fa       ││
│          │  │ "Interessante, quando..."  [Apri]       ││
│          │  └─────────────────────────────────────────┘│
└──────────┴─────────────────────────────────────────────┘
```

### /agents
```
Lista degli agenti con card per ognuno. Ogni card mostra:
- Nome, status badge (🟢 Attivo / 🟡 Pausa / ⚫ Archiviato)
- Metriche principali (acceptance rate, response rate)
- Prospect totali, connessioni attive, rispondenti
- Azioni rapide: [Attiva/Pausa] [Modifica] [Dettaglio]
- [+ Crea nuovo agente] in alto a destra
```

### /agents/:id (Dettaglio Agente)
```
Tabs:
[Panoramica] [Prospect] [Strutture Ricerca] [Configurazione] [Log]

Tab Panoramica:
- Grafico funnel (found→queued→connected→outreach→responded)
- Statistiche ultime 7/30 gg
- Acceptance rate trend (linechart)
- Ultimi prospect contattati

Tab Prospect:
- Tabella filtrabile: nome, headline, status, data, score
- Click su riga → drawer con dettaglio prospect + messaggi

Tab Strutture Ricerca:
- Lista strutture con: nome, ultima esecuzione, risultati
- Bottoni: [Esegui ora] [Modifica] [Abilita/Disabilita] [Elimina]
- [+ Aggiungi struttura] [📥 Import bulk JSON]

Tab Configurazione:
- Form modifica configurazione agente
- Sezione: Identity (dropdown selezione)
- Sezione: Target (job titles, location, industry, score min)
- Sezione: Messaggi (template preview con variabili)
- Sezione: Budget (connection requests/day, messages/day, priority)

Tab Log:
- Stream log filtrato per questo agente
```

### /agents/new (Wizard creazione agente — 5 step)

```
Step 1/5 — Identità
┌────────────────────────────────────────────────────┐
│ Che identità usa questo agente?                     │
│                                                    │
│ ○ Usa identità esistente                           │
│   [dropdown: numa_base | numa_numa | ...]         │
│                                                    │
│ ○ Crea nuova identità                              │
│   > Carica documenti (PDF, PPTX)                   │
│   > Onboarding guidato (domande)                   │
└────────────────────────────────────────────────────┘
                           [Avanti →]

Step 2/5 — Target
[Form: nome agente, obiettivo, job titles, location,
 industry, dimensione azienda, criteri esclusione,
 score minimo]

Step 3/5 — Messaggi
[Preview messaggio 1 (generato live da AI), tono,
 template message 2 e 3, CTA per ogni step]

Step 4/5 — Budget
[Slider: connection requests/day (1-15),
 messages/day (1-25), priority (1-3),
 LinkedIn mode: free / sales_navigator]

Step 5/5 — Review & Launch
[Identity Card completa, messaggio esempio,
 configurazione target, budget]
[← Modifica] [🚀 Crea e attiva agente]
```

### /prospects
```
Tabella globale tutti i prospect (tutti gli agenti).

Filtri: Agente | Status | Data da/a | Score min | Cerca per nome

Colonne: Nome, Agente, Headline, Status (badge colorato),
         Connessione (data), Ultimo msg (data), Score, Azioni

Click su riga → Drawer laterale con:
  - Profilo prospect (foto, nome, headline, location)
  - Status attuale con timeline visuale
  - Profile Analysis (pain points, contact points, notes)
  - Messaggi inviati/ricevuti in ordine cronologico
  - Campo note manuale (editabile)
  - Bottone [Archivia] [Segna opt-out] [Apri su LinkedIn]
```

### /analytics
```
Selector: [Tutti gli agenti] [NUMA-B2B] [AI-TRAINING] [NUMA-INVESTOR]
Periodo: [7 giorni] [30 giorni] [90 giorni]

KPI cards:
[Prospect trovati] [Connessioni inviate] [Acceptance rate] [Response rate]

Grafici:
1. Linechart: acceptance rate nel tempo (una linea per agente)
2. Barchart: attività giornaliera (req inviate, accettate, messaggi)
3. Funnel chart: found→queued→connected→intro→followup1→followup2→responded
4. Table: top strutture di ricerca per qualità (score medio prospect)
5. Pie chart: distribuzione status prospect
```

### /logs
```
[Filtri: Agente | Job | Level (info/warn/error) | Cerca]
[Pulsante: 🔴 Live — aggiorna in tempo reale via WebSocket]

Stream di log in stile terminale:
2026-02-26 14:02:31 [INFO]  [numa_b2b] [afternoon] Connection request sent → Marco Bianchi
2026-02-26 14:05:47 [INFO]  [numa_b2b] [afternoon] Message 1 sent → Laura Verdi
2026-02-26 14:06:02 [WARN]  [numa_b2b] [afternoon] Rate limit approaching — slowing down
2026-02-26 14:08:11 [INFO]  [ai_training] [afternoon] Profile analyzed → Giulio Mancini
2026-02-26 14:08:44 [ERROR] [numa_investor] Search failed — Unipile timeout
```

### /settings
```
Tabs: [Connessioni API] [LinkedIn] [Notifiche] [Sistema] [Sicurezza]

Tab Connessioni API:
  - Unipile API Key (masked) + [Test connessione]
  - Claude API Key (masked) + [Test connessione]
  - Telegram Bot Token + Chat ID + [Invia messaggio test]
  - [Salva]

Tab LinkedIn:
  - LinkedIn Mode: [Free] [Premium Business] [Sales Navigator]
  - Account connesso (mostra info via Unipile)
  - Budget globale giornaliero: connection requests, messaggi
  - [Controlla salute account]

Tab Notifiche:
  - Notifica risposta ricevuta: [✓ Telegram] (immediata)
  - Alert errori critici: [✓ Telegram] (immediata)
  - Report breve Telegram: [✓]  ora invio: [18:30]
  ──────────────────────────────────────────────
  - Report email giornaliero completo: [✓ Abilitato]
  - Destinatario email: [daniel.dallapalma@gmail.com]
  - Orario invio email: [19:00]
  - Resend API Key: [••••••••] + [Invia email di test]
  - [Salva]

Tab Sistema:
  - Orari job: mattina, mezzogiorno, pomeriggio, sera
  - Timezone: Europe/Rome
  - Randomizzazione orari: ± [15] minuti

Tab Sicurezza:
  - Cambia password
  - Sessioni attive
  - [Backup database ora]
```

---

# PARTE VIII — INTEGRAZIONI ESTERNE

## 32. Unipile API Gateway

```typescript
// unipile.client.ts

import { UnipileClient } from '@unipile/node-sdk'

export const unipile = new UnipileClient({
  token: process.env.UNIPILE_API_KEY,
  baseUrl: 'https://api1.unipile.com:13465'  // endpoint API Unipile
})

// Tutti i metodi usati:
// unipile.users.getProfile(accountId, linkedinId)
// unipile.messaging.search(accountId, { keywords, ... })
// unipile.users.sendInvitation(accountId, { providerId, message? })
// unipile.messaging.sendMessage(accountId, { attendeeProviderId, text })
// unipile.users.getInvitations(accountId, { status, since })
// unipile.messaging.getMessages(accountId, { since })
```

**Rate Limiting Wrapper:**
```typescript
// rate-limiter.ts
// Gestisce automaticamente i limiti giornalieri
// Tiene counter in Redis per ogni tipo di azione
// Lancia eccezione se limite raggiunto (il job si ferma)

class LinkedInRateLimiter {
  private limits = {
    connectionRequestsDaily:  21,   // cap giornaliero (150/7)
    connectionRequestsWeekly: 150,  // limite LinkedIn Free — inviti senza messaggio
    messages: 25,                   // messaggi post-accettazione, globale/giorno
    profileViews: 80,               // globale/giorno
    searches: 10                    // globale/giorno
  }

  // I contatori weekly vengono resettati ogni lunedì a 00:00 (cron job dedicato)
  // I contatori daily vengono resettati ogni giorno a 00:00

  async check(action: string): Promise<boolean>
  async increment(action: string): Promise<void>
  async getRemaining(action: string): Promise<number>
  async resetDaily(): Promise<void>  // chiamato a mezzanotte
}
```

## 33. Telegram Bot

```typescript
// telegram.bot.ts

import TelegramBot from 'node-telegram-bot-api'

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Messaggi standard
export const telegram = {

  async sendAlert(message: string) {
    await bot.sendMessage(CHAT_ID, `⚡ *ALERT*\n${message}`, { parse_mode: 'Markdown' })
  },

  async sendResponse(agentName: string, prospectName: string, preview: string) {
    await bot.sendMessage(CHAT_ID,
      `⚡ *RISPOSTA RICEVUTA*\n\n` +
      `👤 *${prospectName}* (${agentName})\n\n` +
      `"${preview}"\n\n` +
      `→ Intervieni tu su LinkedIn`,
      { parse_mode: 'Markdown' }
    )
  },

  async sendDailyReport(report: DailyReportData) {
    // Formatta report multi-agente e lo invia
  },

  async sendMorningBriefing(data: MorningBriefingData) {
    // Riepilogo mattina
  },

  async sendError(agentId: string, error: string) {
    await bot.sendMessage(CHAT_ID, `🔴 *ERRORE* [${agentId}]\n${error}`, { parse_mode: 'Markdown' })
  }
}
```

**Setup Telegram Bot:**
1. Crea bot su Telegram con @BotFather → ottieni token
2. Manda un messaggio al bot dal tuo account Telegram
3. Chiama `https://api.telegram.org/bot{TOKEN}/getUpdates` per trovare il tuo chat_id
4. Inserisci token e chat_id in Settings

## 34. Email Report — Resend Integration

### Setup
```typescript
// email.client.ts
import { Resend } from 'resend'
export const resend = new Resend(process.env.RESEND_API_KEY)
// Piano free Resend: 3.000 email/mese, 100/giorno — più che sufficiente
```

### Formato del report email giornaliero

Il report viene inviato ogni sera alle 19:00 a **daniel.dallapalma@gmail.com**.
È un'email HTML con una struttura a sezioni chiare e leggibili anche da mobile.

```
OGGETTO: 📊 LinkedIn Report — 26 Feb 2026 | 3 risposte ricevute

────────────────────────────────────────────────────
⚡  RISPOSTE RICEVUTE OGGI  (richiede la tua attenzione)
────────────────────────────────────────────────────
1. Marco Bianchi — NUMA-B2B
   Messaggio: "Sì certo, ti va giovedì prossimo?"
   → Apri la conversazione su LinkedIn

2. Laura Verdi — AI-TRAINING
   Messaggio: "Interessante, mi mandi qualcosa in più?"
   → Apri la conversazione su LinkedIn

────────────────────────────────────────────────────
📋  ATTIVITÀ DI OGGI
────────────────────────────────────────────────────

NUMA-B2B (Ristoratori Milano)
┌─────────────────────────────────────────────────┐
│ Nuovi prospect trovati      │        18          │
│ Inviti inviati              │         9          │
│ Connessioni accettate       │         3          │
│ Profili analizzati          │         3          │
│ ─────────────────────────── │ ────────────────── │
│ Messaggi INTRO inviati      │         4          │
│ Messaggi FOLLOW-UP 1 inv.   │         2          │
│ Messaggi FOLLOW-UP 2 inv.   │         1          │
│ Messaggi WARM inviati       │         2  (rete)  │
│ ─────────────────────────── │ ────────────────── │
│ Risposte ricevute           │         2  ⚡       │
│ Prospect archiviati oggi    │         3          │
└─────────────────────────────────────────────────┘

AI-TRAINING (HR & L&D Milano)
┌─────────────────────────────────────────────────┐
│ Nuovi prospect trovati      │        21          │
│ Inviti inviati              │        10          │
│ Connessioni accettate       │         2          │
│ Profili analizzati          │         2          │
│ ─────────────────────────── │ ────────────────── │
│ Messaggi INTRO inviati      │         3          │
│ Messaggi FOLLOW-UP 1 inv.   │         3          │
│ Messaggi FOLLOW-UP 2 inv.   │         0          │
│ Messaggi WARM inviati       │         1  (rete)  │
│ ─────────────────────────── │ ────────────────── │
│ Risposte ricevute           │         1  ⚡       │
│ Prospect archiviati oggi    │         2          │
└─────────────────────────────────────────────────┘

NUMA-INVESTOR (Investitori)
┌─────────────────────────────────────────────────┐
│ Nuovi prospect trovati      │         5          │
│ Inviti inviati              │         3          │
│ Connessioni accettate       │         0          │
│ Profili analizzati          │         0          │
│ Messaggi inviati (tutti)    │         1          │
│ Risposte ricevute           │         0          │
│ Prospect archiviati oggi    │         1          │
└─────────────────────────────────────────────────┘

────────────────────────────────────────────────────
📈  CONTATORI CUMULATIVI
────────────────────────────────────────────────────

                     B2B    TRAINING  INVESTOR   TOTALE
Questa settimana
  Inviti inviati      42       49        14        105/150
  Restano             18       21         6         45
Questo mese
  Prospect trovati   312      287        89        688
  Connessi           108       72        21        201
  In outreach         87       64        18        169
  Rispondenti         18        9         2         29
  Conversion rate   16.7%   12.5%      9.5%      14.4%

────────────────────────────────────────────────────
🔍  NETWORK ANALYSIS (ultimo aggiornamento: domenica)
────────────────────────────────────────────────────
Nuovi collegamenti analizzati:  47
Qualificati per warm outreach:  12 (B2B: 8 | Training: 3 | Investor: 1)
Con conversazione attiva:        5  (saltati)
Irrilevanti:                    30

────────────────────────────────────────────────────
🩺  SALUTE ACCOUNT LINKEDIN
────────────────────────────────────────────────────
Budget inviti settimana:    105 / 150 usati  (70%)
Acceptance rate 7gg:        32%  ✅
Rifiuti rapidi (<1h):        2%  ✅
SSI score:                  [se disponibile via Unipile]

────────────────────────────────────────────────────
→ [Apri Dashboard completa]
────────────────────────────────────────────────────
```

### Logica di generazione del report

```typescript
// email-report.ts

async function generateDailyReport(date: Date): Promise<void> {
  const settings = await db.settings.findUnique({ where: { id: 'singleton' } })
  const agents = await db.agent.findMany({ where: { status: { not: 'archived' } } })

  // Raccoglie metriche per ogni agente dal DailyLog di oggi
  const agentReports = await Promise.all(
    agents.map(agent => getDailyMetrics(agent, date))
  )

  // Raccoglie risposte ricevute oggi (con anteprima messaggio)
  const responsesToday = await db.message.findMany({
    where: {
      direction: 'inbound',
      createdAt: { gte: startOfDay(date) }
    },
    include: { prospect: { include: { agent: true } } }
  })

  // Contatori settimanali da Redis
  const weeklyStats = {
    invitsSent: await redis.get('inviti_inviati_questa_settimana'),
    weeklyLimit: settings.globalWeeklyConnectionLimit
  }

  // Contatori mensili dal DB (aggregazione DailyLog)
  const monthlyStats = await getMonthlyAggregates(date)

  // Genera HTML email
  const html = buildEmailHtml({
    date,
    responses: responsesToday,
    agentReports,
    weeklyStats,
    monthlyStats,
    dashboardUrl: process.env.DASHBOARD_URL
  })

  // Invia via Resend
  await resend.emails.send({
    from: 'LinkedIn Platform <report@tuodominio.com>',
    to: settings.reportEmail,
    subject: `📊 LinkedIn Report — ${formatDate(date)}${responsesToday.length > 0 ? ` | ${responsesToday.length} risposte ricevute` : ''}`,
    html
  })
}
```

> **Nota dominio:** Resend richiede un dominio verificato per inviare email.
> Opzione semplice: usa il dominio di NumaMenu (numamenu.it) o un dominio
> dedicato. In alternativa, durante lo sviluppo si può usare l'indirizzo
> `onboarding@resend.dev` (incluso nel piano free senza dominio).

## 35. Claude AI Layer

```typescript
// claude.client.ts

import Anthropic from '@anthropic-ai/sdk'

export const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

// Modelli usati:
// claude-opus-4-5-20251101   → Identity Builder (task critico, una tantum)
// claude-sonnet-4-5-20250929 → Profile Analysis + Message Generation (uso frequente)

// Stima costi mensile:
// ~100 analisi profilo × ~800 token = 80K token input
// ~100 messaggi × ~500 token = 50K token input
// ~10 identity builds × ~2000 token = 20K token input
// Totale: ~150K input token + ~50K output → ~€30-50/mese
```

---

# PARTE IX — SICUREZZA E GDPR

## 35. Autenticazione e Sessioni

- JWT con scadenza 24h, refreshable
- Password hashata con bcrypt (cost factor 12)
- Nessuna registrazione pubblica (utente unico pre-creato via seed DB)
- Token invalidato su logout (blacklist in Redis con TTL)
- Rate limiting su `/api/auth/login` (max 5 tentativi in 15 minuti → blocco IP)
- HTTPS obbligatorio in produzione (Railway gestisce automaticamente)

## 36. Sicurezza Dati

- Tutte le API key (Unipile, Claude, Telegram) salvate come variabili d'ambiente, MAI nel DB
- In Settings DB, le API key sono salvate solo parzialmente mascherate (per display)
- I valori reali vengono letti solo da process.env
- Upload documenti: validazione tipo file (solo PDF/PPTX/TXT), max 10MB, stored in path locale non accessibile via URL pubblico
- Logs: nessun dato sensibile (no contenuto messaggi nei log, solo azioni)
- Database: Supabase gestisce encryption at rest

## 37. GDPR e Privacy

- **Legittimo interesse:** il sistema è per outreach B2B professionale. Il trattamento dei dati è basato su legittimo interesse commerciale, non consenso.
- **Diritto alla cancellazione:** ogni prospect ha il tasto [Opt-out] che imposta `status = 'opted_out'` e blocca ogni automazione. Il record rimane ma senza azioni future. L'utente può richiedere cancellazione completa via [Elimina] (soft delete o hard delete configurabile).
- **Data retention:** configurabile in Settings. Default: dopo 12 mesi senza interazione, i dati vengono automaticamente anonimizzati (nome → "Anonimo", linkedinUrl → null).
- **Nota LinkedIn ToS:** l'automazione tramite Unipile è in zona grigia rispetto ai ToS di LinkedIn. Il sistema è progettato per minimizzare il rischio (limiti conservativi, comportamento umano simulato) ma l'utente è consapevole del rischio.

## 38. Anti-Ban Strategy

```typescript
// rate-limiter.ts aggiunge intervalli casuali

const DELAYS = {
  // 21 inviti/giorno distribuiti su ~8h lavorative = 1 invito ogni ~23 min in media
  // usiamo un range più largo per sembrare naturali
  betweenConnectionRequests: [600, 1800],  // 10-30 minuti tra un invito e l'altro
  betweenMessages:           [180, 420],   // 3-7 minuti tra messaggi post-accettazione
  betweenProfileViews:       [10, 30],     // 10-30 secondi tra visualizzazioni profilo
}

// NOTA: con 21 inviti totali al giorno su 3 agenti (9+10+3), il pomeriggio job
// non concentra tutto in un blocco ma distribuisce gli inviti con i delay sopra.
// Es: 9 inviti NUMA-B2B × 15 min media = ~135 minuti → ~2h per completare la quota B2B

// Job non partono mai esattamente all'ora configurata
function randomizeJobTime(baseTime: string): string {
  const [h, m] = baseTime.split(':').map(Number)
  const offset = Math.floor(Math.random() * 30) - 15  // ±15 minuti
  return addMinutes(setHours(new Date(), h, m), offset)
}

// Monitor salute account
async function checkLinkedInHealth(): Promise<HealthStatus> {
  // Controlla SSI score via Unipile
  // Alert se SSI cala > 10 punti in una settimana
  // Alert se ratio rifiuti/invii > 40% in 3 giorni
}
```

---

# PARTE X — MONITORING E OPERATIVITÀ

## 39. Logging

```typescript
// logger.ts — Winston structured logging

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ]
})

// Ogni azione loggata include: timestamp, agentId, jobName, action, meta
// Tutti i log salvati anche in DB (tabella OperationLog) per visualizzazione in dashboard
```

## 40. Live Log via WebSocket

```typescript
// log-stream.ts
// Il frontend si connette a /api/logs/live via WebSocket
// Ogni nuovo log viene pushato in tempo reale alla UI
// Filtrabili per agente e livello

wss.on('connection', (ws, req) => {
  // Verifica JWT dal query param
  const filter = parseFilter(req.url)

  // Ogni volta che winston logga qualcosa, pushalo al WebSocket
  logger.on('data', (chunk) => {
    if (matchesFilter(chunk, filter)) {
      ws.send(JSON.stringify(chunk))
    }
  })
})
```

## 41. Backup Automatico

```typescript
// Cron job giornaliero alle 03:00 (fuori orario operativo)
// Esegue: pg_dump DATABASE_URL → file .sql.gz
// Mantiene ultimi 7 backup
// In Railway: snapshot automatici inclusi nel piano

// Setup backup su Railway:
// Railway → Database → Settings → Automatic backups → Enable
```

## 42. Recovery Procedure

**Se il server si riavvia:**
- BullMQ con Redis persistente: i job in coda vengono recuperati automaticamente
- I cron job si re-registrano all'avvio dell'applicazione
- Lo stato di ogni prospect è persistito nel DB: nessun dato perso

**Se un job fallisce:**
- BullMQ gestisce retry automatico (max 3 tentativi, backoff esponenziale)
- Dopo 3 fallimenti: job in coda "failed", notifica Telegram, log errore
- L'operatore può re-accodare manualmente dal dashboard

**Se Unipile è down:**
- I job falliscono con errore gestito
- Nessuna azione su LinkedIn viene eseguita (sistema fail-safe)
- Telegram alert: "🔴 Unipile non raggiungibile — job saltato"
- Al ripristino Unipile: job riprende normalmente al ciclo successivo

---

# PARTE XI — DEPLOYMENT E SETUP

## 43. Variabili d'Ambiente

```env
# .env.example

# App
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-key-min-32-chars
ADMIN_EMAIL=nuovomangiare@gmail.com
ADMIN_PASSWORD_HASH=bcrypt-hash-of-initial-password

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Redis
REDIS_URL=redis://default:password@host:6379

# Unipile
UNIPILE_API_KEY=your-unipile-api-key
UNIPILE_ACCOUNT_ID=your-linkedin-account-id

# Claude (Anthropic)
CLAUDE_API_KEY=your-claude-api-key

# Telegram
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Opzionale: LinkedIn Sales Navigator
LINKEDIN_MODE=free   # free | sales_navigator | premium_business
```

## 44. Deploy su Railway (passo per passo)

```bash
# 1. Installa Railway CLI
npm install -g @railway/cli

# 2. Login Railway
railway login

# 3. Inizializza progetto
railway init

# 4. Aggiungi PostgreSQL
railway add postgresql

# 5. Aggiungi Redis (plugin Upstash)
railway add redis

# 6. Configura variabili d'ambiente
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=...
# (ripeti per tutte le variabili)

# 7. Deploy backend
cd backend && railway up

# 8. Build e deploy frontend
cd frontend && npm run build
# Copia la cartella dist/ nella root del backend/public/
# Express serve la SPA da lì

# 9. Esegui migrations DB
railway run npx prisma migrate deploy

# 10. Seed iniziale (crea utente admin)
railway run npm run seed
```

## 45. Setup Iniziale Step-by-Step

### Fase 1: Ambiente di sviluppo locale

```bash
# Clone repository
git clone <repo>
cd linkedin-platform

# Install deps
cd backend && npm install
cd ../frontend && npm install

# Setup DB locale (Docker)
docker-compose up -d postgres redis

# Setup DB
cd backend
cp .env.example .env
# Modifica .env con credenziali locali
npx prisma migrate dev
npm run seed  # Crea utente admin

# Avvia backend
npm run dev  # porta 3001

# In altro terminale: avvia frontend
cd frontend && npm run dev  # porta 5173
```

### Fase 2: Configurazione iniziale (via UI)

1. Apri `http://localhost:5173` → Login con credenziali admin
2. Vai in **Settings → Connessioni API**:
   - Inserisci Unipile API Key → [Test connessione]
   - Inserisci Claude API Key → [Test connessione]
   - Inserisci Telegram Token + Chat ID → [Invia messaggio test]
3. Vai in **Settings → LinkedIn** → Seleziona modalità "Free"
4. Vai in **Identità → Crea nuova identità**:
   - Carica i documenti NumaMenu (pitch deck, one-pager)
   - Attendi elaborazione AI → Rivedi Identity Card → Approva
5. Vai in **Agenti → Crea nuovo agente**:
   - Wizard step 1: Seleziona identità NumaMenu appena creata
   - Wizard step 2-5: Compila configurazione
   - Step 5: Review → Crea e attiva

### Fase 3: Primo test

1. Vai in **Agenti → NUMA-B2B → Strutture di Ricerca**
2. Seleziona una struttura → [Esegui ora]
3. Controlla **Prospects** → Verifica che siano stati trovati dei profili
4. Controlla **Logs** → Verifica che tutto funzioni
5. Vai in **Agenti → NUMA-B2B → Esegui ora** (tasto solo in dev mode) → Esegui Afternoon Job con 1 sola connection request
6. Verifica su LinkedIn che la richiesta sia stata inviata

---

# PARTE XII — FASI DI SVILUPPO

## 46. Piano di sviluppo

### Fase 1 — Infrastruttura base (Settimane 1–2)
- [ ] Setup monorepo Node.js + TypeScript
- [ ] Schema Prisma + migrations + seed
- [ ] Express app con middleware auth (JWT)
- [ ] Configurazione BullMQ + Redis
- [ ] Client Unipile: connessione, test profile fetch, test search
- [ ] Test invio manuale connection request via API
- [ ] Integrazione Telegram: bot setup, test invio messaggio
- [ ] Frontend: setup Vite + React + Tailwind + shadcn/ui
- [ ] Frontend: pagina Login funzionante

### Fase 2 — Identity Builder (Settimane 3–4)
- [ ] Document processor (PDF + PPTX → testo)
- [ ] Identity Builder Agent (Claude Opus)
- [ ] CRUD identità (DB + API + UI)
- [ ] Pagina Identità con upload documenti e review Identity Card
- [ ] Wizard onboarding conversazionale (alternativa a upload)
- [ ] Test: crea identità NUMA-B2B da pitch deck NumaMenu

### Fase 3 — Agent System (Settimane 5–6)
- [ ] CRUD agenti (DB + API + UI)
- [ ] Wizard creazione agente (5 step)
- [ ] Agent lifecycle (activate/pause/archive)
- [ ] CRUD strutture di ricerca (DB + API + UI)
- [ ] Import bulk strutture via JSON
- [ ] Budget allocator
- [ ] Configura i 3 agenti iniziali nel sistema

### Fase 4 — Search Engine (Settimana 7)
- [ ] Search engine (LinkedIn Free mode)
- [ ] Algoritmo scoring prospect
- [ ] Deduplication cross-agente
- [ ] Midday job funzionante end-to-end
- [ ] Test: struttura eseguita → prospect trovati e salvati in DB

### Fase 5 — Connection & Monitoring (Settimana 8)
- [ ] Connection sender con rate limiter
- [ ] Acceptance monitor (webhook + polling fallback)
- [ ] State machine prospect (tutti i transition)
- [ ] Afternoon job (sezione connection requests) funzionante
- [ ] Test end-to-end: prospect trovato → connection request inviata

### Fase 6 — AI Outreach (Settimane 9–10)
- [ ] Profile analyzer (Claude Sonnet)
- [ ] Outreach agent: messaggio 1 con personalizzazione
- [ ] Morning job: analisi profili accettazioni
- [ ] Afternoon job: invio messaggi intro
- [ ] Test qualità messaggi su 10 profili reali
- [ ] Ottimizzazione prompt (iterativo)

### Fase 7 — Follow-up & Risposta (Settimana 11)
- [ ] Follow-up agent: messaggi 2 e 3
- [ ] Timer follow-up (3 giorni, 10 giorni)
- [ ] Gestione risposta ricevuta (stop automation + alert Telegram)
- [ ] Webhook Unipile per messaggi in entrata
- [ ] Test sequenza completa (1 prospect da zero a 3 messaggi)

### Fase 8 — Dashboard completa (Settimana 12)
- [ ] Pagina Analytics con tutti i grafici
- [ ] Pagina Logs con live stream
- [ ] Pagina Prospects (tabella + drawer dettaglio)
- [ ] Pagina Settings completa
- [ ] Report giornaliero Telegram completo
- [ ] Export CSV prospect

### Fase 9 — Test & Go-live (Settimane 13–14)
- [ ] Deploy su Railway
- [ ] Setup Unipile account LinkedIn reale
- [ ] Configura tutti e 3 gli agenti in produzione
- [ ] Run sistemin per 7 giorni in osservazione
- [ ] Tuning limiti e orari in base ai primi dati reali
- [ ] Checklist go-live completa

## 47. Checklist Go-Live

```
PRE-LANCIO:
□ Tutti i test unitari passano
□ Unipile connesso all'account LinkedIn reale
□ Identity Package approvato per NUMA-B2B e NUMA-INVESTOR
□ Identity Package AI-TRAINING completato (dopo upload documenti)
□ Strutture di ricerca configurate per tutti gli agenti
□ Telegram bot testato (messaggio di test ricevuto)
□ Backup DB configurato e testato
□ Rate limits verificati (non superano 15/giorno)
□ Webhook Unipile registrato e funzionante
□ Deploy su Railway completato
□ HTTPS attivo e certificato valido
□ Variabili d'ambiente tutte configurate in produzione

PRIMO GIORNO (monitoraggio manuale):
□ Osserva il Midday Job: struttura eseguita correttamente?
□ Osserva il Afternoon Job: 1-2 connection requests inviate?
□ Verifica su LinkedIn: le richieste compaiono?
□ Controlla Telegram: report ricevuto?
□ Verifica Logs: nessun errore critico?

PRIMA SETTIMANA:
□ Monitoraggio giornaliero del dashboard
□ Verifica qualità prospect trovati (score medio)
□ Verifica qualità messaggi generati (review manuale)
□ Controlla SSI LinkedIn (non calare >5 punti)
□ Aggiusta strutture di ricerca se trovano troppi falsi positivi

UPGRADE A SALES NAVIGATOR (quando pronto):
□ Acquista LinkedIn Sales Navigator
□ Settings → LinkedIn Mode → Sales Navigator
□ Aggiorna strutture di ricerca con filtri avanzati
□ Il sistema si adatta automaticamente
```

---

## 48. Costi Totali Ricapitolati

| Voce | Costo Mensile |
|------|--------------|
| Railway (backend + DB PostgreSQL) | €5–10 |
| Upstash Redis | €0 (free tier) |
| Unipile API (1 account LinkedIn) | €49 |
| Claude API | €30–50 |
| Telegram Bot | €0 |
| **TOTALE FASE MVP (LinkedIn Free)** | **€84–109/mese** |
| + LinkedIn Sales Navigator | + €79 |
| **TOTALE PIENA POTENZA** | **€163–188/mese** |

---

*Documento versione 3.0 — Finale*
*Questo documento sostituisce prd.md e prd-v2-multiagent.md*
*Prossima revisione: dopo completamento Fase 4 (Search Engine live)*
