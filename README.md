# Cartmates

A shared household shopping list and QA learning portfolio. This repository currently implements **phase 1: the working skeleton**. Registration, households, and shopping operations are intentionally deferred. See [the project plan](docs/PROJECT-PLAN.md) and [agent instructions](AGENTS.md).

## Requirements

- Node.js **24.21.0** (also in `.nvmrc`), npm 11, and Git.
- Docker Desktop running with **Linux containers** and Docker Compose **2.24.4 or newer** (the test override uses `!override`).
- Available local ports: 8080/5432 for development; 8081/5433 for tests.

Check: `node --version`, `npm --version`, `git --version`, `docker --version`, `docker compose version`, and `docker info`.

On Windows, restart your terminal after installing Docker. If `docker` is still missing from PATH, this per-user installation can be added for the current PowerShell session:

```powershell
$env:Path += ";$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
```

## Start with Docker

Run from the repository root. In PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build -d --wait --wait-timeout 120
docker compose ps -a
```

On macOS/Linux, use `cp .env.example .env` instead. Copy the file only on first setup; do not overwrite your own settings on subsequent starts. The example password is for fictional local data only. If changing database settings, keep `DATABASE_URL` consistent and use a URL-safe password. Existing database volumes retain the credentials used when first initialized.

Open [Cartmates](http://localhost:8080), [the nested status page](http://localhost:8080/status), and [API documentation](http://localhost:8080/api/docs/).

```powershell
Invoke-RestMethod http://localhost:8080/api/health/live
Invoke-RestMethod http://localhost:8080/api/health/ready
docker compose logs migrate api
```

`docker compose up --build` also works in the foreground. The `migrate` service should exit with code 0; it is a one-off job, not a crashed server. Database, API, and web services should be healthy.

## Architecture and the first migration

Browser → Nginx (built React application) → `/api/*` → Fastify → Prisma → PostgreSQL.

The browser uses one origin; the development Vite server has the equivalent API proxy. The API is not published directly by Compose. PostgreSQL and the website bind only to the host loopback interface.

- `/api/health/live` returns `200 {"status":"ok"}` when the process is running.
- `/api/health/ready` queries the `AppMetadata` initialization marker. It returns 200 when the database and first migration are available, or a generic `503 NOT_READY` error without connection details.
- `/api/docs/` documents health responses in local/test environments. `APP_ENV=production` disables documentation; public deployment is outside this phase.

The first committed SQL migration creates and inserts a single infrastructure marker. Its timestamp also provides a simple persistence check. Business tables belong to subsequent phases. Prisma 7 uses the PostgreSQL driver adapter and `prisma.config.ts`; generated client files are ignored and regenerated during builds.

Compose enforces: database healthy → migration successful → API ready → website starts. A migration failure blocks startup. Do not replace migrations with `db push`.

## Stop, restart, and inspect persistence

```powershell
docker compose stop
docker compose start
docker compose down
docker compose up -d --wait --wait-timeout 120
```

The named `cartmates_db-data` volume survives these commands. **Do not add `--volumes` to development shutdown commands.** Compare this query before and after `down`/`up`: the timestamp should be unchanged.

```powershell
docker compose exec -T db psql -U cartmates -d cartmates -c 'TABLE "AppMetadata";'
```

Use your configured database/user names if you changed the defaults.

## Local code development

```powershell
npm ci
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run dev
```

Open [Vite](http://localhost:5173). Host API development runs on port 3000 and loads the root `.env`; the database runs in Docker on port 5432. Stop `npm run dev` with Ctrl+C. After schema changes, create a migration with `npm exec -w @cartmates/api -- prisma migrate dev --name descriptive_change`, review the SQL, and commit it. Never accept a reset of a non-test database.

## Checks and isolated smoke tests

```powershell
npm ci
npm run lint
npm run format:check
npm run build
docker compose -f compose.yaml -f compose.test.yaml up --build -d --wait --wait-timeout 120
npx playwright install chromium
npm run test:api
npm run test:e2e
npm run test:report
```

`build` includes TypeScript checks for both applications and tests. `npm run format` formats files. The lockfile fixes dependency versions; `npm ci` reproduces them. No unit suite or seed script exists yet because this phase contains no business rules or demo accounts.

The test override selects project `cartmates-test`, database `cartmates_test`, volume `cartmates-test_db-data`, and ports 8081/5433. Do not override its project name with the development project name. Playwright targets port 8081 by default, uses one worker, and has no retries. API tests run once; UI tests use Chromium. Screenshots and traces are retained on failure.

The smoke tests detect broken health contracts, proxy routing, missing OpenAPI responses, broken SPA refreshes, and missing UI failure/retry feedback. They do not establish coverage of future business features. The UI failure test simulates an HTTP 503; verify a real database outage separately as below.

GitHub Actions runs lint, formatting, type checking/build, the isolated Compose stack, and Playwright. Reports and container logs are uploaded even on failure with seven-day retention. The workflow itself can only be confirmed on GitHub after pushing.

## Manual QA exercise: dependency failure

Use only the isolated test stack:

```powershell
docker compose -f compose.yaml -f compose.test.yaml stop db
curl.exe -i http://localhost:8081/api/health/live
curl.exe -i http://localhost:8081/api/health/ready
docker compose -f compose.yaml -f compose.test.yaml start db
```

Expected: liveness stays 200, readiness becomes 503 with no connection credentials, and readiness recovers to 200 after PostgreSQL starts. On macOS/Linux use `curl`. This distinction helps diagnose a running process whose dependency has failed.

No destructive reset helper is included yet. To recreate the **test database only**, first confirm the project and database names with `docker compose -f compose.yaml -f compose.test.yaml config`, then deliberately run:

```powershell
docker compose -f compose.yaml -f compose.test.yaml down --volumes
docker compose -f compose.yaml -f compose.test.yaml up -d --wait --wait-timeout 120
```

## Troubleshooting

- Engine connection errors: start Docker Desktop, wait until it is ready, and check Linux-container mode with `docker info`.
- Port conflict: change `WEB_PORT` or `DB_PORT` in `.env` for development; update `DATABASE_URL` if changing the host database port. Test ports are defined separately in the override.
- Startup failure: inspect `docker compose ps -a` and `docker compose logs db migrate api web`. Do not erase the volume to hide a migration error.
- Package/image download failure: check internet access and proxy settings, then retry. Initial builds download dependencies and images.
- Missing Playwright browser: run `npx playwright install chromium`; Linux CI also needs `--with-deps`.

## Learning and review

Implementation was AI-assisted. The owner should review the health contract, SQL migration, test assertions, and isolation settings and explain which defect each smoke test catches. See [phase 1 verification](docs/phase-1-verification.md) for executed checks and limitations. Later phases add the risk strategy, exploratory notes, bug reports, and a documented human review; this skeleton is not the completed portfolio or a production deployment.
