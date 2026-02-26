# PRD v2 — LinkedIn Multi-Agent Outreach Platform
## Architettura modulare a agenti paralleli

**Versione:** 2.0
**Data:** 2026-02-26
**Supera:** prd.md v1.0
**Stato:** Draft — pronto per sviluppo

---

## 1. Visione del prodotto

La v1 era un sistema dedicato a un singolo use case (NumaMenu → ristoratori). La v2 è una **piattaforma di outreach LinkedIn multi-agente**, in cui ogni agente è un'entità autonoma con la propria identità, il proprio target e la propria logica di comunicazione.

Gli agenti girano in parallelo, condividono l'infrastruttura sottostante, ma operano in modo completamente isolato. Aggiungere un nuovo agente non richiede codice: richiede una configurazione e un onboarding.

```
PIATTAFORMA
├── Infrastruttura condivisa (Unipile, DB, Scheduler, AI Layer)
├── Agent: NUMA-B2B      → NuMa come founder NumaMenu → ristoratori Milano
├── Agent: NUMA-INVESTOR → NuMa come founder NumaMenu → investitori food tech
├── Agent: AI-TRAINING   → NuMa come AI strategist → HR/L&D Milano
└── Agent: [FUTURO]      → configurabile in <30 minuti
```

---

## 2. Cambiamenti rispetto alla v1

| Aspetto | v1 | v2 |
|---------|----|----|
| Architettura | Monolitica, un target | Multi-agente, N target paralleli |
| Identità | Implicita nel codice | Esplicita, configurabile, document-driven |
| Onboarding agente | Manuale (dev) | Interattivo (wizard) |
| Aggiunta nuovo agente | Richiede sviluppo | Richiede solo configurazione |
| Budget giornaliero | Fisso per sistema | Distribuito e bilanciato tra agenti attivi |
| Contact Repository | Singola dimensione | Multi-agente, isolato per agente |
| Track | B2B + Investor come sub-track | Ogni agente è il suo track |

---

## 3. Architettura di Sistema v2

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         PLATFORM ORCHESTRATOR                                 │
│           (Multi-agent scheduler + Budget allocator + State supervisor)       │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
    ┌─────────────────┐ ┌───────────────┐  ┌────────────────┐
    │  AGENT REGISTRY  │ │  IDENTITY     │  │  SHARED        │
    │  (configurazioni │ │  STORE        │  │  INFRA         │
    │   degli agenti)  │ │  (identità    │  │  ├─ Unipile    │
    └────────┬─────────┘ │   per agente) │  │  ├─ Database   │
             │           └───────┬───────┘  │  ├─ Redis Queue│
             │                   │          │  └─ AI Layer   │
             └───────────────────┼──────────┘                │
                                 │                           │
         ┌───────────────────────┼───────────────────────────┘
         │                       │                   │
         ▼                       ▼                   ▼
┌─────────────────┐   ┌──────────────────┐  ┌──────────────────┐
│  AGENT          │   │  AGENT           │  │  AGENT           │
│  NUMA-B2B       │   │  NUMA-INVESTOR   │  │  AI-TRAINING     │
│  ─────────────  │   │  ─────────────   │  │  ─────────────   │
│  search engine  │   │  search engine   │  │  search engine   │
│  identity ctx   │   │  identity ctx    │  │  identity ctx    │
│  outreach agent │   │  outreach agent  │  │  outreach agent  │
│  follow-up mgr  │   │  follow-up mgr   │  │  follow-up mgr   │
└─────────────────┘   └──────────────────┘  └──────────────────┘
         │                       │                   │
         └───────────────────────┼───────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │   UNIFIED DASHBOARD    │
                    │   (report per agente   │
                    │    e vista aggregata)  │
                    └────────────────────────┘
