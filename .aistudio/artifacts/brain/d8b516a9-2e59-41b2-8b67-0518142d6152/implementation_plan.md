# Resolve Vite WebSocket Connection Error in Avor invest

This plan resolves the `[vite] Error: WebSocket closed without opened` runtime error in the preview environment by disabling Vite's Hot Module Replacement (HMR) WebSocket client across both the Express middleware server and the Vite configuration, while adding safe error handling for the standalone PWA service worker registration.

## User Review & Critical Decisions

> [!IMPORTANT]
> In the cloud preview environment, WebSocket upgrades for Vite HMR are disabled by the reverse proxy. Explicitly setting `hmr: false` prevents `@vite/client` from attempting a WebSocket handshake that immediately closes and triggers a runtime error.

- **Confirmed Decision 1**: Disable Vite HMR WebSocket client (`hmr: false` and `watch: null`) in both the Express dev middleware initialization and Vite configuration so `@vite/client` never opens a failing WebSocket connection.
- **Confirmed Decision 2**: Keep all standalone PWA installation capabilities (`manifest.webmanifest`, `Avor invest` app icon, `beforeinstallprompt` native install flow) and the 4 Official Withdraw Rules intact.

## 1. Overview & Core Concept

- **What It Does**: Eliminates the startup WebSocket error thrown by `@vite/client` when loading **Avor invest** in the browser and ensures clean service worker registration.
- **Target Audience / Persona**: All **Avor invest** users and administrators accessing the web app or installing the standalone PWA on mobile and desktop devices.
- **Key Value**: Restores error-free application startup and smooth page loads without false-positive WebSocket disconnection overlays.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. User opens **Avor invest** in the browser or installed standalone app.
  2. The application loads immediately without any `@vite/client` WebSocket error overlay or console rejection.
  3. Standalone PWA installation (`Install App`) and all wallet/withdrawal workflows operate uninterrupted.
- **Visual Identity & Theme**:
  - Preserves the existing deep navy (`#020e18`) and cyan/emerald (`#00f5d4`) aesthetic of **Avor invest** with zero visual regressions.
- **Interactive Feedback & Motion**:
  - Suppresses unexpected dev-client error banners while keeping in-app toast notifications and modal transitions responsive.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Explicitly disable HMR in Express `createViteServer` options and Vite config
  - *Chosen Approach*: Configure `hmr: false` and `watch: null` inside the `server` config so Vite does not inject an active WebSocket connection loop into the client bundle.
  - *Why*: The preview proxy runs in a container environment where HMR WebSockets are intentionally disabled; attempting to connect causes `WebSocket closed without opened`.
  - *Alternatives Considered*: Relying solely on `process.env.DISABLE_HMR`, which may not always be set when the Express server spawns Vite in middleware mode.
- **Decision 2**: Graceful Service Worker Registration Handling
  - *Chosen Approach*: Provide an `onRegisterError` callback in `registerSW` so any transient preview iframe restrictions are logged cleanly without throwing unhandled promise rejections.
  - *Why*: Ensures resilient PWA startup across both standard browser tabs and embedded preview iframes.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────┐
│                   Express Server (Port 3000)                 │
│  ┌───────────────────────────┐  ┌─────────────────────────┐  │
│  │ REST API (/api/*)         │  │ Vite Middleware Server  │  │
│  │ • Auth & Persistent Users │  │ • middlewareMode: true  │  │
│  │ • 4 Withdraw Rules Check  │  │ • hmr: false            │  │
│  │ • Rotating Deposit Phones │  │ • watch: null           │  │
│  └─────────────┬─────────────┘  └────────────┬────────────┘  │
└────────────────┼─────────────────────────────┼───────────────┘
                 │                             │
                 ▼                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Avor invest Client Application               │
│  ┌───────────────────────────┐  ┌─────────────────────────┐  │
│  │ Standalone PWA Layer      │  │ Core UI Views           │  │
│  │ • registerSW (safe init)  │  │ • Homepage & Machines   │  │
│  │ • beforeinstallprompt     │  │ • Wallet & Withdrawals  │  │
│  │ • Manifest & App Icons    │  │ • Account & VIP Rewards │  │
│  └───────────────────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - No changes to the persistent JSON/MongoDB data stores (`registered_users.json`, `transactions.json`, `investments.json`).
- **Interactive Component & State Mapping**:
  - Express `startServer()` initializes Vite middleware with `hmr: false` and restarts cleanly on port 3000.
  - Client bootstrap registers the PWA service worker with safe error handling and captures `beforeinstallprompt` for one-tap native app installation.
