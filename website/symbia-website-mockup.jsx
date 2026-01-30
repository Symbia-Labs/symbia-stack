import React, { useState, useEffect } from 'react';

// ============================================================================
// SYMBIA WEBSITE REDESIGN - DESIGN MOCKUP
// ============================================================================
// Theme System: 6 named palettes × 3 modes (dark/light/system)
// ============================================================================

// THEME DEFINITIONS - 6 Named Color Palettes
const themes = {
  // 1. CARBON - Deep blacks, electric accents (default, most technical)
  carbon: {
    name: 'Carbon',
    light: {
      bg: '#ffffff',
      bgSubtle: '#f8f9fa',
      bgMuted: '#f1f3f5',
      text: '#1a1a1a',
      textMuted: '#6b7280',
      accent: '#0066ff',
      accentHover: '#0052cc',
      accentSubtle: '#e6f0ff',
      border: '#e5e7eb',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
    dark: {
      bg: '#0a0a0a',
      bgSubtle: '#141414',
      bgMuted: '#1f1f1f',
      text: '#fafafa',
      textMuted: '#9ca3af',
      accent: '#3b82f6',
      accentHover: '#60a5fa',
      accentSubtle: '#1e3a5f',
      border: '#2a2a2a',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  },

  // 2. OCEAN - Deep blues, teal accents (trustworthy, enterprise)
  ocean: {
    name: 'Ocean',
    light: {
      bg: '#ffffff',
      bgSubtle: '#f0f9ff',
      bgMuted: '#e0f2fe',
      text: '#0c1426',
      textMuted: '#64748b',
      accent: '#0891b2',
      accentHover: '#0e7490',
      accentSubtle: '#cffafe',
      border: '#cbd5e1',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    dark: {
      bg: '#0c1426',
      bgSubtle: '#0f1d32',
      bgMuted: '#1a2d4a',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      accent: '#22d3ee',
      accentHover: '#67e8f9',
      accentSubtle: '#164e63',
      border: '#1e3a5f',
      success: '#10b981',
      warning: '#fbbf24',
      error: '#f87171',
    },
  },

  // 3. EMBER - Warm blacks, orange/amber accents (energetic, bold)
  ember: {
    name: 'Ember',
    light: {
      bg: '#fffbf5',
      bgSubtle: '#fff7ed',
      bgMuted: '#ffedd5',
      text: '#1c1917',
      textMuted: '#78716c',
      accent: '#ea580c',
      accentHover: '#c2410c',
      accentSubtle: '#fed7aa',
      border: '#d6d3d1',
      success: '#16a34a',
      warning: '#ca8a04',
      error: '#dc2626',
    },
    dark: {
      bg: '#0c0a09',
      bgSubtle: '#1c1917',
      bgMuted: '#292524',
      text: '#fafaf9',
      textMuted: '#a8a29e',
      accent: '#fb923c',
      accentHover: '#fdba74',
      accentSubtle: '#7c2d12',
      border: '#44403c',
      success: '#22c55e',
      warning: '#facc15',
      error: '#f87171',
    },
  },

  // 4. VIOLET - Purple hues, creative/innovative feel
  violet: {
    name: 'Violet',
    light: {
      bg: '#fefefe',
      bgSubtle: '#faf5ff',
      bgMuted: '#f3e8ff',
      text: '#1e1b2e',
      textMuted: '#6b7280',
      accent: '#8b5cf6',
      accentHover: '#7c3aed',
      accentSubtle: '#e9d5ff',
      border: '#e5e7eb',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
    dark: {
      bg: '#0d0a14',
      bgSubtle: '#1a1625',
      bgMuted: '#2d2640',
      text: '#faf5ff',
      textMuted: '#a1a1aa',
      accent: '#a78bfa',
      accentHover: '#c4b5fd',
      accentSubtle: '#4c1d95',
      border: '#3f3657',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
    },
  },

  // 5. FOREST - Greens, natural/sustainable feel
  forest: {
    name: 'Forest',
    light: {
      bg: '#fefefe',
      bgSubtle: '#f0fdf4',
      bgMuted: '#dcfce7',
      text: '#14241c',
      textMuted: '#5b6b61',
      accent: '#16a34a',
      accentHover: '#15803d',
      accentSubtle: '#bbf7d0',
      border: '#d1d5db',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
    },
    dark: {
      bg: '#0a0f0c',
      bgSubtle: '#0f1a14',
      bgMuted: '#1a2e22',
      text: '#f0fdf4',
      textMuted: '#9ca3af',
      accent: '#4ade80',
      accentHover: '#86efac',
      accentSubtle: '#14532d',
      border: '#2d4a3a',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
    },
  },

  // 6. SLATE - Neutral grays, professional/minimal
  slate: {
    name: 'Slate',
    light: {
      bg: '#ffffff',
      bgSubtle: '#f8fafc',
      bgMuted: '#f1f5f9',
      text: '#0f172a',
      textMuted: '#64748b',
      accent: '#475569',
      accentHover: '#334155',
      accentSubtle: '#e2e8f0',
      border: '#e2e8f0',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
    dark: {
      bg: '#0f172a',
      bgSubtle: '#1e293b',
      bgMuted: '#334155',
      text: '#f8fafc',
      textMuted: '#94a3b8',
      accent: '#cbd5e1',
      accentHover: '#e2e8f0',
      accentSubtle: '#475569',
      border: '#475569',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
    },
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SymbiaWebsiteMockup() {
  const [themeName, setThemeName] = useState('carbon');
  const [mode, setMode] = useState('system'); // 'light' | 'dark' | 'system'
  const [resolvedMode, setResolvedMode] = useState('dark');

  // Handle system preference
  useEffect(() => {
    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedMode(mediaQuery.matches ? 'dark' : 'light');
      const handler = (e) => setResolvedMode(e.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      setResolvedMode(mode);
    }
  }, [mode]);

  const colors = themes[themeName][resolvedMode];
  const isDark = resolvedMode === 'dark';

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg,
      color: colors.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      transition: 'background 0.3s, color 0.3s',
    }}>
      {/* ================================================================== */}
      {/* THEME CONTROLS (Floating) */}
      {/* ================================================================== */}
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000,
        background: colors.bgSubtle,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.1)',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: colors.textMuted }}>
          Theme Preview
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: 4, background: colors.bgMuted, borderRadius: 8, padding: 4 }}>
          {['light', 'dark', 'system'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '6px 12px',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                background: mode === m ? colors.accent : 'transparent',
                color: mode === m ? '#fff' : colors.textMuted,
                transition: 'all 0.2s',
              }}
            >
              {m === 'light' ? '☀️' : m === 'dark' ? '🌙' : '💻'} {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Theme Palette Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {Object.entries(themes).map(([key, theme]) => (
            <button
              key={key}
              onClick={() => setThemeName(key)}
              style={{
                padding: '8px 10px',
                border: themeName === key ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                background: themeName === key ? colors.accentSubtle : colors.bgMuted,
                color: colors.text,
                transition: 'all 0.2s',
              }}
            >
              {theme.name}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================== */}
      {/* NAVIGATION */}
      {/* ================================================================== */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: isDark ? 'rgba(10,10,10,0.8)' : 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: '#fff',
              fontSize: 16,
            }}>S</div>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>Symbia</span>
          </div>

          {/* Nav Links */}
          <div style={{ display: 'flex', gap: 32 }}>
            {['Platform', 'Docs', 'Pricing', 'Blog'].map((link) => (
              <a
                key={link}
                href="#"
                style={{
                  color: colors.textMuted,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.color = colors.text}
                onMouseLeave={(e) => e.target.style.color = colors.textMuted}
              >
                {link}
              </a>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{
              padding: '10px 18px',
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              background: 'transparent',
              color: colors.text,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}>Sign In</button>
            <button style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 8,
              background: colors.accent,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* ================================================================== */}
      {/* HERO SECTION */}
      {/* ================================================================== */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '120px 24px 80px',
        textAlign: 'center',
      }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          background: colors.accentSubtle,
          borderRadius: 20,
          fontSize: 13,
          fontWeight: 500,
          color: colors.accent,
          marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, background: colors.accent, borderRadius: '50%' }} />
          Now in Private Beta
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(40px, 6vw, 72px)',
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          marginBottom: 24,
          background: isDark
            ? `linear-gradient(180deg, ${colors.text} 0%, ${colors.textMuted} 100%)`
            : colors.text,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: isDark ? 'transparent' : colors.text,
        }}>
          The infrastructure layer<br />for AI-native products
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: 20,
          color: colors.textMuted,
          maxWidth: 640,
          margin: '0 auto 40px',
          lineHeight: 1.6,
        }}>
          Symbia is a microservices platform where AI agents are first-class citizens.
          Build, orchestrate, and monitor autonomous workflows with enterprise-grade
          authentication, observability, and multi-tenancy from day one.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button style={{
            padding: '16px 32px',
            border: 'none',
            borderRadius: 10,
            background: colors.accent,
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            Start Building
            <span>→</span>
          </button>
          <button style={{
            padding: '16px 32px',
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            background: 'transparent',
            color: colors.text,
            fontSize: 16,
            fontWeight: 500,
            cursor: 'pointer',
          }}>View Documentation</button>
        </div>
      </section>

      {/* ================================================================== */}
      {/* ARCHITECTURE DIAGRAM (Simplified Visual) */}
      {/* ================================================================== */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '40px 24px 100px',
      }}>
        <div style={{
          background: colors.bgSubtle,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: 48,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Grid pattern overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(${colors.border} 1px, transparent 1px), linear-gradient(90deg, ${colors.border} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            opacity: 0.3,
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: colors.textMuted, marginBottom: 8 }}>
                Platform Architecture
              </div>
              <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }}>
                9 services. One platform.
              </h2>
            </div>

            {/* Service Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { name: 'Identity', port: '5001', desc: 'Auth, users, agents, RBAC', icon: '🔐' },
                { name: 'Catalog', port: '5003', desc: 'Resource registry, versioning', icon: '📦' },
                { name: 'Assistants', port: '5004', desc: 'AI orchestration, rules', icon: '🤖' },
                { name: 'Messaging', port: '5005', desc: 'Real-time, WebSocket', icon: '💬' },
                { name: 'Runtime', port: '5006', desc: 'Graph execution engine', icon: '⚡' },
                { name: 'Network', port: '5054', desc: 'Event mesh, SDN', icon: '🌐' },
                { name: 'Logging', port: '5002', desc: 'Traces, metrics, AI analysis', icon: '📊' },
                { name: 'Integrations', port: '5007', desc: 'LLM gateway, providers', icon: '🔗' },
                { name: 'Server', port: '5000', desc: 'API gateway, builds', icon: '🖥️' },
              ].map((service) => (
                <div key={service.name} style={{
                  background: colors.bgMuted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: 20,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{service.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{service.name}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' }}>:{service.port}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>{service.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* KEY DIFFERENTIATORS */}
      {/* ================================================================== */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5, marginBottom: 16 }}>
            AI-native by design
          </h2>
          <p style={{ fontSize: 18, color: colors.textMuted, maxWidth: 600, margin: '0 auto' }}>
            Not AI bolted onto a traditional platform. Built from the ground up for a world where agents and humans work together.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {[
            {
              title: 'Dual Principal Model',
              desc: 'Users and AI agents both have first-class identities. Agents get their own JWT tokens, declared capabilities, and audit trails.',
              code: `// Agent has its own identity
{
  principalId: "assistant:log-analyst",
  principalType: "assistant",
  capabilities: ["log.read", "log.analyze"]
}`
            },
            {
              title: 'Declarative Workflow Graphs',
              desc: 'Workflows are data, not code. Version-controlled, visually editable, no redeployment needed for changes.',
              code: `graph:
  nodes:
    - classify: llm-invoke
    - route: condition
    - respond: message-send
  edges:
    classify → route → respond`
            },
            {
              title: 'Stream Control Semantics',
              desc: 'Pause, resume, preempt, or hand off AI responses mid-stream. Control long-running LLM interactions.',
              code: `socket.emit('stream:pause', { messageId });
socket.emit('stream:preempt', {
  messageId,
  reason: 'user_interrupt'
});`
            },
            {
              title: 'Self-Documenting Services',
              desc: 'Every service exposes /docs/llms.txt for agent discovery. AI can explore and compose capabilities at runtime.',
              code: `GET /docs/llms.txt

# Identity Service API
> Authentication for Symbia platform
POST /api/auth/login
GET /api/users/me
...`
            },
          ].map((feature, i) => (
            <div key={i} style={{
              background: colors.bgSubtle,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: 32,
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>{feature.title}</h3>
              <p style={{ fontSize: 15, color: colors.textMuted, marginBottom: 20, lineHeight: 1.6 }}>{feature.desc}</p>
              <pre style={{
                background: colors.bgMuted,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 16,
                fontSize: 12,
                lineHeight: 1.5,
                overflow: 'auto',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                color: colors.text,
              }}>
                {feature.code}
              </pre>
            </div>
          ))}
        </div>
      </section>

      {/* ================================================================== */}
      {/* TRUST SIGNALS */}
      {/* ================================================================== */}
      <section style={{
        background: colors.bgSubtle,
        borderTop: `1px solid ${colors.border}`,
        borderBottom: `1px solid ${colors.border}`,
        padding: '80px 24px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginBottom: 16 }}>
              Enterprise-ready from day one
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
            {[
              { metric: 'Multi-tenant', detail: 'Query-level isolation, no data leaks' },
              { metric: '9 Services', detail: 'Modular, independently scalable' },
              { metric: '200+ APIs', detail: 'Full OpenAPI 3.0 specs' },
              { metric: 'Zero Docker', detail: 'Local dev in under 60 seconds' },
            ].map((item, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: colors.accent,
                  marginBottom: 8,
                }}>{item.metric}</div>
                <div style={{ fontSize: 14, color: colors.textMuted }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* DEVELOPER EXPERIENCE */}
      {/* ================================================================== */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '100px 24px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: colors.accent, marginBottom: 16 }}>
              Developer Experience
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5, marginBottom: 20 }}>
              Running in under a minute
            </h2>
            <p style={{ fontSize: 17, color: colors.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
              No Docker. No database provisioning. No environment variable maze.
              In-memory mode means you can run the entire platform with a single command
              and start building immediately.
            </p>
            <div style={{ display: 'flex', gap: 16 }}>
              <button style={{
                padding: '14px 24px',
                border: 'none',
                borderRadius: 10,
                background: colors.accent,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}>Quick Start Guide</button>
            </div>
          </div>

          <div style={{
            background: colors.bgMuted,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 24,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 14,
            lineHeight: 1.8,
          }}>
            <div style={{ color: colors.textMuted, marginBottom: 8 }}>$ Terminal</div>
            <div><span style={{ color: colors.textMuted }}>$</span> git clone symbia</div>
            <div><span style={{ color: colors.textMuted }}>$</span> npm install</div>
            <div><span style={{ color: colors.textMuted }}>$</span> npm run dev</div>
            <div style={{ marginTop: 16, color: colors.success }}>
              ✓ Identity service running on :5001<br />
              ✓ Catalog service running on :5003<br />
              ✓ Messaging service running on :5005<br />
              ✓ All 9 services started in 3.2s
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FINAL CTA */}
      {/* ================================================================== */}
      <section style={{
        background: `linear-gradient(135deg, ${colors.bgMuted} 0%, ${colors.bgSubtle} 100%)`,
        borderTop: `1px solid ${colors.border}`,
        padding: '100px 24px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5, marginBottom: 20 }}>
            Ready to build AI-native?
          </h2>
          <p style={{ fontSize: 18, color: colors.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
            Join the private beta and start building products where AI agents
            are first-class citizens.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button style={{
              padding: '18px 36px',
              border: 'none',
              borderRadius: 10,
              background: colors.accent,
              color: '#fff',
              fontSize: 17,
              fontWeight: 600,
              cursor: 'pointer',
            }}>Request Access</button>
            <button style={{
              padding: '18px 36px',
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              background: 'transparent',
              color: colors.text,
              fontSize: 17,
              fontWeight: 500,
              cursor: 'pointer',
            }}>Read the Docs</button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FOOTER */}
      {/* ================================================================== */}
      <footer style={{
        borderTop: `1px solid ${colors.border}`,
        padding: '48px 24px',
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 24,
              height: 24,
              background: colors.accent,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: '#fff',
              fontSize: 12,
            }}>S</div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Symbia Labs</span>
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>
            © 2026 Symbia Labs. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
