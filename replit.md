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
- `/onboarding` — first-time hashtag picker (>=3 required), with starter rooms grid
- `/app/discover` — smart matches + trending tags
- `/app/home` — chronological feed of posts from hashtag rooms the user follows (with composer)
- `/app/trending` — searchable trending tags + follow/unfollow
- `/app/rooms`, `/app/rooms/:tag` — hashtag rooms list & chat
- `/app/messages`, `/app/messages/:id` — DM list & conversation
- `/app/reels` — YouTube Shorts feed (Instagram coming soon)
- `/app/admin` — role-gated admin panel (Users / MVP Codes / Stats)
- `/app/friends` — friend requests + connections
- `/app/settings` — profile, hashtags, appearance, notifications, privacy, blocks & mutes, chat, photos, account (with MVP code redeem). The "Blocks" tab lists every blocked user, muted user, and muted hashtag with one-click undo (powered by `GET /api/me/blocks-mutes`).

V3 additions:
- 5-digit `discriminator` per user (e.g. `@alice #12345`), backfilled lazily on auth.
- Online presence: `lastSeenAt` updated on each request (30s throttle); online dot if < 5min.
- Roles: `user` / `moderator` / `admin`. Bootstrap admin via `ADMIN_USER_IDS` env (comma-separated **Clerk user IDs**, immutable). Username-based promotion was removed for security.
- MVP plan: admin generates one-time codes; users redeem via Settings → Account.
- Banned users (`bannedAt` set) are rejected at auth with 403.
- Soft-deleted messages (`deletedAt`) are filtered everywhere they could surface (lists, reply previews, unread counts, replyTo target validation).
- Motion polish: framer-motion bubble entry, card stagger, CTA hover scale.

Required env (optional but recommended):
- `ADMIN_USER_IDS` — comma-separated Clerk user IDs to auto-promote to admin.
- `YOUTUBE_API_KEY` — YouTube Data API v3 key for Reels (degrades to a config card if missing).

Real-time is implemented via TanStack Query polling (`refetchInterval` 2.5–5s).

### API Server (`artifacts/api-server`)

Express + Clerk middleware. `requireAuth` reads `getAuth(req).userId` and lazily bootstraps a row in `users` for new Clerk users (username from email/firstName, deduped). All `/api/*` routes are auth-protected.

### Mockup Sandbox (`artifacts/mockup-sandbox`)

Vite preview server for component prototyping (port 8081 → `__mockup`).

V4 additions:
- Image sharing in DMs and rooms via object storage (presigned PUT). Upload icon next to message input on both pages.
- Profile photo gallery on Settings (Gallery tab) — add and delete photos.
- Per-conversation chat backgrounds (per-user override via `conversation_backgrounds`). Set/clear from the conversation header menu.
- Voice + video group calling using a WebRTC mesh with REST-based signaling (calls, call_participants, call_signals tables; `/api/calls/*` routes). 1.5s polling for participant + signal sync. Google STUN only (no TURN — works on most networks but not strict NATs). Initiator side decides offer direction by lower userId.
- Incoming call toast lives in `AppShell`, polling `/api/calls/incoming` (calls remain "incoming" until I accept/decline, even if the initiator's status flipped to active).
- Storage: upload URL endpoint requires auth; persisted image/background URLs are validated to point at our `/objects/<id>` namespace; private object reads are unauthenticated by design (UUID unguessability) so `<img>` tags work without bearer headers.
- Calls authorization (V4 hardening): DM call init checks `isBlockedEitherWay` (blocked users can't ring through). Room calls consult `getRoomAccess(tag, me)` — private rooms require actual membership (only members + owner are invited and authorized to join/signal/poll), public rooms still allow followers + interested users.
- GIF picker in DMs and rooms backed by Giphy v1 API (`GIPHY_API_KEY` secret). Server-side `/api/gifs/search` endpoint proxies trending + search; key is never sent to the browser. `SendMessageBody.gifUrl` is validated against an allowlist of Giphy CDN hostnames, mirrored into `messages.imageUrl` for legacy renderers, and stored as a `kind="gif"` row in `message_attachments`. Picker degrades gracefully (503 → "GIFs aren't set up" panel) when the key is missing.

Reels v3 (true YouTube Shorts feel):
- Tabbed Feed/Saved view (Saved persists in `localStorage` under `hashchat:saved-reels`, capped at 200).
- Player is a **vertical snap-scroll modal** (not single-video prev/next): each short occupies a full `100dvh` page; `snap-y snap-mandatory` advances on swipe up / scroll wheel / arrow keys. Only the actively-visible page mounts a YouTube iframe (autoplay + loop + `playlist=<id>` for replay), other pages show the thumbnail with a play overlay that scrolls into view on tap. Iframes default `mute=1` for cross-browser autoplay; mute pill at top-right toggles (re-keyed iframe applies the new mute param).
- IntersectionObserver tracks active index using a debounced (90 ms) tally over a `Map<index, ratio>` so momentum-scroll doesn't flap the active state. Counter pill shows position (e.g. "3 / 24").
- Right-side action bar (Shorts-style): Save (heart fills pink), Share (`navigator.share` with clipboard fallback), open-in-YouTube link.
- Auto-loads more when active index is within 3 of the end (`useInfiniteQuery.fetchNextPage`), throttled by `lastFetchedAtLength` ref so the same tail can't request twice.
- Backend `/api/reels/youtube` accepts `pageToken`, returns `{items, nextPageToken}`; `ReelsList` schema includes nullable `nextPageToken`.
- Accessibility: `role="dialog"`, `aria-modal="true"`, focus moves to close button on open and is restored on close, body scroll locked while open.
- Keyboard: ↑/k prev, ↓/j next, s save, m mute, Esc close.
- 12 category chips (trending/viral/funny/dance/tech/diy/gaming/food/music/sports/travel/anime).
