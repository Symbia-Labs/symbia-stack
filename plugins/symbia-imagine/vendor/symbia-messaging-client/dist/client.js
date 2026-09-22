/**
 * @symbia/messaging - REST API Client
 *
 * Client for interacting with the Symbia Messaging Service REST API.
 * Used by services to create conversations, send messages, and manage participants.
 */
// Default endpoint uses port 5005 (Messaging service port from @symbia/sys)
// In production, set MESSAGING_ENDPOINT or MESSAGING_SERVICE_URL env var
const DEFAULT_ENDPOINT = 'http://localhost:5005';
export class MessagingClient {
    endpoint;
    token;
    apiKey;
    onError;
    constructor(config = {}) {
        // Browser-safe environment variable access
        const env = typeof process !== 'undefined' ? process.env : {};
        this.endpoint = (config.endpoint || env?.MESSAGING_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/$/, '');
        this.token = config.token || env?.MESSAGING_SERVICE_TOKEN;
        this.apiKey = config.apiKey || env?.MESSAGING_API_KEY;
        this.onError = config.onError;
    }
    /**
     * Set authentication token
     */
    setToken(token) {
        this.token = token;
    }
    /**
     * Set API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }
    getHeaders(asUserId, orgId) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        if (this.apiKey) {
            headers['X-API-Key'] = this.apiKey;
        }
        if (asUserId) {
            headers['X-As-User-Id'] = asUserId;
        }
        if (orgId) {
            headers['X-Org-Id'] = orgId;
        }
        return headers;
    }
    async request(method, path, body, options) {
        const url = `${this.endpoint}${path}`;
        const headers = this.getHeaders(options?.asUserId, options?.orgId);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`Messaging API error: ${response.status} - ${errorText}`);
                this.onError?.(error);
                throw error;
            }
            if (response.status === 204) {
                return undefined;
            }
            return response.json();
        }
        catch (error) {
            if (error instanceof Error) {
                this.onError?.(error);
            }
            throw error;
        }
    }
    // ============================================
    // Conversation Operations
    // ============================================
    /**
     * Create a new conversation
     */
    async createConversation(params, options) {
        return this.request('POST', '/api/conversations', {
            type: params.type,
            name: params.name,
            description: params.description,
            orgId: params.orgId,
            participants: params.participants,
            metadata: params.metadata,
        }, options);
    }
    /**
     * Get a conversation by ID
     */
    async getConversation(conversationId, options) {
        try {
            return await this.request('GET', `/api/conversations/${conversationId}`, undefined, options);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                return null;
            }
            throw error;
        }
    }
    /**
     * List conversations for the authenticated user
     */
    async listConversations(orgId, options) {
        const query = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
        return this.request('GET', `/api/conversations${query}`, undefined, { ...options, orgId });
    }
    /**
     * Update a conversation
     */
    async updateConversation(conversationId, updates, options) {
        return this.request('PATCH', `/api/conversations/${conversationId}`, updates, options);
    }
    /**
     * Delete a conversation
     */
    async deleteConversation(conversationId, options) {
        await this.request('DELETE', `/api/conversations/${conversationId}`, undefined, options);
    }
    // ============================================
    // Participant Operations
    // ============================================
    /**
     * Add a participant to a conversation
     */
    async addParticipant(conversationId, userId, userType = 'user', options) {
        return this.request('POST', `/api/conversations/${conversationId}/participants`, {
            userId,
            userType,
        }, options);
    }
    /**
     * Remove a participant from a conversation
     */
    async removeParticipant(conversationId, userId, options) {
        await this.request('DELETE', `/api/conversations/${conversationId}/participants/${userId}`, undefined, options);
    }
    /**
     * Join a conversation (as the authenticated user)
     */
    async joinConversation(conversationId, options) {
        return this.request('POST', `/api/conversations/${conversationId}/join`, undefined, options);
    }
    /**
     * Leave a conversation
     */
    async leaveConversation(conversationId, options) {
        await this.request('POST', `/api/conversations/${conversationId}/leave`, undefined, options);
    }
    // ============================================
    // Message Operations
    // ============================================
    /**
     * Send a message to a conversation
     */
    async sendMessage(params, options) {
        return this.request('POST', `/api/conversations/${params.conversationId}/messages`, {
            content: params.content,
            contentType: params.contentType || 'text',
            replyTo: params.replyTo,
            metadata: params.metadata,
            runId: params.runId,
            traceId: params.traceId,
            priority: params.priority,
            interruptible: params.interruptible,
        }, options);
    }
    /**
     * Get messages in a conversation
     */
    async getMessages(conversationId, params, options) {
        const searchParams = new URLSearchParams();
        if (params?.limit) {
            searchParams.set('limit', params.limit.toString());
        }
        if (params?.before) {
            const before = params.before instanceof Date ? params.before.toISOString() : params.before;
            searchParams.set('before', before);
        }
        if (params?.after) {
            const after = params.after instanceof Date ? params.after.toISOString() : params.after;
            searchParams.set('after', after);
        }
        const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
        return this.request('GET', `/api/conversations/${conversationId}/messages${query}`, undefined, options);
    }
    /**
     * Send a control event to a conversation
     */
    async sendControl(conversationId, params, options) {
        return this.request('POST', `/api/conversations/${conversationId}/control`, params, options);
    }
}
/**
 * Create a messaging client instance
 */
export function createMessagingClient(config) {
    return new MessagingClient(config);
}
