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

## Multi-file selection — 2026-11-14

Implemented picker/drop/paste append queue, checkboxes, select/unselect all, remove unchecked/per-file and clear. One selected file stays original; multiple selected files become one uncompressed ZIP/ukid through existing multipart API. Queue limit100, artifact limit1GiB including ZIP overhead, zero-byte rejected without discarding valid files. Dynamic zip.js Blob writer, progress/cancel before network, path sanitization/duplicate names, deterministic selection metadata for pending-create retries. Changes to selection clear old result messages. Backend/schema/env unchanged.

Evidence: full unit/database38/38 PASS; Chrome8/8 PASS, including decoding actual outgoing PUT payload to confirm only checked files and contents, dropped/pasted files preserving choices, removal/clear, and dark/light375px screenshots without overflow. Corrected browser test to dispatch native ClipboardEvent (generic synthetic Event omitted clipboardData); production paste handler unchanged. Typecheck/lint/build PASS; read-only reviewer reports no unresolved issues. Full1GiB on real devices/R2 remains unverified. No deployment or remote database change. See docs/handoffs/2026-11-14-multi-file-selection.md.

## Receive links — 2026-11-14

User requested a redirect link alongside the transfer code. Expose the existing same-origin `/receive#code=UKID` URL as a selectable field plus copy/open actions. Opening the URL navigates to Receive and automatically resolves file details; explicit download/claim remains required. Code stays in fragment, is consumed by existing App bootstrap and removed from address bar. Invalid/expired links show the existing API error and keep manual lookup available. No backend/schema/deploy change. Regression tests observed failing before implementation; Chrome10/10 PASS plus typecheck/lint/build PASS afterward, including link field/href, automatic lookup without claim/download, invalid link recovery and single-recipient reload recovery.

## Header/theme UI — 2026-11-14

Set explicit theme dropdown/option foreground and background using theme tokens; enlarge control to42px and preserve native keyboard interaction/focus. Header with logo/theme is sticky at top0 with opaque theme background and z-index100. Chrome10/10 PASS; lint/build PASS. Additional browser inspection at1440px and375px in both themes confirms header top remains0 after scrolling498–500px, no horizontal overflow, and option colors follow active theme. Screenshots test-results/sticky-header-{1440,375}-{dark,light}.png. CSS-only; no deployment.

## Production 503 incident — 2026-11-14

User reported create-transfer503 at terminal-transfer.testo3663.workers.dev. Read-only provider checks confirmed Supabase transfer_rpc_v2 budget/reserve and local R2 access work; migration0002 is now present remotely. Deployed Worker had placeholder SUPABASE_URL/R2_ACCOUNT_ID and example bucket. Patched these three plain-text bindings to configured local values through Cloudflare API, inheriting all other bindings. Generic API then returned expected404, but actual creation still503.

Cloudflare observability logs identified `ReferenceError: DOMParser is not defined`. Root cause: browser esbuild resolution selected AWS XML builder browser parser, which needs DOM APIs absent from Workers. Added scripts/worker-build.mjs to retain browser Fetch transport while resolving SDK's own DOM-free XML parser. Packager and runtime checks share the helper. Packager also reads local .env with existing process/CI env taking precedence, preventing ordinary local builds from silently ignoring configured values.

Regression: mocked real S3 InitiateMultipartUpload XML in workerd failed with DOMParser before fix and passed after. Added verify-r2-runtime.mjs to npm run test:runtime. Lint,38 unit/database tests, build and full runtime suite PASS. Build output no longer contains DOMParser.

Applied only fixed Worker code through Cloudflare API to existing terminal-transfer, preserving existing assets/config and inheriting secrets/bindings. Pre-code-change version76e77b3b-999c-4dc1-845b-01048b8dd863 retained as rollback reference. Worker upload deployment_id4d394e27d229415e9cafa190fb09ddeb. Public production smoke PASS: create201, signed/proxy parts200/204, complete200, resolve200, download200 with exact34-byte content. Test deletion202 requested; physical cleanup remains asynchronous after issued download URLs expire. One1-byte database-only diagnostic reservation was compensated and queued for cleanup; ambiguous reservation grace applies. No secrets or signed links printed. Changes must be committed/pushed so later CI deployments retain this fix.
