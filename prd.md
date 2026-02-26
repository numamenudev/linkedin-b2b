# PRD — LinkedIn B2B Outreach Automation Engine
## Progetto: NumaMenu — Acquisizione Clienti & Investitori via LinkedIn

**Versione:** 1.0
**Data:** 2026-02-26
**Autore:** NuMa
**Stato:** Draft — pronto per sviluppo

---

## 1. Executive Summary

Il sistema è un **agente autonomo di outreach LinkedIn** con due track paralleli:

- **Track A — B2B Sales:** trovare e contattare proprietari di ristoranti e piccole catene a Milano per vendere NumaMenu
- **Track B — Fundraising:** trovare e contattare investitori/business angel interessati al settore della ristorazione per pitchare NumaMenu come opportunità d'investimento

Il sistema opera quotidianamente in modo autonomo: cerca nuovi prospect, invia richieste di collegamento, monitora le accettazioni, analizza i profili accettati, genera messaggi personalizzati e gestisce sequenze di follow-up a 3 tentativi. L'utente interviene solo quando riceve una risposta diretta.

Il motore è basato su **Unipile API** come middleware per la gestione dell'account LinkedIn, garantendo sicurezza, rate limiting intelligente e gestione delle code.

---

## 2. Contesto e Problema

### 2.1 Il contesto
NumaMenu (numamenu.it/ristoratori) è un prodotto SaaS per il settore della ristorazione. La crescita richiede acquisizione di clienti B2B tra i proprietari di ristoranti, particolarmente a Milano come mercato pilota. Parallelamente, il progetto necessita di finanziatori per scalare.

### 2.2 Il problema
L'outreach manuale su LinkedIn è:
- **Lento:** richiede ore di ricerca e scrittura manuale ogni giorno
- **Non scalabile:** un umano non può gestire 200 ricerche diverse e centinaia di contatti in follow-up
- **Inefficace:** i messaggi generici hanno tassi di risposta bassi (<2%)
- **Non monitorato:** senza un sistema strutturato si perde traccia di chi ha risposto, chi è in attesa, chi va ricontattato

### 2.3 La soluzione
Un agente AI autonomo che gestisce l'intero funnel di outreach LinkedIn: dalla scoperta dei prospect all'invio del messaggio finale, con personalizzazione basata sull'analisi del profilo e gestione automatica delle sequenze di follow-up.

---

## 3. Obiettivi e KPI

### 3.1 Obiettivi primari
| Obiettivo | Metrica | Target |
|-----------|---------|--------|
| Costruire base contatti qualificata | Nuovi profili scoperti/settimana | 350–500 |
| Crescere rete LinkedIn | Connessioni accettate/mese | 80–120 |
| Generare pipeline commerciale | Meeting prenotati/mese (Track A) | 10–20 |
| Generare pipeline investor | Risposte qualificate/mese (Track B) | 5–10 |

### 3.2 KPI secondari
- **Acceptance rate** richieste di collegamento: target 30–40%
- **Open rate** messaggi: target 60–70%
- **Response rate** messaggio 1: target 10–15%
- **Response rate** messaggi 2+3 combinati: target 5–8% aggiuntivo
- **Conversion rate** risposta → meeting prenotato: target 40–50%

### 3.3 Vincoli operativi
- Massimo **10–15 richieste di collegamento al giorno** per evitare penalizzazioni LinkedIn
- Massimo **20–30 messaggi al giorno** (tra nuovi intro e follow-up)
- Nessuna azione automatizzata dopo una risposta ricevuta: l'utente gestisce personalmente le conversazioni attive

---

## 4. Architettura di Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                                  │
│              (Scheduler + State Machine + Queue Manager)             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────────┐
         │                 │                      │
         ▼                 ▼                      ▼
┌────────────────┐ ┌──────────────┐    ┌─────────────────────┐
│  SEARCH ENGINE │ │   CONTACT    │    │   UNIPILE API       │
│  (200 strutture│ │  REPOSITORY  │    │   GATEWAY           │
│   di ricerca)  │ │  (Database)  │    │   (LinkedIn Bridge) │
└───────┬────────┘ └──────┬───────┘    └──────────┬──────────┘
        │                 │                        │
        └────────────────►│◄───────────────────────┘
                          │
         ┌────────────────┼──────────────────────┐
         │                │                       │
         ▼                ▼                       ▼
┌────────────────┐ ┌──────────────┐    ┌──────────────────────┐
│ PROFILE        │ │ OUTREACH     │    │ FOLLOW-UP            │
│ ANALYSIS AGENT │ │ AGENT        │    │ MANAGER              │
│ (LLM-powered)  │ │ (msg gen)    │    │ (3-step sequence)    │
└────────────────┘ └──────────────┘    └──────────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  ANALYTICS &    │
                │  DASHBOARD      │
                └─────────────────┘
