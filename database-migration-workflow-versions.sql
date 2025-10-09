-- Migration: Add document version history support to workflow instances
-- This migration adds the ability to track multiple versions of workflow documents

-- Add document_versions column to qms_chat_workflow_instances table
ALTER TABLE qms_chat_workflow_instances 
ADD COLUMN IF NOT EXISTS document_versions JSONB DEFAULT '[]';

-- Create index for faster version queries
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_versions 
ON qms_chat_workflow_instances USING gin (document_versions);

-- Add comment to document the new column
COMMENT ON COLUMN qms_chat_workflow_instances.document_versions IS 
'Array of document versions storing version history. Each version contains: version number, content, polished flag, type (original/ai_polished/user_edited/ai_repolished), and created_at timestamp.';

-- Example version structure:
-- [
--   {
--     "version": 1,
--     "content": "Original generated document",
--     "polished": false,
--     "type": "original",
--     "created_at": "2025-10-09T15:30:00Z"
--   },
--   {
--     "version": 2,
--     "content": "AI polished version",
--     "polished": true,
--     "type": "ai_polished",
--     "created_at": "2025-10-09T15:30:15Z"
--   }
-- ]

-- Note: This migration is backward compatible
-- Existing workflow instances will have empty arrays for document_versions

