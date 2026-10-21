# Phase 2 verification

## Follow-up: form feedback and keyboard focus

The owner subsequently reviewed and accepted the UI refinements and requested a commit. Final copy uses ordinary customer-facing language rather than learning-project or future-phase messages. The login action area has an additional 12 px top margin. Formatting, frontend type checking, and the frontend container build passed after these final copy/spacing edits; browser tests were not rerun for those cosmetic edits. This records UI acceptance, not a completed security or accessibility audit.

Further human feedback requested a more compact form and non-focusable headings. The current UI places “Check the form fields and try again” to the right of the submit button when space allows, wrapping below on narrow screens. All form-level errors use this action area. Headings have no `tabIndex` or programmatic focus; navigation focuses the first form input or the account's Log out button. Field margins were reduced from 16 px to 4 px and label gaps from 8 px to 6 px, retaining a reserved error line. This supersedes the heading-focus behavior described in the earlier follow-up below.

Changed `apps/web/src/accounts.tsx`, `apps/web/src/style.css`, `tests/e2e/accounts.spec.ts`, and this document. Updated keyboard assertions to match the explicitly requested behavior and added checks for the summary wording and its position beside both submit buttons. All 7 Chromium tests passed, as did lint, frontend and test type checks, formatting, and the rebuilt test frontend. Desktop and mobile screenshots were inspected. The API was unchanged and its tests were not rerun for this UI refinement.

October 21, 2026: human review identified missing persistent validation messages, a distracting heading outline, and a focused input outline overlapping its label. The supplied screenshot confirmed the spacing defect.

- Updated `apps/web/src/accounts.tsx` to show English required/format/length/confirmation errors on blur and submission, revalidate corrected fields, and prevent invalid API submissions. Native popup validation is replaced with inline messages; API validation remains unchanged. Errors are associated with inputs and announced through polite live regions.
- Focus moves to the first invalid input on submission, without moving unexpectedly during corrections or Tab navigation. Page headings still receive navigation focus but no longer draw a box; links, buttons, and inputs retain visible keyboard focus.
- Updated `apps/web/src/style.css` to use a 2 px outline with a 2 px offset and an 8 px label gap. Reserved feedback space prevents errors appearing on blur from moving the Submit button during a click. The first browser run caught that layout-shift defect; the existing focus assertion was preserved and passed after correction.
- Expanded `tests/e2e/accounts.spec.ts` with registration/login required-field feedback, malformed email, short password, correction, blocked invalid submissions, keyboard login/logout, and geometric label-clearance checks. Existing scenarios remain covered.
- Passed `npm run lint`, `npm run format:check`, `npm run typecheck -w @cartmates/web`, and `npx tsc -p tsconfig.tests.json`. The frontend image build passed through `docker compose -f compose.yaml -f compose.test.yaml up --build -d --no-deps web`.
- `npx playwright test --project=chromium`: all 7 tests passed. Inspected the focused-input screenshot at 360 px width. API tests were not rerun for this frontend-only change; the earlier API results below remain historical evidence.
- The updated test frontend is available on port 8081. No database reset, commit, or push was performed. Real-device and human accessibility review remain pending.

Date: October 21, 2026. Environment: Windows, PowerShell, Docker Desktop with Linux containers. Implementation and verification are AI-assisted; human review remains pending.

## Repository verification before implementation

- Read `AGENTS.md`, `docs/PROJECT-PLAN.md`, `README.md`, `docs/phase-1-verification.md`, and the existing route schemas.
- Workspace access succeeded, and `git status --short --branch` showed a clean `main` checkout.
- `git branch -vv`, `git remote -v`, and a fresh `git ls-remote --symref origin HEAD refs/heads/*` confirmed local and remote `main` at `0af1613f2f6515ac6f4e7dbacf8f27c6ffeed1cc`. GitHub's default branch is `main`, and no other remote branches were advertised.
- GitHub's API reported two successful CI runs for that commit: [latest checked run](https://github.com/SwieciloM/Cartmates/actions/runs/39610022122), [earlier run](https://github.com/SwieciloM/Cartmates/actions/runs/39321842720).
- The branch API reported `protected: true`, protection enabled, and required status check `skeleton` with enforcement level `everyone`. This verifies saved status-check protection, but is not a full audit of review requirements, bypass permissions, or other protection settings. No deliberately rejected push was attempted.
- Created local branch `codex/accounts-sessions`. No new commit or push was made during implementation.

## Scope and decisions

- Added users and sessions through an additive SQL migration; no household or product tables or operations.
- Registration creates the user and session through an atomic nested Prisma write. A unique normalized email constraint handles concurrent duplicate registration.
- Authentication has explicit request/response schemas and OpenAPI errors. Unknown fields are rejected, not silently removed. Trimming applies only to email/display name; passwords preserve whitespace and names preserve Unicode.
- Argon2id parameters are explicit: 65536 KiB memory, three iterations, parallelism 1. The maintained `argon2` package works in the pinned Node container. Unknown accounts still perform a password verification against a dummy hash.
- Session tokens use 32 random bytes; the database stores SHA-256 hashes and seven-day expiry. Logout deletes only the current session. `/me` is the protected API route; `/account` is the protected UI stopping point before phase 3.
- Cookies use HttpOnly, SameSite=Lax, Path=/, no Domain, and explicit Secure configuration. Authentication responses use `Cache-Control: no-store`. Tokens do not enter localStorage or JSON responses.
- Mutations reject missing and unlisted Origins. Login and registration each allow 10 attempts/minute/IP. Nginx overwrites forwarded client addresses, and Compose trusts only one proxy hop.
- Forms provide loading, saving, validation, error, retry, keyboard focus, and session restoration. Failed submissions preserve input. Restoring an expired session redirects to login and clears private content. The account view rechecks the session when the window regains focus.
- Health behavior and all original smoke assertions remain intact. The CI check name stays `skeleton` to preserve the configured protection requirement.