```

### 4.1 Componenti principali

**Orchestrator:** il cervello del sistema. Esegue i job giornalieri in sequenza, gestisce lo stato di ogni contatto, alimenta le code di lavoro per ogni modulo. Gira come processo schedulato (cron job o equivalente).

**Search Engine:** gestisce il catalogo delle 200 strutture di ricerca. Ogni giorno seleziona automaticamente quali strutture mandare in esecuzione, evita duplicati con il repository esistente, e alimenta la coda prospect.

**Contact Repository:** database centrale di tutti i prospect. È la fonte di verità del sistema. Ogni record ha uno stato preciso e una history completa di tutte le interazioni.

**Unipile API Gateway:** il layer di integrazione con LinkedIn. Gestisce autenticazione, rate limiting, queue, e invio/ricezione di tutti gli eventi LinkedIn (richieste, messaggi, accettazioni).

**Profile Analysis Agent:** agente LLM che, per ogni nuova connessione accettata, analizza il profilo LinkedIn in profondità e produce un'analisi strutturata con punti di contatto, pain point e raccomandazioni per il messaggio.

**Outreach Agent:** agente LLM che, partendo dall'analisi del profilo, genera il messaggio personalizzato e lo invia tramite Unipile.

**Follow-up Manager:** gestisce la logica temporale dei follow-up (giorno 3, giorno 10), verifica lo stato di risposta, costruisce messaggi coerenti con la storia della conversazione.

**Analytics Dashboard:** report giornaliero/settimanale su tutti i KPI. Accessibile via interfaccia semplice (HTML statico o Notion-embedded).

---

## 5. Track A — B2B Sales (Ristoratori Milano)

### 5.1 Target Audience

**Profilo ideale:**
- Proprietario/titolare di ristorante indipendente a Milano
- Proprietario di piccola catena (2–5 locali) a Milano
- Operativo nel locale (non solo investitore passivo)
- Attivo su LinkedIn (almeno profilo base)
- Segmento: ristoranti di fascia media o alta (non fast food commodity)

**Criteri di esclusione:**
- Grandi catene o franchise nazionali (McDonald's, etc.)
- Profili inattivi su LinkedIn da più di 6 mesi
- Già contattati in precedenza (dedup automatico)
- Profili senza foto o con dati minimi (bassa probabilità di risposta)

### 5.2 Il Catalogo delle 200 Strutture di Ricerca

Le strutture di ricerca sono combinazioni di variabili su più assi. Vengono eseguite a rotazione, circa 1–2 al giorno, in modo che in ~100–200 giorni si copra l'intero catalogo, poi si ricomincia (il mercato si rinnova).

#### Asse 1 — Titolo professionale (30+ varianti)
```
Titolare | Proprietario | Owner | CEO | Fondatore | Co-fondatore |
Founder | Gestore | Responsabile | Patron | Imprenditore |
Managing Director | General Manager | F&B Manager | Food Director |
Restaurant Owner | Ristoratore | Operatore | Titolare/Gestore |
Chef-Owner | Chef Patron | Executive Chef (se anche owner) |
Socio Fondatore | Amministratore | Socio | Partner | Co-owner |
Head of Operations | Operations Manager (piccole realtà) |
Direttore | Direttore Operativo | Brand Owner
```

#### Asse 2 — Tipo di locale (20+ varianti)
```
Ristorante | Trattoria | Osteria | Pizzeria | Bistrot | Bistrot-Wine bar |
Sushi | Giapponese | Fusion | Cucina Orientale | Cucina Etnica |
Wine Bar | Enoteca | Gastropub | Pub con cucina | Braceria |
Pesce | Seafood | Mare | Cucina di pesce | Cucina creativa |
Cucina tradizionale | Cucina italiana | Fine dining | Casual dining |
Fast casual | Aperitivo | Cocktail bar con cucina | Locale | Esercizio
```

#### Asse 3 — Zona Milano (15+ zone)
```
Milano Centro | Brera | Navigli | Porta Romana | Isola | Porta Venezia |
Lambrate | Città Studi | Loreto | Nolo | Tortona | CityLife |
Sempione | Repubblica | Garibaldi | Porta Nuova | Bovisa | Zona Nord |
Zona Sud | Zona Est | Zona Ovest | Grande Milano | Hinterland Milano
```

#### Asse 4 — Modificatori dimensione/tipologia
```
"piccola catena" | "locale indipendente" | "gruppo ristorativo" |
"ristorazione indipendente" | "attività familiare" | "ristorante di famiglia"
```

#### Asse 5 — Parole chiave di settore
```
Ristorazione | HORECA | HoReCa | F&B | Food & Beverage |
Accoglienza | Ospitalità | Catering | Banqueting
```

#### Logica di combinazione per generare 200 strutture

Ogni struttura è una query di ricerca LinkedIn con questa logica:
```
QUERY = [Titolo_1 OR Titolo_2] + [Settore: Ristoranti/Food] + [Zona_X]
```

Esempi di strutture concrete:
- `"Titolare" OR "Proprietario" + Ristorante + Milano Navigli`
- `"Owner" OR "Fondatore" + Pizzeria + Milano Brera`
- `"CEO" OR "Gestore" + Bistrot + Milano Centro`
- `"Chef-Owner" OR "Chef Patron" + Fine Dining + Milano`
- `"Patron" OR "Ristoratore" + Trattoria + Milano Porta Romana`
- `"Managing Director" + Food & Beverage + Milano Isola`
- `"Titolare" + Piccola catena + Ristorazione + Milano`
- `"Imprenditore" + HORECA + Milano`
- `"Proprietario" + Wine Bar + Milano Porta Venezia`
- `"Founder" + Casual Dining + Milano Zona Nord`
- *(… fino a 200 combinazioni)*

Ogni struttura viene loggata nel sistema con: query string, data ultima esecuzione, risultati trovati, risultati già nel DB, risultati nuovi.

### 5.3 Scoring dei Prospect (Track A)

Ogni prospect trovato riceve un punteggio automatico (0–100) basato su:

| Criterio | Peso | Logica |
|----------|------|--------|
| Titolo professionale pertinente | 25 | "Titolare" = 25, "Manager" = 10 |
| Profilo foto presente | 10 | Sì = 10, No = 0 |
| Profilo completo (sommario, esperienze) | 15 | Completo = 15, Parziale = 7 |
| Attività recente (post/commenti) | 20 | Attivo = 20, Inattivo = 0 |
| Connessioni comuni | 15 | >5 comuni = 15, 1–5 = 7, 0 = 0 |
| Localizzazione confermata Milano | 15 | Milano = 15, Fuori = 0 |

Soglia minima per essere contattato: **punteggio ≥ 50**. Prospect sotto soglia vengono salvati nel DB ma non inseriti nella coda di invio.

---

## 6. Track B — Fundraising (Investitori)

### 6.1 Target Audience Investitori

**Profilo ideale tipo 1 — Business Angel:**
- Business Angel attivo nel food tech o ristorazione
- Membro di reti di angel investing italiane (IAG, Italian Angels for Growth, Club degli Investitori, LVenture, etc.)
- Ex-imprenditori del settore ristorativo diventati investitori
- Professionisti con portfolio dichiarato nel food/hospitality

**Profilo ideale tipo 2 — VC / Family Office:**
- Partner/Associate in VC con focus food tech o consumer
- Family Office con investimenti nel settore hospitality
- Acceleratori specializzati in food/restaurant tech

**Profilo ideale tipo 3 — Industry Expert:**
- Consulenti senior nel settore HORECA con capacità di investimento
- Ex-executive di grandi gruppi ristorativi (potenziali advisor/investitori)
- Docenti universitari con focus food innovation

### 6.2 Strutture di Ricerca Track B (50 strutture dedicate)

```
"Business Angel" + Food Tech | "Business Angel" + Ristorazione |
"Angel Investor" + F&B | "Investor" + HORECA | "VC" + Food |
"Venture Capital" + Hospitality | "Seed Investor" + Startup + Food |
"Italian Angels for Growth" | "IAG" + Food | "Startup investor" + Milano |
"Portfolio" + Ristoranti | "Investment" + Food Tech + Italia |
"Partner" + VC + Consumer | "Early stage" + Food Startup |
"Advisor" + Food Startup + Italia | "Mentor" + Startup + Ristorazione |
"Ex CEO" + Ristorazione + Investor | "Imprenditore" + Food + Angel |
"Board member" + Food Tech | "Family Office" + Hospitality |
…
```

### 6.3 Pitch Angle Track B

A differenza del Track A (vendita di un prodotto), nel Track B il messaggio introduce NumaMenu come **opportunità di investimento**, sottolineando:
- Dimensione del mercato (ristorazione italiana ~45Mld€)
- Problema risolto e traction attuale
- Modello di business e revenue
- Team e vision
- Ask (round seed, strategic partner, advisor)

---

## 7. Contact Repository — Struttura Dati

### 7.1 Schema Principale (tabella `prospects`)

```json
{
  "id": "uuid-v4",
  "linkedin_id": "string",
  "linkedin_url": "string",
  "full_name": "string",
  "first_name": "string",
  "last_name": "string",
  "headline": "string",
  "location": "string",
  "profile_picture_url": "string",

  "restaurant_name": "string | null",
  "restaurant_type": "enum[ristorante|pizzeria|osteria|trattoria|bistrot|winebar|altro]",
  "estimated_size": "enum[solo|piccola_catena|media_catena|unknown]",
  "website": "string | null",

  "track": "enum[B2B|investor]",
  "score": "integer (0–100)",

  "status": "enum[found|queued|connection_sent|connection_accepted|connection_rejected|intro_sent|followup_1_sent|followup_2_sent|responded|archived|opted_out]",

  "search_structure_id": "string (quale delle 200 strutture l'ha trovato)",
  "discovered_at": "datetime",

  "connection_request_sent_at": "datetime | null",
  "connection_request_accepted_at": "datetime | null",
  "connection_request_rejected_at": "datetime | null",

  "profile_analysis": {
    "analyzed_at": "datetime",
    "pain_points": ["array of strings"],
    "business_context": "string",
    "relevant_posts": ["array of post excerpts"],
    "years_in_business": "integer | null",
    "activity_level": "enum[high|medium|low]",
    "contact_points_with_numa": ["array of strings"],
    "recommended_angle": "string",
    "notes": "string"
  },

  "messages": [
    {
      "message_id": "string",
      "sequence_number": "integer (1|2|3)",
      "sent_at": "datetime",
      "content": "string",
      "unipile_message_id": "string",
      "status": "enum[sent|delivered|read|responded]",
      "responded": "boolean",
      "response_received_at": "datetime | null",
      "response_content": "string | null"
    }
  ],

  "last_activity_at": "datetime",
  "created_at": "datetime",
  "updated_at": "datetime",
  "notes": "string"
}
```

### 7.2 Schema `search_structures`

```json
{
  "id": "string",
  "track": "enum[B2B|investor]",
  "title_keywords": ["array"],
  "industry_keywords": ["array"],
  "location_keywords": ["array"],
  "modifiers": ["array"],
  "full_query_string": "string",
  "last_executed_at": "datetime | null",
  "times_executed": "integer",
  "total_results_found": "integer",
  "new_results_last_run": "integer",
  "enabled": "boolean"
}
```

### 7.3 Schema `daily_logs`

```json
{
  "date": "date",
  "track": "enum[B2B|investor|all]",
  "search_structures_run": ["array of ids"],
  "new_prospects_found": "integer",
  "connection_requests_sent": "integer",
  "connection_requests_accepted_today": "integer",
  "profiles_analyzed": "integer",
  "messages_sent": "integer",
  "responses_received": "integer",
  "cumulative_pending_connections": "integer",
  "cumulative_connected": "integer",
  "cumulative_responded": "integer",
  "errors": ["array of error logs"]
}
```

---

## 8. Flusso Operativo Giornaliero

### 8.1 Architettura temporale

Il sistema esegue **4 job schedulati al giorno** con orari variabilizzati di ±30 minuti per simulare comportamento umano:

```
09:00 ± 30min  →  JOB MATTINA   (monitoraggio + analisi profili)
11:30 ± 30min  →  JOB MIDDAY    (ricerca nuovi prospect)
14:00 ± 30min  →  JOB POMERIGGIO (invio richieste + messaggi)
18:30 ± 30min  →  JOB SERA      (log + report + preparazione domani)
```

### 8.2 JOB MATTINA — Monitoraggio & Analisi

```
1. CHECK ACCEPTANCE MONITOR
   → Chiama Unipile API: "dammi tutte le connection requests accettate/rifiutate nelle ultime 24h"
   → Per ogni accettazione: aggiorna stato prospect → "connection_accepted"
   → Per ogni rifiuto: aggiorna stato → "connection_rejected", rimuovi dalla coda messaggi
   → Logga: N accettate, N rifiutate

