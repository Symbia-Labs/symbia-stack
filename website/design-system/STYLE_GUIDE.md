# Symbia Control Center — Style Guide

> Design system for the Control Center application. Use this guide to maintain visual consistency across all views and components.

---

## Core Principles

1. **Dark-first, light-ready** — Primary experience is dark mode. All components must work in both.
2. **Information density** — Show more, scroll less. Compact but readable.
3. **Color as meaning** — Colors indicate state, type, and hierarchy. Never decorative-only.
4. **Monospace for machines** — Technical identifiers, paths, and code use monospace.
5. **Immediate feedback** — Hover, active, and loading states for all interactive elements.

---

## Color System

### Surfaces (Dark Mode — Default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-base` | `#0d1117` | Page background |
| `--surface-raised` | `#161b22` | Cards, panels, sidebar |
| `--surface-overlay` | `#1c2129` | Modals, dropdowns, popovers |
| `--surface-sunken` | `#080b0f` | Inset areas, code blocks |
| `--surface-highlight` | `#1f2a38` | Hover states, selected rows |

### Surfaces (Light Mode)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-base` | `#f6f8fa` | Page background |
| `--surface-raised` | `#ffffff` | Cards, panels, sidebar |
| `--surface-overlay` | `#ffffff` | Modals, dropdowns |
| `--surface-sunken` | `#eaeef2` | Inset areas, code blocks |
| `--surface-highlight` | `#e8ecf0` | Hover states |

### Borders

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--border-default` | `#30363d` | `#d1d5da` | Card borders, dividers |
| `--border-muted` | `#21262d` | `#e1e4e8` | Subtle separators |
| `--border-emphasis` | `#3fb8af` | `#0d9488` | Focus rings, active states |

### Text

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--text-primary` | `#e6edf3` | `#1f2328` | Headings, primary content |
| `--text-secondary` | `#8b949e` | `#57606a` | Descriptions, labels |
| `--text-muted` | `#6e7681` | `#8b949e` | Placeholders, disabled |
| `--text-link` | `#3fb8af` | `#0d9488` | Links, interactive text |
| `--text-inverse` | `#0d1117` | `#ffffff` | Text on colored backgrounds |

### Primary Accent (Cyan/Teal)

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary-50` | `#e6faf8` | Light tint |
| `--primary-100` | `#b3f0eb` | Subtle backgrounds |
| `--primary-200` | `#80e6dd` | Hover states |
| `--primary-300` | `#4ddbd0` | - |
| `--primary-400` | `#26d1c4` | - |
| `--primary-500` | `#3fb8af` | **Default primary** |
| `--primary-600` | `#0d9488` | Pressed states |
| `--primary-700` | `#0a7c72` | Dark variant |
| `--primary-800` | `#08645c` | - |
| `--primary-900` | `#064d47` | Darkest |

### Semantic Colors

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--success` | `#3fb950` | `#1a7f37` | Success states, online |
| `--warning` | `#d29922` | `#9a6700` | Warnings, pending |
| `--error` | `#f85149` | `#cf222e` | Errors, offline, delete |
| `--info` | `#58a6ff` | `#0969da` | Information, links |

### Node Colors (Workflow Graph)

| Node Type | Hex | Description |
|-----------|-----|-------------|
| `--node-input` | `#3fb950` | Input nodes (green) |
| `--node-output` | `#f97316` | Output nodes (orange) |
| `--node-llm` | `#ec4899` | LLM/Think nodes (pink) |
| `--node-router` | `#a855f7` | Router/decision nodes (purple) |
| `--node-tool` | `#06b6d4` | Tool/action nodes (cyan) |
| `--node-condition` | `#eab308` | Condition/check nodes (yellow) |
| `--node-recall` | `#8b5cf6` | Recall/memory nodes (violet) |
| `--node-say` | `#f472b6` | Say/respond nodes (light pink) |

### Badge Colors

| Type | Background | Text |
|------|------------|------|
| `builtin` | `#1a4d47` | `#3fb8af` |
| `bootstrap` | `#4a3d1a` | `#d29922` |
| `active` | `#1a4d3a` | `#3fb950` |
| `rules` | `#1a3d5c` | `#58a6ff` |
| `capabilities` | `#3d1a4d` | `#a855f7` |

---

## Typography

### Font Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 11px | 400 | 1.4 | Badges, tiny labels |
| `--text-sm` | 13px | 400 | 1.5 | Secondary text, descriptions |
| `--text-base` | 14px | 400 | 1.6 | Body text, form inputs |
| `--text-md` | 15px | 500 | 1.5 | Card titles, nav items |
| `--text-lg` | 18px | 600 | 1.4 | Section headers |
| `--text-xl` | 24px | 700 | 1.3 | Page titles |
| `--text-2xl` | 32px | 700 | 1.2 | Dashboard stats |

### Monospace Usage

