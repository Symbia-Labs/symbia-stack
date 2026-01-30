/**
 * Channel Providers Index
 *
 * Registers all available channel providers with the global registry.
 */

export * from "./types.js";
export { telegramProvider } from "./telegram.js";

import { channelProviders } from "./types.js";
import { telegramProvider } from "./telegram.js";

/**
 * Initialize and register all channel providers
 */
export function initializeChannelProviders(): void {
  // Register Telegram (webhook-based, simplest to start with)
  channelProviders.register(telegramProvider);

  // Future providers will be registered here:
  // channelProviders.register(discordProvider);
  // channelProviders.register(slackProvider);
  // channelProviders.register(whatsappProvider);
  // channelProviders.register(signalProvider);
  // channelProviders.register(googlechatProvider);
  // channelProviders.register(imessageProvider);

  console.log(`[channels] Initialized ${channelProviders.getAll().length} channel provider(s)`);
}

/**
 * Get a specific provider by type
 */
export { channelProviders };