2. QUEUE PROFILE ANALYSIS
   → Trova tutti i prospect con stato "connection_accepted" e "profile_analysis" = null
   → Per ognuno: chiama Unipile API per scaricare profilo completo (posts, esperienze, bio)
   → Passa i dati all'Agente di Analisi Profilo
   → Salva analisi nel campo "profile_analysis" del record
   → Aggiorna stato → "ready_for_outreach"

3. CHECK FOLLOW-UP QUEUE
   → Trova tutti i prospect con:
     a) stato "intro_sent" E (oggi - intro_sent_date) >= 3 giorni E "responded" = false
        → Aggiungi a coda follow-up 1
     b) stato "followup_1_sent" E (oggi - followup_1_date) >= 7 giorni E "responded" = false
        → Aggiungi a coda follow-up 2 (last chance)
     c) stato "followup_2_sent" E (oggi - followup_2_date) >= 3 giorni E "responded" = false
        → Aggiorna stato → "archived", stop automatico

4. REPORT MATTINA
   → Invia notifica all'utente (email o webhook): "N nuove connessioni, N profili analizzati, N follow-up in coda"
```

### 8.3 JOB MIDDAY — Ricerca Nuovi Prospect

```
1. SELEZIONE STRUTTURA DI RICERCA
   → Seleziona 2 strutture dal catalogo:
     - 1 struttura Track A (B2B, ristoratori)
     - 1 struttura Track B (investor)
   → Criterio di selezione: priorità alle strutture mai eseguite, poi a quelle eseguite meno recentemente

