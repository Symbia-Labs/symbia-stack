/**
 * Socket state, shown in the popout header.
 *
 * Three states, and "connecting" is deliberately distinct from "disconnected".
 * A dot that is only ever green or grey cannot tell you whether it has given
 * up or is still trying, and "not yet known" is a legitimate state that should
 * look like itself.
 */
import { useMessagingStore } from '@/stores/messagingStore';

export function ConnectionDot() {
  const { connectionStatus } = useMessagingStore();
  const tone =
    connectionStatus === 'connected'
      ? 'bg-emerald-400'
      : connectionStatus === 'connecting'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-white/30';
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className={`w-2 h-2 rounded-full ${tone}`} />
      <span className="text-[14px] text-white/50 capitalize">{connectionStatus}</span>
    </span>
  );
}
