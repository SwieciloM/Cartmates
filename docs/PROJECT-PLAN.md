# Cartmates — Product, Development, and QA Plan

Status: proposed MVP specification, ready to guide implementation.
Date: October 19, 2026.
Repository name: `cartmates`.

## 1. Purpose and How to Use This Plan

Build a small web application where household members record missing products and mark purchases as completed. The primary learning goal is to develop QA skills: requirements analysis, exploratory testing, REST API testing, TypeScript automation, working with AI, and CI.

Development follows the phases in section 12. Each phase ends with a working part of the product and verification of its acceptance criteria. Before making changes, the implementing agent should read the relevant business rules, API contract, and QA scenarios. Changing a rule requires updating this document and the affected tests.

The MVP focuses on correctly sharing a simple shopping list, isolating household data, and running tests reproducibly. It does not aim to become a full shopping platform.

### Project Identity and Language Policy

- The product name is **Cartmates**. Use `cartmates` for the repository and root package name.
- English is the language of the entire project: UI labels, validation messages, API error messages, documentation, diagrams, examples, and demonstration materials.
- Use English for source code identifiers, file and directory names, database entities and fields, comments, log messages, configuration descriptions, and environment variable names.
- Write test names, steps, assertions with custom messages, fixtures, bug reports, exploratory notes, AI prompts saved in the repository, and agent instructions in English.
- Write commit messages, pull request titles and descriptions, and issue descriptions in English.
- Use consistent terms: **household**, **household member**, **owner**, **product**, **quantity**, **unit**, **shopping list**, **To buy**, and **Purchased**. API statuses remain `needed` and `purchased`.
- Use English for default demo data. User-entered names and notes may contain Unicode characters, including Polish characters; the language policy must not restrict valid user content.
- The MVP has a single English interface. Translation infrastructure and additional UI languages are outside its scope.
- Conversations with the project owner may remain in Polish; all project artifacts follow the English policy.

### Measurable MVP Outcomes

- Two people use the same list in independent browser sessions.
- A third person from another household cannot access their data through either the UI or direct API requests.
- Data survives page refreshes and container restarts when the database volume is retained.
- A new contributor starts the application by following the README without creating database tables manually.
- CI builds the application and tests it against an isolated database; reports remain available after failures.
- The repository includes an example of a test detecting a deliberately introduced defect and a human review of the AI's work.

## 2. MVP Scope

### Included

1. Registration, login, logout, and session restoration after refresh.
2. Creating a household or joining one with an invitation code.
3. Viewing household members.
4. One shared product list per household.
5. Adding a product with a name, quantity, unit, and optional note.
6. Editing and permanently deleting products.
7. Marking products as purchased and undoing that action.
8. Separate **To buy** and **Purchased** tabs.
9. Manual list refresh, error handling, and edit conflict handling.
10. An English interface suitable for desktop and mobile browsers.
11. A REST API, Docker Compose setup, API/UI tests, and CI.

### Excluded

- Native apps, PWA installation, offline mode, and real-time synchronization.
- Multiple households per user and multiple lists per household.
- Leaving or deleting households, deleting accounts, removing members, and transferring ownership.
- Password resets, email verification, external identity providers, and sending messages.
- Prices, budgets, stores, recipes, photos, barcodes, and automatic suggestions.
- Categories, search, change history, and bulk removal of purchased products.
- AI as a product feature; AI supports development and testing.
- Public production deployment, which requires a separate hardening and HTTPS configuration phase.
- UI localization and additional interface languages.

Because account deletion is outside the MVP, demonstrations use fictional data and explain this limitation. Do not add excluded features incidentally while implementing the agreed scope.

## 3. Roles and Business Rules

### Users and Households