```

### 3.1 Platform Orchestrator

Il cuore del sistema. Gestisce:
- **Scheduling:** lancia i job giornalieri per ogni agente attivo in sequenza/parallelo
- **Budget allocation:** distribuisce il budget giornaliero (connection requests, messaggi) tra gli agenti attivi secondo le priorità configurate
- **State supervision:** monitora lo stato di salute di ogni agente (errori, anomalie, rate limit raggiunti)
- **Agent lifecycle:** attiva, mette in pausa, riprende gli agenti secondo la configurazione

### 3.2 Agent Registry

Database delle configurazioni degli agenti. Ogni record contiene tutto ciò che serve per istanziare e far girare un agente. È il "DNA" dell'agente.

### 3.3 Identity Store

Deposito delle identità costruite. Separato dall'Agent Registry per consentire a più agenti di condividere (o variare) la stessa identità di base.

### 3.4 Shared Infrastructure

- **Unipile Gateway:** un solo account LinkedIn, gestito centralmente. Tutti gli agenti fanno richieste attraverso questo layer, che garantisce che i rate limit globali non vengano mai superati.
- **Contact Repository DB:** database unico ma con isolamento per agente (ogni record ha `agent_id`). Un prospect contattato da NUMA-B2B non appare nella coda di AI-TRAINING.
- **AI Layer:** Claude API condivisa. Ogni chiamata riceve il contesto dell'agente specifico nel system prompt.

---

## 4. Identity Builder — Il Modulo di Identità

Questo è il modulo più critico dell'intera piattaforma. Senza un'identità ben costruita, i messaggi sono generici e il sistema non funziona.

### 4.1 Cos'è l'Identity Package

Per ogni agente, il sistema costruisce un **Identity Package** — una rappresentazione strutturata di chi sei, cosa fai, cosa offri e come ti esprimi. Questo package diventa il **system prompt base** per tutti gli agenti AI dell'istanza.

```json
{
  "identity_id": "numa_numa",
  "version": "1.2",
  "built_at": "2026-02-26",
  "sources": ["pitch_deck_numa.pdf", "bio_numa.txt", "numamenu_onepager.pdf"],

  "persona": {
    "name": "NuMa",
    "role": "Co-founder & CEO",
    "company": "NumaMenu",
    "location": "Milano",
    "linkedin_url": "linkedin.com/in/...",
    "languages": ["italiano", "inglese"],
    "tone_profile": {
      "formality": "semi-formal",
      "style": "diretto, concreto, niente paroloni",
      "avoid": ["frasi corporate", "gergo startup", "eccessivo entusiasmo"],
      "strengths_to_highlight": ["pragmatismo", "conoscenza del settore", "risultati concreti"]
    }
  },

  "company_context": {
    "name": "NumaMenu",
    "description": "Estratto AI dal pitch deck...",
    "stage": "early stage / seed",
    "founded": "2024",
    "team_size": "X persone",
    "traction": ["X ristoranti attivi", "Y MRR", "lanciato in data Z"],
    "value_proposition": "...",
    "differentiators": ["...", "...", "..."],
    "website": "numamenu.it/ristoratori"
  },

  "credibility_markers": [
    "Citazione stampa o award se presente",
    "Esperienza precedente rilevante",
    "Partner o advisor noti"
  ],

  "what_i_do_not_want_to_say": [
    "Non menzionare i competitor per nome",
    "Non esagerare con i numeri di traction",
    "Non promettere demo gratuite nel primo messaggio"
  ]
}
```

### 4.2 Identity Builder — Flusso di costruzione

La costruzione dell'identità avviene tramite un processo guidato in due modalità:

**Modalità A — Document-driven (raccomandata):**

```
1. UPLOAD DOCUMENTI
   L'utente carica uno o più file:
   - Pitch deck (PDF/PPTX)
   - One-pager / brochure (PDF)
   - Bio personale (PDF/TXT)
   - Profilo LinkedIn (export PDF)
   - Sito web (URL)

2. ESTRAZIONE AI
   Il sistema analizza ogni documento e estrae:
   - Chi sei (nome, ruolo, azienda)
   - Cosa fai (value proposition, prodotto/servizio)
   - Risultati/trazione (credibility markers)
   - Tono di voce (analizzando come scrivi)
   - Cosa NON dire (controindicazioni)

