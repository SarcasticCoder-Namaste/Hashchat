# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### HashChat (`artifacts/social`)

Hashtag-driven social chat web app. React + Vite + Wouter routing, TanStack Query, shadcn UI (Tailwind v4), Clerk auth (`@clerk/react`).

Routes (relative to base path):
- `/` — Landing (signed out) or redirect to `/app/discover` (signed in)
- `/sign-in/*?`, `/sign-up/*?` — Clerk SignIn/SignUp (`routing="path"`)
- `/onboarding` — first-time hashtag picker (>=3 required)
- `/app/discover` — smart matches + trending tags
- `/app/trending` — searchable trending tags + follow/unfollow
- `/app/rooms`, `/app/rooms/:tag` — hashtag rooms list & chat
- `/app/messages`, `/app/messages/:id` — DM list & conversation
- `/app/profile` — edit display name, bio, hashtags

Real-time is implemented via TanStack Query polling (`refetchInterval` 2.5–5s).

### API Server (`artifacts/api-server`)

Express + Clerk middleware. `requireAuth` reads `getAuth(req).userId` and lazily bootstraps a row in `users` for new Clerk users (username from email/firstName, deduped). All `/api/*` routes are auth-protected.

### Mockup Sandbox (`artifacts/mockup-sandbox`)

Vite preview server for component prototyping (port 8081 → `__mockup`).
