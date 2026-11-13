# Implementation ledger — plan: docs/superpowers/plans/2026-11-13-file-transfer.md

Spec is authoritative. Execution authorized 2026-11-13. No existing code or git repository; no provider environment variables, Docker, psql or cf detected at start.

Pre-flight: Task1 storage types -> Tasks3/5; Task2 transactional repository -> Tasks3/4/5; Task3 API contracts -> Task6 client; Task4 expiry -> Task5 cleanup; all must use shared types/constants.

Ruling: Implement in the provided empty workspace rather than create a linked worktree — there is no pre-existing repository/branch to isolate. No automatic remote push or production deploy.
Ruling: Live provider tests require credentials not currently supplied. Continue implementing and locally testing all independent work, report staging verification as blocked, never silently skip tests as evidence of production readiness.
Ruling: Default to bounded 16 MiB multipart proxy until a live browser/R2 test proves signed Content-Length enforcement. This is the spec's explicit fallback and prevents unbounded direct upload while staging credentials are unavailable; direct mode stays fail-closed behind DIRECT_UPLOAD_VERIFIED.
Ruling: Use local PGlite PostgreSQL for database invariant tests when Docker/psql are unavailable; also supply migrations and staging tests for actual Supabase/R2 verification. Local SQL cannot prove provider configuration.

Tasks1–7: in progress.

Ruling: Build deployable official Build Output with @cloudflare/config + @cloudflare/build-output-utils and deploy via cf --prebuilt — the installed Vite plugin rejects cloudflare.config.ts. Custom packaging is schema-checked and cf dry-run verifies the bundle; do not use cf build in this repo. Cost if wrong: deployment blocked until CLI upgrade, not silent live changes.
Ruling: Reduce cleanup batch25 to3, reconciliation page100 to3, share a hard40 network subrequest budget — Workers Free limit50 includes both jobs in one scheduled invocation. Cost: slower cleanup under backlog; state stays pending and quota reserved until confirmed.
Final review: Important checksum signing fixed (requestChecksumCalculation WHEN_REQUIRED); signing regression observed RED->GREEN.
Final review: Important completion response-loss fixed (generation-guarded compensation + ready recovery; client retries completion without DELETE); database/API/client regressions observed RED->GREEN.
Final review: Important subrequest overflow fixed with bounded batch/page + shared network budget; budget regression observed RED->GREEN.
Final: minor (deferred): JWKS cache is recreated per request; correctness is verified, one extra network lookup is reserved within budget. Cost is latency/request overhead; cache optimization deferred.
Final: Ruling: Upstream stream failure is treated as important resource safety rather than cosmetic; coordinate cancellation so the producer cannot continue after failed PUT. Cost if wrong: hanging requests or dropped upload parts, covered by bounded stream tests and runtime staging gate.

Ruling: Upload session columns share the tt.transfers row instead of a separate uploads table, and named repository actions share one service-only transfer_rpc dispatcher — locking/generation/accounting stay within one transaction. No client table access. Cost: less SQL modularity; covered by real PostgreSQL invariant tests.
Ruling: Pin workerd 1.20261113.1 for local runtime while cf's Miniflare uses its documented V4 adapter — bundled runtime was too old for the specified compatibility date. Production date unchanged. Cost: dev tool compatibility must be checked on upgrades.
Final: fixed independent reconciliation cursor completion flags — unequal scan lengths reproduced RED->GREEN; completed legs no longer restart before the other leg finishes.

Implementation status: Tasks1–7 code, migration, UI, local tests, build artifacts, CI and runbooks implemented. Provider provisioning/live browser R2 and 1GiB staging acceptance remain BLOCKED (no credentials supplied), so deployment/release gates are not marked complete. No resources created or production deploy performed.

Local evidence: npm test -> 26 tests pass; npm run typecheck / lint -> pass; Chrome test:e2e -> 4 tests pass; npm run build -> official build output verified; cf deploy --prebuilt --mode production --dry-run -> pass; npm run test:runtime -> workerd auth/SPA plus strict streaming/error cases pass. Live test:integration -> BLOCKED missing staging env, intentionally fails rather than skipping.

