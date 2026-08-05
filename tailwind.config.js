/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Surface colors
        surface: {
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          sunken: 'var(--surface-sunken)',
          highlight: 'var(--surface-highlight)',
        },
        // Border colors
        border: {
          DEFAULT: 'var(--border-default)',
          muted: 'var(--border-muted)',
          emphasis: 'var(--border-emphasis)',
        },
        // Text colors
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          link: 'var(--text-link)',
          inverse: 'var(--text-inverse)',
        },
        // Primary (Teal/Cyan)
        primary: {
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
          DEFAULT: 'var(--primary-500)',
        },
        // Semantic colors
        success: {
          DEFAULT: 'var(--success)',
          muted: 'var(--success-muted)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          muted: 'var(--warning-muted)',
        },
        error: {
          DEFAULT: 'var(--error)',
          muted: 'var(--error-muted)',
        },
        info: {
          DEFAULT: 'var(--info)',
          muted: 'var(--info-muted)',
        },
        // Node colors (Workflow Graph)
        node: {
          input: 'var(--node-input)',
          'input-bg': 'var(--node-input-bg)',
          output: 'var(--node-output)',
          'output-bg': 'var(--node-output-bg)',
          llm: 'var(--node-llm)',
          'llm-bg': 'var(--node-llm-bg)',
          router: 'var(--node-router)',
          'router-bg': 'var(--node-router-bg)',
          tool: 'var(--node-tool)',
          'tool-bg': 'var(--node-tool-bg)',
          condition: 'var(--node-condition)',
          'condition-bg': 'var(--node-condition-bg)',
          recall: 'var(--node-recall)',
          'recall-bg': 'var(--node-recall-bg)',
          say: 'var(--node-say)',
          'say-bg': 'var(--node-say-bg)',
          think: 'var(--node-think)',
          'think-bg': 'var(--node-think-bg)',
        },
        // Badge colors
        badge: {
          'builtin-bg': 'var(--badge-builtin-bg)',
          'builtin-text': 'var(--badge-builtin-text)',
          'active-bg': 'var(--badge-active-bg)',
          'active-text': 'var(--badge-active-text)',
          'bootstrap-bg': 'var(--badge-bootstrap-bg)',
          'bootstrap-text': 'var(--badge-bootstrap-text)',
          'rules-bg': 'var(--badge-rules-bg)',
          'rules-text': 'var(--badge-rules-text)',
          'capabilities-bg': 'var(--badge-capabilities-bg)',
          'capabilities-text': 'var(--badge-capabilities-text)',
        },
        // Log level colors
        log: {
          debug: 'var(--log-debug)',
          'debug-bg': 'var(--log-debug-bg)',
          info: 'var(--log-info)',
          'info-bg': 'var(--log-info-bg)',
          warn: 'var(--log-warn)',
          'warn-bg': 'var(--log-warn-bg)',
          error: 'var(--log-error)',
          'error-bg': 'var(--log-error-bg)',
        },
        // Legacy aliases for backwards compatibility
        scc: {
          primary: 'var(--primary-500)',
          secondary: 'var(--node-router)',
          accent: 'var(--error)',
          surface: 'var(--surface-base)',
          elevated: 'var(--surface-raised)',
          border: 'var(--border-default)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        md: 'var(--text-md)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
      },
      fontWeight: {
        normal: 'var(--font-normal)',
        medium: 'var(--font-medium)',
        semibold: 'var(--font-semibold)',
        bold: 'var(--font-bold)',
      },
      lineHeight: {
        tight: 'var(--leading-tight)',
        snug: 'var(--leading-snug)',
        normal: 'var(--leading-normal)',
        relaxed: 'var(--leading-relaxed)',
      },
      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        glow: 'var(--shadow-glow)',
        'glow-strong': 'var(--shadow-glow-strong)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease',
      },
      zIndex: {
        base: 'var(--z-base)',
        dropdown: 'var(--z-dropdown)',
        sticky: 'var(--z-sticky)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        popover: 'var(--z-popover)',
        tooltip: 'var(--z-tooltip)',
        toast: 'var(--z-toast)',
      },
      width: {
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed)',
      },
      height: {
        header: 'var(--header-height)',
      },
      maxWidth: {
        content: 'var(--content-max-width)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(63, 184, 175, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(63, 184, 175, 0.5)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
