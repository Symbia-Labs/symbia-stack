/**
 * A message bubble, rendered per skin.
 *
 * One implementation, three appearances. The previous chat panel had its own
 * MessageBubble and `components/messaging/MessageBubble.tsx` had another —
 * two implementations of one concern, which is how this codebase produced a
 * forked authMiddleware and a proxy config fixed in one file and not the
 * other. Adding a third for the popout would have been the same mistake, so
 * both call sites use this.
 */
import type { Skin } from './skins';

export interface BubbleMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_type?: string;
}

function assistantName(senderId: string): string {
  if (!senderId.startsWith('assistant:')) return 'Assistant';
  return senderId
    .replace('assistant:', '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Telegram's double tick. Purely decorative until delivery receipts exist. */
function Ticks() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="inline-block text-[#5eabe1]">
      <path d="M2 11l3.5 3.5L12 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11l3.5 3.5L18 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Bubble({
  message,
  isOwn,
  skin,
  /** First of a run from the same sender — controls whether the name shows. */
  startsGroup = true,
}: {
  message: BubbleMessage;
  isOwn: boolean;
  skin: Skin;
  startsGroup?: boolean;
}) {
  const isAgent = message.sender_type === 'agent';
  const tone = isOwn ? skin.bubble.own : isAgent ? skin.bubble.agent : skin.bubble.other;
  const body = isOwn ? skin.text.own : skin.text.other;

  const name = isOwn ? 'You' : isAgent ? assistantName(message.sender_id) : message.sender_id.slice(0, 8);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`${skin.bubble.maxWidth} ${skin.bubble.base} ${tone}`}>
        {skin.showSenderName && startsGroup && !isOwn && (
          <div className="text-[14px] font-semibold mb-0.5 text-[#5eabe1]">{name}</div>
        )}

        <div className={`${body} whitespace-pre-wrap break-words`}>
          {message.content}
          {/* Telegram floats the timestamp into the last line, so the bubble
              reserves room for it rather than wrapping around it. */}
          {skin.timestamp === 'inside' && (
            <span className="inline-block w-[64px]" aria-hidden />
          )}
        </div>

        {skin.timestamp === 'inside' && (
          <div className={`-mt-[18px] flex items-center justify-end gap-1 ${skin.timestampClass}`}>
            {time(message.created_at)}
            {skin.ticks && isOwn && <Ticks />}
          </div>
        )}
      </div>

      {skin.timestamp === 'below' && (
        <div className={`self-end ml-2 mr-2 ${skin.timestampClass}`}>{time(message.created_at)}</div>
      )}
    </div>
  );
}

/**
 * iMessage shows one timestamp above a run of messages rather than one per
 * bubble. Rendered by the list, not the bubble, because it belongs to the gap
 * between messages.
 */
export function GroupTimestamp({ iso, skin }: { iso: string; skin: Skin }) {
  if (skin.timestamp !== 'grouped') return null;
  const d = new Date(iso);
  return (
    <div className={`text-center py-2 ${skin.timestampClass}`}>
      {d.toLocaleDateString([], { weekday: 'short' })} {time(iso)}
    </div>
  );
}
