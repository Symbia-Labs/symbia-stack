// src/index.ts
var IDENTITY_DEFAULT_PORT = 5001;
function getIdentityServiceUrl() {
  return process.env.IDENTITY_SERVICE_URL || process.env.IDENTITY_URL || `http://localhost:${IDENTITY_DEFAULT_PORT}`;
}
var tokenCache = /* @__PURE__ */ new Map();
var TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1e3;
var DEFAULT_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1e3;
var IdentityClient = class {
  baseUrl;
  agentCredential;
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || getIdentityServiceUrl();
    this.agentCredential = config.agentCredential || process.env.AGENT_CREDENTIAL || "symbia-agent-dev-secret-32chars-min!!";
  }
  async request(method, path, body, token) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Identity API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) {
      return void 0;
    }
    return response.json();
  }
  // ===========================================================================
  // User Authentication
  // ===========================================================================
  /**
   * Login a user with email and password
   */
  async loginUser(email, password) {
    return this.request("POST", "/api/auth/user/login", { email, password });
  }
  /**
   * Get current user info from a token
   */
  async getUser(token) {
    return this.request("GET", "/api/auth/user/me", void 0, token);
  }
  /**
   * Introspect a token to get user/agent info
   */
  async introspect(token) {
    return this.request("POST", "/api/auth/introspect", { token }, token);
  }
  // ===========================================================================
  // Agent Authentication
  // ===========================================================================
  /**
   * Login an agent with agentId and credential
   */
  async loginAgent(agentId, credential) {
    return this.request("POST", "/api/auth/agent/login", {
      agentId,
      credential: credential || this.agentCredential
    });
  }
  /**
   * Get current agent info from a token
   */
  async getAgent(token) {
    return this.request("GET", "/api/auth/agent/me", void 0, token);
  }
  /**
   * Register a new agent
   */
  async registerAgent(data) {
    return this.request("POST", "/api/auth/agent/register", data);
  }
};
var defaultClient = null;
function getDefaultClient() {
  if (!defaultClient) {
    defaultClient = new IdentityClient();
  }
  return defaultClient;
}
function createIdentityClient(config) {
  return new IdentityClient(config);
}
async function getAgentToken(agentId, client) {
  const cacheKey = agentId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return cached.token;
  }
  const identityClient = client || getDefaultClient();
  const { token } = await identityClient.loginAgent(agentId);
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + DEFAULT_TOKEN_LIFETIME_MS
  });
  console.log(`[Identity] Agent ${agentId} authenticated`);
  return token;
}
async function initializeAgentTokens(agentIds, client) {
  console.log(`[Identity] Initializing ${agentIds.length} agent tokens...`);
  const results = await Promise.allSettled(
    agentIds.map((agentId) => getAgentToken(agentId, client))
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[Identity] ${failed} agents failed to authenticate`);
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.warn(`[Identity] Failed: ${agentIds[i]} - ${r.reason}`);
      }
    });
  }
  console.log(`[Identity] ${succeeded}/${agentIds.length} agents authenticated`);
  return { succeeded, failed };
}
function clearTokenCache() {
  tokenCache.clear();
}
function clearAgentToken(agentId) {
  tokenCache.delete(agentId);
}
export {
  IdentityClient,
  clearAgentToken,
  clearTokenCache,
  createIdentityClient,
  getAgentToken,
  getDefaultClient,
  initializeAgentTokens
};
