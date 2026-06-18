# QMS Regulatory Intelligence Platform (React + Netlify)

A React + Netlify Functions app for QMS document management, regulatory intelligence, GxP education, and AI-powered document chat. Built on Supabase PostgreSQL with pgvector for semantic search.

**📖 For complete system documentation, see [SYSTEM-DOCUMENTATION.md](./SYSTEM-DOCUMENTATION.md)**

## Prereqs
- Node 18+
- Netlify account
- Supabase project
- OpenAI API key (for document summarization and embeddings)
- Auth0 tenant (for authentication)
- Groq API key (for chat completions)

## Quick Start (Local)

```bash
npm install
npm run dev
```

### Required environment variables (create a `.env` or set in Netlify UI)
```
# Supabase Configuration
# Auto-injected by Netlify <-> Supabase integration in production.
# For local dev, copy from Supabase → Settings → API / Database.
SUPABASE_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>

# OpenAI Configuration (for document summarization and embeddings)
OPENAI_API_KEY=<your_openai_api_key>

# OpenAI Fallback Control (set to 'true' to disable gpt-4o-mini fallback)
DISABLE_OPENAI_FALLBACK=false

# Auth0 Configuration
VITE_AUTH0_DOMAIN=<your_auth0_domain>
VITE_AUTH0_CLIENT_ID=<your_auth0_client_id>

# Auth0 Management API Configuration (for user management)
AUTH0_MGMT_DOMAIN=<your_auth0_domain>
AUTH0_MGMT_CLIENT_ID=<your_management_api_client_id>
AUTH0_MGMT_CLIENT_SECRET=<your_management_api_client_secret>

# Groq Configuration (for chat)
GROQ_API_KEY=<your_groq_api_key>

# GovInfo CFR API
GPO_API_KEY=<your_govinfo_api_key>
```

Netlify CLI will read `.env` for local dev. In production, set these in **Netlify → Site settings → Environment variables**.

## Endpoints

### Document Management
- `GET /api/get-indexed-documents?limit=50&offset=0&name=foo` — Retrieve uploaded/indexed documents.
- `POST /api/regenerate-document-summary` — Regenerate AI summary for a document.
- `POST /api/update-manual-summary` — Add or update manual summaries for documents.
- `DELETE /api/delete-document` — Delete a document and its chunks.

### Document Chat
- `POST /api/chat-with-documents` — Chat with uploaded documents, CFR regulations, and web resources using AI.

### CFR Title 21
- `GET /api/cfr-title-21` — Fetch CFR Title 21 data from GovInfo.
- `POST /api/index-cfr-regulations` — Index CFR regulations with AI summaries and embeddings.

### GxP Education
- `GET/POST /api/course-management` — Course, module, and lesson CRUD.
- `POST /api/ai-tutor` — Socratic AI tutoring for GxP topics.
- `GET /api/educational-analytics` — Analytics for student progress.

### Workflows
- `GET/POST /api/workflow-management` — Document workflow management.

### Health
- `GET /api/health` — Service health check.

## Document Chat Features

- **AI-Powered Q&A**: Ask questions about uploaded documents, CFR regulations, and scraped web resources.
- **Semantic Search**: pgvector embeddings for accurate document chunk retrieval.
- **Conversation History**: Maintains chat context throughout your session.
- **Document Uploads**: Upload PDFs and other documents for indexing and chat.

## Chat File Uploads & Retention

- **Netlify Blobs Storage**: Chat attachments up to ~2 MB are stored privately in the `chat-uploads` Netlify Blob store via `POST /.netlify/functions/blob-upload`.
- **Secure Deletion**: Use `POST /.netlify/functions/blob-delete` with `{ key }` to remove uploads when a chat is cleared.
- **Automated Cleanup**: The scheduled function `/.netlify/functions/cleanup-blobs` runs daily at 02:00 UTC and removes uploads older than 48 hours.

## Database Setup

1. Create a [Supabase](https://supabase.com) project.
2. In Netlify → **Integrations → Supabase**, link the project — this auto-injects `SUPABASE_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `SUPABASE_JWT_SECRET`.
3. For local dev, copy those values manually from **Supabase → Settings → API / Database** into your `.env`.
4. Enable the `pgvector` extension in **Supabase → Database → Extensions** (search "vector").
5. The database schema will be automatically created on first run (see `database-schema.sql` for reference).

## Deploy to Netlify

1. Create a new repo in GitHub.
2. Upload this project (or import zip below).
3. In Netlify, **New site from Git**, select your repo.
4. In **Build settings**, set the build command to `npm run build` and the publish directory to `dist`.
5. In **Environment variables**, add all the variables shown above.
6. Deploy. (Functions are under `netlify/functions/*` and are auto-built by Netlify.)

## Security

### React Version Security Status

**Current Status: NOT AFFECTED** by CVE-2025-55182 and CVE-2025-66478

- **React Version**: 18.3.1 (pinned to `^18.3.1` in `package.json`)
- **Vulnerability Scope**: The React Server Components (RSC) vulnerability only affects React 19.0, 19.1, and 19.2
- **Framework**: This project uses Vite + React (not Next.js), and does not use React Server Components

**References**:
- [Netlify Security Response](https://www.netlify.com/changelog/2025-12-03-react-security-vulnerability-response/)
- [React Security Advisory](https://react.dev/blog/security)

## Notes

- Document indexing processes up to 4000 characters of content for AI summarization.
- Database connections are pooled for optimal performance.
- OpenAI API key is required for document summarization and embedding generation.
- Manual summaries enhance chat responses by providing user-added context and corrections.
