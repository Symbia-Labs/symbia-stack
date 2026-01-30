/**
 * Symbia Website — Dynamic Enhancement Module
 *
 * Enhances the static website with dynamic data loading.
 * Gracefully falls back to static content if data unavailable.
 *
 * Usage:
 *   <script type="module" src="./src/lib/enhance.js"></script>
 *
 * Or programmatically:
 *   import { enhance } from './src/lib/enhance.js';
 *   await enhance();
 */

const DATA_PATH = './src/data';

// Feature flags
const config = {
  enableDynamicServices: true,
  enableDynamicAssistants: true,
  enableDynamicSolutions: true,
  enableLiveChat: false, // Set to true to connect to Symbia
  symbiaEndpoint: 'http://localhost:5001'
};

/**
 * Load JSON data with error handling
 */
async function loadJSON(filename) {
  try {
    const response = await fetch(`${DATA_PATH}/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`[Symbia] Could not load ${filename}: ${error.message}`);
    return null;
  }
}

/**
 * Color mapping for service cards
 */
const colorMap = {
  'primary': 'var(--primary)',
  'node-input': 'var(--node-input)',
  'node-condition': 'var(--node-condition)',
  'tertiary': 'var(--tertiary)',
  'node-llm': 'var(--node-llm)',
  'node-tool': 'var(--node-tool)',
  'node-router': 'var(--node-router)',
  'node-output': 'var(--node-output)',
  'secondary': 'var(--secondary)'
};

/**
 * Check if Symbia platform is available
 */
async function checkSymbiaConnection() {
  if (!config.enableLiveChat) return false;

  try {
    const response = await fetch(`${config.symbiaEndpoint}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      console.log('[Symbia] Platform connected');
      return true;
    }
  } catch (e) {
    console.log('[Symbia] Platform not available, using mock responses');
  }
  return false;
}

/**
 * Fetch live assistant list from Symbia
 */
async function fetchLiveAssistants() {
  try {
    const response = await fetch(`${config.symbiaEndpoint}/api/assistants`);
    if (response.ok) {
      const data = await response.json();
      return data.assistants || data;
    }
  } catch (e) {
    // Fall back to static data
  }
  return null;
}

/**
 * Fetch live service health from Symbia
 */
async function fetchServiceHealth() {
  try {
    const response = await fetch(`${config.symbiaEndpoint}/health`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    // Services not available
  }
  return null;
}

/**
 * Update service cards with live health status
 */
function updateServiceHealth(healthData) {
  if (!healthData?.services) return;

  document.querySelectorAll('.arch-service').forEach(card => {
    const serviceId = card.dataset.service;
    const status = healthData.services[serviceId];

    if (status) {
      // Add health indicator
      let indicator = card.querySelector('.health-indicator');
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'health-indicator';
        card.querySelector('.arch-service-header')?.appendChild(indicator);
      }

      indicator.className = `health-indicator ${status.healthy ? 'healthy' : 'unhealthy'}`;
      indicator.title = status.healthy ? 'Service healthy' : `Error: ${status.error}`;
    }
  });
}

/**
 * Update assistant stats with live counts
 */
function updateAssistantStats(assistants) {
  const activeCount = assistants.filter(a => a.status === 'active').length;
  const totalCount = assistants.length;

  // Update any stat displays
  const statElement = document.querySelector('.assistants-stat-count');
  if (statElement) {
    statElement.textContent = `${activeCount} active / ${totalCount} total`;
  }
}

/**
 * Initialize live chat connection
 */
function initLiveChat() {
  // Replace mock chat handler with live version
  window.sendLiveMessage = async (context, message, onChunk) => {
    try {
      const response = await fetch(`${config.symbiaEndpoint}/api/messaging/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: `website-${context}`,
          content: message,
          assistant: 'website-helper'
        })
      });

      if (!response.ok) throw new Error('Send failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.content) onChunk(data.content);
          }
        }
      }
    } catch (error) {
      console.error('[Symbia] Chat error:', error);
      throw error;
    }
  };
}

/**
 * Main enhancement function
 */
export async function enhance() {
  console.log('[Symbia] Enhancing website...');

  // Check if Symbia platform is available
  const symbiaAvailable = await checkSymbiaConnection();

  // Load static data files
  const [servicesData, assistantsData, solutionsData] = await Promise.all([
    loadJSON('services.json'),
    loadJSON('assistants.json'),
    loadJSON('solutions.json')
  ]);

  // If Symbia is available, try to get live data
  if (symbiaAvailable) {
    const [liveAssistants, healthData] = await Promise.all([
      fetchLiveAssistants(),
      fetchServiceHealth()
    ]);

    if (healthData) {
      updateServiceHealth(healthData);
    }

    if (liveAssistants) {
      updateAssistantStats(liveAssistants);
    }

    initLiveChat();
  }

  // Log data availability
  console.log('[Symbia] Data loaded:', {
    services: servicesData?.services?.length || 'static',
    assistants: assistantsData?.assistants?.length || 'static',
    solutions: solutionsData?.solutions?.length || 'static',
    liveMode: symbiaAvailable
  });

  // Add data attributes for CSS styling
  document.documentElement.dataset.symbiaLive = symbiaAvailable;
  document.documentElement.dataset.symbiaEnhanced = 'true';

  console.log('[Symbia] Enhancement complete');
}

/**
 * Auto-enhance on DOMContentLoaded if imported as module
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhance);
} else {
  enhance();
}

export { loadJSON, config, checkSymbiaConnection };
