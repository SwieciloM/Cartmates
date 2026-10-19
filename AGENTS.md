# Cartmates agent instructions

- Read `docs/PROJECT-PLAN.md`, `README.md`, and relevant API schemas before editing. The plan defines scope and business rules.
- Work incrementally on one agreed phase or feature. Explain important decisions and the risks covered by tests. Leave future features for later steps.
- Use English for all artifacts, code, UI text, tests, documentation, and commit/PR messages. Preserve Unicode user content.
- Keep application and tests in this npm-workspace repository. Follow the agreed React/Fastify/PostgreSQL/Prisma/Compose/Playwright stack.
- Preserve expected behavior when tests fail. Never delete tests, weaken assertions, or remove authorization checks to obtain a pass.
- Use fictional data. Never reset a non-test database; destructive test operations must explicitly identify and validate the test environment.
- Do not commit secrets, generated clients, build output, or test reports. Commit migrations and the npm lockfile.
- If requirements conflict, identify the specific contradiction and pause dependent implementation.
- Run relevant checks. Report changed files, commands, results, and limitations honestly. Human review is part of the QA learning process.
