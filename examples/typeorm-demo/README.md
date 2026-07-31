# typeorm-demo

Minimal standalone demo of [`@nestjs-crud/typeorm`](../../packages/typeorm) against the v2.0 API.

This app is **not** a monorepo workspace member — it is intentionally decoupled
from the integration-test fixture that lives at
`packages/typeorm/test/__fixture__/app/`. Keeping the demo standalone ensures it
works as a reference a consumer can point at without the test harness becoming
load-bearing on a user-facing app.

## Prerequisites

- Node 24+
- Yarn (any modern version — this folder does not share the repo's Yarn 4.12 pin)
- Postgres reachable on `localhost:5455` — easiest via the repo-root `compose.yml`:
  ```bash
  # from the repository root
  docker compose up -d
  ```
- The `@nestjs-crud/*` workspace packages must be **built first** because this demo
  links to them via `file:` paths that resolve to each package's `lib/` output:
  ```bash
  # from the repository root
  yarn install
  yarn build
  ```

## Run the demo

```bash
cd examples/typeorm-demo
yarn install
yarn build        # tsc compile into ./dist
yarn start:dev    # ts-node, fastest feedback loop
# or: yarn start  — run the compiled dist output
```

The app binds to `http://localhost:3000` (set `PORT` to override).
`synchronize: true` is enabled in `orm.config.ts` so the two demo tables
(`users`, `companies`) are created on first boot — no migrations required.

## Poke the API

```bash
# List users (empty array until you create one)
curl http://localhost:3000/users

# Create a company
curl -X POST http://localhost:3000/companies \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme","domain":"acme.test","description":"Demo co"}'

# Create a user in that company
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@acme.test","name":"Alice","companyId":1}'

# Join + search + pagination
curl 'http://localhost:3000/users?join=company&limit=10&offset=0'
curl 'http://localhost:3000/users?s=%7B%22name%22%3A%7B%22%24cont%22%3A%22alice%22%7D%7D'
```

## What this demonstrates

- `@Crud()` decorator on a NestJS controller — auto-generated REST routes
- Auto-generated handlers: `getMany`, `getOne`, `createOne`, `createMany`,
  `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`
- Relation joining via `?join=company`
- Pagination via `?limit=10&offset=0`
- Search via `?s={"name":{"$cont":"alice"}}` (URL-encode in a real client)
- Soft-delete with `@DeleteDateColumn` + `query.softDelete: true`

## See also

- Package README: [`packages/typeorm/README.md`](../../packages/typeorm/README.md)
- Full integration fixture (7 entities, joins, seeds, swagger):
  `packages/typeorm/test/__fixture__/app/`
- Public `@Crud()` API reference: repo root skills catalog.
