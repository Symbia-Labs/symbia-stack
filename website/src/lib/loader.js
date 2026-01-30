/**
 * Symbia Website — Dynamic Data Loader
 *
 * Loads content from JSON data files and renders sections dynamically.
 * Falls back gracefully if data files are unavailable.
 */

// Cache for loaded data
const dataCache = {
  services: null,
  assistants: null,
  solutions: null
};

// Base path for data files
const DATA_PATH = './src/data';

/**
 * Load JSON data with caching
 */
async function loadData(type) {
  if (dataCache[type]) return dataCache[type];

  try {
    const response = await fetch(`${DATA_PATH}/${type}.json`);
    if (!response.ok) throw new Error(`Failed to load ${type}.json`);
    const data = await response.json();
    dataCache[type] = data;
    return data;
  } catch (error) {
    console.warn(`Could not load ${type}.json:`, error.message);
    return null;
  }
}

/**
 * Get color CSS variable for a service
 */
function getServiceColor(colorKey) {
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
  return colorMap[colorKey] || 'var(--primary)';
}

/**
 * Render a single service card for the architecture section
 */
function renderServiceCard(service) {
  const color = getServiceColor(service.color);
  return `
    <div class="arch-service clickable" data-service="${service.id}" style="--service-color: ${color}">
      <div class="arch-service-header">
        <span class="arch-service-name">${service.name}</span>
        <span class="arch-service-port">${service.stats?.port || `:${service.port}`}</span>
      </div>
      <span class="arch-service-desc">${service.description}</span>
      <div class="arch-service-click-hint">Click for details →</div>
    </div>
  `;
}

/**
 * Render a service modal
 */
