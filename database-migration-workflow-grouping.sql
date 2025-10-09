-- Migration: Add workflow question grouping support
-- This migration adds columns to enable grouping workflow steps for AI synthesis

-- Add group-related columns to qms_chat_workflow_steps table
ALTER TABLE qms_chat_workflow_steps 
ADD COLUMN IF NOT EXISTS group_id VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS group_order INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_last_in_group BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS group_synthesis_prompt TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS group_output_variable VARCHAR(100) DEFAULT NULL;

-- Create index for group_id to improve query performance
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_group_id 
ON qms_chat_workflow_steps(group_id) WHERE group_id IS NOT NULL;

-- Create index for finding last steps in groups efficiently
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_last_in_group 
ON qms_chat_workflow_steps(workflow_template_id, group_id, is_last_in_group) 
WHERE is_last_in_group = true;

-- Add comments to document the new columns
COMMENT ON COLUMN qms_chat_workflow_steps.group_id IS 'Optional identifier linking steps into a group (e.g., "root_cause_group"). NULL for ungrouped steps.';
COMMENT ON COLUMN qms_chat_workflow_steps.group_order IS 'Order within the group (for determining which is the last question). Only used if group_id is set.';
COMMENT ON COLUMN qms_chat_workflow_steps.is_last_in_group IS 'Flag indicating this is the final question in the group. When true, triggers AI synthesis.';
COMMENT ON COLUMN qms_chat_workflow_steps.group_synthesis_prompt IS 'Admin-configured AI prompt for synthesizing grouped responses. Only required for last step in group.';
COMMENT ON COLUMN qms_chat_workflow_steps.group_output_variable IS 'Template variable name for the synthesized output (e.g., "root_cause_analysis"). Only required for last step in group.';

-- Note: Backward compatibility is maintained as all new columns have NULL defaults
-- Existing ungrouped workflows will continue to work without any changes

