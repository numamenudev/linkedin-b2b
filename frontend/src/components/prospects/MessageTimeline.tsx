/**
 * MessageTimeline — vertical chat-style message timeline for a prospect's
 * conversation history.
 *
 * Visual design:
 *  - Outbound (sent by agent): bubble on the RIGHT, indigo background
 *  - Inbound (received from prospect): bubble on the LEFT, green/emerald background
 *  - A vertical line connects all messages
 *  - Each bubble shows: content, timestamp, delivery status badge
 *
 * Status badge values:
 *  - sent      → grey    "Inviato"
 *  - delivered → blue    "Consegnato"
 *  - read      → indigo  "Letto"
 *  (inbound messages don't have a status badge)
 */

import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CheckCheck, Check } from 'lucide-react';
import type { ProspectMessage } from '@/hooks/useProspects';

// ---------------------------------------------------------------------------
// Message direction helper
// ---------------------------------------------------------------------------

function isOutbound(msg: ProspectMessage): boolean {
  return msg.type === 'connection_request' || msg.type === 'follow_up';
}

// ---------------------------------------------------------------------------
// Delivery status badge
// ---------------------------------------------------------------------------

type DeliveryStatus = 'sent' | 'delivered' | 'read';

function getDeliveryStatus(msg: ProspectMessage): DeliveryStatus {
  if (msg.readAt) return 'read';
  if (msg.deliveredAt) return 'delivered';
  return 'sent';
}

function StatusBadge({ msg }: { msg: ProspectMessage }) {
  if (!isOutbound(msg)) return null;

  const status = getDeliveryStatus(msg);

  const label =
    status === 'read'
      ? 'Letto'
      : status === 'delivered'
      ? 'Consegnato'
      : 'Inviato';

  const icon =
    status === 'read' || status === 'delivered' ? (
      <CheckCheck
        className={clsx(
          'h-3 w-3',
          status === 'read' ? 'text-indigo-500' : 'text-gray-400',
        )}
      />
    ) : (
      <Check className="h-3 w-3 text-gray-400" />
    );

  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Message type label
// ---------------------------------------------------------------------------

function TypeLabel({ type }: { type: ProspectMessage['type'] }) {
  const labels: Record<ProspectMessage['type'], string> = {
    connection_request: 'Richiesta connessione',
    follow_up: 'Follow-up',
    inbound: 'Risposta prospect',
  };
  return (
    <span className="mb-1 block text-xs font-medium text-gray-400">
      {labels[type] ?? type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ProspectMessage }) {
  const outbound = isOutbound(msg);

  const timeStr = (() => {
    try {
      return format(parseISO(msg.sentAt), "d MMM yyyy 'alle' HH:mm", {
        locale: it,
      });
    } catch {
      return msg.sentAt;
    }
  })();

  return (
    <div
      className={clsx(
        'flex',
        outbound ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={clsx(
          'max-w-[75%] rounded-2xl px-4 py-3 shadow-sm',
          outbound
            ? 'rounded-tr-sm bg-indigo-600 text-white'
            : 'rounded-tl-sm bg-emerald-50 text-gray-900 border border-emerald-100',
        )}
      >
        {/* Type label */}
        <TypeLabel type={msg.type} />

        {/* Content */}
        <p
          className={clsx(
            'whitespace-pre-wrap text-sm leading-relaxed',
            outbound ? 'text-white' : 'text-gray-800',
          )}
        >
          {msg.content}
        </p>

        {/* Footer: timestamp + status */}
        <div
          className={clsx(
            'mt-2 flex items-center gap-2',
            outbound ? 'justify-end' : 'justify-start',
          )}
        >
          <span
            className={clsx(
              'text-xs',
              outbound ? 'text-indigo-200' : 'text-gray-400',
            )}
          >
            {timeStr}
          </span>
          {outbound && <StatusBadge msg={msg} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageTimeline
// ---------------------------------------------------------------------------

interface MessageTimelineProps {
  messages: ProspectMessage[];
  /** Show empty state when no messages */
  emptyText?: string;
}

export function MessageTimeline({
  messages,
  emptyText = 'Nessun messaggio scambiato con questo prospect.',
}: MessageTimelineProps) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    );
  }

  // Sort chronologically (oldest first for chat-style display)
  const sorted = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div
        aria-hidden
        className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-200"
      />

      <div className="relative space-y-4 pb-4">
        {sorted.map((msg, index) => (
          <div key={msg.id ?? index} className="relative">
            {/* Central dot on the timeline */}
            <div
              aria-hidden
              className={clsx(
                'absolute left-1/2 top-4 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white shadow-sm',
                isOutbound(msg) ? 'bg-indigo-500' : 'bg-emerald-500',
              )}
            />

            <MessageBubble msg={msg} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MessageTimeline;
