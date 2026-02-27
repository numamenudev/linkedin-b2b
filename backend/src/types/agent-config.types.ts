/**
 * DC-14: TargetConfig -- defines who this agent targets.
 * Stored as Agent.targetConfig (Prisma Json type).
 * Used by: Step2Target.tsx (UI), search-engine.ts, prospect-scorer.ts
 */
export interface TargetConfig {
  targetTitles: string[];        // e.g. ["Ristoratore", "Chef", "Proprietario ristorante"]
  targetIndustries: string[];    // e.g. ["Food & Beverages", "Hospitality", "Ristorazione"]
  targetLocations: string[];     // e.g. ["Milano", "Roma", "Torino"]
  excludeTitles: string[];       // e.g. ["Studente", "Stagista"] -- profiles with these titles are skipped
  minConnectionCount?: number;   // Optional: minimum connections (default: 0, no filter)
  keywords: string[];            // Search keywords for LinkedIn queries, e.g. ["ristorante", "trattoria"]
}

/**
 * DC-14: MessagingConfig -- defines how this agent communicates.
 * Stored as Agent.messagingConfig (Prisma Json type).
 * Used by: Step3Messaging.tsx (UI), outreach-agent.ts, claude.prompts.ts
 */
export interface MessagingConfig {
  // Cold path prompts (new connections after acceptance)
  coldIntroPrompt: string;         // System instructions for Claude when generating cold intro message
  coldFollowup1Prompt: string;     // System instructions for follow-up #1
  coldFollowup2Prompt: string;     // System instructions for follow-up #2

  // Warm path prompts (existing network connections)
  warmIntroPrompt: string;         // System instructions for warm intro message
  warmFollowup1Prompt: string;     // System instructions for warm follow-up #1
  warmFollowup2Prompt: string;     // System instructions for warm follow-up #2

  // Message constraints
  maxMessageLength: number;        // Default: 500 characters. LinkedIn message limit consideration.
  language: string;                // Default: 'it' (Italian). ISO 639-1 code.
  tone: string;                    // e.g. "professionale ma amichevole", "formale", "casual"
}

/**
 * Default values for new agents (used by Step3Messaging.tsx)
 */
export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  coldIntroPrompt: '',
  coldFollowup1Prompt: '',
  coldFollowup2Prompt: '',
  warmIntroPrompt: '',
  warmFollowup1Prompt: '',
  warmFollowup2Prompt: '',
  maxMessageLength: 500,
  language: 'it',
  tone: 'professionale ma amichevole',
};

/**
 * DC-15: ScoreBreakdown -- result of prospect-scorer.ts scoring algorithm.
 * Threshold: score >= 50 qualifies a prospect for the connection request queue.
 */
export interface ScoreBreakdown {
  titleMatch: number;           // 0-30 points
  locationMatch: number;        // 0-15 points
  industryMatch: number;        // 0-20 points
  profileCompleteness: number;  // 0-15 points
  connectionCount: number;      // 0-10 points
  mutualConnections: number;    // 0-10 points
  total: number;                // 0-100 points
}

/**
 * LinkedInProfile -- normalized profile data returned by Unipile API.
 * Used by prospect-scorer.ts and outreach-agent.ts.
 */
export interface LinkedInProfile {
  linkedinId: string;
  linkedinUrl: string;
  fullName: string;
  firstName: string;
  lastName: string;
  headline?: string;
  location?: string;
  profilePictureUrl?: string;
  industry?: string;
  connectionCount?: number;
  mutualConnections?: number;
  hasExperience?: boolean;
  rawData?: Record<string, unknown>;
}

/**
 * ProfileAnalysis -- result of Claude-based profile analysis in outreach-agent.ts.
 */
export interface ProfileAnalysis {
  businessContext: string;
  activityLevel: 'high' | 'medium' | 'low';
  painPoints: string[];
  contactPointsWithUs: string[];
  relevantPosts: string[];
  recommendedAngle: string;
  toneRecommendation: string;
  notes: string;
}

/**
 * AgentDailyReport -- per-agent statistics for daily Telegram/email reports.
 */
export interface AgentDailyReport {
  agentId: string;
  agentName: string;
  newProspectsFound: number;
  connectionRequestsSent: number;
  connectionsAccepted: number;
  profilesAnalyzed: number;
  introMessagesSent: number;
  followup1Sent: number;
  followup2Sent: number;
  warmMessagesSent: number;
  responsesReceived: number;
  prospectsArchived: number;
}

/**
 * ResponsePreview -- short preview of a prospect reply, shown in daily report.
 */
export interface ResponsePreview {
  prospectName: string;
  agentName: string;
  messagePreview: string;
  receivedAt: Date;
}

/**
 * DailyReportData -- full payload assembled by the reporting job.
 */
export interface DailyReportData {
  date: Date;
  agents: AgentDailyReport[];
  responses: ResponsePreview[];
  weeklyStats: { invitsSent: number; weeklyLimit: number };
  monthlyStats: Record<string, number>;
}
