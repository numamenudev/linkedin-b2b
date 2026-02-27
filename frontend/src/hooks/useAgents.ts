/**
 * TanStack Query hooks for the Agents API.
 *
 * Endpoints consumed:
 *   GET    /api/agents
 *   GET    /api/agents/:id
 *   GET    /api/agents/:id/stats
 *   POST   /api/agents
 *   PUT    /api/agents/:id
 *   POST   /api/agents/:id/activate  |  /api/agents/:id/pause
 *   DELETE /api/agents/:id           (soft-delete / archive)
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'active' | 'paused' | 'error' | 'draft';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  identityId: string;
  identityName?: string;
  targetDescription?: string;
  dailyLimit: number;
  messageTemplate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStats {
  agentId: string;
  totalProspects: number;
  contacted: number;
  accepted: number;
  responded: number;
  converted: number;
  acceptanceRate: number;
  responseRate: number;
  conversionRate: number;
  dailySent: number;
  weeklyTrend: { date: string; count: number }[];
}

export interface CreateAgentPayload {
  name: string;
  identityId: string;
  targetDescription?: string;
  dailyLimit?: number;
  messageTemplate?: string;
}

export type UpdateAgentPayload = Partial<CreateAgentPayload>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const agentKeys = {
  all: ['agents'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
  detail: (id: string) => [...agentKeys.all, 'detail', id] as const,
  stats: (id: string) => [...agentKeys.all, 'stats', id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all agents */
export function useAgents(): UseQueryResult<Agent[]> {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => api.get<Agent[]>('/agents'),
  });
}

/** Single agent by ID */
export function useAgent(id: string): UseQueryResult<Agent> {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: Boolean(id),
  });
}

/** Agent performance statistics */
export function useAgentStats(id: string): UseQueryResult<AgentStats> {
  return useQuery({
    queryKey: agentKeys.stats(id),
    queryFn: () => api.get<AgentStats>(`/agents/${id}/stats`),
    enabled: Boolean(id),
    staleTime: 1000 * 60, // 1 minute
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new agent */
export function useCreateAgent(): UseMutationResult<Agent, Error, CreateAgentPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAgentPayload) => api.post<Agent>('/agents', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

/** Update an existing agent */
export function useUpdateAgent(): UseMutationResult<
  Agent,
  Error,
  { id: string; data: UpdateAgentPayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => api.put<Agent>(`/agents/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(agentKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

/** Toggle agent status: active ↔ paused */
export function useToggleAgent(): UseMutationResult<
  Agent,
  Error,
  { id: string; action: 'activate' | 'pause' }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action }) =>
      api.post<Agent>(`/agents/${id}/${action}`),
    onSuccess: (updated) => {
      queryClient.setQueryData(agentKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

/** Soft-delete (archive) an agent */
export function useDeleteAgent(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/agents/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: agentKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}