2. ESECUZIONE RICERCA
   → Per ogni struttura: chiama Unipile LinkedIn Search API
   → Scarica lista profili risultanti (max 50–100 per ricerca)

3. DEDUPLICATION
   → Per ogni profilo trovato: controlla se linkedin_id è già nel Contact Repository
   → Scarta i duplicati

4. SCORING
   → Per ogni nuovo profilo: calcola score (0–100) secondo i criteri definiti in §5.3
   → Profili con score < 50: salva nel DB con status "found" ma NON accodare
   → Profili con score ≥ 50: salva nel DB con status "queued"

5. LOG
   → Aggiorna record search_structure con: last_executed_at, total_results, new_results
```

### 8.4 JOB POMERIGGIO — Invio Richieste & Messaggi

```
1. CALCOLO BUDGET GIORNALIERO
   → Budget connection requests: 10–15 (default: 12)
   → Budget messaggi: 20–25 (default: 22)
   → I budget si adattano automaticamente: se ieri ne ho inviati di più, oggi ne invio di meno

2. INVIO RICHIESTE DI COLLEGAMENTO
   → Prendi i primi N prospect dalla coda (status: "queued"), ordinati per score decrescente
   → Per ognuno: invia connection request tramite Unipile API
     - Includi nota breve (opzionale, max 300 caratteri): es. "Ciao [Nome], ho visto il tuo profilo — mi occupo di soluzioni per la ristorazione e vorrei connettermi."
   → Aggiorna status → "connection_sent", registra data
   → Inserisci intervallo casuale tra ogni invio: 2–5 minuti