3. IDENTITY CARD — REVISIONE
   Il sistema presenta una "Identity Card" all'utente:
   ┌────────────────────────────────────────────────┐
   │ IDENTITY CARD — Bozza generata dai documenti  │
   │ ─────────────────────────────────────────────  │
   │ Nome: NuMa                                    │
   │ Ruolo: Co-founder, NumaMenu                    │
   │ Cosa offri: Menu digitale per ristoranti [...]  │
   │ Trazione: X ristoranti attivi                  │
   │ Tono: Semi-formale, diretto, concreto          │
   │ NON dire: competitor per nome, promesse demo   │
   │                                                │
   │ [✓ Approva] [✎ Modifica] [↺ Rigenera]         │
   └────────────────────────────────────────────────┘

4. APPROVAZIONE
   L'utente approva, modifica o integra manualmente.
   L'Identity Package viene salvato e versioned.
```

**Modalità B — Conversational onboarding:**

Se l'utente non ha documenti, il sistema conduce un'intervista strutturata:

```
AGENTE: "Ciao! Prima di attivarti, ho bisogno di conoscerti.
         Rispondimi a queste domande — più sei specifico, meglio mi comporto."

Q1: "Descrivi in 2-3 frasi cosa fai e per chi lo fai."
    → NuMa risponde

Q2: "Qual è il problema concreto che risolvi? Cosa succederebbe se
     il tuo cliente non avesse il tuo prodotto/servizio?"
    → NuMa risponde

Q3: "Dimmi 2-3 risultati reali che hai ottenuto o che i tuoi clienti
     hanno ottenuto. Anche piccoli, ma reali."
    → NuMa risponde

Q4: "Come vuoi che mi presenti? Formale o informale?
     Punta a creare curiosità o vai diretto al punto?"
    → NuMa risponde

Q5: "C'è qualcosa che non devo mai dire o fare nei messaggi?"
    → NuMa risponde

AGENTE: [Genera Identity Card] "Ho capito. Ecco come mi presenterò.
         Va bene così o vuoi cambiare qualcosa?"
```

### 4.3 Identity condivisa vs Identity specializzata

Un'identità può essere **condivisa tra agenti** o **specializzata per contesto**:

- `numa_base` → identità di base: chi è NuMa, il suo tono, le sue credenziali generali
- `numa_numa_b2b` → estende `numa_base` aggiungendo il contesto NumaMenu per ristoratori
- `numa_numa_investor` → estende `numa_base` aggiungendo il pitch investor NumaMenu
- `numa_ai_training` → estende `numa_base` aggiungendo il contesto AI strategist / formazione

Questo sistema di ereditarietà evita la duplicazione e garantisce coerenza del personaggio di base.

---

## 5. Agent Configuration — Schema Completo

Ogni agente è definito da un file di configurazione JSON/YAML. Creare un agente = compilare questa struttura.

```yaml
agent:
  id: "ai_training_hr"
  name: "AI Training — HR & L&D Milano"
  status: "active"            # active | paused | archived
  created_at: "2026-02-26"
  version: "1.0"

identity:
  identity_id: "numa_ai_training"  # riferimento all'Identity Store

target:
  description: "Responsabili HR, L&D, formazione in aziende con sede a Milano"
  track_type: "B2B_services"

  job_titles:
    - "HR Manager"
    - "HR Director"
    - "Head of People"
    - "Chief People Officer"
    - "CPO"
    - "Learning & Development Manager"
    - "L&D Manager"
    - "Responsabile Formazione"
    - "Training Manager"
    - "Head of Learning"
    - "Head of HR"
    - "People & Culture Manager"
    - "Talent Development"
    - "Talent Manager"
    - "Head of Talent"
    - "Corporate Learning"
    - "Learning Experience"
    - "Responsabile Risorse Umane"
    - "Direttore HR"
    - "Chief Learning Officer"
    - "CLO"

  company_filters:
    location: "Milano"
    size: ["50-200 dipendenti", "201-500 dipendenti", "500+ dipendenti"]
    industries:
      - "Consulenza"
      - "Finanza e banche"
      - "Assicurazioni"
      - "Manifatturiero"
      - "Retail"
      - "Tecnologia"
      - "Healthcare"
      - "Energia"
      - "Media e comunicazione"

  exclusion_criteria:
    - "Aziende con meno di 50 dipendenti"
    - "Startup (early stage, pre-seed, seed)"
    - "Già presenti nel Contact Repository per questo agente"
    - "Profili inattivi da >6 mesi"

  scoring_rules:
    job_title_match_exact: 30        # es. "L&D Manager"
    job_title_match_partial: 15      # es. "HR" nel titolo
    company_size_large: 20           # 500+ dipendenti
    company_size_medium: 15          # 200-500
    profile_complete: 10             # foto, bio, esperienze
    recent_activity: 15              # post negli ultimi 30gg
    ai_keywords_in_profile: 10       # "AI", "intelligenza artificiale", "digital transformation"
    min_score_to_contact: 50

