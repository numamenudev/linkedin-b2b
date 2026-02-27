/**
 * backend/src/integrations/email/email-templates.ts
 *
 * HTML email template builder for the daily LinkedIn activity report.
 *
 * buildEmailHtml(data) — generates a complete, self-contained HTML document
 * with inline CSS for maximum email-client compatibility.
 *
 * Template sections:
 *   1. Header   — date and platform branding
 *   2. Responses received today (with message preview)
 *   3. Per-agent activity table (all DailyLog metrics)
 *   4. Cumulative counters — weekly + monthly side-by-side
 *   5. Network analysis — top agent, overall rates, last analysis date
 *   6. LinkedIn account health — usage bars + warning badges
 *   7. Footer   — dashboard link + generated timestamp
 *
 * Design goals:
 *   - Inline CSS only (no <style> blocks) for Outlook / Gmail compatibility
 *   - max-width 600px for desktop; single-column layout for mobile
 *   - Responsive via fluid percentages; min-width: 0 on table cells
 *   - No external images, fonts, or scripts
 *
 * Export: buildEmailHtml
 */

// ---------------------------------------------------------------------------
// Data types (exported so email-report.ts can import them)
// ---------------------------------------------------------------------------

export interface AgentActivityRow {
  agentId: string;
  agentName: string;
  searchStructuresRun: number;
  newProspectsFound: number;
  connectionRequestsSent: number;
  connectionsAccepted: number;
  connectionsRejected: number;
  profilesAnalyzed: number;
  messagesSent: number;
  responsesReceived: number;
  /** Acceptance rate in % (0-100). */
  acceptanceRate: number;
  /** Response rate in % (0-100). */
  responseRate: number;
}

export interface ResponsePreview {
  prospectName: string;
  agentName: string;
  prospectLinkedinUrl: string;
  messagePreview: string;
  respondedAt: Date;
}

export interface CumulativeCounters {
  weekly: {
    connectionsSent: number;
    messagesDelivered: number;
    responsesReceived: number;
  };
  monthly: {
    connectionsSent: number;
    messagesDelivered: number;
    responsesReceived: number;
    newProspectsFound: number;
  };
}

export interface NetworkSummary {
  totalActiveAgents: number;
  topAgent: string | null;
  topAgentAcceptanceRate: number | null;
  overallWeeklyAcceptanceRate: number;
  overallWeeklyResponseRate: number;
  lastNetworkAnalysisAt: Date | null;
}

export interface LinkedInHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  weeklyConnectionsUsed: number;
  weeklyConnectionsLimit: number;
  dailyConnectionsUsed: number;
  dailyConnectionsLimit: number;
  notes: string[];
}

/**
 * Composite type passed to buildEmailHtml() and assembled by generateDailyReport().
 */
export interface EmailReportData {
  date: string;
  agentActivity: AgentActivityRow[];
  responsePreviews: ResponsePreview[];
  cumulative: CumulativeCounters;
  networkSummary: NetworkSummary;
  linkedInHealth: LinkedInHealthStatus;
  /** Full URL to the dashboard, e.g. https://app.example.com */
  dashboardUrl: string;
  /** When this report object was assembled */
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Colour palette (inline-safe)
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#f4f6f9',
  card: '#ffffff',
  primary: '#0077b5',      // LinkedIn blue
  primaryDark: '#005f8a',
  success: '#28a745',
  warning: '#fd7e14',
  danger: '#dc3545',
  textDark: '#212529',
  textMid: '#495057',
  textLight: '#6c757d',
  border: '#dee2e6',
  headerBg: '#0077b5',
  headerText: '#ffffff',
  rowAlt: '#f8f9fa',
};

// ---------------------------------------------------------------------------
// Low-level HTML helpers
// ---------------------------------------------------------------------------

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(
  label: string,
  color: string,
  bg: string,
): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${esc(color)};background-color:${esc(bg)};">${esc(label)}</span>`;
}

