-- Document Index Database Schema for Neon Database

CREATE TABLE IF NOT EXISTS document_index (
  id SERIAL PRIMARY KEY,
  veeva_document_id VARCHAR(255) UNIQUE NOT NULL,
  document_number VARCHAR(255) NOT NULL,
  document_name TEXT NOT NULL,
  major_version INTEGER NOT NULL,
  minor_version INTEGER NOT NULL,
  document_type VARCHAR(255),
  status VARCHAR(100),
  summary TEXT,
  manual_summary TEXT,
  indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_index_veeva_id 
ON document_index(veeva_document_id);

CREATE INDEX IF NOT EXISTS idx_document_index_number 
ON document_index(document_number);

CREATE INDEX IF NOT EXISTS idx_document_index_name 
ON document_index(document_name);

-- Sample data insertion (optional)
-- INSERT INTO document_index (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary) 
-- VALUES ('sample-id', 'DOC-001', 'Sample Document', 1, 0, 'Standard Operating Procedure', 'STEADYSTATE', 'This is a sample document summary.');
