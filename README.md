# Veeva Approved Docs (React + Netlify)

A minimal React + Netlify Functions app that connects to **Veeva Vault** and lists **approved (steady-state)** documents. Includes secure serverless proxy for authentication, VQL querying, file downloads, and health checks.

## Prereqs
- Node 18+
- Netlify account
- Veeva Vault credentials (username/password)

## Quick Start (Local)

```bash
npm install
npm run dev
```

### Required environment variables (create a `.env` or set in Netlify UI)
```
VAULT_DOMAIN=y-prime-quality.veevavault.com
VAULT_API_VERSION=v25.2
VAULT_USERNAME=<your_vault_username>
VAULT_PASSWORD=<your_vault_password>
```

Netlify CLI will read `.env` for local dev. In production, set these in **Netlify → Site settings → Environment variables**.

## Endpoints

- `GET /api/list-approved?limit=50&offset=0&name=foo` — List approved docs (VQL with `STEADYSTATE()`).
- `GET /api/download-file?docId=####&major=1&minor=0` — Download latest or versioned file.
- `GET /api/health` — Simple connectivity check (`/limits`).
- `GET /api/whoami` — Identify current Vault user.
- `GET /api/readiness` — Chain of health checks (limits + whoami).

## UI

- **StatusBar** shows live readiness across the top.
- Search/filter by name and paginate.
- Download the underlying file via proxied endpoint.

## Deploy to Netlify

1. Create a new repo in GitHub.
2. Upload this project (or import zip below).
3. In Netlify, **New site from Git**, select your repo.
4. In **Build settings**, set the build command to `npm run build` and the publish directory to `dist`.
5. In **Environment variables**, add the variables shown above.
6. Deploy. (Functions are under `netlify/functions/*` and are auto-built by Netlify.)

## Notes

- All Vault calls are made server‑side with the Session ID in `Authorization` header.
- The VQL query uses `status__v = STEADYSTATE()` to capture “approved/effective” across lifecycles.
- Adjust fields/filters in `list-approved.js` to match your Vault model.
