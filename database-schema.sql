-- Document Index Database Schema for Neon Database

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS Veeva_Doc_Chat_document_index (
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
CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_document_index_veeva_id 
ON Veeva_Doc_Chat_document_index(veeva_document_id);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_document_index_number 
ON Veeva_Doc_Chat_document_index(document_number);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_document_index_name 
ON Veeva_Doc_Chat_document_index(document_name);

-- Table for storing document chunks with embeddings for RAG
CREATE TABLE IF NOT EXISTS Veeva_Doc_Chat_document_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES Veeva_Doc_Chat_document_index(id) ON DELETE CASCADE,
  veeva_document_id VARCHAR(255) NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 produces 1536-dimensional embeddings
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

-- Create indexes for faster chunk retrieval and vector search
CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_chunks_document_id 
ON Veeva_Doc_Chat_document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_chunks_veeva_document_id 
ON Veeva_Doc_Chat_document_chunks(veeva_document_id);

-- Create IVFFLAT index for faster vector similarity search
-- Note: This index should be created after inserting data for better performance
-- CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_chunks_embedding 
-- ON Veeva_Doc_Chat_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Sample data insertion (optional)
-- INSERT INTO Veeva_Doc_Chat_document_index (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary) 
-- VALUES ('sample-id', 'DOC-001', 'Sample Document', 1, 0, 'Standard Operating Procedure', 'STEADYSTATE', 'This is a sample document summary.');
