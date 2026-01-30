/**
 * Channels Module
 *
 * Provides multi-channel messaging support for Symbia through the Integrations service.
 * Channels act as bridges between external messaging platforms (Telegram, WhatsApp, etc.)
 * and the Symbia SDN event system.
 */

export { registerChannelRoutes, createChannelRoutes } from "./routes.js";
export {
  channelProviders,
  initializeChannelProviders,
  type ChannelProvider,
  type ChannelConnectionContext,
  type ConnectionInitResult,
  type ConnectionStatusResult,
  type SendMessageResult,
  type WebhookVerifyResult,
  type ParsedWebhook,
} from "./providers/index.js";
export { telegramProvider } from "./providers/telegram.js";
export {
  initializeChannelEventHandlers,
  sendChannelMessage,
} from "./event-handlers.js";
export { initializeChannelBridge, handleInboundMessage } from "./bridge.js";