- Unauthenticated users can access registration and login.
- Authenticated users without a household choose between creating and joining one.
- A user can belong to at most one household. Attempting to create or join another returns a conflict.
- The creator becomes the owner and first member in a single transaction.
- Every member can add, edit, delete, and change the status of any product in their household.
- Only the owner can generate a replacement invitation code and see the newly generated code. Other members can view the member list, but not the code.
- A household name must contain 1–60 characters after trimming whitespace. Names do not have to be unique.
- Invitation codes are random secrets with at least 128 bits of entropy, rather than sequential identifiers. Store only their hashes in the database.
- Show the plaintext code to the owner only when creating the household or rotating the code. A lost code can be replaced; existing secrets cannot be retrieved.
- Codes are reusable until rotated. Rotation immediately invalidates the previous code without removing existing members.
- Concurrent attempts to join two households with the same account must not create two memberships. Enforce this with a database constraint as well as application logic.

### Products

- Names must contain 1–100 characters after trimming whitespace. Preserve letter case and Unicode characters.
- Quantities must be positive, no greater than 9999.999, and have at most three decimal places.
- Supported unit values are `pcs`, `kg`, `g`, `l`, `ml`, and `pack`, displayed with English labels. Quantities for `pcs` and `pack` must be integers.
- The default quantity is 1 and the default unit is `pcs`. Notes are optional, limited to 300 characters after trimming, and stored as `null` when empty.
- The UI accepts both a decimal point and a decimal comma, converting the comma to a point before submission. This input convenience also supports users with non-English keyboard settings.
- The API accepts quantities as decimal strings, such as `"1.5"`. It rejects decimal commas, scientific notation, `NaN`, excessive precision, and values outside the allowed range.
- Duplicate product names are allowed. Products added by different people are not merged automatically.
- New products have the `needed` status. Setting `purchased` records the purchase time. Undoing the action restores `needed` and clears the purchase time.
- Purchased products can be edited or deleted. Renaming a product does not change its status.
- **To buy** sorts by creation time, newest first. **Purchased** sorts by purchase time, newest first. Resolve ties by identifier.
- Deletion is permanent and requires UI confirmation. The MVP has no recycle bin.

### Concurrent Changes

- Each product has an integer `version`, initially 1. Editing, changing status, and deletion require the client's known version.
- Mutations are atomic: their condition includes the product identifier, household, and version. Successful updates increment the version by 1.
- An outdated version returns `409 VERSION_CONFLICT`, including repeated requests to set the same status. Status mutations do not promise idempotency.
- The UI displays **Another household member changed this product**, preserves the user's form input, and offers a way to load the current product. Saving again after comparing changes is an explicit user action.
- A product deleted by another member returns `404`; the UI explains the deletion and refreshes the list.
- Do not automatically retry mutations. Disable repeat submission while a request is in progress. Two independent creation requests may create two products; request deduplication is outside the MVP.

## 4. Screens and UI Behavior

| Screen | Content and actions |
| --- | --- |
| Log in | Email, password, registration link, generic invalid credentials message |
| Sign up | Display name, email, password, password confirmation |
| Household setup | Create a household or enter an invitation code |
| Shopping list | Household name, tabs with counts, products, add action, refresh action |
| Product form | Name, quantity, unit, note; create and edit modes |
| Household members | Member names and owner badge; the owner can rotate the invitation code |

Shared requirements:

- Provide explicit loading, empty, fetch failure, saving, and success states.
- Preserve form input after network or API errors and allow manual retry.
- Fetch the list on entry, after the user's own changes, and when **Refresh** is pressed. Display the last successful refresh time without implying live synchronization.
- If refresh fails, retain previously loaded data and indicate that it may be outdated.
- If a session expires, return to login and clear household data from the view's memory.
- Forms have labels, field errors, correct focus behavior, and keyboard support. Operation feedback is available to screen readers.
- Avoid horizontal scrolling at a width of 360 px. Primary controls should have touch targets of approximately 44 × 44 px.
- Use semantic elements and role/name-based test selectors. Add `data-testid` only where no useful semantic selector exists.
- All application-owned text, including accessible names, empty states, confirmation dialogs, and errors, is in English.

## 5. Architecture and Technologies

