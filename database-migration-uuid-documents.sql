-- Migration: Convert qms_chat_documents and qms_chat_document_chunks to use UUID primary keys
-- This migration converts the existing SERIAL integer IDs to UUIDs to fix the attached document chat issue

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- First, add a temporary UUID column to qms_chat_documents
ALTER TABLE qms_chat_documents 
ADD COLUMN temp_uuid UUID DEFAULT gen_random_uuid();

-- Update the temp_uuid column with new UUIDs for existing records
UPDATE qms_chat_documents 
SET temp_uuid = gen_random_uuid() 
WHERE temp_uuid IS NULL;

-- Add a temporary UUID column to qms_chat_document_chunks
ALTER TABLE qms_chat_document_chunks 
ADD COLUMN temp_document_uuid UUID;

-- Update the temp_document_uuid column with corresponding UUIDs from qms_chat_documents
UPDATE qms_chat_document_chunks 
SET temp_document_uuid = qms_chat_documents.temp_uuid
FROM qms_chat_documents 
WHERE qms_chat_document_chunks.document_id = qms_chat_documents.id;

-- Drop the old foreign key constraint
ALTER TABLE qms_chat_document_chunks 
DROP CONSTRAINT IF EXISTS qms_chat_document_chunks_document_id_fkey;

-- Drop the old id column from qms_chat_documents
ALTER TABLE qms_chat_documents 
DROP COLUMN id;

-- Rename temp_uuid to id and make it the primary key
ALTER TABLE qms_chat_documents 
RENAME COLUMN temp_uuid TO id;

ALTER TABLE qms_chat_documents 
ADD PRIMARY KEY (id);

-- Drop the old document_id column from qms_chat_document_chunks
ALTER TABLE qms_chat_document_chunks 
DROP COLUMN document_id;

-- Rename temp_document_uuid to document_id
ALTER TABLE qms_chat_document_chunks 
RENAME COLUMN temp_document_uuid TO document_id;

-- Add the foreign key constraint back
ALTER TABLE qms_chat_document_chunks 
ADD CONSTRAINT qms_chat_document_chunks_document_id_fkey 
FOREIGN KEY (document_id) REFERENCES qms_chat_documents(id) ON DELETE CASCADE;

-- Update the index on document_id in qms_chat_document_chunks
DROP INDEX IF EXISTS idx_qms_chat_document_chunks_document_id;
CREATE INDEX IF NOT EXISTS idx_qms_chat_document_chunks_document_id 
ON qms_chat_document_chunks(document_id);

-- Update the composite index for user + document_id queries
DROP INDEX IF EXISTS idx_qms_chat_document_chunks_user_document;
CREATE INDEX IF NOT EXISTS idx_qms_chat_document_chunks_user_document 
ON qms_chat_document_chunks(user_id, document_id);

-- Verify the migration
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('qms_chat_documents', 'qms_chat_document_chunks')
    AND column_name IN ('id', 'document_id')
ORDER BY table_name, column_name;

-- Show sample data to verify the migration worked
SELECT 
    'qms_chat_documents' as table_name,
    COUNT(*) as record_count,
    'id' as column_name,
    data_type
FROM qms_chat_documents, information_schema.columns 
WHERE table_name = 'qms_chat_documents' AND column_name = 'id'
UNION ALL
SELECT 
    'qms_chat_document_chunks' as table_name,
    COUNT(*) as record_count,
    'document_id' as column_name,
    data_type
FROM qms_chat_document_chunks, information_schema.columns 
WHERE table_name = 'qms_chat_document_chunks' AND column_name = 'document_id';
