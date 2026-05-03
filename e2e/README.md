# HashChat end-to-end tests

Playwright suite that exercises the production-shaped surface of HashChat
across the API, web, and (selectively) authenticated app flows.

## Run

```bash
pnpm --filter @workspace/e2e exec playwright install --with-deps chromium
pnpm --filter @workspace/e2e test
```

By default the suite targets `https://$REPLIT_DEV_DOMAIN` (or
`http://localhost:80` if that env var is unset). Override with
`E2E_BASE_URL=...`.

## Projects

The Playwright config defines three projects:

- **`setup`** — runs `tests/auth.setup.ts`, which provisions a Clerk
  test-mode user and saves a Playwright `storageState` JSON to
  `./.auth/state.json` (or `$E2E_AUTH_STATE`).
- **`chromium`** — unauthenticated specs only (`smoke`, `api-contract`,
  `a11y-and-polish`). Always safe to run, even without Clerk creds.
- **`authenticated`** — depends on `setup`; runs `shortcuts.spec.ts` and
  `core-flows.spec.ts` with the captured storage state.

Run a single project with `--project`:

```bash
pnpm --filter @workspace/e2e test --project=chromium
pnpm --filter @workspace/e2e test --project=authenticated
```

## Authenticated flows

The `setup` project drives Clerk's `/sign-up` UI in test mode using the
`+clerk_test` email pattern (verification code is always `424242`). It
requires `VITE_CLERK_PUBLISHABLE_KEY` (or `CLERK_PUBLISHABLE_KEY`) to be a
`pk_test_*` key, otherwise it skips and the `authenticated` project is a
no-op.

Useful env vars:

- `E2E_AUTH_STATE` — override the storage state path.
- `E2E_REUSE_AUTH_STATE=1` — reuse an existing state file (no fresh
  sign-up).
- `E2E_SKIP_AUTH_SETUP=1` — skip the setup entirely (use a state file you
  produced out-of-band, e.g. via `playwright codegen`).

To capture a state manually instead of using the setup project:

```bash
pnpm --filter @workspace/e2e exec playwright codegen \
  --save-storage=./.auth/state.json \
  $E2E_BASE_URL
```

## Core-flow regression (`tests/core-flows.spec.ts`)

Implements the headline release-gate journey from Task #97:

1. Onboarding (pick ≥3 hashtags → `/app/discover`)
2. Join a hashtag room and post a chat message
3. Create a post via the home composer
4. React to a post in the feed
5. DM another discoverable user
6. Upgrade to the Premium (MVP) tier

The upgrade step handles both providers transparently:

- **Stripe test mode** (Stripe is connected and `seed-stripe-products` has
  been run) — drives the hosted Checkout page with card `4242 4242 4242 4242`.
- **Dev fallback** (no Stripe connection) — completes the upgrade via the
  `/api/premium/dev-confirm` round-trip and asserts the active badge.

Sub-steps that depend on populated data (e.g. discoverable people, an
existing post to react to) call `test.skip(...)` rather than failing the
whole journey, while the headline upgrade step is asserted strictly.

The whole spec is gated: it skips unless either `E2E_AUTH_STATE` is set or
`./.auth/state.json` already exists, so unauthenticated CI runs stay green.