| Layer | Choice |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router, plain CSS |
| Backend | A supported Node.js LTS release, Fastify, TypeScript |
| API validation | Fastify JSON Schema validation and explicit response contracts |
| Database | PostgreSQL, Prisma ORM, migrations committed to the repository |
| Sessions | Random server-side sessions, HttpOnly cookie, token hashes in the database |
| Tests | Playwright Test + TypeScript for API and UI; Vitest for selected pure logic |
| Tooling | npm workspaces, ESLint, Prettier, TypeScript strict mode |
| Runtime / CI | Docker Compose, GitHub Actions |

Select and verify compatible dependency versions during initialization. Commit the lockfile and pin container image versions rather than relying on moving `latest` tags.

```text
Browser
    │ HTTP
    ▼
web service: Nginx + Vite build output
    │ /api/* → proxy
    ▼
api service: Fastify → Prisma → PostgreSQL

Playwright → web (UI) and /api (HTTP tests)
```

- Nginx serves the production frontend build; the Vite development server supports local development.
- The browser uses one origin, with `/api` proxied to the backend. Local Vite uses an equivalent proxy, avoiding a broad CORS configuration.
- Use one backend with `auth`, `households`, and `products` modules. Microservices, Redis, and queues are unnecessary for the MVP.
- Initially use React state and a small `fetch` client, without Redux or an additional caching library.
- Generate OpenAPI documentation from route schemas and expose it at `/api/docs` in local/test environments.
- Shared types can assist development, but tests also verify actual responses and runtime validation.

## 6. Data Model

| Entity | Main fields and constraints |
| --- | --- |
| User | `id` UUID, `displayName`, unique normalized `email`, `passwordHash`, `createdAt` |
| Household | `id` UUID, `name`, `ownerId`, `inviteCodeHash`, `createdAt` |
| Membership | `id`, UNIQUE `userId`, `householdId`, `joinedAt`; foreign keys |
| Product | `id` UUID, `householdId`, `name`, `quantity` DECIMAL(7,3), `unit`, `note`, `status`, `version`, `createdById`, `createdAt`, `updatedAt`, nullable `purchasedAt` |
| Session | `id`, UNIQUE `tokenHash`, `userId`, `createdAt`, `expiresAt` |

- Display names contain 1–60 characters after trimming. Emails are trimmed, lowercased, format-validated, and limited to 254 characters. Do not apply provider-specific email rules.
- Passwords contain 12–128 characters without automatic trimming. The UI verifies confirmation; the API accepts one password.
- Store timestamps in UTC and return ISO 8601 values. The UI formats them using English display conventions and the user's local time zone.
- Quantities use a decimal database type and strings in JSON to avoid implicit floating-point rounding.
- Index products by household and status, sessions by token hash and expiry, and members by household.
- Database constraints support API validation: positive quantity, valid unit/status, positive version, and consistency between status and `purchasedAt`.
- Household/membership creation and invitation rotation must remain consistent if a transaction fails.
- API lists are paginated. Products default to 50 per request, with a maximum of 100. The UI offers **Show more**.

## 7. REST API Contract