function statusBadge(status: LinkedInHealthStatus['status']): string {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    healthy: { label: 'Healthy', color: '#155724', bg: '#d4edda' },
    warning: { label: 'Warning', color: '#856404', bg: '#fff3cd' },
    critical: { label: 'Critical', color: '#721c24', bg: '#f8d7da' },
  };
  const cfg = map[status] ?? map['warning'];
  return badge(cfg.label, cfg.color, cfg.bg);
}

function progressBar(used: number, total: number): string {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barColor =
    pct >= 90 ? COLORS.danger : pct >= 70 ? COLORS.warning : COLORS.success;

  return `
    <div style="background-color:${COLORS.border};border-radius:4px;height:8px;margin:4px 0;">
      <div style="width:${pct}%;background-color:${barColor};height:8px;border-radius:4px;min-width:${pct > 0 ? '4px' : '0'};"></div>
    </div>
    <span style="font-size:11px;color:${COLORS.textLight};">${used} / ${total} (${pct}%)</span>
  `;
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------

function card(title: string, content: string): string {
  return `
    <div style="background-color:${COLORS.card};border-radius:8px;margin-bottom:20px;overflow:hidden;border:1px solid ${COLORS.border};">
      <div style="background-color:${COLORS.primary};padding:12px 20px;">
        <h2 style="margin:0;font-size:15px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;">${esc(title)}</h2>
      </div>
      <div style="padding:20px;">
        ${content}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildResponsesSection(responses: ResponsePreview[]): string {
  if (responses.length === 0) {
    return card(
      'Risposte Ricevute Oggi',
      `<p style="margin:0;color:${COLORS.textLight};font-style:italic;font-family:Arial,sans-serif;">Nessuna risposta ricevuta oggi.</p>`,
    );
  }

  const rows = responses
    .map((r, i) => {
      const rowBg = i % 2 === 0 ? COLORS.card : COLORS.rowAlt;
      const time = r.respondedAt
        ? new Date(r.respondedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';

      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;">
            <a href="${esc(r.prospectLinkedinUrl)}" style="color:${COLORS.primary};text-decoration:none;font-weight:600;font-size:13px;">${esc(r.prospectName)}</a>
            <div style="font-size:11px;color:${COLORS.textLight};margin-top:2px;">${esc(r.agentName)} &bull; ${esc(time)}</div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;color:${COLORS.textMid};max-width:300px;">
            <em style="color:${COLORS.textLight};">&ldquo;${esc(r.messagePreview)}${r.messagePreview.length >= 200 ? '&hellip;' : ''}&rdquo;</em>
          </td>
        </tr>
      `;
    })
    .join('');

  const content = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background-color:${COLORS.rowAlt};">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${COLORS.textLight};border-bottom:2px solid ${COLORS.border};font-family:Arial,sans-serif;font-weight:600;">Prospect</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${COLORS.textLight};border-bottom:2px solid ${COLORS.border};font-family:Arial,sans-serif;font-weight:600;">Anteprima Messaggio</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return card(`Risposte Ricevute Oggi (${responses.length})`, content);
}

