# Symbia Website

Marketing website for Symbia with live platform integration using `@symbia/*` packages.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The website runs on http://localhost:8080 and automatically connects to Symbia services when the platform is running.

## Structure

```
website/
├── index.html              # Vite entry point
├── vite.config.ts          # Vite config with service proxies
├── package.json            # Dependencies including @symbia/* packages
├── tsconfig.json           # TypeScript config
├── src/
│   ├── main.tsx            # React entry
│   ├── App.tsx             # Main app component
│   ├── vite-env.d.ts       # Vite types
│   ├── components/
│   │   ├── PlatformStatus.tsx   # Live service health display
│   │   ├── LiveChat.tsx         # Chat using @symbia/messaging-client
│   │   └── AssistantGrid.tsx    # Assistants from @symbia/catalog-client
│   ├── hooks/
│   │   └── useSymbia.ts    # React hooks for Symbia services
│   └── styles/
│       └── main.css        # Design system CSS
├── design-system/          # Theme tokens
├── index-static.html       # Original static mockup (reference)
└── README.md
```

## @symbia/* Packages Used

| Package | Purpose |
|---------|---------|
| `@symbia/catalog-client` | Fetch assistants, graphs, resources |
| `@symbia/messaging-client` | Live chat with streaming |
| `@symbia/http` | HTTP utilities |
| `@symbia/sys` | System constants |

## Features

### Live Platform Integration
When Symbia is running (`./scripts/dev-start.sh`):
- **Service Health** - Real-time status for all 9 services
- **Catalog Stats** - Live resource/assistant/graph counts
- **Assistant Grid** - Populated from live catalog
- **Live Chat** - Stream messages through messaging service

### Demo Mode
When platform isn't running:
- Shows demo data for all sections
- Chat displays helpful fallback messages
- Gracefully degrades without errors

## Hooks

### `usePlatformStatus(pollInterval?)`
Polls service health endpoints, returns connection status and service details.

```tsx
const { connected, services, stats } = usePlatformStatus();
```

### `useAssistants()`
Fetches published assistants from catalog.

```tsx
const { assistants, loading, error } = useAssistants();
```

### `useChat(assistantKey?)`
Manages chat state with streaming support.

```tsx
const { messages, isStreaming, sendMessage, pauseStream, resumeStream } = useChat('coordinator');
```

### `useGraphs()`
Fetches published workflow graphs.

```tsx
const { graphs, loading, error } = useGraphs();
```

## Vite Proxies

API routes are proxied to local Symbia services:

| Route | Service | Port |
|-------|---------|------|
| `/api/identity/*` | Identity | 5001 |
| `/api/logging/*` | Logging | 5002 |
| `/api/catalog/*` | Catalog | 5003 |
| `/api/assistants/*` | Assistants | 5004 |
| `/api/messaging/*` | Messaging | 5005 |
| `/api/runtime/*` | Runtime | 5006 |
| `/api/integrations/*` | Integrations | 5007 |
| `/api/network/*` | Network | 5054 |

## Theme System

Four themes with dark/light modes:

- **Carbon** - Neon tech (blue/pink accents)
- **Sand** - Organic warmth (tan/green)
- **Stone** - Muted professional (slate)
- **Mono-Blue** - Monochromatic blue

Controlled via data attributes:
```html
<html data-theme="carbon" data-mode="dark">
```

## Scripts

```bash
npm run dev      # Start dev server (port 8080)
npm run build    # Build for production
npm run preview  # Preview production build
npm run check    # TypeScript type check
```

## Development

### Adding a new Symbia hook

1. Add the hook to `src/hooks/useSymbia.ts`
2. Import the relevant `@symbia/*` client
3. Handle both connected and disconnected states
4. Export from the hook file

### Adding a new component

1. Create component in `src/components/`
2. Export from `src/components/index.ts`
3. Import and use in `App.tsx`

## Production Build

```bash
npm run build
```

Outputs to `dist/`. Can be served by any static file server.

For production, configure the API endpoints to point to your deployed Symbia instance instead of localhost proxies.
