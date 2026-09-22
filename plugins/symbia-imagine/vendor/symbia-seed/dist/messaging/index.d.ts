/**
 * Messaging Service Seed Data
 *
 * This module provides basic seed data for the Symbia Messaging Service,
 * including sample conversations and messages.
 */
import { SeedConfig } from "../shared/constants.js";
/**
 * Conversation seed data interface
 */
export interface ConversationSeedData {
    id: string;
    orgId: string;
    title: string;
    status: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Generate default conversations
 */
export declare function generateDefaultConversations(): ConversationSeedData[];
/**
 * Seed conversations
 */
export declare function seedConversations(db: any, conversationsTable: any, config?: SeedConfig): Promise<ConversationSeedData[]>;
/**
 * Seed all messaging data
 */
export declare function seedMessagingData(db: any, schema: any, config?: SeedConfig): Promise<{
    conversations: ConversationSeedData[];
}>;
