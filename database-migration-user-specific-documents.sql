-- Database Migration: Add User-Specific Document Support
-- This migration adds user_id columns to uploaded document tables to support user-specific document isolation
-- Veeva documents remain globally accessible (no user_id column added)

-- Add user_id column to uploaded documents table
ALTER TABLE qms_chat_documents 
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);

-- Add user_id column to uploaded document chunks table
ALTER TABLE qms_chat_document_chunks 
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);

-- Add indexes for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_user_id 
ON qms_chat_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_document_chunks_user_id 
ON qms_chat_document_chunks(user_id);

-- Add composite index for user + source_type queries
CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_user_source 
ON qms_chat_documents(user_id, source_type);

-- Add composite index for user + document_id queries in chunks
CREATE INDEX IF NOT EXISTS idx_qms_chat_document_chunks_user_document 
ON qms_chat_document_chunks(user_id, document_id);

-- NOTE: Veeva tables (Veeva_Doc_Chat_document_index, Veeva_Doc_Chat_document_chunks)
-- remain UNCHANGED - no user_id column added, keeping them globally accessible

-- Optional: Add comments to document the purpose of these columns
COMMENT ON COLUMN qms_chat_documents.user_id IS 'User ID for uploaded documents - NULL for Veeva documents (globally accessible)';
COMMENT ON COLUMN qms_chat_document_chunks.user_id IS 'User ID for uploaded document chunks - NULL for Veeva document chunks (globally accessible)';

-- Verify the migration
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('qms_chat_documents', 'qms_chat_document_chunks')
    AND column_name = 'user_id'
ORDER BY table_name;