search_structures:
  total: 80
  rotation: "sequential_with_dedup"
  structures:
    - id: "hr_001"
      query: ["HR Manager OR HR Director", "Milano", "Consulenza OR Finance"]
    - id: "hr_002"
      query: ["L&D Manager OR Learning Development", "Milano"]
    - id: "hr_003"
      query: ["Chief People Officer OR CPO", "Milano", "200-500 dipendenti"]
    - id: "hr_004"
      query: ["Responsabile Formazione", "Milano", "Banca OR Assicurazione"]
    # ... fino a 80 strutture

messaging:
  connection_note:
    enabled: true
    template: "Ciao {first_name}, mi occupo di formazione su AI per team aziendali.
               Vorrei connettermi con te."
    max_chars: 300

  message_1:
    timing: "immediately_after_acceptance"
    max_lines: 7
    personalization_priority:
      - "post_recente_su_AI_o_formazione"
      - "mention_azienda_specifica"
      - "trend_sector"
      - "fallback_generico_per_ruolo"
    cta: "15_min_call"

  message_2:
    timing_days_after_m1: 3
    condition: "no_response"
    angle: "different_from_m1"  # cambio angolo obbligatorio
    cta: "send_link_or_resource"

  message_3:
    timing_days_after_m1: 10
    condition: "no_response"
    angle: "last_chance_different_angle"
    cta: "minimal_ask"

  stop_on_response: true
  notify_user_on_response: true

daily_limits:
  connection_requests: 5       # questo agente ha budget 5/giorno
  messages: 8
  profile_views: 20

priority: 2    # 1=massima priorità nel budget allocation, 3=minima
```

---

## 6. I Tre Agenti Attivi

### 6.1 Agent: NUMA-B2B
**ID:** `numa_b2b`
**Obiettivo:** vendere NumaMenu a proprietari di ristoranti e piccole catene a Milano
**Identity:** NuMa, co-founder NumaMenu, tono diretto e informale
**Budget giornaliero:** 5 connection requests, 8 messaggi
**Search structures:** 200 (come definite nel PRD v1, sezione 5.2)
**Messaggi:** focalizzati su semplificazione operativa, risparmio tempo, digitalizzazione menu
**CTA primaria:** call di 15 minuti

### 6.2 Agent: NUMA-INVESTOR
**ID:** `numa_investor`
**Obiettivo:** pitchare NumaMenu come opportunità di investimento
**Identity:** NuMa, founder, pitch mode — più formale, numeri in evidenza, mercato e vision
**Budget giornaliero:** 3 connection requests, 5 messaggi
**Search structures:** 50 (come definite nel PRD v1, sezione 6.2)
**Messaggi:** focalizzati su traction, mercato, team, opportunità
**CTA primaria:** call esplorativa 20-30 minuti

### 6.3 Agent: AI-TRAINING
**ID:** `ai_training_hr`
**Obiettivo:** trovare responsabili HR/L&D/Formazione in aziende milanesi interessati a formazione AI per i loro team
**Identity:** NuMa, AI business strategist e consulente di formazione, tono professionale ma accessibile
**Budget giornaliero:** 5 connection requests, 8 messaggi
**Search structures:** 80 strutture (definite in §5 di questo documento)
**Messaggi:** focalizzati su urgenza upskilling AI, gap di competenze nei team, ROI della formazione
**CTA primaria:** call di 20 minuti o invio di una risorsa gratuita (es. guida AI per HR)

**Target dettagliato Agent AI-TRAINING:**

Profilo ideale:
- HR Director / CHRO / CPO in azienda 50–500 dipendenti con sede Milano
- L&D Manager responsabile dei budget di formazione annuali
- Responsabile Formazione in aziende tradizionali che affrontano digital transformation
- Chief Learning Officer in grandi corporate

Pain points che il messaggio deve toccare:
- "Il mio team non sa come usare l'AI nel lavoro quotidiano"
- "Devo formare centinaia di persone sull'AI ma non so da dove partire"
- "Ho un budget formazione ma non trovo provider con competenze AI reali"
- "Il top management ci chiede risultati sull'AI ma non abbiamo le skill interne"
- "Ho paura di restare indietro rispetto ai competitor che stanno già formando i loro team"

Differenziale del messaggio rispetto a NUMA:
- Non si vende un software ma un servizio/expertise
- Il tono è più consulenziale, meno product-led
- Si leveraggia l'urgenza del mercato (AI è su tutti i giornali, le aziende sono in ritardo)
- Si possono usare dati di mercato come trigger ("Il 67% delle aziende italiane non ha ancora un piano di formazione AI...")

---

## 7. Platform Orchestrator — Logica Multi-Agente

### 7.1 Budget Allocation Giornaliero

Il budget totale giornaliero (15 connection requests, 25 messaggi) viene distribuito tra gli agenti attivi secondo priorità e performance storica.

```
BUDGET GIORNALIERO TOTALE:
├── Connection requests: 15
└── Messaggi: 25