Use monospace (`--font-mono`) for:
- Operation paths: `integrations.openai.assistant`
- API endpoints: `POST /api/auth/introspect`
- Code snippets and system prompts
- @mention aliases: `@logs`, `@catalog`
- Technical identifiers: `log-analyst`, `v1`
- Metrics and counts: `226 operations`, `7ms`

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Inline spacing, icon gaps |
| `--space-2` | 8px | Tight padding, small gaps |
| `--space-3` | 12px | Default padding |
| `--space-4` | 16px | Card padding, section gaps |
| `--space-5` | 20px | Larger gaps |
| `--space-6` | 24px | Section padding |
| `--space-8` | 32px | Major section breaks |
| `--space-10` | 40px | Page-level spacing |
| `--space-12` | 48px | Large containers |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Badges, small buttons, inputs |
| `--radius-md` | 6px | Buttons, cards |
| `--radius-lg` | 8px | Panels, modals |
| `--radius-xl` | 12px | Large cards, containers |
| `--radius-full` | 9999px | Pills, avatars, dots |

---

## Shadows & Elevation

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
--shadow-glow: 0 0 20px rgba(63, 184, 175, 0.15);
```

Use shadows sparingly. Prefer border contrast for elevation in dark mode.

---

## Components

### Sidebar Navigation

```
Width: 220px (expanded), 56px (collapsed)
Background: --surface-raised
Border-right: 1px solid --border-muted

Logo area:
  Height: 56px
  Padding: 0 16px
  Font: 18px, weight 700, --primary-500

Workspace selector:
  Margin: 8px 12px
  Padding: 8px 12px
  Background: --surface-sunken
  Border-radius: --radius-md

Nav items:
  Height: 40px
  Padding: 0 12px
  Gap (icon to text): 12px
  Icon size: 20px
  Font: 14px, weight 500

  Default: --text-secondary
  Hover: --surface-highlight, --text-primary
  Active: --primary-500 text, --primary-500/10 background
  Active indicator: 3px left border, --primary-500

Badge (count):
  Background: --surface-sunken
  Padding: 2px 8px
  Border-radius: --radius-full
  Font: 12px, weight 500
```

### Page Header

```
Padding: 24px 32px 16px
Border-bottom: none (content flows)

Title:
  Font: 24px, weight 700, --text-primary

Subtitle:
  Font: 14px, weight 400, --text-secondary
  Margin-top: 4px

Actions (right side):
  Gap: 12px
```

### Cards

```
Background: --surface-raised
Border: 1px solid --border-default
Border-radius: --radius-lg
Padding: 16px

Hover (interactive cards):
  Border-color: --border-emphasis
  Background: --surface-highlight

Card header:
  Gap between icon and title: 12px
  Title: 15px, weight 600

Card description:
  Font: 13px, --text-secondary
  Margin-top: 4px

Card footer/meta:
  Margin-top: 12px
  Gap: 8px
  Display: flex, wrap
```

### Buttons

#### Primary Button
```
Background: --primary-500
Color: --text-inverse (dark on light bg)
Padding: 8px 16px
Border-radius: --radius-md
Font: 14px, weight 500

Hover: --primary-400
Active: --primary-600
Disabled: 50% opacity, no pointer
```

#### Secondary Button
```
Background: --surface-raised
Border: 1px solid --border-default
Color: --text-primary
Padding: 8px 16px

Hover: --surface-highlight, border --border-emphasis
```

#### Ghost Button
```
Background: transparent
Color: --text-secondary

Hover: --surface-highlight, --text-primary
```

### Badges

```
Display: inline-flex
Padding: 2px 8px
Border-radius: --radius-sm
Font: 11px, weight 500, uppercase, letter-spacing 0.5px

Types:
  builtin: teal bg tint, teal text
  active: green bg tint, green text
  bootstrap: yellow bg tint, yellow text
  rules: blue bg tint, blue text
```

### Form Inputs

```
Height: 36px
Padding: 0 12px
Background: --surface-sunken
Border: 1px solid --border-default
Border-radius: --radius-md
Font: 14px

Placeholder: --text-muted
Focus: border --border-emphasis, shadow --shadow-glow

Search input:
  Icon left, 16px
  Padding-left: 36px
```

### Tabs

```
Display: flex
Gap: 0 (tabs touch)
Border-bottom: 1px solid --border-muted

Tab item:
  Padding: 10px 16px
  Font: 14px, weight 500
  Color: --text-secondary
  Border-bottom: 2px solid transparent

  Hover: --text-primary
  Active: --text-primary, border --primary-500
```

### Tables / Log Lists

```
Row height: 40px
Padding: 0 12px
Border-bottom: 1px solid --border-muted

Hover: --surface-highlight

Timestamp column:
  Width: 100px
  Font: --font-mono, 12px, --text-muted

Level badge:
  DEBUG: gray
  INFO: blue
  WARN: yellow
  ERROR: red
```

### Modals / Dialogs

```
Overlay: rgba(0, 0, 0, 0.7)
Container:
  Background: --surface-overlay
  Border: 1px solid --border-default
  Border-radius: --radius-xl
  Shadow: --shadow-lg
  Max-width: 560px
  Padding: 24px

Header:
  Font: 18px, weight 600
  Margin-bottom: 16px

Footer:
  Margin-top: 24px
  Display: flex
  Justify-content: flex-end
  Gap: 12px
