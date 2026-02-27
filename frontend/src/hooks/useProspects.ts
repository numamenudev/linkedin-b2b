/**
 * TanStack Query hooks for the Prospects API.
 *
 * Endpoints consumed:
 *   GET    /api/prospects              (list, paginated, filterable)
 *   GET    /api/prospects/:id          (detail with messages)
 *   PUT    /api/prospects/:id
 *   POST   /api/prospects/:id/opt-out
 *   DELETE /api/prospects/:id
 *   GET    /api/prospects/export       (CSV download)
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProspectStatus =
  | 'new'
  | 'contacted'
  | 'accepted'
  | 'responded'
  | 'converted'
  | 'rejected'
  | 'opted_out'
  | 'blacklisted';

export interface ProspectMessage {
  id: string;
  type: 'connection_request' | 'follow_up' | 'inbound';
  content: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface Prospect {
  id: string;
  linkedinUrl: string;
  firstName: string;
  lastName: string;
  headline?: string;
  company?: string;
  location?: string;
  profileImageUrl?: string;
  status: ProspectStatus;
  agentId?: string;
  agentName?: string;
  contactedAt?: string;
  acceptedAt?: string;
  respondedAt?: string;
  optedOutAt?: string;
  createdAt: string;
  updatedAt: string;
  messages?: ProspectMessage[];
}

export interface ProspectFilters {
  status?: ProspectStatus | ProspectStatus[];
  agentId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProspects {
  data: Prospect[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UpdateProspectPayload {
  firstName?: string;
  lastName?: string;
  headline?: string;
  company?: string;
  location?: string;
  status?: ProspectStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const prospectKeys = {
  all: ['prospects'] as const,
  list: (filters?: ProspectFilters) => [...prospectKeys.all, 'list', filters] as const,
  detail: (id: string) => [...prospectKeys.all, 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Paginated, filterable prospect list */
export function useProspects(
  filters: ProspectFilters = {},
): UseQueryResult<PaginatedProspects> {
  return useQuery({
    queryKey: prospectKeys.list(filters),
    queryFn: () => {
      const qs = buildQueryString(filters as Record<string, unknown>);
      return api.get<PaginatedProspects>(`/prospects${qs}`);
    },
    placeholderData: (prev) => prev, // keep stale data while fetching (like keepPreviousData)
  });
}

/** Single prospect with full message timeline */
export function useProspect(id: string): UseQueryResult<Prospect> {
  return useQuery({
    queryKey: prospectKeys.detail(id),
    queryFn: () => api.get<Prospect>(`/prospects/${id}`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Update a prospect's metadata */
export function useUpdateProspect(): UseMutationResult<
  Prospect,
  Error,
  { id: string; data: UpdateProspectPayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => api.put<Prospect>(`/prospects/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(prospectKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: prospectKeys.all });
    },
  });
}

/** Opt-out a prospect — sets status to opted_out */
export function useOptOutProspect(): UseMutationResult<Prospect, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Prospect>(`/prospects/${id}/opt-out`),
    onSuccess: (updated) => {
      queryClient.setQueryData(prospectKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: prospectKeys.all });
    },
  });
}

/** Soft-delete a prospect */
export function useDeleteProspect(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/prospects/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: prospectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: prospectKeys.all });
    },
  });
}

/** Export prospects as CSV — triggers browser download */
export function useExportProspects(
  filters: ProspectFilters = {},
): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const qs = buildQueryString({
        ...filters,
        format: 'csv',
      } as Record<string, unknown>);

      const response = await fetch(`/api/prospects/export${qs}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Export fallito: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}