DISTRIBUZIONE CON 3 AGENTI ATTIVI:
├── NUMA-B2B      (priority 1): 5 req + 8 msg
├── AI-TRAINING   (priority 1): 5 req + 8 msg
└── NUMA-INVESTOR (priority 2): 3 req + 5 msg
    ──────────────────────────────────────────
    Totale allocato:            13 req + 21 msg
    Buffer di sicurezza:         2 req + 4 msg  (non usati per cautela)
```

**Regole di riallocazione dinamica:**
- Se un agente ha esaurito i prospect in coda, il suo budget viene redistribuito agli altri
- Se un agente riceve un'alta percentuale di accettazioni (>40%), il suo budget viene aumentato
- Se un agente riceve segnali di penalizzazione (rifiuti rapidi), il suo budget viene temporaneamente ridotto

### 7.2 Sequenza di Esecuzione Giornaliera

```
09:00  PLATFORM CHECK
       → Verifica stato di tutti gli agenti
       → Calcola budget del giorno
       → Legge acceptance monitor per tutti gli agenti (via Unipile)
       → Avvia analisi profili in parallelo per tutti gli agenti

11:30  SEARCH JOB (tutti gli agenti in sequenza, non parallelo per Unipile)
       → NUMA-B2B: esegue struttura #X
       → AI-TRAINING: esegue struttura #Y
       → NUMA-INVESTOR: esegue struttura #Z

14:00  OUTREACH JOB (tutti gli agenti, intervalli variabilizzati)
       → NUMA-B2B: 5 connection requests + messaggi pending
       → AI-TRAINING: 5 connection requests + messaggi pending
       → NUMA-INVESTOR: 3 connection requests + messaggi pending
       Nota: le azioni dei tre agenti vengono interleaved nel tempo
       (non tutte concentrate nello stesso minuto)

18:30  LOG & REPORT
       → Daily log per ogni agente
       → Dashboard aggregata aggiornata
       → Report email giornaliero con sezione per ogni agente
