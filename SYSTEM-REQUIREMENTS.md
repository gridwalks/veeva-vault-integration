# System Requirements Specification — Veeva Vault Integration

## 1. Purpose
This document defines the functional and non-functional requirements for the Veeva Vault Integration system. It is derived from the existing React + Netlify codebase and associated infrastructure and is intended to guide stakeholders, developers, and operators in understanding the system's capabilities and constraints.

## 2. System Overview
- **Architecture**: A React single-page application served via Netlify with supporting serverless functions that proxy Veeva Vault APIs, orchestrate document indexing, and facilitate AI-assisted workflows.
- **Core Integrations**: Auth0 for authentication, Veeva Vault for authoritative document content, Neon PostgreSQL for indexed metadata storage, Netlify Blob storage for chat uploads, and OpenAI through Groq inference cloud platform for summarization and Q&A.
- **Primary Experience**: An authenticated chat workspace with document-aware assistance, an administrative console for knowledge-base curation, and personal productivity utilities (My Notebook) that surface past workflows and chat sessions.

## 3. User Roles & Permissions
- **Authenticated User**: Must sign in via Auth0 before any application features are accessible.
- **Administrator**: Determined via Auth0 role claims; gains access to the admin console and management tabs. Non-admin users are blocked from admin views.
- **Workflow Owners**: Authenticated users who create workflow instances. Admins can view broader history; users can toggle visibility of their own workflows.

## 4. Functional Requirements
### 4.1 Authentication & Session Management
- FR-1: The system shall require Auth0 login before rendering application content.
- FR-2: The system shall enforce inactivity logout by invoking a shared logout handler for authenticated users.
- FR-3: Users shall be able to update their profile metadata, which is reflected within the active session state.

### 4.2 Document Discovery & Viewing
- FR-4: The system shall display an indexed document list with search, pagination, and download capabilities driven by serverless APIs.
- FR-5: Users shall open documents in a dedicated viewer pane capable of handling Veeva-hosted files, uploaded content, and workflow-generated artifacts with PDF conversion when required.

### 4.3 Conversational Assistance
- FR-6: The chat pane shall maintain a conversation history, support markdown rendering, and track token usage for interactions.【F:src/components/StaticChatPane.jsx†L1-L104】
- FR-7: Users shall attach indexed or uploaded documents to a chat session, triggering blob uploads via Netlify functions and optional purge automation.【F:src/components/StaticChatPane.jsx†L24-L200】【F:README.md†L95-L100】
- FR-8: The system shall persist chat sessions and allow users to reload them from My Notebook, including restoring conversation history and attachment metadata.【F:src/components/StaticChatPane.jsx†L118-L174】【F:src/components/MyNotebook.jsx†L1-L189】
- FR-9: Chat interactions shall be sent to backend APIs capable of generating AI-powered responses and recording QA feedback.【F:src/components/StaticChatPane.jsx†L1-L200】【F:src/api.js†L89-L199】

### 4.4 Document Uploads & Knowledge Base Expansion
- FR-10: Administrators shall upload documents via drag-and-drop or file selection, constrained to approved MIME types/extensions and recorded with associated metadata fields.【F:src/components/DocumentUpload.jsx†L18-L195】
- FR-11: Uploaded documents shall be retrievable, editable (metadata, manual and AI summaries), and removable through admin tooling.【F:src/components/DocumentUpload.jsx†L80-L195】
- FR-12: Indexing workflows shall process Veeva documents in batches with retry logic, capturing summary statistics and refreshing the indexed document view upon completion.【F:src/components/AdminScreen.jsx†L12-L146】

### 4.5 Workflow Orchestration
- FR-13: Administrators shall configure workflow templates, steps, and triggers via the workflow management tab.【F:src/components/AdminScreen.jsx†L200-L338】【F:src/components/WorkflowManagement.jsx†L1-L160】
- FR-14: Users shall view workflow history, filter results, toggle public visibility, resume suspended workflows, and delete obsolete instances from My Notebook.【F:src/components/MyNotebook.jsx†L1-L189】【F:src/components/WorkflowHistory.jsx†L1-L200】
- FR-15: Resuming a workflow shall signal the main application to load the relevant instance and focus the chat interface.【F:src/components/WorkflowHistory.jsx†L64-L103】【F:src/App.jsx†L77-L103】

### 4.6 Administrative Operations & Compliance
- FR-16: The admin console shall expose tabs for indexed documents, uploads, blob inventory, external resources, CFR Title 21 data, Q&A management, workflow management, and indexing logs.【F:src/components/AdminScreen.jsx†L12-L338】
- FR-17: The system shall retrieve CFR Title 21 compliance data and present it within the admin interface.【F:src/components/AdminScreen.jsx†L200-L276】【F:src/api.js†L131-L152】
- FR-18: Administrators shall monitor indexing operations via log retrieval and optional cleanup actions.【F:src/components/AdminScreen.jsx†L300-L338】【F:src/api.js†L154-L187】

