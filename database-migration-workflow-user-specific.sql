-- Migration: Add user-specific and public sharing capabilities to workflow instances
-- This migration adds columns to support user ownership and public sharing of workflow instances

-- Add public sharing and user tracking columns to workflow instances
ALTER TABLE qms_chat_workflow_instances 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS created_by_user_name VARCHAR(255);

-- Create index for public workflows (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_is_public 
ON qms_chat_workflow_instances(is_public) WHERE is_public = true;

-- Create composite index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_user_public 
ON qms_chat_workflow_instances(user_id, is_public);

-- Create index for creator name lookups
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_created_by_name 
ON qms_chat_workflow_instances(created_by_user_name);

-- Update existing records to have default values
-- Set created_by_user_name to 'Unknown User' for existing records without a creator name
UPDATE qms_chat_workflow_instances 
SET created_by_user_name = 'Unknown User' 
WHERE created_by_user_name IS NULL;

-- Ensure all existing workflows are private by default
UPDATE qms_chat_workflow_instances 
SET is_public = FALSE 
WHERE is_public IS NULL;
