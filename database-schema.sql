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

-- Table for storing uploaded documents (separate from Veeva documents)
CREATE TABLE IF NOT EXISTS Veeva_Doc_Chat_documents (
  id SERIAL PRIMARY KEY,
  document_name TEXT NOT NULL,
  document_type VARCHAR(255) DEFAULT 'uploaded_document',
  version VARCHAR(50) DEFAULT '1.0',
  content TEXT,
  ai_summary TEXT,
  file_size BIGINT,
  extraction_method VARCHAR(100),
  source_type VARCHAR(50) DEFAULT 'upload', -- 'upload', 'veeva', 'external'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for uploaded documents
CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_documents_name 
ON Veeva_Doc_Chat_documents(document_name);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_documents_type 
ON Veeva_Doc_Chat_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_documents_source_type 
ON Veeva_Doc_Chat_documents(source_type);

-- Table for storing external resources/links
CREATE TABLE IF NOT EXISTS external_resources (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category VARCHAR(100),
  tags TEXT[], -- Array of tags
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for external resources
CREATE INDEX IF NOT EXISTS idx_external_resources_title 
ON external_resources(title);

CREATE INDEX IF NOT EXISTS idx_external_resources_category 
ON external_resources(category);

CREATE INDEX IF NOT EXISTS idx_external_resources_url 
ON external_resources(url);

-- Update the document_chunks table to support both Veeva and uploaded documents
-- First, we need to make the document_id reference more flexible
-- We'll create a new table structure that can handle both types

-- Create a unified documents table that combines both Veeva and uploaded documents
CREATE TABLE IF NOT EXISTS Veeva_Doc_Chat_unified_documents (
  id SERIAL PRIMARY KEY,
  document_name TEXT NOT NULL,
  document_type VARCHAR(255),
  version VARCHAR(50),
  content TEXT,
  ai_summary TEXT,
  manual_summary TEXT,
  file_size BIGINT,
  extraction_method VARCHAR(100),
  source_type VARCHAR(50) NOT NULL, -- 'veeva', 'upload', 'external'
  veeva_document_id VARCHAR(255), -- Only for Veeva documents
  document_number VARCHAR(255), -- Only for Veeva documents
  major_version INTEGER, -- Only for Veeva documents
  minor_version INTEGER, -- Only for Veeva documents
  status VARCHAR(100), -- Only for Veeva documents
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for unified documents
CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_unified_documents_name 
ON Veeva_Doc_Chat_unified_documents(document_name);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_unified_documents_type 
ON Veeva_Doc_Chat_unified_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_unified_documents_source_type 
ON Veeva_Doc_Chat_unified_documents(source_type);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_unified_documents_veeva_id 
ON Veeva_Doc_Chat_unified_documents(veeva_document_id);

-- Update the document_chunks table to reference the unified documents table
-- Note: This is a breaking change, so we'll create a new table for chunks
CREATE TABLE IF NOT EXISTS Veeva_Doc_Chat_unified_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES Veeva_Doc_Chat_unified_documents(id) ON DELETE CASCADE,
  veeva_document_id VARCHAR(255), -- Keep for backward compatibility
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 produces 1536-dimensional embeddings
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

-- Create indexes for unified chunks
CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_unified_chunks_document_id 
ON Veeva_Doc_Chat_unified_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_unified_chunks_veeva_document_id 
ON Veeva_Doc_Chat_unified_chunks(veeva_document_id);

-- Sample data insertion (optional)
-- INSERT INTO Veeva_Doc_Chat_document_index (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary) 
-- VALUES ('sample-id', 'DOC-001', 'Sample Document', 1, 0, 'Standard Operating Procedure', 'STEADYSTATE', 'This is a sample document summary.');
