-- Migration to add document indexing/regeneration logging table
-- This table tracks all document indexing and regeneration activities

CREATE TABLE IF NOT EXISTS qms_chat_indexing_logs (
  id SERIAL PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL, -- 'index', 'regenerate', 'upload', 'force_regenerate'
  source_type VARCHAR(50) NOT NULL, -- 'veeva', 'upload', 'external'
  document_id INTEGER, -- References qms_chat_unified_documents(id) or Veeva_Doc_Chat_document_index(id)
  veeva_document_id VARCHAR(255), -- Veeva document ID for Veeva documents
  document_name TEXT NOT NULL,
  document_number VARCHAR(255), -- For Veeva documents
  document_type VARCHAR(255),
  version VARCHAR(50),
  status VARCHAR(50) NOT NULL, -- 'success', 'error', 'skipped', 'timeout'
  processing_duration_ms INTEGER, -- Time taken to process this document
  chunks_created INTEGER DEFAULT 0, -- Number of chunks created/updated
  summary_generated BOOLEAN DEFAULT false, -- Whether AI summary was generated
  error_message TEXT, -- Error details if status is 'error'
  batch_id VARCHAR(255), -- Groups documents processed in the same batch
  batch_offset INTEGER, -- Position in the batch
  user_id VARCHAR(255), -- User who triggered the operation
  session_id VARCHAR(255), -- Session identifier
  force_regenerate BOOLEAN DEFAULT false, -- Whether this was a forced regeneration
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_operation_type 
ON qms_chat_indexing_logs(operation_type);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_source_type 
ON qms_chat_indexing_logs(source_type);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_status 
ON qms_chat_indexing_logs(status);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_document_id 
ON qms_chat_indexing_logs(document_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_veeva_document_id 
ON qms_chat_indexing_logs(veeva_document_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_batch_id 
ON qms_chat_indexing_logs(batch_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_created_at 
ON qms_chat_indexing_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_qms_chat_indexing_logs_user_id 
ON qms_chat_indexing_logs(user_id);

-- Create a view for easy querying of recent indexing activities
CREATE OR REPLACE VIEW qms_chat_recent_indexing_activities AS
SELECT 
  id,
  operation_type,
  source_type,
  document_name,
  document_number,
  document_type,
  version,
  status,
  processing_duration_ms,
  chunks_created,
  summary_generated,
  error_message,
  batch_id,
  force_regenerate,
  created_at,
  CASE 
    WHEN processing_duration_ms < 1000 THEN processing_duration_ms || 'ms'
    WHEN processing_duration_ms < 60000 THEN ROUND(processing_duration_ms / 1000.0, 1) || 's'
    ELSE ROUND(processing_duration_ms / 60000.0, 1) || 'm'
  END as duration_display
FROM qms_chat_indexing_logs
ORDER BY created_at DESC;

-- Create a view for indexing statistics
CREATE OR REPLACE VIEW qms_chat_indexing_statistics AS
SELECT 
  DATE(created_at) as date,
  operation_type,
  source_type,
  status,
  COUNT(*) as document_count,
  AVG(processing_duration_ms) as avg_duration_ms,
  SUM(chunks_created) as total_chunks_created,
  SUM(CASE WHEN summary_generated THEN 1 ELSE 0 END) as summaries_generated
FROM qms_chat_indexing_logs
GROUP BY DATE(created_at), operation_type, source_type, status
ORDER BY date DESC, operation_type, source_type, status;

-- Add comments for documentation
COMMENT ON TABLE qms_chat_indexing_logs IS 'Logs all document indexing and regeneration activities';
COMMENT ON COLUMN qms_chat_indexing_logs.operation_type IS 'Type of operation: index, regenerate, upload, force_regenerate';
COMMENT ON COLUMN qms_chat_indexing_logs.source_type IS 'Source of document: veeva, upload, external';
COMMENT ON COLUMN qms_chat_indexing_logs.batch_id IS 'Groups documents processed in the same batch operation';
COMMENT ON COLUMN qms_chat_indexing_logs.force_regenerate IS 'Whether this was a forced regeneration (force=true)';
