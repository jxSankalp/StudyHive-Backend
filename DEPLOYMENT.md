# StudyHive API deployment

## Verify locally

```bash
npm ci
npm test
```

`npm test` performs the TypeScript production build and runs eight authorization plus five cursor regression cases.

## Database migrations

Apply every SQL file in `supabase/migrations` in numeric order. Migration `005_security_pagination_files_receipts.sql` is required before deploying this API version. It:

- enables RLS on `tasks`, `notifications`, and `message_reactions` and adds scoped policies;
- creates private chat-file metadata and the `chat-files` Storage bucket;
- creates monotonic chat read state and unread-count/read-watermark functions;
- adds the compound message-pagination index.

Do not deploy the new backend before migration 005: workspace listing calls the unread-count function and will fail until it exists. Apply migrations to staging first, then run authenticated/non-member policy smoke tests before production.

## Render configuration

Use `render.yaml` and configure:

- `NODE_ENV=production`
- `CLIENT_URL=https://<production-vercel-domain>`
- `CLIENT_URLS=https://*.vercel.app` only if previews need API access
- `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`
- `STREAM_API_KEY` and server-only `STREAM_API_SECRET`

The service-role and Stream secret must never be copied into Vercel. Render builds with `npm ci && npm run build`, starts with `npm start`, and checks `/health`.

## Release order

1. Back up/verify the target Supabase project and apply pending migrations.
2. Run `npm test`.
3. Deploy Render and verify `/health`, auth, workspace list, paginated messages, a signed upload, and read acknowledgement.
4. Deploy Vercel.
5. Run a two-user smoke test for unread counts, “seen by,” file access, member denial, and message deletion cleanup.
