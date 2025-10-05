# Veeva Approved Docs (React + Netlify)

A React + Netlify Functions app that connects to **Veeva Vault** and lists **approved (steady-state)** documents. Includes secure serverless proxy for authentication, VQL querying, file downloads, document indexing with AI summarization, and health checks.

## Prereqs
- Node 18+
- Netlify account
- Veeva Vault credentials (username/password)
- Neon database account (for document indexing)
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

# Neon Database Configuration (for document indexing)
DATABASE_URL=postgresql://username:password@hostname:5432/database

# OpenAI Configuration (for document summarization)
OPENAI_API_KEY=<your_openai_api_key>

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

## Document Indexing Features

- **Automatic Summarization**: Documents are processed through OpenAI to generate concise summaries.
- **Database Storage**: Document metadata and summaries stored in Neon PostgreSQL database.
- **Upsert Logic**: Existing documents are updated if their metadata changes, preserving existing summaries.
- **Version Tracking**: Captures document name, number, major/minor versions, and status.
- **Search & Filter**: Search indexed documents by name with pagination support.

## Document Chat Features

- **AI-Powered Q&A**: Ask questions about your indexed documents and get intelligent answers.
- **Document Selection**: Choose specific documents to chat with or let the AI find relevant documents automatically.
- **Context-Aware Responses**: AI uses document summaries and metadata to provide accurate, relevant answers.
- **Conversation History**: Maintains chat context throughout your session.
- **Smart Document Discovery**: Automatically finds relevant documents based on your questions.

## Database Setup

1. Create a Neon database account at [neon.tech](https://neon.tech).
2. Create a new PostgreSQL database.
3. Copy the connection string and set it as `DATABASE_URL` in your environment variables.
4. The database schema will be automatically created on first run (see `database-schema.sql` for reference).

## Deploy to Netlify

1. Create a new repo in GitHub.
2. Upload this project (or import zip below).
3. In Netlify, **New site from Git**, select your repo.
4. In **Build settings**, set the build command to `npm run build` and the publish directory to `dist`.
5. In **Environment variables**, add all the variables shown above (including `DATABASE_URL` and `OPENAI_API_KEY`).
6. Deploy. (Functions are under `netlify/functions/*` and are auto-built by Netlify.)

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