```

### 7.3 Isolamento dei Prospect

Un prospect NON può essere contattato contemporaneamente da più agenti. La logica di deduplication funziona così:

1. Quando un agente trova un nuovo prospect, il sistema verifica se `linkedin_id` esiste già nel DB con qualsiasi `agent_id`
2. Se esiste già (contattato da altro agente): il prospect viene salvato come `known_via_other_agent` ma non accodato per questo agente
3. Eccezione configurabile: se sono passati 90+ giorni dall'ultimo contatto da un altro agente e quel tentativo è archiviato senza risposta, il sistema può ri-proporre il prospect all'agente corrente (con angolo diverso)

Questo evita che la stessa persona riceva messaggi identici da "due NuMa diverse" nello stesso periodo.

---

## 8. Struttura Dati v2

### 8.1 Schema `agents`

```json
{
  "agent_id": "string",
  "agent_name": "string",
  "status": "enum[active|paused|archived]",
  "identity_id": "string",
  "config": { "...yaml config..." },
  "stats": {
    "total_prospects_found": 0,
    "total_connections_sent": 0,
    "total_connections_accepted": 0,
    "total_messages_sent": 0,
    "total_responses_received": 0,
    "acceptance_rate_7d": 0.0,
    "response_rate_7d": 0.0
  },
  "created_at": "datetime",
  "last_active_at": "datetime"
}
```

### 8.2 Schema `identities`

```json
{
  "identity_id": "string",
  "parent_identity_id": "string | null",
  "persona_name": "string",
  "role": "string",
  "company": "string",
  "full_context_prompt": "string (system prompt completo per LLM)",
  "tone_profile": { "...}" },
  "source_documents": ["array di filename"],
  "version": "string",
  "approved_by_user": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 8.3 Schema `prospects` (aggiornato v2)

Il campo chiave aggiunto è `agent_id`. Il resto della struttura è identico alla v1.

```json
{
  "id": "uuid",
  "agent_id": "string",           // NUOVO: quale agente gestisce questo prospect
  "identity_id": "string",        // NUOVO: quale identità è stata usata
  "linkedin_id": "string",
  "...tutti i campi v1..."
}
```

### 8.4 Schema `identity_documents`

```json
{
  "document_id": "uuid",
  "identity_id": "string",
  "filename": "string",
  "file_type": "enum[pdf|pptx|txt|url]",
  "upload_date": "datetime",
  "extraction_status": "enum[pending|processed|failed]",
  "extracted_content": "string (testo grezzo estratto)",
  "extraction_summary": "string (sintesi AI)",
  "key_facts": ["array di fatti estratti"]
}
```

---

## 9. Agent Onboarding Flow — Dettaglio UX

Quando si crea un nuovo agente, il sistema guida l'utente attraverso un wizard in 6 step:

### Step 1 — Identità
```
"Per quale identità lavora questo agente?

[→ Usa un'identità esistente]
   Seleziona da: numa_base | numa_numa | numa_ai_training

[→ Crea nuova identità]
   Opzione A: Carica documenti (PDF, PPTX, TXT)
   Opzione B: Rispondi a delle domande guidate"
```

### Step 2 — Obiettivo
```
"Cosa deve ottenere questo agente?

[A] Generare lead / clienti potenziali
[B] Trovare investitori / finanziatori
[C] Costruire partnership / collaborazioni
[D] Aumentare awareness / posizionamento
[E] Altro (descrivi)"
```

### Step 3 — Target
```
"Chi deve contattare?

Descrivi il profilo ideale:
- Titolo/ruolo: _______________
- Settore: _______________
- Dimensione azienda: _______________
- Città/area geografica: _______________
- Cosa li qualifica come target? _______________
- Chi NON devi contattare? _______________"
```

### Step 4 — Messaggio e tono
```
"Come vuoi che mi presenti?

- Tono (formale/semi-formale/informale): ___
- Lunghezza messaggi (brevi <5 righe / standard 5-7 righe): ___
- CTA principale (call / link / risposta): ___
- C'è qualcosa che non devo mai scrivere? ___

Vuoi rivedere un messaggio di esempio prima di andare live? [Sì] [No]"
```

### Step 5 — Budget
```
"Quante azioni quotidiane per questo agente?

Connection requests/giorno: [___] (consigliato: 3-6)
Messaggi/giorno: [___] (consigliato: 5-10)
Priorità rispetto agli altri agenti: [Alta / Media / Bassa]"
```

### Step 6 — Review & Launch
```
"Ecco il riepilogo del tuo agente:

Nome: AI Training — HR Milano
Identità: NuMa, AI strategist e consulente formazione
Target: HR/L&D Manager, aziende 50-500 dip., Milano
Budget: 5 req + 8 msg / giorno
Priorità: Alta

Messaggio di esempio generato:
────────────────────────────────
Ciao [Nome],

Ho visto che gestisci la formazione in [Azienda] — mi ha
colpito come molte realtà simili stiano cercando di capire
come strutturare un piano di upskilling sull'AI senza
sapere da dove partire.

Mi occupo proprio di questo: formazione pratica sull'AI
per team aziendali. Qualcosa che puoi portare in azienda
domani, non tra 6 mesi.

Ti andrebbe una call di 15 minuti questa settimana?
NuMa
────────────────────────────────

[✓ Lancia l'agente] [✎ Modifica] [← Torna indietro]"
```

---

## 10. Dashboard Multi-Agente

### 10.1 Vista Aggregata

```
═══════════════════════════════════════════════════════════════════════
 LINKEDIN PLATFORM — VISTA AGGREGATA | 26 Feb 2026
═══════════════════════════════════════════════════════════════════════

 AGENTI ATTIVI: 3   │   BUDGET OGGI: 13/15 req │ 21/25 msg

 ┌─────────────────────────────────────────────────────────────────┐
 │ NUMA-B2B       │ req oggi: 5  │ acc. rate: 34% │ resp: 12.8%  │
 │ AI-TRAINING    │ req oggi: 5  │ acc. rate: 28% │ resp: 8.1%   │
 │ NUMA-INVESTOR  │ req oggi: 3  │ acc. rate: 21% │ resp: 6.4%   │
 └─────────────────────────────────────────────────────────────────┘

 ⚡ RICHIEDE ATTENZIONE (risposte ricevute oggi):
    → Marco Bianchi (NUMA-B2B) ha risposto → gestisci tu
    → Laura Rossi (AI-TRAINING) ha risposto → gestisci tu

 CUMULATIVO TOTALE (tutti gli agenti)
 ├── Prospect nel DB:     1.247
 ├── Connessioni attive:    412
 ├── In outreach:           287
 └── Rispondenti totali:     71  (17.2%)
═══════════════════════════════════════════════════════════════════════
```

### 10.2 Vista per Agente

Ogni agente ha la propria pagina di dettaglio con:
- Funnel completo (found → queued → connected → outreach → responded → meeting)
- Strutture di ricerca più performanti
- Messaggi con highest response rate
- Timeline dei contatti attivi
- Prospect in attesa di follow-up

---

## 11. Estendibilità — Aggiungere un Nuovo Agente

Il valore principale della v2 è la velocità di aggiunta di nuovi agenti. Il processo è:

1. **Avvia il wizard di onboarding** (Step 1–6 descritti in §9): ~20-30 minuti
2. **Carica i documenti di identità** se non già presenti: ~5 minuti
3. **Review del messaggio di esempio generato** e approvazione: ~5 minuti
4. **Agente online e operativo**: entro 30 minuti dall'inizio

**Esempio: nuovo agente per consulenza digital marketing a PMI:**
- Identità: NuMa come consulente digital strategy
- Target: CMO, Responsabile Marketing, Imprenditore PMI Milano
- Search structures: generate automaticamente dal wizard
- Budget: si aggiunge al pool esistente (con riallocazione automatica)

**Il sistema è disegnato per supportare fino a 5–6 agenti attivi simultanei** prima di saturare il budget giornaliero disponibile sul singolo account LinkedIn. Oltre quella soglia, è necessario un secondo account LinkedIn (collegato via Unipile allo stesso sistema).

---

## 12. Stack Tecnologico v2

Rispetto alla v1, le aggiunte sono minime ma strategiche.

### 12.1 Nuovi componenti

| Componente | Tecnologia | Scopo |
|------------|-----------|-------|
| Agent Registry | PostgreSQL + JSON config | Store configurazioni agenti |
| Identity Store | PostgreSQL + pgvector | Store identità e similarity search |
| Document Processor | pdf-parse + mammoth (PPTX) | Estrazione testo da documenti |
| Identity Builder Agent | Claude API (claude-opus) | Sintesi AI dei documenti → Identity Package |
| Onboarding Wizard | React (web UI) o CLI interattiva | Configurazione agenti via UI |
| Multi-agent Orchestrator | BullMQ (job queues separate per agente) | Scheduling e isolamento agenti |

### 12.2 Stack invariato dalla v1

- Runtime: Node.js TypeScript
- Database principale: PostgreSQL (Supabase)
- Cache/Queue: Redis
- ORM: Prisma
- Outreach AI: Claude API (claude-sonnet)
- LinkedIn bridge: Unipile SDK
- Hosting: VPS Hetzner / Railway

### 12.3 Costi aggiornati v2

| Voce | v1 | v2 |
|------|----|----|
| Unipile (1 account) | €49 | €49 |
| VPS | €10 | €10 |
| Claude API (agenti aumentati) | €20–30 | €35–50 |
| Database | €0 | €0 |
| **TOTALE** | **~€79–89** | **~€94–109/mese** |

Il delta è minimo (+€15–20/mese) nonostante il sistema supporti 3 agenti invece di 1.

---

## 13. Fasi di Sviluppo v2

Le fasi 1–3 sono identiche alla v1 (infrastruttura base). Le fasi 4–7 vengono sostanzialmente modificate.

### Fase 1–3 (Settimane 1–6): Invariate dalla v1
- Infrastruttura base, Unipile, DB, Search Engine, Connection Automation

### Fase 4 — Identity Builder (Settimane 7–8)
- [ ] Document processor (PDF, PPTX → testo grezzo)
- [ ] Identity Builder Agent (Claude → Identity Package strutturato)
- [ ] Identity Store + versioning
- [ ] Sistema di ereditarietà identità (base → specializzata)
- [ ] Review & approval UI per Identity Card

### Fase 5 — Agent Registry & Wizard (Settimane 9–10)
- [ ] Schema Agent Registry nel DB
- [ ] Onboarding wizard (CLI o web UI semplice)
- [ ] Configurazione agente YAML + validazione
- [ ] Multi-agent Orchestrator con BullMQ
- [ ] Budget allocation logic
- [ ] Agent lifecycle (active/pause/archive)

### Fase 6 — Agenti AI Multi-Identity (Settimane 11–12)
- [ ] Profile Analysis Agent con identity injection
- [ ] Outreach Agent con identity injection
- [ ] Follow-up Agent con identity injection
- [ ] Test qualità messaggi per tutti e 3 gli agenti
- [ ] Prospect isolation logic (no double-contact)

### Fase 7 — Dashboard + Report v2 (Settimane 13–14)
- [ ] Dashboard multi-agente (aggregata + per agente)
- [ ] Report giornaliero multi-agente via email
- [ ] Alert sistema per risposte ricevute (con indicazione dell'agente)
- [ ] Deploy e go-live

### Fase 8 — Ottimizzazione (Settimane 15–18)
- [ ] A/B testing messaggi per agente
- [ ] Auto-optimization: aumenta budget agli agenti con acceptance rate più alto
- [ ] Enrichment esterno (Google Maps, LinkedIn Sales Navigator)
- [ ] Test aggiunta quarto agente (validazione estendibilità)

---

## 14. Definizione di "Done" v2

Il sistema è MVP completo quando:
- [ ] 3 agenti attivi e operativi in parallelo
- [ ] Identity Package approvato per ogni agente
- [ ] Onboarding wizard funzionante (agente aggiuntivo creato in <30 min)
- [ ] Budget allocation automatica tra agenti
- [ ] Prospect isolation funzionante (zero doppi contatti)
- [ ] Dashboard multi-agente con vista aggregata e per agente
- [ ] Alert risposte ricevute funzionante per tutti gli agenti
- [ ] Sistema operativo autonomamente per 14 giorni consecutivi
- [ ] Nessun ban o penalizzazione account LinkedIn

---

*Fine documento — versione 2.0*
*Supera prd.md v1.0 per la componente architetturale.*
*La v1 rimane valida come riferimento per i dettagli operativi di singolo agente (search structures, message templates, follow-up logic).*
