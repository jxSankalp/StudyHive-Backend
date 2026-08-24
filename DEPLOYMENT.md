# StudyHive API deployment

## Verify locally

```bash
npm ci
npm test
```

`npm test` performs the TypeScript production build, runs 16 unit/regression cases,
and runs seven in-memory HTTP/Socket.IO authorization integration cases. It also
discovers four real-Supabase RLS cases; those run only when the disposable test
project variables below are configured.

## Database migrations

Apply every SQL file in `supabase/migrations` in numeric order. In particular,
migration `008_rls_idempotency_hardening.sql` must be applied before this API
version. It:

- converges RLS policies and grants for `tasks`, `notifications`, and `message_reactions`;
- removes anonymous access and prevents direct authenticated mutations except a
  user acknowledging their own notification;
- adds `messages.client_message_id` and sender-scoped uniqueness for idempotent sends.

Earlier migrations remain required: migration 005 contains the private file/read
state foundations, migration 006 repairs the reply foreign key, and migration 007
adds mentions and workspace search. Apply migrations to staging first. Then run
`npm run test:rls` with a disposable Supabase project and authenticated member,
outsider, and anonymous tokens before production.

## Render configuration

Use `render.yaml` and configure:

- `NODE_ENV=production`
- `CLIENT_URL=https://<production-vercel-domain>`
- `CLIENT_URLS=https://*.vercel.app` only if previews need API access
- `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`
- `STREAM_API_KEY` and server-only `STREAM_API_SECRET`
- optional `LOG_LEVEL`, `SENTRY_DSN`, and `SENTRY_TRACES_SAMPLE_RATE`

The service-role and Stream secret must never be copied into Vercel. Render builds with `npm ci && npm run build`, starts with `npm start`, and checks `/health`.

## Release order

1. Back up/verify the target Supabase project and apply pending migrations.
2. Run `npm test`.
3. Deploy Render and verify `/health`, auth, workspace search, idempotent message retry, paginated messages, a signed upload, and read acknowledgement. Record the returned `X-Request-ID` when diagnosing failures.
4. Deploy Vercel.
5. Run a two-user smoke test for unread counts, “seen by,” mentions, file access,
   non-member denial, whiteboard delta sync, room revocation after member removal,
   and message deletion cleanup.

## Disposable Supabase RLS test project

Set `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and
`SUPABASE_TEST_SERVICE_ROLE_KEY`, apply all migrations, and run:

```bash
npm run test:rls
```

The suite creates and removes its own users/workspace data. Never point it at a
production project.