3. INVIO MESSAGGI INTRO (nuove connessioni)
   → Prendi tutti i prospect con status "ready_for_outreach"
   → Per ognuno: l'Outreach Agent genera il messaggio personalizzato basato su profile_analysis
   → Invia messaggio tramite Unipile API
   → Aggiorna status → "intro_sent", salva messaggio nel campo messages[]
   → Inserisci intervallo casuale tra ogni invio: 3–7 minuti

4. INVIO FOLLOW-UP
   → Prendi tutti i prospect in coda follow-up (da JOB MATTINA)
   → Per ognuno: l'Outreach Agent genera follow-up coerente con messaggio precedente
   → Invia tramite Unipile API
   → Aggiorna status (followup_1_sent o followup_2_sent)
   → Salva messaggio nel campo messages[]
```

### 8.5 JOB SERA — Logging & Report

```
1. COMPILA DAILY LOG
   → Aggrega tutte le attività del giorno in un record daily_logs

2. GENERA REPORT GIORNALIERO
   → Dashboard aggiornata con metriche cumulative
   → Alert per eventuali prospect che hanno risposto (richiede intervento manuale)
   → Proiezioni settimanali/mensili

3. PREPARAZIONE DOMANI
   → Pre-seleziona strutture di ricerca per domani
   → Stima budget disponibile
   → Identifica prospect in follow-up urgente
```

---

## 9. Agente di Analisi Profilo

### 9.1 Input
L'agente riceve:
- **Dati grezzi del profilo LinkedIn** (via Unipile): headline, bio/sommario, esperienze lavorative, istruzione, competenze, post recenti (ultimi 5–10), connessioni comuni
- **Track** del prospect (B2B o investor)
- **Profilo di NumaMenu** (prompt di sistema fisso)

### 9.2 Output strutturato

L'agente produce un JSON strutturato:

```json
{
  "business_context": "Breve sintesi del business del ristorante/investitore (2–3 frasi)",
  "years_in_business": 8,
  "activity_level": "high",
  "pain_points": [
    "Gestione del menu spesso macchinosa e lenta da aggiornare",
    "Poca visibilità digitale nonostante ottima cucina",
    "Difficoltà nel comunicare aggiornamenti ai clienti in tempo reale"
  ],
  "contact_points_with_numa": [
    "Ha postato su Instagram aggiornamenti del menu ogni settimana → NumaMenu automatizza questo",
    "Ha scritto di voler digitalizzare il locale → NumaMenu è la risposta diretta",
    "Ha menzionato problemi con il menu cartaceo durante covid → NumaMenu risolve questo"
  ],
  "relevant_posts": [
    "Post del 15/01: 'Aggiornare il menu ogni settimana è un lavoraccio, ma ne vale la pena...'",
    "Post del 03/02: 'Stiamo pensando di digitalizzare il locale...'"
  ],
  "recommended_angle": "Focus sulla semplicità di aggiornamento digitale del menu e sul risparmio di tempo operativo",
  "tone_recommendation": "Diretto, informale, colloquiale — evita linguaggio corporate",
  "notes": "Molto attivo su LinkedIn, risponde spesso ai commenti. Menziona spesso la sua brigata. Il ristorante ha vinto una menzione Gambero Rosso."
}
```

### 9.3 Logica di fallback
Se il profilo è scarno (pochi dati), l'agente:
- Segnala `activity_level: "low"` e `data_quality: "insufficient"`
- Usa angolo generico basato sul tipo di locale e zona
- Abbassa il punteggio di priorità del prospect

---

## 10. Agente di Outreach — Generazione Messaggi

### 10.1 Principi guida per tutti i messaggi

1. **Brevità assoluta:** max 5–7 righe. LinkedIn non è email.
2. **Personalizzazione reale:** almeno 1 riferimento specifico al profilo/locale/post
3. **Nessun pitch immediato:** messaggio 1 = curiosità + connessione umana + CTA leggera
4. **CTA una sola:** una domanda, una richiesta, non tre
5. **Tono umano:** non "sono il fondatore di una startup innovativa che..." ma "ho visto che gestisci un ristorante a Navigli..."
6. **Niente allegati o link al primo messaggio** (trigger spam LinkedIn)

### 10.2 Template strutturale — Track A, Messaggio 1 (Intro)

```
Ciao [NOME],

[Aggancio specifico: post recente / tipo di locale / zona / achievement]

Mi chiamo [NuMa], sto lavorando a [NumaMenu] — uno strumento per [angolo specifico del contact_point più rilevante].

[Problema o scenario in 1 frase che risuona col suo pain point principale]

Ti andrebbe di fare due chiacchiere veloce? Anche solo 15 minuti in call.

[Nome]
```

**Esempio concreto:**
```
Ciao Marco,

Ho visto il tuo post sulla fatica di aggiornare il menu ogni settimana — mi ha colpito perché è esattamente il problema che stiamo cercando di risolvere.

Sto lavorando a NumaMenu, uno strumento che permette ai ristoratori di aggiornare il menu digitale in 2 minuti e sincronizzarlo automaticamente con QR code, Google, e i canali social.