Prefix: `/api/v1`. Use JSON and reject unknown request fields. Errors have a stable format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the form fields",
    "fields": { "name": "Name is required" },
    "requestId": "request-identifier"
  }
}
```

The UI bases its behavior on `code`; tests do not depend on the exact wording of every sentence. Include `fields` only for field-related errors. Logs include the matching `requestId`. Human-readable API messages and OpenAPI descriptions are in English.

| Method and path | Input / result | Success |
| --- | --- | --- |
| POST `/auth/register` | `{displayName,email,password}` → user; also creates a session | 201 |
| POST `/auth/login` | `{email,password}` → user and a new session cookie | 200 |
| POST `/auth/logout` | Invalidates the current session and clears the cookie, including when no session exists | 204 |
| GET `/auth/me` | User and household identifier or `null` | 200 |
| POST `/households` | `{name}` → household and plaintext invitation code shown once | 201 |
| POST `/households/join` | `{code}` → joined household | 200 |
| GET `/households/current` | Household and members: id, display name, role; no emails or invitation code | 200 |
| POST `/households/current/invite-code/rotate` | New plaintext invitation code; owner only | 200 |
| GET `/products?status=needed&limit=50&cursor=...` | `{items,nextCursor,counts:{needed,purchased}}` scoped to the user's household | 200 |
| GET `/products/:id` | One product including its version | 200 |
| POST `/products` | `{name,quantity,unit,note?}` → created product | 201 |
| PATCH `/products/:id` | `{name,quantity,unit,note,version}` → product; complete set of editable fields | 200 |
| PATCH `/products/:id/status` | `{status,version}` → product | 200 |
| DELETE `/products/:id` | Requires `If-Match: "<version>"` | 204 |

Additionally, `/api/health/live` checks the process, while `/api/health/ready` checks application readiness and database connectivity. Readiness returns 503 if the database is unavailable, without exposing connection details.

### Response Rules

- `400 VALIDATION_ERROR`: invalid body, parameters, cursor, or missing required version.
- `401 UNAUTHENTICATED`: missing, invalid, or expired session. Invalid login credentials return a generic `INVALID_CREDENTIALS` error with 401.
- `403 FORBIDDEN`: a member attempts to rotate an invitation code. `403 HOUSEHOLD_REQUIRED`: a list operation without a household. A rejected Origin also returns 403.
- `404 NOT_FOUND`: a product does not exist or belongs to another household; do not disclose its existence. A missing current household also returns 404.
- `409 EMAIL_TAKEN`, `ALREADY_IN_HOUSEHOLD`, or `VERSION_CONFLICT`: a state conflict.
- An invalid or rotated invitation code returns generic `400 INVALID_INVITE_CODE`.
- `413`: request size exceeded; `429`: attempt limit exceeded; `500`: generic message with requestId.
- Derive the user's household from the session. Clients do not submit `householdId` for product operations.
- Cursors are opaque and tied to the filter and stable ordering. Changing the filter or resetting the list clears the cursor. Pagination does not guarantee a snapshot during concurrent changes; refresh reloads from the beginning.
- Before UI implementation, complete OpenAPI response schemas, limits, and error examples. This table establishes semantics but does not replace those schemas.

## 8. Sessions, Authorization, and Data Protection

- Hash passwords with a maintained Argon2id library rather than custom cryptography. Verify parameters and compatibility with the Node image during initialization.
- Session tokens are cryptographically random with at least 256 bits of entropy; store only hashes. Sessions expire after 7 days, without automatic renewal in the MVP.
- Cookies use HttpOnly, SameSite=Lax, Path=/, no explicit Domain, and Secure over HTTPS. Local HTTP allows a configuration without Secure. Tokens never enter localStorage.
- Mutations, including login and registration, require an Origin matching the allowlist. Reject a missing Origin; API tests explicitly provide the correct header. SameSite adds another protection layer.
- Enforce authorization on the backend for every operation, including GET, PATCH, DELETE, and individual product retrieval.
- Rate-limit login, registration, and joining, for example to 10 attempts/minute/IP. Record final limits in configuration and tests. A single API instance can use an in-memory limiter for the MVP.
- Limit JSON payloads to 16 KB. Render user content as text, without `dangerouslySetInnerHTML`.
- Logs must not contain passwords, cookies, tokens, or invitation codes. Secrets belong in environment configuration, with `.env` excluded from version control.
- Logging out invalidates the session and clears its cookie. Logout in one browser affects only that session.

## 9. Repository Structure

Use **one repository containing both the application and its tests**, separate from the existing Playwright learning exercises:

```text
cartmates/
  apps/
    web/src/
    api/src/modules/{auth,households,products}/
    api/prisma/{schema.prisma,migrations/}
  tests/
    api/
    e2e/
    fixtures/
    helpers/
  docs/
    PROJECT-PLAN.md
    test-strategy.md
    exploratory-notes/
    bugs/
    ai-workflow/
  .github/workflows/ci.yml
  AGENTS.md
  compose.yaml
  compose.test.yaml
  playwright.config.ts
  package.json
  package-lock.json
  .env.example
  README.md