## New design request — no-login and recipient mode

2026-11-13: user requested design + handoff only for removing account auth and choosing single/multiple recipients. Added authoritative v2 design and docs/handoffs/2026-11-13-anonymous-sharing.md; no product code or provider configuration changed. Proposed default single; atomic explicit claim with receiver capability, separate owner management capability, local browser history. Baseline tests above apply to v1 only and are not v2 verification.

v2 builder review: one material gap corrected — pending/confirmed receiver records persist canonical code + transferId + token + claimRequestId before claim, with active pointer for reload after fragment removal; resolve rechecks server state. Reviewed local doc links resolve (5 checked). No runtime tests needed for this docs-only change. Unrelated concurrent .env.example edit preserved and excluded from docs commit.

## Deploy origin bootstrap fix

2026-11-13: user correctly flagged that requiring a known APP_ORIGIN before the first deployment was circular for the same-origin app. Added APP_ORIGIN=auto (default if not set) to compare Origin with the actual request URL; explicit local Vite origin still supported. No forwarded-host trust, wildcard origin, login/sharing change or deploy. Origin regression tests written and observed failing before implementation.

Provider retest with user's updated .env: Supabase budget RPC and server privileges PASS; R2 multipart create/upload/complete/HEAD/signed GET of34 bytes PASS; temporary test object deleted. List-all-buckets remains AccessDenied for the scoped token, which does not block configured bucket operations. No secrets printed or user .env/.env.example modified.

Origin fix verification: typecheck/lint PASS, full Vitest29/29 PASS; build with user's .env loaded and temporary process-only APP_ORIGIN=auto PASS; built Worker config confirms auto; browser bundle checked against configured backend/keyring secrets and none found. workerd same-origin accepted/cross-origin rejected plus streaming regression PASS. Existing .env APP_ORIGIN kept unchanged for local development. No deploy performed.

## v2 implementation — account authentication removed

User explicitly confirmed the app must remove login, not stop at design. Implemented no-account UI/API, immutable single/multiple sharing, owner capabilities, atomic receiver claim with response-loss recovery, local browser history/management links, service-only transfer_rpc_v2 and additive migration0002. Removed Login/auth client/JWT verifier and direct jose dependency; browser no longer reads Supabase keys or calls auth endpoints. Existing user .env untouched.

Ruling: optional RATE_KEY_SECRET falls back to a domain-separated HMAC key from the existing active SHARE_CODE_KEYS entry — no new mandatory credential during this change. Costs if key changes: daily IP buckets change; global storage reservation still enforced. Explicit override is available.
Ruling: preserve legacy tables/v1 RPC for expand migration and cleanup compatibility, but all v2 app requests use v2 dispatcher and explicitly deny legacy rows. No old row becomes anonymously accessible. Rollout requires0002; no destructive schema reset.

Fresh reviewer findings fixed with observed RED->GREEN: invalid management links could overwrite valid owner secrets (verify before persist); returning to previously claimed file omitted saved proof (canonical-code lookup across receiver records); blocked/quota storage hid memory fallback (volatile cache precedence). Audit actor_kind updated for owner/receiver actions.

Evidence: npm test31/31 PASS; Chrome5/5 PASS including no login, sharing mode, reload claim, management link safety and dark/light/mobile screenshots; typecheck/lint/build/workerd runtime/cf prebuilt dry-run PASS. No deployment. Live RPC check returnsPGRST202 for transfer_rpc_v2: migration0002not yet applied. CUA database editor access stopped because the tool could not confidently verify the current browser URL; no database UI changes were performed and no alternate UI mechanism was used.

Next operator step: run supabase/migrations/202611130002_anonymous_sharing.sql once in SupabaseSQL Editor (0001alreadyapplied), then restart Worker and hard-refresh frontend. Full1GiBstagingremainsunverified. SQL0002wasverifiedonlocalPostgreSQLbutnotremoteSupabase.