Ti andrebbe di fare 15 minuti in call questa settimana?

NuMa
```

### 10.3 Template strutturale — Track A, Messaggio 2 (Follow-up, giorno 3)

Il messaggio 2 **non menziona** il messaggio 1. Cambia angolo completamente.

```
Ciao [NOME],

[Nuovo aggancio: una domanda aperta sul suo contesto OR un dato/insight di settore rilevante]

[1 frase su cosa fa NumaMenu da un angolo diverso dal messaggio 1]

[CTA diversa: es. "ti mando il link al sito?" oppure "hai 5 minuti per una call?"]

[Nome]
```

**Esempio:**
```
Ciao Marco,

Stavo pensando: quante volte al mese aggiorni il menu del tuo ristorante?

Abbiamo lavorato con alcuni ristoratori a Milano che ora gestiscono tutto questo da telefono in 2 minuti.

Ti va se ti mando il link al progetto? Nessun impegno, solo per curiosità.

NuMa
```

### 10.4 Template strutturale — Track A, Messaggio 3 (Last Chance, giorno 10)

```
Ciao [NOME],

Ultimo messaggio, lo prometto — so che sei impegnato.

[1 frase finale su NumaMenu con angolo completamente diverso dai precedenti: es. impatto sui clienti, sul fatturato, su un trend specifico]

Se mai avessi curiosità: [numamenu.it/ristoratori]

In bocca al lupo con il locale.
[Nome]
```

### 10.5 Template Track B (Investitori) — Messaggio 1

```
Ciao [NOME],

