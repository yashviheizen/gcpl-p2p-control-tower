# GCPL P2P Control Tower — demo prototype

A clickable **demo prototype** of a plan-to-production (P2P) control tower: production vs plan, dispatch, FG / RM-PM inventory, PO coverage, exceptions, report uploads, master data, administration and a deterministic "Ask P2P" assistant.

> **This is a demo, not a production system.**
> - All quantities, plans, reports, exceptions, users and emails are **synthetic demo data** generated in `src/data/`. SKU/vendor codes are illustrative, not real GCPL codes; vendor names are used as recognisable examples only and the figures shown against them are invented.
> - There is **no backend and no live GCPL connection**. Uploads, validation, invitations and permissions are simulated in the browser and persisted to `localStorage` only.
> - **Demo login:** `planner@example.com` / `DemoP2P2026!` (public, fictional, prefilled). The sign-in is simulated in the browser (a session cookie) — it is not authentication and no SSO or backend is connected.
> - No real emails are sent and there is no real authentication. The "Demo controls" menu switches personas (Supply Planner, Admin, Viewer, …).
> - The assistant is keyword-matched and computes answers from the demo dataset — it is not an AI model.
> - The demo "today" is fixed at 9 Oct 2026.

## Setup

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5185
```

## Build & checks

```bash
npm run build      # type-check (tsc -b) + Vite production build → dist/
npm run preview    # serve the built app locally
npm run lint       # oxlint
npx vitest run     # data/metric reconciliation tests
```

## Deployment

Static single-page app. `vercel.json` sets the Vite framework, `npm run build`, output `dist/`, and rewrites all non-asset paths to `index.html` so deep links and refreshes work with client-side routing.

To reset the demo state in a browser, use **Demo controls → Reset demo data** or clear the site's `localStorage`.
