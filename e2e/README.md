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

## Authenticated flows

The default `smoke.spec.ts` runs without auth. Tests that exercise
signed-in surface area (`shortcuts.spec.ts`, future `core-flows.spec.ts`)
read a Playwright `storageState` JSON file referenced by `E2E_AUTH_STATE`
and skip themselves when it is unset.

To capture a storage state with a Clerk test-mode user:

```bash
pnpm --filter @workspace/e2e exec playwright codegen \
  --save-storage=./.auth/state.json \
  $E2E_BASE_URL
```

Then re-run the suite with `E2E_AUTH_STATE=./.auth/state.json`.

## Coverage targets (per Task #96)

The suite is the home for the core-flow regression coverage:
sign up → onboarding → join hashtag → post → react → DM → upgrade to MVP
(Stripe test mode). Each flow is added behind the `E2E_AUTH_STATE` gate so
the file can also run as a CI smoke test against an unauthenticated
deployment.
