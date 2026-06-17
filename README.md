# Veeva Approved Docs (React + Netlify)

A React + Netlify Functions app that connects to **Veeva Vault** and lists **approved (steady-state)** documents. Includes secure serverless proxy for authentication, VQL querying, file downloads, document indexing with AI summarization, and health checks.

**📖 For complete system documentation, see [SYSTEM-DOCUMENTATION.md](./SYSTEM-DOCUMENTATION.md)**

## Prereqs
- Node 18+
- Netlify account
- Veeva Vault credentials (username/password)
- Supabase project (AccelerQA Reg Intel database)
- OpenAI API key (for document summarization)

## Quick Start (Local)

```bash
npm install
npm run dev
```

### Required environment variables (create a `.env` or set in Netlify UI)
```
# Veeva Vault Configuration
VAULT_DOMAIN=y-prime-quality.veevavault.com
VAULT_API_VERSION=v25.2
VAULT_USERNAME=<your_vault_username>
VAULT_PASSWORD=<your_vault_password>

# Supabase Configuration (AccelerQA Reg Intel database)
# Auto-injected by Netlify <-> Supabase integration in production.
# For local dev, copy from Supabase → Settings → API / Database.
SUPABASE_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>

# OpenAI Configuration (for document summarization)
OPENAI_API_KEY=<your_openai_api_key>

# OpenAI Fallback Control (set to 'true' to disable gpt-4o-mini fallback)
DISABLE_OPENAI_FALLBACK=false

# Auth0 Configuration
VITE_AUTH0_DOMAIN=<your_auth0_domain>
VITE_AUTH0_CLIENT_ID=<your_auth0_client_id>
```

Netlify CLI will read `.env` for local dev. In production, set these in **Netlify → Site settings → Environment variables**.

## Endpoints

### Veeva Vault Integration
- `GET /api/list-approved?limit=50&offset=0&name=foo` — List approved docs (VQL with `STEADYSTATE()`).
- `GET /api/download-file?docId=####&major=1&minor=0` — Download latest or versioned file.
- `GET /api/health` — Simple connectivity check (`/limits`).
- `GET /api/whoami` — Identify current Vault user.
- `GET /api/readiness` — Chain of health checks (limits + whoami).

### Document Indexing
- `POST /api/index-documents?limit=100&name=foo` — Index Veeva documents with AI summaries.
- `GET /api/get-indexed-documents?limit=50&offset=0&name=foo` — Retrieve indexed documents from database.

### Document Chat
- `POST /api/chat-with-documents` — Chat with indexed documents using OpenAI API.

### Manual Summaries
- `POST /api/update-manual-summary` — Add or update manual summaries for documents.

## UI

- Requires Auth0 login to access document list.
- **StatusBar** shows live readiness across the top.
- **Tab navigation** between "Veeva Documents" and "Indexed Documents".
- Search/filter by name and paginate.
- Download the underlying file via proxied endpoint.
- **Index Documents** button to process Veeva documents with AI summarization.
- View AI-generated document summaries in the indexed documents tab.
- **Chat with Documents** button to ask questions about indexed documents using AI.
- Select specific documents to chat with or chat with all indexed documents.
- **Manual Summary Editor** to add user-defined summaries to documents.
- Combined AI and manual summaries provide comprehensive document understanding.

## Document Indexing Features

- **Automatic Summarization**: Documents are processed through OpenAI to generate concise summaries.
- **Database Storage**: Document metadata and summaries stored in Supabase PostgreSQL database.
- **Upsert Logic**: Existing documents are updated if their metadata changes, preserving existing summaries.
- **Version Tracking**: Captures document name, number, major/minor versions, and status.
- **Search & Filter**: Search indexed documents by name with pagination support.

## Document Chat Features

- **AI-Powered Q&A**: Ask questions about your indexed documents and get intelligent answers.
- **Document Selection**: Choose specific documents to chat with or let the AI find relevant documents automatically.
- **Context-Aware Responses**: AI uses both AI and manual document summaries plus metadata to provide accurate, relevant answers.
- **Conversation History**: Maintains chat context throughout your session.
- **Smart Document Discovery**: Automatically finds relevant documents based on your questions.
- **Hybrid Summaries**: Combines AI-generated and user-added manual summaries for comprehensive document understanding.

