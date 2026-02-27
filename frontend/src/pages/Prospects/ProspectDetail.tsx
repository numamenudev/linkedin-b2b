import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, ExternalLink, Archive, UserX, MapPin, Briefcase, Clock,
  MessageSquare, CheckCircle2, Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  useProspect,
  useUpdateProspect,
  useOptOutProspect,
  type Prospect,
  type ProspectMessage,
} from '@/hooks/useProspects';
import { formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Status timeline
// ---------------------------------------------------------------------------
const STATUS_ORDER = ['new', 'contacted', 'accepted', 'responded', 'converted'];

const STATUS_LABELS: Record<string, string> = {
  new:         'Nuovo',
  contacted:   'Contattato',
  accepted:    'Connesso',
  responded:   'Risposta',
  converted:   'Convertito',
  opted_out:   'Opt-out',
  blacklisted: 'Blacklist',
};

function StatusTimeline({ status }: { status: string }) {
  const currentIdx = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0 flex-wrap">
      {STATUS_ORDER.map((s, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                  done
                    ? 'bg-green-500 text-white'
                    : active
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-200'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs mt-1 text-center max-w-[64px] leading-tight ${
                  active ? 'text-indigo-600 font-medium' : 'text-gray-400'
                }`}
              >
                {STATUS_LABELS[s] ?? s}
              </span>
            </div>
            {idx < STATUS_ORDER.length - 1 && (
              <div
                className={`h-0.5 w-8 mx-0.5 mt-[-16px] ${done ? 'bg-green-400' : 'bg-gray-200'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message timeline
// ---------------------------------------------------------------------------
function MessageTimeline({ messages }: { messages: ProspectMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">Nessun messaggio ancora.</p>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map(msg => {
        const isOutbound = msg.type !== 'inbound';
        return (
          <div
            key={msg.id}
            className={`flex gap-3 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs ${
                isOutbound ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {isOutbound ? <Send className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
            </div>
            <div
              className={`max-w-[75%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col`}
            >
              <div
                className={`rounded-xl px-3 py-2 text-sm ${
                  isOutbound
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-900 rounded-bl-none'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-xs text-gray-400 mt-1">{formatDate(msg.sentAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner content (shared between drawer and page mode)
// ---------------------------------------------------------------------------
interface ProspectDetailContentProps {
  prospectId: string;
  onClose?: () => void;
}

function ProspectDetailContent({ prospectId, onClose }: ProspectDetailContentProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);

  const { data: prospect, isLoading } = useProspect(prospectId);

  // Sync notes from server
  const resolvedNotes = editingNotes ? notes : (prospect as any)?.notes ?? '';

  const updateProspect = useUpdateProspect();
  const optOut = useOptOutProspect();

  const archiveMutation = useMutation({
    mutationFn: () =>
      api.put(`/prospects/${prospectId}`, { status: 'blacklisted' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
      onClose?.();
    },
  });

  const handleSaveNotes = () => {
    updateProspect.mutate(
      { id: prospectId, data: { notes: resolvedNotes } },
      { onSuccess: () => setEditingNotes(false) },
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-60 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!prospect) {
    return <div className="p-6 text-sm text-gray-400 text-center">Prospect non trovato.</div>;
  }

  const messages: ProspectMessage[] = prospect.messages ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-100">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl flex-shrink-0">
            {prospect.firstName?.charAt(0) ?? '?'}
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg leading-tight">
              {prospect.firstName} {prospect.lastName}
            </h2>
            {prospect.headline && (
              <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                {prospect.headline}
              </p>
            )}
            {prospect.location && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-gray-400" />
                {prospect.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {prospect.linkedinUrl && (
            <a
              href={prospect.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Apri su LinkedIn"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Status timeline */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status</h3>
          <StatusTimeline status={prospect.status} />
          {prospect.acceptedAt && (
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Connesso il {formatDate(prospect.acceptedAt)}
            </p>
          )}
        </div>

        {/* Messages timeline */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Messaggi ({messages.length})
          </h3>
          <MessageTimeline messages={messages} />
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</h3>
            {!editingNotes && (
              <button
                onClick={() => {
                  setNotes((prospect as any)?.notes ?? '');
                  setEditingNotes(true);
                }}
                className="text-xs text-indigo-600 hover:underline"
              >
                Modifica
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Aggiungi note su questo prospect..."
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNotes}
                  disabled={updateProspect.isPending}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  Salva
                </button>
                <button
                  onClick={() => setEditingNotes(false)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {(prospect as any)?.notes || (
                <span className="text-gray-400">Nessuna nota.</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2 flex-wrap">
        {prospect.linkedinUrl && (
          <a
            href={prospect.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Apri su LinkedIn
          </a>
        )}
        <button
          onClick={() => {
            if (window.confirm('Archiviare questo prospect?')) archiveMutation.mutate();
          }}
          disabled={archiveMutation.isPending || prospect.status === 'blacklisted'}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
        >
          <Archive className="h-3.5 w-3.5" />
          Archivia
        </button>
        <button
          onClick={() => {
            if (window.confirm('Registrare opt-out? Questo prospect non verrà più contattato.')) {
              optOut.mutate(prospectId, { onSuccess: () => onClose?.() });
            }
          }}
          disabled={optOut.isPending || prospect.status === 'opted_out'}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium disabled:opacity-50"
        >
          <UserX className="h-3.5 w-3.5" />
          Opt-out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProspectDetail — supports both page mode (/prospects/:id) and drawer mode
// ---------------------------------------------------------------------------
interface ProspectDetailProps {
  prospectId?: string;
  onClose?: () => void;
  mode?: 'page' | 'drawer';
}

export default function ProspectDetail({
  prospectId,
  onClose,
  mode = 'page',
}: ProspectDetailProps) {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = prospectId ?? params.id ?? '';

  if (mode === 'drawer') {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
        {/* Drawer */}
        <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
          <ProspectDetailContent prospectId={id} onClose={onClose} />
        </div>
      </>
    );
  }

  // Page mode
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-indigo-600 hover:underline mb-4 block"
      >
        ← Torna all'elenco
      </button>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px]">
        <ProspectDetailContent prospectId={id} />
      </div>
    </div>
  );
}