[Aggancio specifico: portfolio, post sull'investimento nel settore food/hospitality, menzione di una startup simile che segue]

Sto costruendo NumaMenu — [1 frase sul prodotto e traction/mercato].

[Dato rilevante: es. "siamo già usati da X ristoranti a Milano" o "il mercato della ristorazione digitale in Italia vale X"]

Sarebbe bello confrontarmi con te — hai 20 minuti per una call esplorativa?

[Nome]
```

### 10.6 Regole di personalizzazione per l'Outreach Agent

L'Outreach Agent riceve l'analisi del profilo e segue queste priorità per personalizzare:

1. **Se ci sono post recenti rilevanti** → usa un post come aggancio (citarlo in modo naturale, non "ho visto il tuo post di 3 giorni fa in cui...")
2. **Se non ci sono post** → usa il nome del ristorante/locale come aggancio + zona
3. **Se ci sono connessioni comuni** → menziona la connessione comune come credenziale
4. **Se il profilo mostra un achievement recente** (apertura nuovo locale, premio, evento) → congratulati e usa come apertura
5. **Fallback generico** → aggancio sulla zona/tipo di locale + domanda diretta

---

## 11. Follow-up Manager — Logica Dettagliata

### 11.1 Macchina a stati del prospect

```
found
  ↓ (scoring ≥ 50)
queued
  ↓ (invio connection request)
connection_sent
  ↓ (accettata)                ↓ (rifiutata / scaduta 30gg)
connection_accepted          archived_rejected
  ↓ (analisi profilo)
ready_for_outreach
  ↓ (invio messaggio 1)
intro_sent
  ↓ (risposta)                 ↓ (no risposta dopo 3gg)
RESPONDED (stop, alert)      followup_1_queued
                               ↓ (invio follow-up 1)
                             followup_1_sent
                               ↓ (risposta)     ↓ (no risposta dopo 7gg)
                             RESPONDED        followup_2_queued
                                               ↓ (invio follow-up 2)
                                             followup_2_sent
                                               ↓ (risposta)  ↓ (no risposta dopo 3gg)
                                             RESPONDED      archived_no_response
```

### 11.2 Gestione delle risposte

Quando Unipile rileva una risposta (webhook):
1. Il sistema aggiorna immediatamente lo stato → `responded`
2. Salva il contenuto della risposta nel record
3. **STOP** a qualsiasi automazione per quel prospect
4. Invia notifica urgente all'utente: "[NOME] ha risposto su LinkedIn — intervieni tu"
5. La conversazione passa sotto controllo manuale dell'utente

Il sistema **non risponde mai automaticamente** a una risposta ricevuta.

### 11.3 Gestione connessioni in attesa scadute

LinkedIn tipicamente scade le inviti dopo 30 giorni. Il sistema:
- Dopo 30 giorni senza risposta alla connection request → stato `archived_expired`
- Dopo 6 mesi: il sistema può ri-proporre il prospect per una nuova connection request (mercato si rinnova)

---

## 12. Sicurezza & Anti-Ban Strategy

### 12.1 Limiti operativi conservativi

| Azione | Limite LinkedIn | Nostro limite |
|--------|----------------|---------------|
| Connection requests/giorno | ~80–100 (paid) | **10–15** |
| Messaggi/giorno | 100–150 | **20–30** |
| Profile views/giorno | ~150 | **50–80** |
| Ricerche/giorno | illimitate | **5–10 esecuzioni** |

### 12.2 Comportamento umano simulato

- **Variabilizzazione orari:** tutti i job partono con offset casuale ±30 minuti
- **Intervalli tra azioni:** 2–8 minuti tra ogni connection request, 3–10 minuti tra messaggi
- **Non operare il week-end:** opzionale ma raccomandato (o ridurre il volume al 50%)
- **Pausa durante festività italiane:** il sistema rileva le date e riduce automaticamente il volume
- **Warm-up iniziale:** la prima settimana invia solo 5 connection request/giorno, poi sale gradualmente

### 12.3 Proxy & Account Safety
- Unipile gestisce automaticamente i proxy per account (IP fissi per account)
- Non condividere mai le credenziali LinkedIn con altri sistemi
- Monitorare il Social Selling Index (SSI) dell'account settimanalmente
- Alert automatico se SSI scende bruscamente (segnale di penalizzazione)

### 12.4 Compliance GDPR
- Tutti i dati dei prospect sono trattati per finalità di marketing B2B (legittimo interesse)
- Il Contact Repository non è accessibile pubblicamente
- Su richiesta esplicita di un prospect, il suo record viene eliminato (`opted_out`)

---

## 13. Analytics & Dashboard

### 13.1 Dashboard Giornaliera

```
═══════════════════════════════════════════════════════════════
 NUMA MENU — LINKEDIN ENGINE | 26 Feb 2026
═══════════════════════════════════════════════════════════════

 OGGI
 ├── Nuovi prospect trovati:     23 (18 B2B, 5 Investor)
 ├── Connection requests inviate: 12 (10 B2B, 2 Investor)
 ├── Accettazioni ricevute:       4
 ├── Messaggi inviati:           14 (6 intro, 5 follow-up1, 3 follow-up2)
 └── Risposte ricevute:           2 ⚡ (richiedono attenzione)

 CUMULATIVO
 ├── Tot. prospect nel DB:       847
 ├── Pending connections:        143
 ├── Connessi:                   312
 ├── In outreach:                198
 ├── Rispondenti:                 47  (15.1%)
 └── Archiviati:                 254

 TRACK A — B2B RISTORATORI
 ├── Acceptance rate:            34.2%
 ├── Response rate (msg1):       12.8%
 └── Meeting prenotati:          18

 TRACK B — INVESTITORI
 ├── Acceptance rate:            28.7%
 ├── Response rate (msg1):       9.3%
 └── Call esplorative:            6

 STRUTTURE DI RICERCA
 ├── Eseguite totale:             67 / 200
 └── Prossima esecuzione:        Struttura #68 (Titolare+Pizzeria+Isola)
═══════════════════════════════════════════════════════════════
```

### 13.2 Report Settimanale

Il sistema genera ogni lunedì mattina un report settimanale con:
- Trend acceptance rate (settimana su settimana)
- Top 5 strutture di ricerca per qualità prospect (score medio più alto)
- Prospect con risposta ricevuta da gestire
- Previsione pipeline per le prossime 4 settimane
- Eventuali anomalie o alert di sicurezza account

### 13.3 Alert & Notifiche

| Evento | Canale | Urgenza |
|--------|--------|---------|
| Risposta ricevuta da prospect | Email + push | 🔴 Urgente |
| Account LinkedIn flag sospetto | Email | 🔴 Urgente |
| SSI drop >10 punti | Email | 🟡 Attenzione |
| 0 accettazioni in 3 giorni | Email | 🟡 Attenzione |
| Report giornaliero | Email | 🟢 Info |
| Report settimanale | Email | 🟢 Info |

---

## 14. Stack Tecnologico Consigliato

### 14.1 Backend Core
- **Runtime:** Node.js (TypeScript) — ottimo per operazioni async e Unipile SDK ufficiale
- **Scheduler:** node-cron o BullMQ per job queue + scheduling
- **Database:** PostgreSQL (struttura dati relazionale) con Redis per code e cache
- **ORM:** Prisma

### 14.2 AI / LLM Layer
- **Profile Analysis Agent:** Claude API (Anthropic) — claude-sonnet per analisi profilo
- **Outreach Agent:** Claude API — claude-sonnet per generazione messaggi
- **Prompt management:** sistema di versioning dei prompt (es. Langsmith o semplice JSON)

### 14.3 Integrazioni
- **Unipile SDK:** `@unipile/node-sdk` per LinkedIn
- **Notifiche:** email via Resend o SendGrid, opzionale push via ntfy.sh
- **Dashboard:** HTML/React semplice servito localmente, o Notion database alimentato via API

### 14.4 Infrastructure
- **Deploy:** VPS leggero (es. Hetzner CX11, ~5€/mese) o Railway/Render
- **Database:** Supabase (PostgreSQL hosted gratuito fino a certi limiti)
- **Backup:** backup automatico DB ogni 24h su S3 o Backblaze

### 14.5 Costi stimati mensili
| Voce | Costo stimato |
|------|--------------|
| Unipile API (1 account LinkedIn) | €49/mese |
| VPS hosting | €5–10/mese |
| Claude API (analisi + messaggi) | €15–30/mese |
| Database (Supabase free tier) | €0 |
| Email notifiche (Resend free tier) | €0 |
| **TOTALE** | **~€70–90/mese** |

---

## 15. Fasi di Sviluppo

### Fase 1 — Fondamenta (Settimane 1–2)
- [ ] Setup progetto Node.js + TypeScript
- [ ] Integrazione Unipile API (auth, test connection)
- [ ] Schema database Prisma + PostgreSQL
- [ ] CRUD base Contact Repository
- [ ] Test invio manuale connection request via API
- [ ] Test recupero profilo LinkedIn via API

### Fase 2 — Search Engine (Settimane 3–4)
- [ ] Implementazione catalogo 200 strutture di ricerca (JSON config)
- [ ] Motore di esecuzione ricerche via Unipile
- [ ] Logica deduplication
- [ ] Algoritmo scoring prospect
- [ ] Job "midday" funzionante

### Fase 3 — Connection Automation (Settimane 5–6)
- [ ] Job scheduler con BullMQ
- [ ] Logic invio connection requests con rate limiting
- [ ] Acceptance Monitor (webhook Unipile + polling fallback)
- [ ] Gestione stati prospect (state machine)
- [ ] Job "mattina" funzionante
- [ ] Job "pomeriggio" — sezione connection requests

### Fase 4 — AI Agents (Settimane 7–8)
- [ ] Profile Analysis Agent (prompt engineering + Claude API)
- [ ] Outreach Agent — generazione messaggio 1 (con personalizzazione)
- [ ] Test qualità messaggi su 10 profili reali
- [ ] Ottimizzazione prompt
- [ ] Integrazione invio messaggi via Unipile

### Fase 5 — Follow-up Manager (Settimane 9–10)
- [ ] Follow-up Agent (messaggi 2 e 3)
- [ ] Logica temporale follow-up (giorno 3, giorno 10)
- [ ] Gestione stato "responded" + stop automation
- [ ] Sistema notifiche (email)
- [ ] Test end-to-end completo ciclo

### Fase 6 — Track B + Dashboard (Settimane 11–12)
- [ ] Adattamento Search Engine per Track B (investitori)
- [ ] Adattamento Profile Analysis Agent per Track B
- [ ] Adattamento Outreach Agent per pitch investitori
- [ ] Dashboard analytics (HTML o Notion)
- [ ] Report giornaliero/settimanale automatico
- [ ] Deploy su VPS

### Fase 7 — Ottimizzazione (Settimane 13–16)
- [ ] A/B testing messaggi (varianti A/B automatiche)
- [ ] Affinamento scoring prospect
- [ ] Analisi strutture di ricerca più performanti
- [ ] Aggiunta dati di enrichment (es. Google My Business, Tripadvisor score)
- [ ] Monitoring avanzato account LinkedIn health

---

## 16. Rischi & Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| Ban account LinkedIn | Bassa (con limiti conservativi) | Alto | Rate limiting estremamente conservativo, comportamento umano simulato, warm-up graduale |
| Qualità messaggi bassa → basso response rate | Media | Medio | A/B testing continuo, review manuale dei primi 20 messaggi, ottimizzazione prompt |
| Dati profilo insufficienti per personalizzazione | Media | Basso | Fallback a template generico per area/tipo locale |
| Prospect già contattati da altri sistemi simili | Alta | Basso | Il sistema non può saperlo — mitigazione: messaggi che si distinguono per qualità |
| Cambio API Unipile / LinkedIn | Bassa | Alto | Layer di astrazione nell'architettura che isola le dipendenze API |
| False positive nel targeting (non proprietari) | Media | Basso | Score system con threshold, review periodica manuale del 10% del campione |

---

## 17. Future Evoluzioni (Post-MVP)

1. **Enrichment automatico:** integrazione con API Google Places, Tripadvisor, o DesignMyNight per arricchire i profili prospect con dati del ristorante (voti, prezzi, tipo cucina, capacità)
2. **CRM integration:** sync con Notion, Airtable, o HubSpot per gestire il pipeline commerciale post-risposta
3. **Multi-account LinkedIn:** aggiungere un secondo account LinkedIn per aumentare il volume giornaliero
4. **Espansione geografica:** dopo Milano → Roma, poi Torino, poi Italia
5. **Voice prospecting:** integrazione con sistema di chiamata automatica come fallback per i non-responsivi
6. **Lookalike prospecting:** usa i profili che hanno risposto positivamente per trovare prospect simili tramite ML
7. **Content strategy agent:** agente parallelo che suggerisce cosa postare su LinkedIn per aumentare l'awareness e l'acceptance rate organico
8. **WhatsApp outreach:** per ristoratori trovati su LinkedIn ma non attivi → bridge a WhatsApp via Unipile

---

## 18. Definizione di "Done"

Il sistema è considerato MVP completo quando:
- [ ] Gira autonomamente per 7 giorni consecutivi senza intervento manuale
- [ ] Ha inviato almeno 100 connection requests
- [ ] Ha ricevuto almeno 30 accettazioni
- [ ] Ha inviato almeno 30 messaggi intro personalizzati
- [ ] Ha generato almeno 5 risposte
- [ ] Il report giornaliero arriva via email correttamente
- [ ] Nessun ban o penalizzazione account LinkedIn
- [ ] Il Contact Repository contiene dati puliti e consultabili

---

*Fine documento — versione 1.0*
*Prossima revisione prevista dopo Fase 3 (post-deployment connection automation)*