```

This document currently lives in the learning workspace as a planning artifact. During initialization, move or copy it to the Cartmates repository. Do not overwrite the existing course exercises.

Avoid building a large test framework in advance. Add Page Objects for actual repeated interactions; API helpers prepare data and manage sessions. Keep all new project filenames and documentation in English.

## 10. Docker and Environment Data

- `compose.yaml` defines `web`, `api`, `db`, and a one-off migration job. Database/API health checks determine readiness order. Web starts after the API is ready.
- Start the API after successful migrations; migration failure blocks startup. Do not use `db push` instead of versioned migrations.
- A named volume preserves database data. Ordinary stop/start operations do not erase it.
- `compose.test.yaml` uses a separate Compose project, database, ports, and volume. A Playwright runner is an optional service/profile; local tests can run from the host.
- Test resets may remove only resources belonging to the test project. The reset script requires explicit test mode and verifies the database/environment name before destructive operations.
- Demo seeding is optional, idempotent, and invoked separately. Tests do not automatically depend on demo data.
- Tests create their own accounts and households with a unique run prefix. They must not depend on execution order or a single shared account.
- The README documents ports, `.env.example`, migrations, stopping services, resetting the test database, and troubleshooting.

Planned scripts: `dev`, `build`, `typecheck`, `lint`, `test:unit`, `test:api`, `test:e2e`, `test:report`, `db:migrate`, and `db:seed:demo`. `build` explicitly includes type checking; Vite's build alone does not replace it.

## 11. QA Strategy

### Risk Priorities

| Priority | Risk | Main test level |
| --- | --- | --- |
| P0 | Reading another household's list or changing its products | API, selected E2E |
| P0 | Saving a product to the wrong household | API |
| P1 | Broken authentication or ineffective logout | API + E2E |
| P1 | Lost changes between two household members | Concurrent API requests + E2E |
| P1 | Incorrect quantity/status or data loss after refresh | API + E2E |
| P2 | Incorrect sorting, counts, feedback, or mobile layout | API/UI + exploration |

### Planned API Suite — Approximately 15–20 Logical Tests

1. Registration creates an account and session; duplicate emails are rejected regardless of case.
2. Valid/invalid login, expired sessions, logout, and reuse of an old cookie.
3. Validation of display name, email, and password length boundaries.
4. Household creation saves the owner and membership consistently.
5. Joining with a valid code, rejecting an invalid code, and refusing a second membership.
6. Code rotation invalidates the previous code; ordinary members cannot rotate it.
7. Creating and retrieving a product with default values.
8. Parameterized quantity, unit, name, and note validation, including boundary values.
9. Editing increments the version and preserves unaffected fields.
10. Marking purchased and undoing updates status, timestamps, and counts correctly.
11. Deleting a product, followed by GET and another DELETE.
12. Household isolation: list and GET/PATCH/status/DELETE using a known foreign UUID.
13. Missing sessions and missing households block the corresponding operations.
14. Two updates with the same version: exactly one succeeds, the other returns 409, and stored data matches the successful mutation.
15. Updating after another member deletes the product returns 404.
16. Filters, stable ordering, pagination, and counts for both statuses.
17. Invalid/missing Origin and attempt limits; verify the limiter in an isolated environment without disrupting other tests.
18. Concurrent attempts to join two households with one account leave exactly one membership.

Parameterization may produce more `test()` functions. Test count is not the success metric; risk coverage and meaningful assertions are.

### Planned E2E Suite — Approximately 8 Scenarios

1. Sign up → create a household → add a product → refresh → product persists.
2. A second member joins with a code, refreshes the list, and sees the first member's product.
3. Mark purchased and undo, checking tabs and counts.
4. Edit quantity using decimal-comma input and update the note; verify after reopening.
5. Cancel deletion, then confirm deletion.
6. Two independent sessions edit the same product; the UI reports a conflict and preserves the form input.
7. A network error during saving produces no false success, preserves the form, and allows a successful manual retry.
8. Logout prevents returning to private data; the primary flow works in a mobile Chromium viewport.

Start with Chromium. API tests use a separate Playwright project and are not repeated for each browser. Two users in E2E use separate BrowserContexts. Supplement mobile emulation with a manual check on a real device.

### Unit Tests and Exploration

- Add a few unit tests for quantity normalization and unit rules where boundaries matter, rather than testing every wrapper mechanically.
- Run 20–30 minute exploratory sessions: **Two household members shopping**, **Poor connectivity**, **Quantity mistakes**, and **Keyboard and mobile use**.
- Each note records the goal, attempts, observations, risks, and issue links.
- Each bug report includes environment/version, steps, expected/actual results, impact, and evidence.
- UI tests use auto-waiting and retrying assertions. Avoid fixed sleeps, execution-order dependencies, and weakening assertions to obtain a pass.
- Prepare data through the public API. Direct database access is reserved for controlled resets and special cases such as deterministic session expiry. Do not create a public reset endpoint.
- Test descriptions and reports are in English. Include Unicode user content in selected validation tests to verify that English UI does not imply ASCII-only data.

## 12. Development Phases and Acceptance Criteria

### Phase 0 — Clarification and Design

Work: review this document, sketch screens, complete OpenAPI schemas, and check dependency compatibility. Record decisions about sessions, invitations, and conflicts. Create a backlog following these phases and adopt the Cartmates naming and English language policy.

Acceptance: contracts and data model are consistent, error responses are specified, and P0/P1 tests are identified. Features beyond the MVP enter a separate backlog.

### Phase 1 — Skeleton and Environment

Work: create the repository, workspaces, minimal React/Fastify applications, database, first migration, Dockerfiles, Compose, proxy, health checks, lint/typecheck/build, and basic CI. Add the README, `.env.example`, and agent instructions in English.

Acceptance: after a clean checkout and documented configuration, `docker compose up --build` starts the website, healthy API, and database. Migrations initialize the database, no secrets enter version control, and restarts preserve data. SPA navigation also works after refreshing a nested route.

### Phase 2 — Accounts and Sessions

Work: implement user/session models, registration, login, logout, `me`, protected UI/API routes, validation, and feedback. Enable Origin protection and attempt limits.

Acceptance: API tests verify valid and invalid login; refresh preserves the session, logout invalidates the token, and responses contain neither passwords nor hashes. The first registration/login E2E runs in CI.

### Phase 3 — Households and Sharing

Work: implement household creation, membership, invitation codes and rotation, joining, and the member screen. Add transactions and the single-membership constraint.

Acceptance: two sessions belong to one household, another group remains isolated, rotated codes stop working, and ordinary members cannot rotate codes. Concurrent attempts do not create two memberships.

### Phase 4 — Complete Shopping List Flow

Work: implement creation, retrieval, editing, status changes, deletion, filters, counts, pagination, forms, and responsive layout. Include record versioning immediately to avoid changing the contract later.

Acceptance: users complete the shopping flow, direct API requests enforce validation, and state survives refresh. Updates and deletion respect version and household boundaries. Errors do not clear forms.

### Phase 5 — Concurrency and Failure Handling

Work: implement conflict feedback, deletion during editing, connection loss, session expiry, and manual refresh. Run exploratory sessions and fix discovered issues.

Acceptance: a deterministic concurrent-update test produces one success and one conflict; the UI preserves entered content. Network failure and foreign-identifier tests pass. Manually check keyboard use and a real phone.

### Phase 6 — Full CI and QA Deliverables

Work: organize fixtures, reports, artifacts, and test isolation. Add the test strategy, exploratory notes, a bug report, and agent workflow documentation. Perform a clean setup using the README.

Acceptance: the complete pipeline in section 13 passes; failed tests retain reports/traces and logs without secrets. All P0/P1 tests pass. Three consecutive full runs show no instability; this is an acceptance check, not proof that flaky tests cannot exist. Review project artifacts and UI text for compliance with the English language policy.

### Phase 7 — Quality Demonstration

Work: on a separate local branch, deliberately remove the household condition from one operation, demonstrate an isolation test failing, and restore the fix. Do not publish the vulnerable instance. Record the AI workflow and human review. Optionally record a 2–3 minute demonstration in English.

Acceptance: the same test passes before the mutation, fails with the defect, and passes after restoration. The default branch contains the correct implementation. The README explains human/AI contributions and product limitations in English.

Avoid fixed deadlines before the initial phases. After phase 2, assess progress and divide the remaining work into short sessions with one visible outcome each.

## 13. CI Pipeline

Run on pull requests and pushes to the main branch:

1. Check out the code and prepare the pinned Node version.
2. Run `npm ci`, type checking, lint, and selected unit tests.
3. Build images and start an isolated Compose project for testing.
4. Apply migrations and wait for health checks with a bounded timeout; collect logs on failure rather than waiting indefinitely.
5. Install browsers matching the Playwright version or use a matching runner image.
6. Run API tests followed by Chromium E2E. Initially use one worker for easier diagnosis; data isolation remains required.
7. Save HTML/JUnit reports, failure traces, screenshots, and container logs even on failure.
8. Clean up only test Compose resources in an always-run step.

CI reports have limited retention, for example 7 days, and contain fictional data only. Start with retries=0. Introduce retries only with explicit flaky-test reporting; passing on retry does not resolve an underlying issue.

## 14. Working with AI and Learning QA

For each feature:

1. The human describes the risk and expected outcome using a concrete example.
2. The agent proposes scenarios; the human removes unnecessary ones and adds missing coverage.
3. The agent implements a limited change or test and runs relevant checks.
4. The human reviews assertions, data, isolation, and whether the test could pass despite a defect.
5. Record the result, any AI mistake, and the correction before moving to the next scope.

`AGENTS.md` should require:

- Reading the plan, API schemas, and startup instructions before editing.
- Following Cartmates' English language policy for all project artifacts and generated UI text.
- Preserving expected behavior rather than changing it merely because a test fails.
- Never deleting tests, assertions, or authorization checks just to obtain a pass.
- Reporting changed files, executed checks, results, and limitations.
- Using fictional data and never resetting a non-test database.
- Pausing dependent implementation when requirements conflict and identifying the specific contradiction.

Limit the first agent workflow to one feature, such as product creation: read the contract → propose tests → write tests → run → analyze the report → propose a fix. Do not start with an agent independently changing the entire project. Automated execution of this workflow in CI remains an extension if the local process proves useful.

Portfolio documentation includes a risk strategy, at least one exploratory note, a bug report, a prompt → test → human review example, and evidence of detecting a deliberate defect. All materials are in English.

## 15. Definition of Done

A feature is complete when:

- It meets its business rules and acceptance criteria, including failures and authorization.
- Type checks and lint pass; the build and necessary migrations work in a fresh environment.
- It has tests at levels appropriate to the risk, without unnecessarily repeating all validation through the UI.
- Ordinary use does not require manually creating database records.
- The UI handles loading, errors, basic accessibility, and small screens.
- API contracts and instructions are current, and logs do not expose secrets.
- Application-owned text, code identifiers, comments, tests, and documentation follow the English language policy.
- The human can explain why each test exists, what it checks, and which defect it would detect.

The MVP is complete after phases 0–7 and verification of the measurable outcomes in section 1. Additional features do not block acceptance.

## 16. Post-MVP Extension Order

1. Selected E2E coverage on Firefox/WebKit and automated accessibility checks.
2. Better member management and account lifecycle support.
3. Automatic refresh, followed by real-time synchronization if useful.
4. Search, categories, history, or bulk list cleanup based on actual usage.
5. PWA support and a public demo after a separate configuration and security review.

Each extension needs a user goal, risk description, and acceptance criteria. Add technologies because they solve a demonstrated need rather than to increase the portfolio's tool count.
