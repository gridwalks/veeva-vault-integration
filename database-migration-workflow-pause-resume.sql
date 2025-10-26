-- Migration: Add workflow pause/resume functionality
-- This migration adds support for pausing workflows midstream and resuming them later

-- Add paused_at column to track when workflow was paused
ALTER TABLE qms_chat_workflow_instances 
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP;

-- Create index for paused workflows
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_paused 
ON qms_chat_workflow_instances(user_id, status) 
WHERE status = 'paused';

-- Add comment to clarify status values
COMMENT ON COLUMN qms_chat_workflow_instances.status IS 
'Workflow status: in_progress, paused, completed, cancelled';