## Test risks and levels

| Risk                                             | Verification                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Duplicate accounts or inconsistent normalization | Registration, uppercase/whitespace email, Unicode name, concurrent duplicate registration                               |
| Password or token leakage                        | Exact public response assertions, cookie flags, database hash inspection, no readable cookie/localStorage in browser    |
| Ineffective logout or expiry                     | Old-cookie replay, independent session remains valid, deterministic expiry of only the test-created session             |
| Weak runtime validation                          | Below/above name and password boundaries, invalid/oversized email, numeric password, unknown properties, oversized body |
| Cross-origin mutations and brute-force attempts  | Missing/foreign/null Origin on all mutations; attempt eleven returns 429 and Retry-After                                |
| Broken browser flow                              | Registration, confirmation mismatch/focus, page refresh, logout, protected-route revisit, login at 360 px               |
| Lost form input or stale private content         | Network-failed registration preserves input and succeeds on retry; expired-session response removes account view        |
| Skeleton regression                              | Existing four HTTP API and two Chromium tests retained                                                                  |

Authentication API tests use Fastify injection and the real test database, with a separate limiter per test instance. HTTP health tests and browser tests use the actual Compose proxy. Injection tests do not alone establish proxy behavior. Test data uses unique fictional addresses and accumulates until an explicitly requested isolated test reset; no database reset was performed.

## Checks and issues

| Command/check                                                                                                                                                                   | Final result                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm install -w @cartmates/api --save-exact argon2@0.45.1 @fastify/cookie@11 @fastify/rate-limit@10`                                                                            | Installed and lockfile updated; zero reported vulnerabilities. Cookie resolved to 11.1.3 and rate-limit to 10.3.0. |
| `npm run lint`                                                                                                                                                                  | Passed                                                                                                             |
| `npm run format:check`                                                                                                                                                          | Passed                                                                                                             |
| `npm run build`                                                                                                                                                                 | Passed, including Prisma generation and strict application/test type checks                                        |
| `docker compose -f compose.yaml -f compose.test.yaml up --build -d --wait --wait-timeout 120`                                                                                   | Passed; migration exited successfully; database, API, and web healthy                                              |
| `npx playwright test`                                                                                                                                                           | 23 passed: 19 API and 4 Chromium; retries disabled                                                                 |
| `npx playwright screenshot --viewport-size='360,800' --full-page --wait-for-selector='input[name=displayName]' http://127.0.0.1:8081/register test-results/register-mobile.png` | Captured and visually inspected; labels, inputs, controls, and navigation fit without horizontal clipping          |
| `git diff --check`                                                                                                                                                              | Passed; only Windows line-ending notices                                                                           |
| `git check-ignore .env apps/api/src/generated/prisma/client.ts test-results/register-mobile.png`                                                                                | All three excluded from Git                                                                                        |

The test stack remains available at port 8081 with its volume retained. Development database contents were not changed or reset. The migration was exercised against the existing isolated phase 1 database and re-run idempotently during the final rebuild. A separate empty-database rebuild was not performed in this phase.

The implementation was checked against the official [Fastify validation documentation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [cookie plugin](https://github.com/fastify/fastify-cookie), [rate-limit plugin](https://github.com/fastify/fastify-rate-limit), and [node-argon2 documentation](https://github.com/ranisalt/node-argon2).

- Initial static checks caught a syntax error introduced while extracting the app factory, an unsupported numeric proxy type, widened Argon2 option typing, and strict array-access typing in tests. These were corrected before completion.
- The first full suite passed 22/23 tests. The rate-limit test caught a real 500-versus-429 defect: a custom error builder omitted the status code. Removed that builder and used the plugin's standard error with the application's stable error envelope. The assertion was preserved, and the API rerun passed all 19 tests.
- Windows sandbox restrictions blocked Git metadata writes, network queries, Prisma generated-directory replacement, Docker's pipe, and Playwright report replacement. Those checks were rerun with approved access; these were tooling restrictions rather than application failures.

## Changed files

| Area                       | Files                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| API                        | `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/modules/auth/routes.ts`, `apps/api/src/modules/auth/schemas.ts` |
| Database                   | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261021000100_accounts_sessions/migration.sql`                   |
| Frontend                   | `apps/web/src/accounts.tsx`, `apps/web/src/main.tsx`, `apps/web/src/style.css`                                                 |
| Configuration/dependencies | `.env.example`, `compose.yaml`, `compose.test.yaml`, `apps/web/nginx.conf`, `apps/api/package.json`, `package-lock.json`       |
| Tests                      | `tests/api/auth.spec.ts`, `tests/e2e/accounts.spec.ts`                                                                         |
| Documentation              | `README.md`, `docs/phase-2-verification.md`                                                                                    |

## Human review and remaining limits

- Review the migration, authorization path, Origin allowlist, proxy trust, cookie flags, and response schemas before merging.
- Explain why the old cookie fails after logout while a second session remains valid, and why a test must inspect the database to distinguish a plaintext token from its hash.
- Explain why the rate-limit test caught a real API defect despite login/registration browser flows passing.
- No phase 2 remote CI result exists until this branch is pushed. Existing CI automatically discovers the new tests.
- Mobile coverage uses Chromium emulation. Real-device, comprehensive accessibility, and public HTTPS deployment reviews remain pending.
- This phase does not implement household setup, invitations, shopping operations, password recovery, account deletion, or production deployment.
