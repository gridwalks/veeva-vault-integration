-- Database Migration: Add Feedback System to Q&A Interactions
-- This migration adds user rating and feedback capabilities to the existing qms_chat_qa_interactions table

-- Add feedback columns to existing qms_chat_qa_interactions table
ALTER TABLE qms_chat_qa_interactions 
ADD COLUMN IF NOT EXISTS user_rating INTEGER CHECK (user_rating IN (1, -1, NULL)), -- 1=like, -1=dislike, NULL=no rating
ADD COLUMN IF NOT EXISTS feedback_notes TEXT, -- Optional text feedback
ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMP; -- When feedback was given

-- Add index for efficient feedback queries
CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_rating 
ON qms_chat_qa_interactions(user_rating);

-- Add index for feedback submission time
CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_feedback_submitted_at 
ON qms_chat_qa_interactions(feedback_submitted_at);

-- Add composite index for user feedback analytics
CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_user_rating_created 
ON qms_chat_qa_interactions(user_id, user_rating, created_at);

-- Update existing records to have NULL ratings (no change to existing data)
-- This is just for documentation - no actual update needed since new columns default to NULL

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'qms_chat_qa_interactions' 
  AND column_name IN ('user_rating', 'feedback_notes', 'feedback_submitted_at')
ORDER BY column_name;