function renderServiceModal(service) {
  const features = service.features?.map(f => `
    <li class="modal-list-item">
      <strong>${f.title}</strong>
      <span>${f.desc}</span>
    </li>
  `).join('') || '';

  const codeExample = service.codeExample ? `
    <div class="modal-section">
      <h3 class="modal-section-title">${service.codeExample.title}</h3>
      <div class="modal-code">${service.codeExample.code}</div>
    </div>
  ` : '';

  const suggestions = service.chatSuggestions?.map(s =>
    `<button class="chat-suggestion">${s}</button>`
  ).join('') || '';

  return `
    <div class="modal-panel" id="modal-${service.id}">
      <div class="modal-header">
        <h2 class="modal-title">${service.name} Service</h2>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-section">
          <h3 class="modal-section-title">Overview</h3>
          <p class="modal-desc">${service.overview}</p>
        </div>
        <div class="modal-stats">
          <div class="modal-stat">
            <span class="modal-stat-label">Port</span>
            <span class="modal-stat-value">${service.stats?.port || `:${service.port}`}</span>
          </div>
          <div class="modal-stat">
            <span class="modal-stat-label">Framework</span>
            <span class="modal-stat-value">${service.stats?.framework || 'Node.js'}</span>
          </div>
          <div class="modal-stat">
            <span class="modal-stat-label">LOC</span>
            <span class="modal-stat-value">${service.stats?.loc || '~3K'}</span>
          </div>
        </div>
        <div class="modal-section">
          <h3 class="modal-section-title">Key Features</h3>
          <ul class="modal-list">${features}</ul>
        </div>
        ${codeExample}
      </div>
      <div class="modal-chat" data-context="${service.id}">
        <div class="modal-chat-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Ask about this service
        </div>
        <div class="modal-chat-messages"></div>
        <div class="modal-chat-suggestions">${suggestions}</div>
        <div class="modal-chat-input">
          <input type="text" placeholder="Ask about ${service.name}...">
          <button>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a single assistant card
 */
function renderAssistantCard(assistant) {
  const statusClass = assistant.status === 'active' ? 'badge-active' : 'badge-bootstrap';
  const categories = assistant.categories?.join(' ') || '';

  return `
    <div class="assistant-card" data-category="${categories}">
      <div class="assistant-icon">${assistant.icon}</div>
      <div class="assistant-info">
        <div class="assistant-name">${assistant.name}</div>
        <div class="assistant-alias">${assistant.alias}</div>
        <div class="assistant-desc">${assistant.description}</div>
      </div>
      <div class="assistant-badges">
        <span class="badge ${statusClass}">${assistant.status}</span>
      </div>
    </div>
  `;
}

/**
 * Render assistant category filters
 */
function renderAssistantFilters(categories) {
  return categories.map(cat => `
    <button class="assistant-filter${cat.key === 'all' ? ' active' : ''}" data-filter="${cat.key}">
      ${cat.label}
    </button>
  `).join('');
}

/**
 * Render solution feature card
 */
function renderSolutionCard(solution) {
  return `
    <div class="solution-card clickable" data-detail="${solution.id}">
      <div class="solution-icon">${solution.icon}</div>
      <div class="solution-title">${solution.title}</div>
      <div class="solution-desc">${solution.shortDesc}</div>
      <div class="solution-code">${solution.codeHint}</div>
    </div>
  `;
}

/**
 * Render solution feature modal
 */
function renderSolutionModal(solution) {
  const details = solution.details?.map(d => `
    <li class="modal-list-item">
      <strong>${d.title}</strong>
      <span>${d.desc}</span>
    </li>
  `).join('') || '';

  const suggestions = solution.chatSuggestions?.map(s =>
    `<button class="chat-suggestion">${s}</button>`
  ).join('') || '';

  return `
    <div class="modal-panel" id="modal-${solution.id}">
      <div class="modal-header">
        <h2 class="modal-title">${solution.title}</h2>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-section">
          <h3 class="modal-section-title">The Problem</h3>
          <p class="modal-desc">${solution.problem}</p>
        </div>
        <div class="modal-section">
          <h3 class="modal-section-title">The Solution</h3>
          <p class="modal-desc">${solution.solution}</p>
        </div>
        <div class="modal-section">
          <h3 class="modal-section-title">Key Capabilities</h3>
          <ul class="modal-list">${details}</ul>
        </div>
      </div>
      <div class="modal-chat" data-context="${solution.id}">
        <div class="modal-chat-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Ask about this feature
        </div>
        <div class="modal-chat-messages"></div>
        <div class="modal-chat-suggestions">${suggestions}</div>
        <div class="modal-chat-input">
          <input type="text" placeholder="Ask about ${solution.title}...">
          <button>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize dynamic content rendering
 */
export async function initDynamicContent() {
  console.log('Loading Symbia website data...');

  // Load all data in parallel
  const [servicesData, assistantsData, solutionsData] = await Promise.all([
    loadData('services'),
    loadData('assistants'),
    loadData('solutions')
  ]);

  // Render architecture section
  if (servicesData?.services) {
    const archContainer = document.querySelector('.arch-grid');
    if (archContainer) {
      // Group services by layer
      const layers = {};
      servicesData.services.forEach(service => {
        const layer = service.layer || 'Other';
        if (!layers[layer]) layers[layer] = [];
        layers[layer].push(service);
      });

      // Render by layer
      let html = '';
      Object.entries(layers).forEach(([layer, services]) => {
        html += `<div class="arch-layer">
          <div class="arch-layer-name">${layer}</div>
          <div class="arch-layer-services">
            ${services.map(renderServiceCard).join('')}
          </div>
        </div>`;
      });
      archContainer.innerHTML = html;

      // Add service modals
      const modalsContainer = document.getElementById('dynamicModals');
      if (modalsContainer) {
        modalsContainer.innerHTML = servicesData.services.map(renderServiceModal).join('');
      }
    }
  }

  // Render assistants section
  if (assistantsData?.assistants) {
    const assistantsGrid = document.querySelector('.assistants-grid');
    const filtersContainer = document.querySelector('.assistants-filters');

    if (filtersContainer && assistantsData.categories) {
      filtersContainer.innerHTML = renderAssistantFilters(assistantsData.categories);
    }

    if (assistantsGrid) {
      assistantsGrid.innerHTML = assistantsData.assistants.map(renderAssistantCard).join('');
    }
  }

  // Render solutions section
  if (solutionsData?.solutions) {
    const solutionsGrid = document.querySelector('.solutions-grid');
    if (solutionsGrid) {
      solutionsGrid.innerHTML = solutionsData.solutions.map(renderSolutionCard).join('');
    }

    // Add solution modals
    const modalsContainer = document.getElementById('dynamicModals');
    if (modalsContainer) {
      modalsContainer.innerHTML += solutionsData.solutions.map(renderSolutionModal).join('');
    }
  }

  // Re-initialize event handlers for dynamic content
  initEventHandlers();

  console.log('Symbia website data loaded successfully');
}

/**
 * Initialize event handlers for dynamically rendered content
 */
function initEventHandlers() {
  // Service drill-downs
  document.querySelectorAll('.arch-service.clickable').forEach(service => {
    service.addEventListener('click', () => {
      const serviceId = service.dataset.service;
      window.openModal(`modal-${serviceId}`);
    });
  });

  // Solution card drill-downs
  document.querySelectorAll('.solution-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const detailId = card.dataset.detail;
      window.openModal(`modal-${detailId}`);
    });
  });

  // Assistant filtering
  document.querySelectorAll('.assistant-filter').forEach(filter => {
    filter.addEventListener('click', () => {
      const category = filter.dataset.filter;
      document.querySelectorAll('.assistant-filter').forEach(f => f.classList.remove('active'));
      filter.classList.add('active');

      document.querySelectorAll('.assistant-card').forEach(card => {
        if (category === 'all') {
          card.style.display = 'block';
        } else {
          const cardCategories = card.dataset.category || '';
          card.style.display = cardCategories.includes(category) ? 'block' : 'none';
        }
      });
    });
  });

  // Assistant card clicks
  document.querySelectorAll('.assistant-card').forEach(card => {
    card.addEventListener('click', () => {
      window.openModal('modal-assistants');
    });
  });

  // Initialize chat for new modals
  initChatHandlers();
}

/**
 * Initialize chat handlers for dynamically created modals
 */
function initChatHandlers() {
  document.querySelectorAll('.modal-chat').forEach(chat => {
    // Skip if already initialized
    if (chat.dataset.initialized) return;
    chat.dataset.initialized = 'true';

    const input = chat.querySelector('input');
    const button = chat.querySelector('button');

    if (!input || !button) return;

    // Handle send button click
    button.addEventListener('click', () => {
      const question = input.value.trim();
      if (question) window.handleChatSubmit(chat, question);
    });

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const question = input.value.trim();
        if (question) window.handleChatSubmit(chat, question);
      }
    });

    // Handle suggestion clicks
    chat.querySelectorAll('.chat-suggestion').forEach(suggestion => {
      suggestion.addEventListener('click', () => {
        window.handleChatSubmit(chat, suggestion.textContent);
      });
    });
  });
}

// Export for use
export { loadData, dataCache };
