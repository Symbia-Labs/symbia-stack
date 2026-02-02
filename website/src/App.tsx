import { useState, useEffect } from 'react';
import { usePlatformStatus, useAssistants } from './hooks/useSymbia';
import { PlatformStatus } from './components/PlatformStatus';
import { AssistantGrid } from './components/AssistantGrid';
import { SymbiaScriptDemo } from './components/SymbiaScriptDemo';

// Theme management
type Theme = 'carbon' | 'sand' | 'stone' | 'mono-blue';
type Mode = 'dark' | 'light' | 'system';

function App() {
  const [theme, setTheme] = useState<Theme>('carbon');
  const [mode, setMode] = useState<Mode>('dark');
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  // Platform connection
  const platformStatus = usePlatformStatus();
  const { assistants, loading: assistantsLoading } = useAssistants();

  // Apply theme/mode to document
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme;

    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.dataset.mode = prefersDark ? 'dark' : 'light';
    } else {
      html.dataset.mode = mode;
    }
  }, [theme, mode]);

  // Listen for system theme changes
  useEffect(() => {
    if (mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.dataset.mode = e.matches ? 'dark' : 'light';
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode]);

  return (
    <>
      {/* Navigation */}
      <nav className="nav">
        <div className="container nav-inner">
          <a href="/" className="nav-logo">
            <svg viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.1"/>
              <path d="M8 16c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="3" fill="currentColor"/>
            </svg>
            Symbia
          </a>

          <div className="nav-links">
            <a href="#platform" className="nav-link">Platform</a>
            <a href="#architecture" className="nav-link">Architecture</a>
            <a href="#assistants" className="nav-link">Assistants</a>
            <a href="/docs" className="nav-link">Docs</a>
          </div>

          <div className="nav-actions">
            <PlatformStatus status={platformStatus} compact />
            <a href="/docs/quickstart" className="btn btn-primary">Get Started</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-content">
            <span className="hero-eyebrow">AI-Native Infrastructure</span>
            <h1 className="hero-title">
              Build systems where AI is a first-class citizen
            </h1>
            <p className="hero-subtitle">
              Symbia is the platform for building systems where AI assistants are first-class principals.
              Authentication, orchestration, and observability designed for AI-native architectures.
            </p>
            <div className="hero-actions">
              <a href="/docs/quickstart" className="btn btn-primary btn-lg">
                Start Building
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </a>
              <a href="#assistants" className="btn btn-secondary btn-lg">Explore Assistants</a>
            </div>

            <div className="hero-meta">
              <div className="hero-meta-item">
                <span className="hero-meta-value">9 Services</span>
                <span className="hero-meta-label">Microservice Platform</span>
              </div>
              <div className="hero-meta-item">
                <span className="hero-meta-value">
                  {platformStatus.connected ? assistants.length : '—'}
                </span>
                <span className="hero-meta-label">Built-in Assistants</span>
              </div>
              <div className="hero-meta-item">
                <span className="hero-meta-value">
                  {platformStatus.connected ? (
                    <span style={{ color: 'var(--node-input)' }}>● Live</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>○ Demo</span>
                  )}
                </span>
                <span className="hero-meta-label">Platform Status</span>
              </div>
            </div>
          </div>

          {/* Hero Visual - Live Platform Status */}
          <div className="hero-visual">
            <div className="hero-visual-header">
              <span className="hero-visual-dot" style={{ background: platformStatus.connected ? 'var(--node-input)' : 'var(--text-muted)' }}></span>
              <span className="hero-visual-dot" style={{ background: 'var(--node-condition)' }}></span>
              <span className="hero-visual-dot" style={{ background: 'var(--node-input)' }}></span>
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                {platformStatus.connected ? 'Connected to Symbia' : 'Demo Mode'}
              </span>
            </div>
            <div className="hero-visual-content">
              <PlatformStatus status={platformStatus} expanded />
            </div>
          </div>
        </div>
      </section>

      {/* Symbia Script Demo Section */}
      <section id="symbia-script" className="section" style={{ background: 'var(--bg-muted)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="container">
          <div className="section-header" style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <span className="section-label">Developer Experience</span>
            <h2 className="section-title">
              <span className="highlight">Symbia Script</span> - Unified Reference System
            </h2>
            <p className="section-desc">
              A consistent syntax for referencing data across the entire platform.
              Access users, messages, services, and integrations with a single, predictable pattern.
            </p>
          </div>

          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <SymbiaScriptDemo />
          </div>

          {/* Feature highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-5)', marginTop: 'var(--space-8)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>@</div>
              <h4 style={{ fontWeight: '600', marginBottom: 'var(--space-2)' }}>Universal Syntax</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                One pattern to access all platform data: @namespace.path
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>{'{{'}...{'}}'}</div>
              <h4 style={{ fontWeight: '600', marginBottom: 'var(--space-2)' }}>Template Interpolation</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Embed references anywhere with double-brace syntax
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>10+</div>
              <h4 style={{ fontWeight: '600', marginBottom: 'var(--space-2)' }}>Built-in Namespaces</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                User, org, message, service, integration, catalog & more
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Assistants Section */}
      <section id="assistants" className="section">
        <div className="container">
          <div className="section-header" style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <h2 className="section-title">Built-in Assistants</h2>
            <p className="section-subtitle">
              {platformStatus.connected
                ? `${assistants.length} assistants loaded from catalog`
                : 'Connect to Symbia platform to view assistants'}
            </p>
          </div>

          <AssistantGrid
            assistants={assistants}
            loading={assistantsLoading}
            connected={platformStatus.connected}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-copy">© 2026 Symbia Labs. All rights reserved.</div>
          <div className="footer-links">
            <a href="/docs" className="footer-link">Documentation</a>
            <a href="/blog" className="footer-link">Blog</a>
            <a href="/privacy" className="footer-link">Privacy</a>
            <a href="/terms" className="footer-link">Terms</a>
          </div>
        </div>
      </footer>

      {/* Theme Controls */}
      <div className="theme-controls">
        <div className={`theme-panel ${themePanelOpen ? 'open' : ''}`} id="themePanel">
          <div className="theme-panel-title">Mode</div>
          <div className="mode-toggle">
            {(['dark', 'light', 'system'] as Mode[]).map(m => (
              <button
                key={m}
                className={`mode-btn ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <div className="theme-panel-title" style={{ marginTop: 'var(--space-4)' }}>Theme</div>
          <div className="theme-swatches">
            <button
              className={`theme-swatch ${theme === 'carbon' ? 'active' : ''}`}
              style={{ background: 'linear-gradient(135deg, #3b82f6, #ec4899)' }}
              onClick={() => setTheme('carbon')}
            />
            <button
              className={`theme-swatch ${theme === 'sand' ? 'active' : ''}`}
              style={{ background: 'linear-gradient(135deg, #c2956b, #7d9a78)' }}
              onClick={() => setTheme('sand')}
            />
            <button
              className={`theme-swatch ${theme === 'stone' ? 'active' : ''}`}
              style={{ background: 'linear-gradient(135deg, #7890a8, #a89088)' }}
              onClick={() => setTheme('stone')}
            />
            <button
              className={`theme-swatch ${theme === 'mono-blue' ? 'active' : ''}`}
              style={{ background: '#5a8ad0' }}
              onClick={() => setTheme('mono-blue')}
            />
          </div>
        </div>
        <button
          className="theme-toggle-btn"
          onClick={() => setThemePanelOpen(!themePanelOpen)}
          title="Toggle theme panel"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </button>
      </div>
    </>
  );
}

export default App;