### 4.7 Personal Productivity Tools
- FR-19: My Notebook shall provide tabbed access to workflow history and chat history, including keyboard shortcuts and modal accessibility behaviors.【F:src/components/MyNotebook.jsx†L23-L189】
- FR-20: Chat history entries shall be loadable into the active chat session through postMessage communication to the parent window.【F:src/components/MyNotebook.jsx†L8-L21】

## 5. Data Management Requirements
- DR-1: Environment configuration shall supply Vault credentials, database connection strings, Auth0 identifiers, and OpenAI keys for runtime operation.【F:README.md†L21-L43】
- DR-2: Indexed metadata and manual summaries shall persist in the Neon PostgreSQL database following the schema provided in `database-schema.sql`.【F:README.md†L78-L115】
- DR-3: Chat attachments shall be stored in Netlify Blob storage with automated retention cleanup and audit logging.【F:README.md†L95-L100】
- DR-4: Workflow and chat session metadata shall be retrievable via dedicated APIs for history and resumption features.【F:src/components/StaticChatPane.jsx†L118-L174】【F:src/components/WorkflowHistory.jsx†L1-L200】

## 6. External Interface Requirements
- IR-1: The system shall expose serverless API endpoints for document listing, downloading, health checks, indexing, chat, and manual summary maintenance as documented in the README.【F:README.md†L45-L93】
- IR-2: Frontend modules shall call the shared `api.js` utilities to interact with Netlify functions, leveraging common logging and error handling patterns.【F:src/api.js†L1-L199】
- IR-3: Blob storage operations shall be accessible via Netlify function endpoints for upload, delete, and scheduled cleanup tasks.【F:README.md†L95-L100】【F:src/components/StaticChatPane.jsx†L177-L199】

## 7. Non-Functional Requirements
- NFR-1 (Security): Authentication and role-based authorization shall gate all sensitive screens, with admin-only capabilities restricted via Auth0 role inspection.【F:src/hooks/useAdminRole.js†L1-L71】【F:src/App.jsx†L138-L235】
- NFR-2 (Reliability): Indexing operations shall include retry with exponential backoff to mitigate transient failures.【F:src/components/AdminScreen.jsx†L40-L126】
- NFR-3 (Performance): Batch sizing for indexing and token estimation for chat shall balance responsiveness with resource limits.【F:src/components/AdminScreen.jsx†L40-L126】【F:src/components/StaticChatPane.jsx†L9-L104】
- NFR-4 (Usability): Modal interactions (My Notebook) shall manage focus, keyboard escape handling, and prevent background scrolling to maintain accessibility.【F:src/components/MyNotebook.jsx†L23-L189】
- NFR-5 (Maintainability): Centralized API wrappers shall provide consistent error logging and diagnostics across network calls.【F:src/api.js†L1-L199】
- NFR-6 (Compliance): The system shall support CFR Title 21 reporting and workflow audit history for regulated environments.【F:src/components/AdminScreen.jsx†L200-L276】【F:src/components/WorkflowHistory.jsx†L1-L200】

## 8. Operational Considerations
- OC-1: Deployment assumes Netlify build pipelines with `npm run build` and environment variable management in site settings.【F:README.md†L117-L124】
- OC-2: Scheduled maintenance tasks (blob cleanup) shall be configured via Netlify cron triggers as described in the README.【F:README.md†L95-L100】
- OC-3: Local development requires Node 18+, Netlify CLI (optional), and configured `.env` files mirroring production secrets.【F:README.md†L7-L43】

## 9. Assumptions & Dependencies
- The system relies on Veeva Vault availability and credentials for document retrieval and indexing operations.【F:README.md†L1-L70】
- AI features depend on a valid OpenAI API key and associated service quotas.【F:README.md†L29-L108】
- Role information is supplied in Auth0-issued tokens following the namespaces inspected by `useAdminRole`.【F:src/hooks/useAdminRole.js†L12-L71】

## 10. Open Issues & Future Enhancements
- Document repolishing and version history editing in the viewer require backend endpoints to persist changes beyond the current session.【F:src/components/SelectedDocumentViewer.jsx†L1-L120】
- Enhanced auditing for workflow resume/delete actions may require additional server-side logging not visible in the current frontend code.【F:src/components/WorkflowHistory.jsx†L64-L135】
- The system may benefit from improved error feedback for chat session loading and document upload failures to guide remediation steps.【F:src/components/StaticChatPane.jsx†L118-L174】【F:src/components/DocumentUpload.jsx†L80-L195】
