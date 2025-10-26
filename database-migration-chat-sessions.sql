-- Migration: Add chat sessions table
-- Purpose: Store chat conversation history for retrieval and loading

CREATE TABLE IF NOT EXISTS qms_chat_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  session_name VARCHAR(500),
  conversation_history JSONB NOT NULL,
  document_metadata JSONB,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_user_id 
ON qms_chat_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_created_at 
ON qms_chat_sessions(created_at);

-- Comments
COMMENT ON TABLE qms_chat_sessions IS 'Stores chat conversation sessions for retrieval';
COMMENT ON COLUMN qms_chat_sessions.user_id IS 'Auth0 user identifier';
COMMENT ON COLUMN qms_chat_sessions.session_name IS 'Auto-generated or user-provided session name';
COMMENT ON COLUMN qms_chat_sessions.conversation_history IS 'Array of message objects with role and content';
COMMENT ON COLUMN qms_chat_sessions.document_metadata IS 'Selected documents, attached documents, uploaded blobs metadata';
COMMENT ON COLUMN qms_chat_sessions.message_count IS 'Number of messages in the session';