## Chat File Uploads & Retention

- **Netlify Blobs Storage**: Chat attachments up to ~2 MB are stored privately in the `chat-uploads` Netlify Blob store via `POST /.netlify/functions/blob-upload`. The function returns a blob key and a short-lived signed URL for Groq ingestion.
- **Secure Deletion**: Use `POST /.netlify/functions/blob-delete` with `{ key }` to remove uploads when a chat is cleared. Users can toggle automatic purge behaviour in the UI.
- **Automated Cleanup**: The scheduled function `/.netlify/functions/cleanup-blobs` runs daily at 02:00 UTC (configured in `netlify.toml`) and removes uploads older than 48 hours.
- **Audit Logging**: Upload, delete, and cleanup actions write rows to the `blob_audit_log` table in Supabase for traceability.

## Manual Summary Features

- **User-Added Context**: Add your own notes and summaries to complement AI-generated summaries.
- **Inline Editing**: Edit manual summaries directly in the document list interface.
- **Markdown Support**: Format your manual summaries with markdown for better readability.
- **Chat Integration**: Manual summaries are automatically included in chat responses.
- **Search Enhancement**: Manual summaries improve document discoverability in chat searches.

## Database Setup

1. Create a [Supabase](https://supabase.com) project (AccelerQA Reg Intel database).
2. In Netlify → **Integrations → Supabase**, link the project — this auto-injects `SUPABASE_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `SUPABASE_JWT_SECRET`.
3. For local dev, copy those values manually from **Supabase → Settings → API / Database** into your `.env`.
4. Enable the `pgvector` extension in **Supabase → Database → Extensions** (search "vector").
5. The database schema will be automatically created on first run (see `database-schema.sql` for reference).

## Deploy to Netlify

1. Create a new repo in GitHub.
2. Upload this project (or import zip below).
3. In Netlify, **New site from Git**, select your repo.
4. In **Build settings**, set the build command to `npm run build` and the publish directory to `dist`.
5. In **Environment variables**, add all the variables shown above (including `DATABASE_URL` and `OPENAI_API_KEY`).
6. Deploy. (Functions are under `netlify/functions/*` and are auto-built by Netlify.)

## Security

### React Version Security Status

**Current Status: NOT AFFECTED** by CVE-2025-55182 and CVE-2025-66478

- **React Version**: 18.3.1 (pinned to `^18.3.1` in `package.json`)
- **React DOM Version**: 18.3.1
- **Vulnerability Scope**: The React Server Components (RSC) vulnerability (CVE-2025-55182) only affects React 19.0, 19.1, and 19.2
- **Framework**: This project uses Vite + React (not Next.js), and does not use React Server Components

**Security Hardening**:
- React is pinned to `^18.3.1` to prevent accidental upgrades to React 19.x
- Before upgrading React, verify that any security vulnerabilities in React 19.x have been fully resolved
- To verify React version: `npm list react react-dom`

**References**:
- [Netlify Security Response](https://www.netlify.com/changelog/2025-12-03-react-security-vulnerability-response/)
- [React Security Advisory](https://react.dev/blog/security)

## Notes

- All Vault calls are made server‑side with the Session ID in `Authorization` header.
- The VQL query uses `status__v = STEADYSTATE()` to capture "approved/effective" across lifecycles.
- Adjust fields/filters in `list-approved.js` to match your Vault model.
- Document indexing processes up to 4000 characters of content for OpenAI summarization.
- Database connections are pooled for optimal performance.
- Indexing results show created, updated, and unchanged document counts.
- Document chat uses GPT-4 for intelligent question answering with document context.
- Chat functionality requires indexed documents to work effectively.
- OpenAI API key is required for both document summarization and chat features.
- Manual summaries enhance chat responses by providing user-added context and corrections.
- Database schema automatically adds manual_summary column to existing installations.
