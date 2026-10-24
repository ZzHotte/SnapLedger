@AGENTS.md

# Frontend (Next.js App Router + React + TypeScript)

Note: `AGENTS.md` in this directory is auto-written by `next dev` on every run (it's the Next.js version-drift warning, not project conventions) — don't hand-edit it; add project conventions here instead.

## Layout

- `lib/api.ts` — the single HTTP client module. Every backend call is a typed function here (`fetchShipments`, `createCustomer`, …) that goes through the shared `request()`/`requestForm()` helpers. Don't call `fetch()` directly from a component — add a function here instead, even for a one-off call.
- `lib/auth-context.tsx` / `lib/workspace-context.tsx` — app-wide state via React context (`useAuth()`, `useWorkspace()`). `currentWorkspace.id` is what every workspace-scoped API call is parameterized on.
- `components/` — shared UI used from more than one page. Page-specific UI stays in its `app/**/page.tsx` or a co-located `*-client.tsx`.
- Pages are client components (`"use client"`) that fetch in a `useEffect`. There's no server-side data fetching yet — if you add a page, match this pattern unless you have a specific reason not to.

## Requests

- **Independent requests must run in parallel**, not be awaited one after another — this was a real, repeated source of slow page loads here (fixed in both the login flow and the shipment detail page this session). Reach for `Promise.all` whenever two fetches don't actually depend on each other's result.
- Catch errors as `err instanceof ApiError ? err.message : "<fallback>"` — `ApiError` (from `lib/api.ts`) carries the backend's actual message; match this pattern rather than a generic try/catch.

## Testing

- Tests are co-located (`Component.test.tsx` next to `Component.tsx`), using Vitest + `@testing-library/react`. Mock context providers with `vi.mock("@/lib/auth-context", ...)` / `vi.mock("@/lib/workspace-context", ...)` rather than wrapping in real providers.

## Validation

```bash
npm run lint
npm test
npm run typecheck   # fast local type-check; `npm run build` also type-checks, as part of `next build`
```

## Production build

`next.config.ts`'s `output: "standalone"` is conditioned on `!process.env.VERCEL` — Vercel's own build sets that var and does its own packaging, and breaks outright if `standalone` output is forced on it. Don't remove that condition. See `frontend/Dockerfile`'s `runner` stage for where `standalone` output is actually used.