```

### Status Indicators

```
Online/healthy dot:
  Width: 8px
  Height: 8px
  Border-radius: 50%
  Background: --success

Offline/error dot:
  Background: --error

Status in sidebar (MSG, NET):
  Font: 10px, weight 500
  Gap: 4px
  Dot size: 6px
```

---

## Workflow Graph

### Canvas

```
Background: --surface-sunken
Grid: 20px, --border-muted at 0.3 opacity
Zoom range: 25% - 200%
Pan: click + drag or scroll
```

### Nodes

```
Min-width: 140px
Max-width: 200px
Padding: 8px 12px
Border-radius: --radius-md
Border: 2px solid (node type color)
Background: --surface-raised

Header:
  Display: flex
  Align: center
  Gap: 8px

  Type indicator: 6px dot, node color
  Label: 13px, weight 500, truncate

Selected:
  Border-width: 2px
  Shadow: 0 0 0 2px (node color at 30%)

Hover:
  Background: --surface-highlight
```

### Edges

```
Stroke: --border-default
Stroke-width: 2px
Type: bezier or smoothstep

Animated (active):
  Stroke-dasharray: 5
  Animation: dash flow

Hover:
  Stroke: --primary-500
  Stroke-width: 3px
```

### Minimap

```
Position: bottom-right
Width: 150px
Height: 100px
Background: --surface-sunken
Border: 1px solid --border-default
Border-radius: --radius-md
Opacity: 0.8
```

---

## Transitions

```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;
```

Apply to:
- Hover states: `--transition-fast`
- Modal open/close: `--transition-base`
- Page transitions: `--transition-slow`
- Color/theme changes: `--transition-base`

---

## Iconography

### Icon Set
Use **Lucide** icons as the primary icon set.

### Sizes
| Context | Size |
|---------|------|
| Inline with text | 16px |
| Nav items | 20px |
| Buttons | 16px |
| Card icons | 24px |
| Empty states | 48px |

### Colors
- Default: `--text-secondary`
- Active/hover: `--text-primary`
- Branded: `--primary-500`
- Semantic: Match status colors

---

## Responsive Breakpoints

```css
--breakpoint-sm: 640px;   /* Mobile */
--breakpoint-md: 768px;   /* Tablet */
--breakpoint-lg: 1024px;  /* Desktop */
--breakpoint-xl: 1280px;  /* Wide */
--breakpoint-2xl: 1536px; /* Ultra-wide */
```

### Sidebar Behavior
- `< 768px`: Collapsed by default, hamburger menu
- `>= 768px`: Collapsible, remembers state
- `>= 1280px`: Expanded by default

---

## Accessibility

### Focus States
All interactive elements must have visible focus:
```css
:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}
```

### Color Contrast
- Text on surfaces: minimum 4.5:1 ratio
- Large text (18px+): minimum 3:1 ratio
- UI components: minimum 3:1 ratio

### Motion
Respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## File Naming Conventions

```
components/
  Button.tsx
  Button.module.css

styles/
  tokens.css        # CSS custom properties
  globals.css       # Base styles

themes/
  dark.css
  light.css
```

---

## CSS Custom Properties Export

```css
:root {
  /* Surfaces */
  --surface-base: #0d1117;
  --surface-raised: #161b22;
  --surface-overlay: #1c2129;
  --surface-sunken: #080b0f;
  --surface-highlight: #1f2a38;

  /* Borders */
  --border-default: #30363d;
  --border-muted: #21262d;
  --border-emphasis: #3fb8af;

  /* Text */
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --text-link: #3fb8af;

  /* Primary */
  --primary-500: #3fb8af;
  --primary-600: #0d9488;

  /* Semantic */
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
  --info: #58a6ff;

  /* Nodes */
  --node-input: #3fb950;
  --node-output: #f97316;
  --node-llm: #ec4899;
  --node-router: #a855f7;
  --node-tool: #06b6d4;
  --node-condition: #eab308;
  --node-recall: #8b5cf6;
  --node-say: #f472b6;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
}

[data-theme="light"] {
  --surface-base: #f6f8fa;
  --surface-raised: #ffffff;
  --surface-overlay: #ffffff;
  --surface-sunken: #eaeef2;
  --surface-highlight: #e8ecf0;

  --border-default: #d1d5da;
  --border-muted: #e1e4e8;

  --text-primary: #1f2328;
  --text-secondary: #57606a;
  --text-muted: #8b949e;

  --success: #1a7f37;
  --warning: #9a6700;
  --error: #cf222e;
  --info: #0969da;
}
```

---

## Quick Reference Card

| Element | Dark | Light |
|---------|------|-------|
| Page BG | `#0d1117` | `#f6f8fa` |
| Card BG | `#161b22` | `#ffffff` |
| Border | `#30363d` | `#d1d5da` |
| Text | `#e6edf3` | `#1f2328` |
| Muted | `#8b949e` | `#57606a` |
| Primary | `#3fb8af` | `#0d9488` |
| Success | `#3fb950` | `#1a7f37` |
| Error | `#f85149` | `#cf222e` |

---

*Last updated: January 2026*
*Version: 1.0*