function buildAgentActivitySection(agents: AgentActivityRow[]): string {
  if (agents.length === 0) {
    return card(
      'Attivit&agrave; per Agente',
      `<p style="margin:0;color:${COLORS.textLight};font-style:italic;font-family:Arial,sans-serif;">Nessun dato disponibile per oggi.</p>`,
    );
  }

  const rows = agents
    .map((a, i) => {
      const rowBg = i % 2 === 0 ? COLORS.card : COLORS.rowAlt;
      const accColor =
        a.acceptanceRate >= 50 ? COLORS.success :
        a.acceptanceRate >= 25 ? COLORS.warning :
        COLORS.danger;
      const respColor =
        a.responseRate >= 30 ? COLORS.success :
        a.responseRate >= 15 ? COLORS.warning :
        COLORS.danger;

      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:${COLORS.textDark};">${esc(a.agentName)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;color:${COLORS.textMid};">${a.newProspectsFound}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;color:${COLORS.textMid};">${a.connectionRequestsSent}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;color:${COLORS.textMid};">${a.connectionsAccepted}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;font-weight:600;color:${accColor};">${a.acceptanceRate}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;color:${COLORS.textMid};">${a.messagesSent}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;color:${COLORS.textMid};">${a.responsesReceived}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;font-weight:600;color:${respColor};">${a.responseRate}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${COLORS.border};font-family:Arial,sans-serif;font-size:13px;text-align:center;color:${COLORS.textMid};">${a.profilesAnalyzed}</td>
        </tr>
      `;
    })
    .join('');

  const headerStyle = `padding:8px 10px;text-align:center;font-size:11px;color:${COLORS.textLight};border-bottom:2px solid ${COLORS.border};font-family:Arial,sans-serif;font-weight:600;white-space:nowrap;`;

  const content = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px;">
        <thead>
          <tr style="background-color:${COLORS.rowAlt};">
            <th style="${headerStyle}text-align:left;">Agente</th>
            <th style="${headerStyle}">Prospect</th>
            <th style="${headerStyle}">Inviti</th>
            <th style="${headerStyle}">Accettati</th>
            <th style="${headerStyle}">% Acc.</th>
            <th style="${headerStyle}">Msg</th>
            <th style="${headerStyle}">Risposte</th>
            <th style="${headerStyle}">% Risp.</th>
            <th style="${headerStyle}">Profili</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  return card('Attivit&agrave; per Agente', content);
}

function buildCumulativeSection(cumulative: CumulativeCounters): string {
  const cellStyle = `padding:12px 16px;text-align:center;font-family:Arial,sans-serif;`;
  const numStyle = `font-size:24px;font-weight:700;color:${COLORS.primary};display:block;`;
  const labelStyle = `font-size:11px;color:${COLORS.textLight};margin-top:4px;display:block;`;

  const weekRow = `
    <tr style="background-color:${COLORS.rowAlt};">
      <td style="${cellStyle}padding-left:16px;text-align:left;font-weight:600;font-size:13px;color:${COLORS.textDark};border-bottom:1px solid ${COLORS.border};">Questa Settimana</td>
      <td style="${cellStyle}border-bottom:1px solid ${COLORS.border};">
        <span style="${numStyle}">${cumulative.weekly.connectionsSent}</span>
        <span style="${labelStyle}">Inviti</span>
      </td>
      <td style="${cellStyle}border-bottom:1px solid ${COLORS.border};">
        <span style="${numStyle}">${cumulative.weekly.messagesDelivered}</span>
        <span style="${labelStyle}">Messaggi</span>
      </td>
      <td style="${cellStyle}border-bottom:1px solid ${COLORS.border};">
        <span style="${numStyle}">${cumulative.weekly.responsesReceived}</span>
        <span style="${labelStyle}">Risposte</span>
      </td>
      <td style="${cellStyle}border-bottom:1px solid ${COLORS.border};"></td>
    </tr>
  `;

  const monthRow = `
    <tr style="background-color:${COLORS.card};">
      <td style="${cellStyle}padding-left:16px;text-align:left;font-weight:600;font-size:13px;color:${COLORS.textDark};">Questo Mese</td>
      <td style="${cellStyle}">
        <span style="${numStyle}">${cumulative.monthly.connectionsSent}</span>
        <span style="${labelStyle}">Inviti</span>
      </td>
      <td style="${cellStyle}">
        <span style="${numStyle}">${cumulative.monthly.messagesDelivered}</span>
        <span style="${labelStyle}">Messaggi</span>
      </td>
      <td style="${cellStyle}">
        <span style="${numStyle}">${cumulative.monthly.responsesReceived}</span>
        <span style="${labelStyle}">Risposte</span>
      </td>
      <td style="${cellStyle}">
        <span style="${numStyle}">${cumulative.monthly.newProspectsFound}</span>
        <span style="${labelStyle}">Nuovi Prospect</span>
      </td>
    </tr>
  `;

  const headerStyle = `padding:8px 16px;font-size:11px;color:${COLORS.textLight};border-bottom:2px solid ${COLORS.border};font-family:Arial,sans-serif;font-weight:600;text-align:center;`;

  const content = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:380px;">
        <thead>
          <tr style="background-color:${COLORS.rowAlt};">
            <th style="${headerStyle}text-align:left;">Periodo</th>
            <th style="${headerStyle}">Inviti</th>
            <th style="${headerStyle}">Messaggi</th>
            <th style="${headerStyle}">Risposte</th>
            <th style="${headerStyle}">Nuovi Prospect</th>
          </tr>
        </thead>
        <tbody>
          ${weekRow}
          ${monthRow}
        </tbody>
      </table>
    </div>
  `;

  return card('Contatori Cumulativi', content);
}

function buildNetworkSection(network: NetworkSummary): string {
  const lastUpdated = network.lastNetworkAnalysisAt
    ? new Date(network.lastNetworkAnalysisAt).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'N/D';

  const metricBlock = (value: string, label: string) => `
    <div style="display:inline-block;text-align:center;padding:12px 20px;min-width:100px;">
      <span style="font-size:22px;font-weight:700;color:${COLORS.primary};display:block;">${esc(value)}</span>
      <span style="font-size:11px;color:${COLORS.textLight};display:block;margin-top:4px;">${esc(label)}</span>
    </div>
  `;

  const topAgentHtml = network.topAgent
    ? `<div style="margin-top:12px;padding:10px 14px;background-color:${COLORS.rowAlt};border-radius:6px;border-left:3px solid ${COLORS.primary};">
         <span style="font-size:12px;color:${COLORS.textLight};font-family:Arial,sans-serif;">Miglior agente oggi: </span>
         <strong style="font-size:13px;color:${COLORS.textDark};font-family:Arial,sans-serif;">${esc(network.topAgent)}</strong>
         ${network.topAgentAcceptanceRate !== null
           ? `<span style="font-size:12px;color:${COLORS.success};margin-left:8px;font-family:Arial,sans-serif;">${network.topAgentAcceptanceRate}% accettazione</span>`
           : ''}
       </div>`
    : '';

  const content = `
    <div style="text-align:center;padding:8px 0;border-bottom:1px solid ${COLORS.border};margin-bottom:12px;">
      ${metricBlock(String(network.totalActiveAgents), 'Agenti Attivi')}
      ${metricBlock(`${network.overallWeeklyAcceptanceRate}%`, 'Accettazione Sett.')}
      ${metricBlock(`${network.overallWeeklyResponseRate}%`, 'Risposta Sett.')}
    </div>
    ${topAgentHtml}
    <div style="margin-top:12px;font-size:12px;color:${COLORS.textLight};font-family:Arial,sans-serif;">
      Ultimo aggiornamento analisi rete: <strong>${esc(lastUpdated)}</strong>
    </div>
  `;

  return card('Network Analysis', content);
}

function buildHealthSection(health: LinkedInHealthStatus): string {
  const notesList =
    health.notes.length > 0
      ? `<ul style="margin:12px 0 0 0;padding-left:18px;">
           ${health.notes.map((n) => `<li style="font-size:13px;color:${COLORS.textMid};margin-bottom:4px;font-family:Arial,sans-serif;">${esc(n)}</li>`).join('')}
         </ul>`
      : `<p style="margin:12px 0 0 0;font-size:13px;color:${COLORS.success};font-family:Arial,sans-serif;">Nessun problema rilevato.</p>`;

  const content = `
    <div style="margin-bottom:12px;">
      <span style="font-size:13px;font-family:Arial,sans-serif;color:${COLORS.textMid};">Stato account: </span>
      ${statusBadge(health.status)}
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:12px;color:${COLORS.textLight};font-family:Arial,sans-serif;margin-bottom:4px;">Inviti settimanali (limite LinkedIn Free: 150)</div>
      ${progressBar(health.weeklyConnectionsUsed, health.weeklyConnectionsLimit)}
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:12px;color:${COLORS.textLight};font-family:Arial,sans-serif;margin-bottom:4px;">Inviti giornalieri</div>
      ${progressBar(health.dailyConnectionsUsed, health.dailyConnectionsLimit)}
    </div>
    ${notesList}
  `;

  return card('Salute Account LinkedIn', content);
}

// ---------------------------------------------------------------------------
// buildEmailHtml — public export
// ---------------------------------------------------------------------------

/**
 * Build a complete, self-contained HTML email document for the daily report.
 *
 * @param data  Aggregated report data produced by generateDailyReport()
 * @returns     Full HTML string ready to pass to Resend emails.send({ html })
 */
export function buildEmailHtml(data: EmailReportData): string {
  const formattedDate = new Date(data.date + 'T12:00:00Z').toLocaleDateString('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const generatedAt = new Date(data.generatedAt).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const totalResponses = data.responsePreviews.length;
  const totalConnSent = data.agentActivity.reduce((s, a) => s + a.connectionRequestsSent, 0);
  const totalMsgSent = data.agentActivity.reduce((s, a) => s + a.messagesSent, 0);

  const summaryBar = `
    <div style="background-color:${COLORS.primaryDark};padding:12px 24px;display:block;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding:4px 0;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;display:block;">${totalConnSent}</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.8);display:block;">Inviti Inviati</span>
          </td>
          <td style="text-align:center;padding:4px 0;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;display:block;">${totalMsgSent}</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.8);display:block;">Messaggi</span>
          </td>
          <td style="text-align:center;padding:4px 0;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;display:block;">${totalResponses}</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.8);display:block;">Risposte</span>
          </td>
        </tr>
      </table>
    </div>
  `;

  const header = `
    <div style="background-color:${COLORS.headerBg};padding:24px 24px 0 24px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:${COLORS.headerText};font-family:Arial,sans-serif;letter-spacing:-0.5px;">
        LinkedIn B2B Outreach
      </h1>
      <p style="margin:6px 0 16px 0;font-size:13px;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;">
        Report Giornaliero &mdash; ${esc(formattedDate)}
      </p>
    </div>
    ${summaryBar}
  `;

  const footer = `
    <div style="padding:20px 24px;text-align:center;border-top:1px solid ${COLORS.border};">
      <a href="${esc(data.dashboardUrl)}"
         style="display:inline-block;padding:10px 24px;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;font-family:Arial,sans-serif;">
        Apri Dashboard
      </a>
      <p style="margin:14px 0 0 0;font-size:11px;color:${COLORS.textLight};font-family:Arial,sans-serif;">
        Report generato alle ${esc(generatedAt)} &bull; LinkedIn Multi-Agent Outreach Platform
      </p>
    </div>
  `;

  const body = `
    ${buildResponsesSection(data.responsePreviews)}
    ${buildAgentActivitySection(data.agentActivity)}
    ${buildCumulativeSection(data.cumulative)}
    ${buildNetworkSection(data.networkSummary)}
    ${buildHealthSection(data.linkedInHealth)}
  `;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>LinkedIn Report &mdash; ${esc(data.date)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!--[if mso]>
  <table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0">
  <tr><td>
  <![endif]-->
  <div style="max-width:600px;margin:0 auto;background-color:${COLORS.bg};">
    <!-- Email wrapper -->
    <div style="background-color:${COLORS.card};border-radius:8px;margin:20px auto;overflow:hidden;border:1px solid ${COLORS.border};">
      ${header}
      <div style="padding:20px 16px;">
        ${body}
      </div>
      ${footer}
    </div>
  </div>
  <!--[if mso]>
  </td></tr>
  </table>
  <![endif]-->
</body>
</html>`;
}
