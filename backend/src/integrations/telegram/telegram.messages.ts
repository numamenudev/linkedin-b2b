/**
 * backend/src/integrations/telegram/telegram.messages.ts
 *
 * Message formatting templates for the Telegram bot.
 * All functions return Markdown-formatted strings ready for Telegram sendMessage().
 *
 * Exported:
 *  formatMorningReport(data)                 — morning briefing
 *  formatEveningReport(data)                 — evening daily report
 *  formatResponseAlert(agentName, name, preview) — prospect replied
 *  formatErrorAlert(agentId, error)          — system/agent error
 *  formatNetworkAnalysis(data)               — weekly network analysis
 */

import type {
  DailyReportData,
  MorningBriefingData,
  NetworkAnalysisData,
} from './telegram.bot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function bar(value: number, max = 100, length = 10): string {
  const filled = Math.round((value / Math.max(max, 1)) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function esc(text: string): string {
  // Minimal escaping for Telegram Markdown v1
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[');
}

// ---------------------------------------------------------------------------
// 1. Morning Report
// ---------------------------------------------------------------------------

/**
 * Format the morning briefing sent by the morning automation job.
 * Shows the day ahead: scheduled jobs, budget, pending actions, health status.
 */
export function formatMorningReport(data: MorningBriefingData): string {
  const healthEmoji =
    data.healthStatus === 'ok' ? '🟢' : data.healthStatus === 'warning' ? '🟡' : '🔴';

  const jobsList =
    data.scheduledJobs.length > 0
      ? data.scheduledJobs.map((j) => `• ${esc(j)}`).join('\n')
      : '• Nessun job programmato';

  const lines: string[] = [
    `*LinkedIn B2B — Briefing Mattutino* ☀️`,
    `_${esc(data.date)}_`,
    ``,
    `${healthEmoji} *Stato sistema:* ${esc(data.healthStatus.toUpperCase())}`,
    data.healthNotes ? `_${esc(data.healthNotes)}_` : '',
    ``,
    `*Agenti attivi:* ${data.activeAgents}`,
    ``,
    `*Budget giornaliero*`,
    `• Richieste connessione: ${data.todayBudget.connections}`,
    `• Messaggi: ${data.todayBudget.messages}`,
    ``,
    `*Da processare*`,
    `• Connessioni in sospeso: ${data.pendingConnections}`,
    `• Messaggi in sospeso: ${data.pendingMessages}`,
    ``,
    `*Notifiche recenti*`,
    `• Nuove accettazioni: ${data.newAcceptancesSince}`,
    `• Nuove risposte: ${data.newResponsesSince}`,
    ``,
    `*Job programmati oggi*`,
    jobsList,
  ];

  return lines.filter((l) => l !== null && l !== undefined).join('\n');
}

// ---------------------------------------------------------------------------
// 2. Evening Report
// ---------------------------------------------------------------------------

/**
 * Format the evening daily report sent by the evening automation job.
 * Shows today's results: connections sent, messages, acceptances, responses.
 */
export function formatEveningReport(data: DailyReportData): string {
  const agentLines = data.agentReports.map((agent) =>
    [
      `*${esc(agent.agentName)}*`,
      `  ↳ Connessioni: ${agent.connectionsSent} | Messaggi: ${agent.messagesSent}`,
      `  ↳ Accettazioni: ${agent.acceptances} | Risposte: ${agent.responses}`,
    ].join('\n'),
  );

  const acceptanceBar = bar(data.overallAcceptanceRate);
  const responseBar = bar(data.overallResponseRate);

  const lines: string[] = [
    `*LinkedIn B2B — Report Serale* 🌙`,
    `_${esc(data.date)}_`,
    ``,
    `*Riepilogo giornaliero*`,
    `• Richieste connessione inviate: ${data.totalConnectionsSent}`,
    `• Messaggi inviati: ${data.totalMessagesSent}`,
    `• Accettazioni ricevute: ${data.totalAcceptances}`,
    `• Risposte ricevute: ${data.totalResponses}`,
    ``,
    `*Performance*`,
    `• Tasso accettazione: ${pct(data.overallAcceptanceRate)} ${acceptanceBar}`,
    `• Tasso risposta: ${pct(data.overallResponseRate)} ${responseBar}`,
    ``,
  ];

  if (agentLines.length > 0) {
    lines.push('*Per agente*');
    lines.push(...agentLines);
  }

  lines.push('', '_Report completo disponibile nella dashboard_');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. Response Alert
// ---------------------------------------------------------------------------

/**
 * Format an immediate alert when a prospect replies on LinkedIn.
 * C8: Automation has been stopped. User must take over manually.
 */
export function formatResponseAlert(
  agentName: string,
  prospectName: string,
  preview: string,
): string {
  const lines: string[] = [
    `*RISPOSTA RICEVUTA* 📩`,
    ``,
    `*Agente:* ${esc(agentName)}`,
    `*Prospect:* ${esc(prospectName)}`,
    ``,
    `*Anteprima:*`,
    `_"${esc(preview)}"_`,
    ``,
    `⚠️ *L'automazione è stata sospesa per questo prospect.*`,
    `Accedi alla dashboard per gestire manualmente la conversazione.`,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. Error Alert
// ---------------------------------------------------------------------------

/**
 * Format an immediate error alert for a system or agent failure.
 */
export function formatErrorAlert(agentId: string, error: string): string {
  const timestamp = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });

  const lines: string[] = [
    `*ERRORE SISTEMA* 🔴`,
    ``,
    `*AgentID:* \`${esc(agentId)}\``,
    `*Ora:* ${esc(timestamp)}`,
    ``,
    `*Errore:*`,
    `\`\`\``,
    esc(error.slice(0, 800)), // Cap at 800 chars to avoid Telegram message limit
    `\`\`\``,
    ``,
    `_Verifica i log nella dashboard per dettagli completi._`,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 5. Network Analysis Report
// ---------------------------------------------------------------------------

/**
 * Format the weekly network analysis report (Sunday job).
 * Shows funnel performance, health warnings, and trends.
 */
export function formatNetworkAnalysis(data: NetworkAnalysisData): string {
  const { sent, accepted, messaged, responded } = data.conversionFunnel;

  const acceptanceRate = sent > 0 ? (accepted / sent) * 100 : 0;
  const messageRate = accepted > 0 ? (messaged / accepted) * 100 : 0;
  const responseRate = messaged > 0 ? (responded / messaged) * 100 : 0;

  const funnelLines = [
    `  Inviti inviati:   ${sent}`,
    `  Accettazioni:     ${accepted} (${pct(acceptanceRate)})`,
    `  Messaggiati:      ${messaged} (${pct(messageRate)} degli accettati)`,
    `  Risposte:         ${responded} (${pct(responseRate)} dei messaggiati)`,
  ];

  const warningLines =
    data.healthWarnings.length > 0
      ? data.healthWarnings.map((w) => `⚠️ ${esc(w)}`)
      : ['✅ Nessun avviso di salute'];

  const lines: string[] = [
    `*LinkedIn B2B — Analisi Rete Settimanale* 📊`,
    `_${esc(data.date)}_`,
    ``,
    `*Rete totale*`,
    `• Connessioni totali: ${data.totalConnections}`,
    `• Nuove connessioni questa settimana: ${data.newConnectionsThisWeek}`,
    `• Conversazioni attive: ${data.activeConversations}`,
    ``,
    `*Funnel di conversione (settimanale)*`,
    ...funnelLines,
    ``,
    `*Tassi chiave*`,
    `• Tasso accettazione: ${pct(data.weeklyAcceptanceRate)} ${bar(data.weeklyAcceptanceRate)}`,
    `• Tasso risposta: ${pct(data.weeklyResponseRate)} ${bar(data.weeklyResponseRate)}`,
    `• Tasso rifiuto: ${pct(data.rejectionRate)} ${bar(data.rejectionRate, 100, 5)}`,
  ];

  if (data.topPerformingAgent) {
    lines.push(``, `*Agente migliore:* ${esc(data.topPerformingAgent)} 🏆`);
  }

  lines.push(``, `*Stato salute account*`, ...warningLines);
  lines.push(``, `_Analisi completa disponibile nella dashboard_`);

  return lines.join('\n');
}
