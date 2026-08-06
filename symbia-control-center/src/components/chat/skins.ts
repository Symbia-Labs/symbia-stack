/**
 * Messenger skins.
 *
 * Three real messaging apps, not three colour swaps. The things that actually
 * distinguish them are bubble geometry, where the timestamp lives, whether
 * consecutive messages group, and what the input bar looks like — so those are
 * what this describes.
 *
 * Type sizes are deliberate and are NOT to be reduced. The base is 16px because
 * anything smaller is unusable for this operator without zooming to 150%. Every
 * real messenger runs 16–17px body text; the previous chat panel ran 14px.
 */
export type SkinId = 'imessage' | 'android' | 'telegram';

export interface Skin {
  id: SkinId;
  label: string;
  /** Surface behind the message list. */
  surface: string;
  /** Header bar. */
  header: string;
  headerTitle: string;
  /** Bubble geometry + colour. `own` is the operator, `other` is anyone else. */
  bubble: {
    own: string;
    other: string;
    agent: string;
    /** Applied to every bubble. */
    base: string;
    /** Max width as a fraction of the column. */
    maxWidth: string;
  };
  /** Body text inside a bubble. Never below 16px. */
  text: { own: string; other: string };
  /** Where the timestamp goes. */
  timestamp: 'inside' | 'below' | 'grouped';
  timestampClass: string;
  /** Sender name shown above the bubble? iMessage hides it in 1:1. */
  showSenderName: boolean;
  /** Input bar. */
  input: {
    bar: string;
    field: string;
    send: string;
    sendIdle: string;
  };
  /** Telegram-style delivery ticks. */
  ticks: boolean;
}

const BODY = 'text-[16px] leading-[1.45]';

export const SKINS: Record<SkinId, Skin> = {
  imessage: {
    id: 'imessage',
    label: 'iMessage',
    surface: 'bg-[#000000]',
    header: 'bg-[#1c1c1e]/95 backdrop-blur border-b border-white/10',
    headerTitle: 'text-[17px] font-semibold text-white',
    bubble: {
      base: 'px-[14px] py-[8px] rounded-[20px]',
      own: 'bg-[#0b84ff] rounded-br-[6px]',
      other: 'bg-[#26252a] rounded-bl-[6px]',
      agent: 'bg-[#26252a] rounded-bl-[6px]',
      maxWidth: 'max-w-[78%]',
    },
    text: { own: `${BODY} text-white`, other: `${BODY} text-white` },
    timestamp: 'grouped',
    timestampClass: 'text-[13px] text-white/40',
    showSenderName: false,
    input: {
      bar: 'bg-[#1c1c1e]/95 backdrop-blur border-t border-white/10',
      field:
        'bg-[#1c1c1e] border border-white/20 rounded-[20px] px-[14px] py-[9px] ' +
        `${BODY} text-white placeholder:text-white/35`,
      send: 'bg-[#0b84ff] text-white rounded-full',
      sendIdle: 'bg-white/10 text-white/30 rounded-full',
    },
    ticks: false,
  },

  android: {
    id: 'android',
    label: 'Android',
    surface: 'bg-[#131316]',
    header: 'bg-[#1b1b1f] border-b border-white/5',
    headerTitle: 'text-[17px] font-medium text-[#e4e2e6]',
    bubble: {
      base: 'px-[16px] py-[10px] rounded-[20px]',
      own: 'bg-[#004a77] rounded-br-[4px]',
      other: 'bg-[#2b2930] rounded-bl-[4px]',
      agent: 'bg-[#332d41] rounded-bl-[4px]',
      maxWidth: 'max-w-[80%]',
    },
    text: { own: `${BODY} text-[#c2e7ff]`, other: `${BODY} text-[#e4e2e6]` },
    timestamp: 'below',
    timestampClass: 'text-[13px] text-[#c8c5ca]',
    showSenderName: true,
    input: {
      bar: 'bg-[#131316] border-t border-white/5',
      field:
        'bg-[#1b1b1f] rounded-[28px] px-[18px] py-[12px] ' +
        `${BODY} text-[#e4e2e6] placeholder:text-[#8f8f94]`,
      send: 'bg-[#a8c7fa] text-[#00325a] rounded-[16px]',
      sendIdle: 'bg-[#2b2930] text-[#8f8f94] rounded-[16px]',
    },
    ticks: false,
  },

  telegram: {
    id: 'telegram',
    label: 'Telegram',
    surface: 'bg-[#0e1621]',
    header: 'bg-[#17212b] border-b border-black/40',
    headerTitle: 'text-[17px] font-semibold text-white',
    bubble: {
      base: 'px-[12px] pt-[7px] pb-[6px] rounded-[12px]',
      own: 'bg-[#2b5278] rounded-br-[4px]',
      other: 'bg-[#182533] rounded-bl-[4px]',
      agent: 'bg-[#182533] rounded-bl-[4px]',
      maxWidth: 'max-w-[82%]',
    },
    text: { own: `${BODY} text-white`, other: `${BODY} text-white` },
    timestamp: 'inside',
    timestampClass: 'text-[13px] text-white/45',
    showSenderName: true,
    input: {
      bar: 'bg-[#17212b] border-t border-black/40',
      field:
        'bg-[#17212b] rounded-[8px] px-[14px] py-[10px] ' +
        `${BODY} text-white placeholder:text-white/35`,
      send: 'bg-transparent text-[#5eabe1] rounded-full',
      sendIdle: 'bg-transparent text-white/25 rounded-full',
    },
    ticks: true,
  },
};

export const SKIN_ORDER: SkinId[] = ['imessage', 'android', 'telegram'];

const STORAGE_KEY = 'symbia:chat:skin';

export function loadSkin(): SkinId {
  if (typeof window === 'undefined') return 'imessage';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved && saved in SKINS ? (saved as SkinId) : 'imessage';
}

export function saveSkin(id: SkinId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing or storage disabled. The switcher still works for this
    // session; it just will not be remembered. Not worth failing over.
  }
}
