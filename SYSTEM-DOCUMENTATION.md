# Veeva Approved Docs - Complete System Documentation

**Last Updated:** October 2025  
**Version:** 1.0  
**Maintained By:** Development Team

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [Core Features](#core-features)
4. [Implementation Guides](#implementation-guides)
5. [Troubleshooting & Fixes](#troubleshooting--fixes)
6. [Advanced Features](#advanced-features)
7. [Architecture & Technical Details](#architecture--technical-details)

---

## System Overview

### What is This System?

A React + Netlify Functions application that connects to **Veeva Vault** and provides:

- Secure serverless proxy for Veeva Vault authentication
- Document indexing with AI-powered summarization
- Intelligent document search and retrieval (RAG)
- Interactive chat interface powered by AI
- Workflow management for document generation (CAPAs, deviations, etc.)
- Admin dashboards for Q&A management and system monitoring

### Key Technologies

- **Frontend**: React 18, Vite, TailwindCSS
- **Backend**: Netlify Functions (serverless)
- **Database**: PostgreSQL with pgvector extension
- **AI Services**: OpenAI (GPT-4, embeddings), Groq (OSS models)
- **Storage**: Netlify Blobs for file storage
- **Authentication**: Auth0
- **Document Management**: Veeva Vault integration

---

## Getting Started

### Prerequisites

- Node 18+
- Netlify account
- Veeva Vault credentials (username/password)
- Neon database account (for document indexing)
- OpenAI API key (for document summarization)
- Auth0 account (for authentication)

### Quick Start (Local)

```bash
npm install
npm run dev
```

### Required Environment Variables

Create a `.env` file or set in Netlify UI:

```env
# Veeva Vault Configuration
VAULT_DOMAIN=y-prime-quality.veevavault.com
VAULT_API_VERSION=v25.2
VAULT_USERNAME=<your_vault_username>
VAULT_PASSWORD=<your_vault_password>

# Neon Database Configuration (for document indexing)
DATABASE_URL=postgresql://username:password@hostname:5432/database

# OpenAI Configuration (for document summarization)
OPENAI_API_KEY=<your_openai_api_key>

# OpenAI Fallback Control
DISABLE_OPENAI_FALLBACK=false

# Groq Configuration (for chat)
GROQ_API_KEY=<your_groq_api_key>

# Auth0 Configuration
VITE_AUTH0_DOMAIN=<your_auth0_domain>
VITE_AUTH0_CLIENT_ID=<your_auth0_client_id>

# Netlify Blobs Configuration
NETLIFY_BLOBS_SITE_ID=<your_site_id>
NETLIFY_BLOBS_TOKEN=<your_blob_token>
```

### Deploy to Netlify

1. Create a new repo in GitHub
2. Upload this project (or import zip)
3. In Netlify, **New site from Git**, select your repo
4. In **Build settings**, set build command to `npm run build` and publish directory to `dist`
5. In **Environment variables**, add all variables shown above
6. Deploy (Functions are under `netlify/functions/*` and are auto-built by Netlify)

---

## Core Features

### 1. Veeva Vault Integration

**Endpoints:**
- `GET /api/list-approved?limit=50&offset=0&name=foo` - List approved docs (VQL with STEADYSTATE())
- `GET /api/download-file?docId=####&major=1&minor=0` - Download versioned file
- `GET /api/health` - Connectivity check
- `GET /api/whoami` - Identify current Vault user
- `GET /api/readiness` - Chain of health checks

**Features:**
- Secure server-side authentication with session management
- VQL query optimization for approved/effective documents
- File download proxying through secure endpoints
- Health monitoring and readiness checks

### 2. Document Indexing with AI

**Endpoints:**
- `POST /api/index-documents?limit=100&name=foo` - Index Veeva documents with AI summaries
- `GET /api/get-indexed-documents?limit=50&offset=0&name=foo` - Retrieve indexed documents
- `POST /api/update-manual-summary` - Add user-defined summaries
- `POST /api/regenerate-document-summary?docId=###` - Regenerate AI summaries

**Features:**
- Automatic AI summarization using GPT-4
- Manual summary editor for user corrections
- Document chunking for semantic search (RAG)
- Vector embeddings stored in PostgreSQL
- Hybrid search combining AI and manual summaries

### 3. Intelligent Document Chat

**Endpoints:**
- `POST /api/chat-with-documents` - Chat with indexed documents using AI
- `POST /api/chat-sessions` - Manage chat session history
- `POST /api/qa-interactions` - Store Q&A interactions with feedback

**Features:**
- Context-aware responses using RAG (Retrieval-Augmented Generation)
- Document selection for focused queries
- Conversation history and context management
- Automatic document discovery based on questions
- User feedback system (thumbs up/down)

### 4. Workflow Management

**Endpoints:**
- `GET /api/workflow-management/templates` - List workflow templates
- `POST /api/workflow-management/templates` - Create workflow template
- `POST /api/workflow-execution/start` - Start workflow instance
- `POST /api/workflow-execution/submit-step` - Submit workflow step
- `POST /api/workflow-execution/complete` - Complete workflow
- `POST /api/workflow-execution/repolish-document` - Re-polish with AI

**Features:**
- AI-powered workflow detection in chat
- Step-by-step guided document creation
- Flexible input types (text, textarea, select, date, checkboxes, file upload)
- Validation rules (min/max length, patterns, required fields)
- Question grouping with AI synthesis
- AI document polishing and re-polishing
- Complete version history

### 5. Admin Features

**Admin Access:**
- Role-based access control with Auth0 roles
- Admin panel restricted to users with "admin" role
- Q&A Management dashboard
- Workflow History browser
- Indexing Logs monitoring
- User profile management

---

## Implementation Guides

### Admin Role-Based Access Control

#### How It Works

The system uses Auth0 roles to restrict access to admin features. Users with the "admin" role can:
- Access the admin panel
- View Q&A interactions
- Manage workflow templates
- Monitor system logs

**Custom Hook:** `src/hooks/useAdminRole.js`

```javascript
import { useAdminRole } from './hooks/useAdminRole';

function MyComponent() {
  const { isAdmin, isLoading, error, debugInfo } = useAdminRole();
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAdmin) return <div>Access Denied</div>;
  
  return <AdminPanel />;
}
```

**Auth0 Configuration Required:**
1. Create custom claim: `https://your-domain.com/roles`
2. Add role assignment to users
3. Configure Auth0 to include roles in tokens

See `ADMIN-ROLE-IMPLEMENTATION.md` for detailed setup instructions.

---

### Feedback System Setup

#### Overview

The thumbs up/down feedback system allows users to rate AI responses. The system tracks:
- User ratings (1 = like, -1 = dislike)
- Optional feedback notes
- Feedback submission timestamps

**Database Schema:**
```sql
ALTER TABLE qms_chat_qa_interactions 
ADD COLUMN user_rating INTEGER CHECK (user_rating IN (1, -1, NULL)),
ADD COLUMN feedback_notes TEXT,
ADD COLUMN feedback_submitted_at TIMESTAMP;

CREATE INDEX idx_qms_chat_qa_interactions_rating 
ON qms_chat_qa_interactions(user_rating);
```

**Features:**
- Thumbs up/down buttons in chat interface
- Rating display in Q&A Management
- Filter by rating (Liked, Disliked, No rating)
- Export feedback data
- Backward compatible

See `FEEDBACK-SYSTEM-SETUP.md` for complete setup guide.

---

### RAG (Retrieval-Augmented Generation) Implementation

#### How It Works

The system uses vector embeddings and semantic search to find relevant document chunks:

1. **Document Chunking**: Documents are split into ~512 token chunks with 50 token overlap
2. **Vector Embeddings**: Each chunk is embedded using OpenAI's ada-002 model (1536 dimensions)
3. **Semantic Search**: Queries are embedded and compared using cosine similarity
4. **Context Building**: Top 10 most relevant chunks are retrieved
5. **AI Response**: GPT-4 generates answers based on relevant chunks

**Database Schema:**
```sql
CREATE TABLE Veeva_Doc_Chat_document_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES Veeva_Doc_Chat_document_index(id) ON DELETE CASCADE,
  veeva_document_id VARCHAR(255) NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);
```

**Configuration:**
- Chunking: 512 tokens per chunk, 50 token overlap
- Search: Top 10 most relevant chunks
- Fallback: Keyword search if embeddings unavailable

See `RAG-IMPLEMENTATION.md` for complete technical details.

---

### Workflow Management

#### Creating a Workflow

1. **Create Template**
   - Name, Description, Category
   - Trigger Keywords (e.g., "capa", "deviation")
   - Document Template (with `{{variable}}` placeholders)

2. **Add Steps**
   - Step Order (1, 2, 3...)
   - Question Text
   - Input Type (text, textarea, select, date, etc.)
   - Validation Rules
   - Help Text

3. **Configure Grouping** (Optional)
   - Group ID (e.g., "root_cause_group")
   - Group Order (1, 2, 3...)
   - Mark last question in group
   - AI Synthesis Prompt
   - Output Variable Name

4. **Activate**
   - Check "Active" checkbox
   - Test in chat interface

**Input Types:**
- **Text Input**: Short, single-line responses
- **Text Area**: Long, multi-line descriptions
- **Dropdown/Select**: Single choice from options
- **Radio Buttons**: 2-5 visible options
- **Checkboxes**: Multiple selections
- **Date Picker**: Date selection
- **File Upload**: Attach supporting documents

**Validation Rules:**
```json
{
  "minLength": 50,
  "maxLength": 500,
  "pattern": "^[A-Z]{3}-\\d{4}$",
  "patternMessage": "Must be in format ABC-1234"
}
```

**Document Template Example:**
```
CAPA Document: {{title}}

Problem Description: {{problem_description}}
Root Cause: {{root_cause}}
Corrective Actions: {{corrective_actions}}
```

See `WORKFLOW-USER-GUIDE.md` for complete workflow documentation.

---

### Document Indexing with Logging

#### Features

The system tracks all document processing activities:
- Operation type (index, regenerate, force_regenerate, upload)
- Processing status (success, error, skipped, timeout)
- Processing duration
- Chunks created
- Summary generation status
- Batch IDs for grouping

**Database Table:** `qms_chat_indexing_logs`

**Admin Interface:**
- View indexing history
- Filter by operation type, status, date range
- View detailed logs for each document
- Export logs for analysis

See `INDEXING-LOGS-IMPLEMENTATION-SUMMARY.md` for details.

---

## Troubleshooting & Fixes

### PDF Extraction Fix

**Problem:** Error `ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'`

**Root Cause:** The `pdf-parse` library tries to access test files that don't exist in production.

**Solution Applied:**
1. **Patched pdf-parse library** - Disabled debug mode
2. **Created PDF extraction wrapper** with multiple fallback strategies
3. **Updated all extraction functions** to use wrapper

**Files Modified:**
- `patches/pdf-parse+1.1.1.patch` - Patch file
- `netlify/functions/pdf-extraction-wrapper.js` - Extraction wrapper
- All PDF extraction functions updated

See `PDF-EXTRACTION-COMPLETE-FIX.md` for details.

---

### Document Chunking Fixes

**Problem:** Error `function array_length(vector, integer) does not exist`

**Root Cause:** Incompatible pgvector function usage in chunk validation.

**Solution Applied:**
1. **Removed vector dimension validation** - Replaced with `embedding IS NOT NULL` checks
2. **Added comprehensive error handling** - Graceful fallback for missing tables
3. **Fixed table name inconsistencies** - Unified to use both chunk tables
4. **Standardized chunking parameters** - 512 tokens, 50 overlap across all functions

**Current Status:**
- ✅ All chunking functions standardized
- ✅ Vector storage working correctly
- ✅ Error handling added
- ✅ Both table types supported

See `CHUNKING-FIX-SUMMARY.md` and `CHUNKING-ISSUES-AND-FIXES.md` for details.

---

### Document Comparison Timeout Fix

**Problem:** Timeout errors when comparing documents due to large context sizes.

**Solution Applied:**
1. **Reduced chunk count** - 20 → 6 chunks for comparison queries
2. **Truncated chunk text** - 600 chars per chunk (comparison), 1500 (regular)
3. **Truncated summaries** - 300 chars per summary (comparison), 800 (regular)
4. **Limited keyword documents** - 10 → 2 for comparison queries
5. **Reduced attachment size** - 6000 → 3000 chars for comparison queries
6. **Increased max_tokens** - 4000 → 16000 for comparison responses
7. **Increased time budget** - Extra processing time for comparisons

**Impact:**
- ✅ Context size reduced from 33KB to ~6-10KB
- ✅ No more timeout errors
- ✅ Detailed comparison analysis supported
- ✅ Better performance and reliability

See `DOCUMENT-COMPARISON-TIMEOUT-FIX.md` for details.

---

## Advanced Features

### AI Document Polishing

**Feature:** Automatic AI-powered document polishing with re-polishing capability.

**Workflow:**
1. User completes workflow
2. AI generates initial document
3. AI polishes document (grammar, clarity, professionalism)
4. User edits polished document
5. User can re-polish with AI
6. Complete version history maintained

**Version History Structure:**
```javascript
[
  { version: 1, content: "Original...", polished: false, type: "original" },
  { version: 2, content: "AI polished...", polished: true, type: "ai_polished" },
  { version: 3, content: "User edited...", polished: false, type: "user_edited" },
  { version: 4, content: "AI re-polished...", polished: true, type: "ai_repolished" }
]
```

**API Endpoint:**
```
POST /api/workflow-execution/repolish-document
Body: { instanceId, editedDocument }
Response: { success, versions, currentVersion, polishedDocument, aiSuggestions }
```

See `AI-REPOLISH-IMPLEMENTATION-SUMMARY.md` for details.

---

### Question Grouping with AI Synthesis

**Feature:** Group related questions and have AI synthesize responses into cohesive paragraphs.

**Example Use Case:**
Group questions for root cause analysis:
1. "What was the immediate cause?"
2. "What contributing factors existed?"
3. "What systemic issues enabled this?"

AI synthesizes into: "The immediate cause was equipment calibration being overdue. Contributing factors included training gaps. This revealed a systemic issue: the absence of automated reminders."

**Configuration:**
- **Group ID**: Identifier linking questions (e.g., "root_cause_group")
- **Group Order**: Order within group (1, 2, 3...)
- **Last in Group**: Checkbox to trigger synthesis
- **Synthesis Prompt**: Instructions for AI on how to combine responses
- **Output Variable**: Template variable name for synthesized output

**Best Practices:**
- Group 2-5 related questions
- Use clear, specific synthesis prompts
- Test with realistic answers
- Keep group IDs descriptive

See `WORKFLOW-GROUPING-IMPLEMENTATION-SUMMARY.md` for details.

---

### Workflow History

**Feature:** Browse, search, filter, and view all completed workflow instances.

**Features:**
- Filter by workflow type, status, date range
- Text search across responses and documents
- Pagination (20 items per page)
- Detailed view with all responses
- Download generated documents
- Sort by date created

**UI Components:**
- Workflow type filter dropdown
- Status filter (All / Completed / In Progress / Abandoned)
- Date range pickers
- Search box
- Card-based list view
- Detailed modal view

See `WORKFLOW-HISTORY-IMPLEMENTATION-SUMMARY.md` for details.

---

## Architecture & Technical Details

### Database Schema

**Main Tables:**
- `Veeva_Doc_Chat_document_index` - Document metadata
- `Veeva_Doc_Chat_document_chunks` - Document chunks with embeddings
- `qms_chat_documents` - Uploaded documents
- `qms_chat_qa_interactions` - Q&A with feedback
- `qms_chat_workflow_templates` - Workflow definitions
- `qms_chat_workflow_steps` - Workflow steps/questions
- `qms_chat_workflow_instances` - Active workflow sessions
- `qms_chat_indexing_logs` - Indexing activity logs
- `blob_audit_log` - File upload audit trail

**Database Setup:**
1. Create Neon database account
2. Enable pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Schema auto-created on first run via `initDatabase()` in `db.js`

### File Structure

```
veeva-vault-integration/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom hooks (useAdminRole, etc.)
│   ├── utils/          # Utility functions
│   └── api.js          # API helper functions
├── netlify/
│   └── functions/      # Serverless functions
│       ├── db.js       # Database connection
│       ├── shared-utils.js        # Shared utilities
│       ├── text-extraction-utils.js   # Text extraction
│       ├── chunking-utils.js      # Chunking utilities
│       └── ... (other functions)
├── public/             # Static assets (Vite)
├── assets/             # Source assets (logos)
└── database-schema.sql # Reference schema
```

### Serverless Functions

**Core Functions:**
- `list-approved.js` - Veeva document listing
- `download-file.js` - File downloads
- `index-documents.js` - Document indexing with AI
- `chat-with-documents.js` - AI chat interface
- `workflow-management.js` - Workflow CRUD operations
- `workflow-execution.js` - Workflow execution logic
- `qa-interactions.js` - Q&A management with feedback

**Utility Functions:**
- `db.js` - Database connection pool
- `vault-auth.js` - Veeva authentication
- `chunking-utils.js` - Text chunking
- `shared-utils.js` - CORS, response builders
- `text-extraction-utils.js` - Unified text extraction

### Key Libraries

- **pdf-parse**: PDF text extraction (patched for production)
- **mammoth**: DOCX extraction
- **openai**: GPT-4 and embeddings
- **groq-sdk**: OSS model support
- **pg**: PostgreSQL client with pooling
- **@netlify/blobs**: File storage

---

## Additional Resources

### Documentation Files

This documentation combines:
- System overview (README.md)
- Admin role implementation
- Feedback system setup
- RAG implementation guide
- Workflow user guide
- AI re-polish documentation
- Question grouping documentation
- Workflow history documentation
- PDF extraction fixes
- Chunking fixes
- Comparison timeout fixes
- Indexing logs implementation

### Support

For issues or questions:
1. Check this documentation
2. Review implementation summaries for specific features
3. Check troubleshooting sections
4. Review codebase for examples

---

**Document Version:** 1.0  
**Last Updated:** October 2025  
**Maintained By:** Development Team

