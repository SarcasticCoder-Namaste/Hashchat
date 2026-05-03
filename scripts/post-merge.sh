#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
pnpm --filter db run backfill-friend-codes
pnpm --filter db run backfill-conversation-members
