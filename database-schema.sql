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
CREATE TABLE IF NOT EXISTS qms_chat_documents (
  id SERIAL PRIMARY KEY,
  document_name TEXT NOT NULL,
  safe_file_name TEXT,
  document_type VARCHAR(255) DEFAULT 'uploaded_document',
  version VARCHAR(50) DEFAULT '1.0',
  content TEXT,
  ai_summary TEXT,
  manual_summary TEXT,
  file_size BIGINT,
  extraction_method VARCHAR(100),
  source_type VARCHAR(50) DEFAULT 'upload', -- 'upload', 'veeva', 'external'
  blob_url TEXT, -- URL to the file stored in Netlify Blob
  original_filename TEXT, -- Original filename when uploaded
  mime_type VARCHAR(255), -- MIME type of the original file
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for uploaded documents
CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_name 
ON qms_chat_documents(document_name);

CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_type 
ON qms_chat_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_source_type 
ON qms_chat_documents(source_type);

-- Table for storing external resources/links
CREATE TABLE IF NOT EXISTS qms_chat_external_resources (
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
CREATE INDEX IF NOT EXISTS idx_qms_chat_external_resources_title 
ON qms_chat_external_resources(title);

CREATE INDEX IF NOT EXISTS idx_qms_chat_external_resources_category 
ON qms_chat_external_resources(category);

CREATE INDEX IF NOT EXISTS idx_qms_chat_external_resources_url 
ON qms_chat_external_resources(url);

-- Update the document_chunks table to support both Veeva and uploaded documents
-- First, we need to make the document_id reference more flexible
-- We'll create a new table structure that can handle both types

-- Create a unified documents table that combines both Veeva and uploaded documents
CREATE TABLE IF NOT EXISTS qms_chat_unified_documents (
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
CREATE INDEX IF NOT EXISTS idx_qms_chat_unified_documents_name 
ON qms_chat_unified_documents(document_name);

CREATE INDEX IF NOT EXISTS idx_qms_chat_unified_documents_type 
ON qms_chat_unified_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_qms_chat_unified_documents_source_type 
ON qms_chat_unified_documents(source_type);

CREATE INDEX IF NOT EXISTS idx_qms_chat_unified_documents_veeva_id 
ON qms_chat_unified_documents(veeva_document_id);

-- Update the document_chunks table to reference the unified documents table
-- Note: This is a breaking change, so we'll create a new table for chunks
CREATE TABLE IF NOT EXISTS qms_chat_unified_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES qms_chat_unified_documents(id) ON DELETE CASCADE,
  veeva_document_id VARCHAR(255), -- Keep for backward compatibility
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 produces 1536-dimensional embeddings
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

-- Create indexes for unified chunks
CREATE INDEX IF NOT EXISTS idx_qms_chat_unified_chunks_document_id 
ON qms_chat_unified_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_unified_chunks_veeva_document_id 
ON qms_chat_unified_chunks(veeva_document_id);

-- Table for storing Q&A interactions
CREATE TABLE IF NOT EXISTS qms_chat_qa_interactions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  document_ids TEXT[], -- Array of document IDs that were used to answer the question
  document_names TEXT[], -- Array of document names for easier reference
  user_id VARCHAR(255), -- Optional user identifier
  session_id VARCHAR(255), -- Optional session identifier
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for Q&A interactions
CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_created_at 
ON qms_chat_qa_interactions(created_at);

CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_user_id 
ON qms_chat_qa_interactions(user_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_session_id 
ON qms_chat_qa_interactions(session_id);

-- Table for storing chat sessions
CREATE TABLE IF NOT EXISTS qms_chat_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  session_name VARCHAR(500),
  conversation_history JSONB NOT NULL,
  document_metadata JSONB,
  message_count INTEGER DEFAULT 0,
  study_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for chat sessions
CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_user_id 
ON qms_chat_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_created_at 
ON qms_chat_sessions(created_at);

-- Workflow Configuration Tables

-- Table for workflow templates (CAPA, Deviations, Change Control, etc.)
CREATE TABLE IF NOT EXISTS qms_chat_workflow_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'Quality',
  is_active BOOLEAN DEFAULT true,
  trigger_keywords TEXT[], -- Keywords that trigger this workflow in chat
  document_template TEXT, -- Template for generating final documents
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for workflow templates
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_templates_name 
ON qms_chat_workflow_templates(name);

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_templates_category 
ON qms_chat_workflow_templates(category);

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_templates_is_active 
ON qms_chat_workflow_templates(is_active);

-- Table for workflow steps/questions
CREATE TABLE IF NOT EXISTS qms_chat_workflow_steps (
  id SERIAL PRIMARY KEY,
  workflow_template_id INTEGER NOT NULL REFERENCES qms_chat_workflow_templates(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  input_type VARCHAR(50) NOT NULL, -- 'text', 'textarea', 'select', 'date', 'file', 'checkbox', 'radio'
  options JSONB, -- For select, radio, checkbox options
  validation_rules JSONB, -- Required, min/max length, regex, etc.
  conditional_logic JSONB, -- Show/hide based on previous answers
  is_required BOOLEAN DEFAULT false,
  placeholder_text TEXT,
  help_text TEXT,
  -- Question grouping fields for AI synthesis
  group_id VARCHAR(100) DEFAULT NULL, -- Optional identifier linking steps into a group
  group_order INTEGER DEFAULT NULL, -- Order within the group
  is_last_in_group BOOLEAN DEFAULT false, -- Flag indicating this is the final question in the group
  group_synthesis_prompt TEXT DEFAULT NULL, -- AI prompt for synthesizing grouped responses
  group_output_variable VARCHAR(100) DEFAULT NULL, -- Template variable name for synthesized output
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for workflow steps
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_template_id 
ON qms_chat_workflow_steps(workflow_template_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_order 
ON qms_chat_workflow_steps(workflow_template_id, step_order);

-- Indexes for workflow question grouping
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_group_id 
ON qms_chat_workflow_steps(group_id) WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_last_in_group 
ON qms_chat_workflow_steps(workflow_template_id, group_id, is_last_in_group) 
WHERE is_last_in_group = true;

-- Table for storing workflow instances (user sessions)
CREATE TABLE IF NOT EXISTS qms_chat_workflow_instances (
  id SERIAL PRIMARY KEY,
  workflow_template_id INTEGER NOT NULL REFERENCES qms_chat_workflow_templates(id),
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  current_step INTEGER DEFAULT 1,
  responses JSONB, -- Store all user responses
  generated_document TEXT, -- Final generated document (current version)
  document_versions JSONB DEFAULT '[]', -- Version history array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Create indexes for workflow instances
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_template_id 
ON qms_chat_workflow_instances(workflow_template_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_user_id 
ON qms_chat_workflow_instances(user_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_session_id 
ON qms_chat_workflow_instances(session_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_status 
ON qms_chat_workflow_instances(status);

-- Index for document version history (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_versions 
ON qms_chat_workflow_instances USING gin (document_versions);

-- Table for storing document comparison history
CREATE TABLE IF NOT EXISTS qms_chat_document_comparisons (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  document_ids TEXT[], -- Array of document IDs being compared
  comparison_query TEXT, -- User's question
  comparison_result TEXT, -- AI's comparison output
  comparison_metadata JSONB, -- Structured comparison data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for document comparisons
CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_user_id 
ON qms_chat_document_comparisons(user_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_session_id 
ON qms_chat_document_comparisons(session_id);

CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_created_at 
ON qms_chat_document_comparisons(created_at);

-- Index for document IDs array (GIN index for array operations)
CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_document_ids 
ON qms_chat_document_comparisons USING gin (document_ids);

-- Insert sample CAPA workflow template
INSERT INTO qms_chat_workflow_templates (name, description, category, trigger_keywords, document_template) VALUES 
('CAPA Workflow', 'Corrective and Preventive Action workflow for addressing nonconformities', 'Quality', 
 ARRAY['capa', 'corrective action', 'preventive action', 'nonconformity', 'deviation', 'issue'],
 'CAPA Document Template: {{title}}\n\nProblem Description: {{problem_description}}\n\nRoot Cause: {{root_cause}}\n\nCorrective Actions: {{corrective_actions}}\n\nPreventive Actions: {{preventive_actions}}\n\nResponsible Person: {{responsible_person}}\n\nTarget Date: {{target_date}}\n\nEffectiveness Measures: {{effectiveness_measures}}')
ON CONFLICT DO NOTHING;

-- Insert sample CAPA workflow steps
INSERT INTO qms_chat_workflow_steps (workflow_template_id, step_order, question_text, input_type, is_required, placeholder_text, help_text) VALUES 
(1, 1, 'What type of CAPA are you creating?', 'select', true, NULL, 'Select whether this is a corrective action, preventive action, or both'),
(1, 2, 'Please provide a brief title for this CAPA', 'text', true, 'e.g., Equipment Calibration Deviation', 'A concise title that describes the issue'),
(1, 3, 'Describe the problem or nonconformity in detail', 'textarea', true, 'Provide a detailed description of what happened, when, where, and who was involved', 'Include all relevant facts and observations'),
(1, 4, 'What was the root cause of this issue?', 'textarea', true, 'Describe the underlying cause(s) that led to this problem', 'Focus on the fundamental reason, not just symptoms'),
(1, 5, 'Who or what was impacted by this issue?', 'checkbox', true, NULL, 'Select all that apply'),
(1, 6, 'What immediate corrective actions were taken?', 'textarea', true, 'Describe actions taken to address the immediate problem', 'Include containment measures and immediate fixes'),
(1, 7, 'What preventive measures will be implemented?', 'textarea', true, 'Describe actions to prevent recurrence', 'Focus on systemic improvements and process changes'),
(1, 8, 'Who will be responsible for implementing these actions?', 'text', true, 'Name or role of the responsible person', 'Include contact information if available'),
(1, 9, 'What is the target completion date?', 'date', true, NULL, 'When should all actions be completed?'),
(1, 10, 'How will effectiveness be measured?', 'textarea', true, 'Describe how you will verify that the actions are working', 'Include specific metrics, timelines, and review processes')
ON CONFLICT DO NOTHING;

-- Update the options for specific steps
UPDATE qms_chat_workflow_steps 
SET options = '{"choices": ["Corrective Action", "Preventive Action", "Both"]}'::jsonb
WHERE step_order = 1 AND workflow_template_id = 1;

UPDATE qms_chat_workflow_steps 
SET options = '{"choices": ["Patients", "Processes", "Products", "Regulatory", "Staff", "Equipment", "Other"]}'::jsonb
WHERE step_order = 5 AND workflow_template_id = 1;

-- Add validation rules
UPDATE qms_chat_workflow_steps 
SET validation_rules = '{"minLength": 10, "maxLength": 200}'::jsonb
WHERE step_order = 2 AND workflow_template_id = 1;

UPDATE qms_chat_workflow_steps 
SET validation_rules = '{"minLength": 50, "maxLength": 2000}'::jsonb
WHERE step_order = 3 AND workflow_template_id = 1;

UPDATE qms_chat_workflow_steps 
SET validation_rules = '{"minLength": 20, "maxLength": 1000}'::jsonb
WHERE step_order = 4 AND workflow_template_id = 1;

UPDATE qms_chat_workflow_steps 
SET validation_rules = '{"minLength": 20, "maxLength": 1000}'::jsonb
WHERE step_order = 6 AND workflow_template_id = 1;

UPDATE qms_chat_workflow_steps 
SET validation_rules = '{"minLength": 20, "maxLength": 1000}'::jsonb
WHERE step_order = 7 AND workflow_template_id = 1;

UPDATE qms_chat_workflow_steps 
SET validation_rules = '{"minLength": 20, "maxLength": 1000}'::jsonb
WHERE step_order = 10 AND workflow_template_id = 1;

-- CFR Title 21 Regulations Tables

-- Table for storing CFR Title 21 regulations (subchapters and parts)
CREATE TABLE IF NOT EXISTS cfr_title21_regulations (
  id SERIAL PRIMARY KEY,
  regulation_id VARCHAR(255) UNIQUE NOT NULL, -- e.g., "subchapter-A" or "part-11"
  regulation_type VARCHAR(50) NOT NULL, -- 'subchapter' or 'part'
  title TEXT NOT NULL,
  granule_id VARCHAR(255),
  chapter_id VARCHAR(255),
  subchapter_id VARCHAR(255), -- NULL for parts that are direct children of chapters
  html_link TEXT,
  details_link TEXT,
  full_text TEXT, -- extracted regulation content
  ai_summary TEXT,
  extraction_method VARCHAR(100),
  source_date VARCHAR(255), -- date/version from eCFR source to track changes
  indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for CFR regulations
CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_regulation_id 
ON cfr_title21_regulations(regulation_id);

CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_regulation_type 
ON cfr_title21_regulations(regulation_type);

CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_chapter_id 
ON cfr_title21_regulations(chapter_id);

CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_subchapter_id 
ON cfr_title21_regulations(subchapter_id);

-- Table for storing CFR regulation chunks with embeddings for RAG
CREATE TABLE IF NOT EXISTS cfr_title21_regulation_chunks (
  id SERIAL PRIMARY KEY,
  regulation_id INTEGER NOT NULL REFERENCES cfr_title21_regulations(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 produces 1536-dimensional embeddings
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(regulation_id, chunk_index)
);

-- Create indexes for CFR regulation chunks
CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulation_chunks_regulation_id 
ON cfr_title21_regulation_chunks(regulation_id);

-- Create IVFFLAT index for faster vector similarity search
-- Note: This index should be created after inserting data for better performance
-- CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulation_chunks_embedding 
-- ON cfr_title21_regulation_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Web Resources Tables for Title 21 Regulation Information

-- Table for storing scraped web content related to Title 21 regulations
CREATE TABLE IF NOT EXISTS cfr_title21_web_resources (
  id SERIAL PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source_type VARCHAR(50), -- 'fda_guidance', 'industry_resource', 'regulatory_news', etc.
  domain VARCHAR(255), -- e.g., 'fda.gov', 'pharma.org'
  full_text TEXT, -- scraped content
  ai_summary TEXT,
  extraction_method VARCHAR(100),
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_checked_at TIMESTAMP, -- for re-scraping
  status VARCHAR(50) DEFAULT 'active' -- 'active', 'archived', 'error'
);

-- Create indexes for web resources
CREATE INDEX IF NOT EXISTS idx_web_resources_source_url 
ON cfr_title21_web_resources(source_url);

CREATE INDEX IF NOT EXISTS idx_web_resources_source_type 
ON cfr_title21_web_resources(source_type);

-- Pharmaceutical Practices Tables

-- Table for storing pharmaceutical practices (GCP, GMP, GLP, GDP, etc.)
CREATE TABLE IF NOT EXISTS pharmaceutical_practices (
  id SERIAL PRIMARY KEY,
  practice_code VARCHAR(10) UNIQUE NOT NULL, -- e.g., 'GCP', 'GMP', 'GLP', 'GDP'
  practice_name VARCHAR(255) NOT NULL, -- e.g., 'Good Clinical Practices'
  description TEXT, -- Full description of the practice
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for pharmaceutical practices
CREATE INDEX IF NOT EXISTS idx_pharmaceutical_practices_practice_code 
ON pharmaceutical_practices(practice_code);

-- Table for storing practice-regulation associations (many-to-many)
CREATE TABLE IF NOT EXISTS practice_regulation_associations (
  id SERIAL PRIMARY KEY,
  practice_id INTEGER NOT NULL REFERENCES pharmaceutical_practices(id) ON DELETE CASCADE,
  regulation_id INTEGER NOT NULL REFERENCES cfr_title21_regulations(id) ON DELETE CASCADE,
  association_type VARCHAR(50) DEFAULT 'primary', -- 'primary', 'secondary', 'related'
  notes TEXT, -- Optional notes about the association
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(practice_id, regulation_id)
);

-- Create indexes for practice-regulation associations
CREATE INDEX IF NOT EXISTS idx_practice_regulation_associations_practice_id 
ON practice_regulation_associations(practice_id);

CREATE INDEX IF NOT EXISTS idx_practice_regulation_associations_regulation_id 
ON practice_regulation_associations(regulation_id);

-- Seed initial pharmaceutical practices
INSERT INTO pharmaceutical_practices (practice_code, practice_name, description) VALUES
  ('GCP', 'Good Clinical Practices', 'Standards for the design, conduct, performance, monitoring, auditing, recording, analyses, and reporting of clinical trials that involve the participation of human subjects.'),
  ('GMP', 'Good Manufacturing Practices', 'Regulations that require manufacturers, processors, and packagers of drugs, medical devices, and certain types of food and blood to take proactive steps to ensure that their products are safe, pure, and effective.'),
  ('GLP', 'Good Laboratory Practices', 'Regulations that ensure the quality and integrity of nonclinical laboratory studies that support research or marketing permits for products regulated by the FDA.'),
  ('GDP', 'Good Distribution Practices', 'Guidelines for the proper distribution of medicinal products for human use to ensure that the quality and integrity of medicines is maintained throughout the supply chain.')
ON CONFLICT (practice_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_web_resources_domain 
ON cfr_title21_web_resources(domain);

CREATE INDEX IF NOT EXISTS idx_web_resources_status 
ON cfr_title21_web_resources(status);

-- Table for storing web resource chunks with embeddings for RAG
CREATE TABLE IF NOT EXISTS cfr_title21_web_resource_chunks (
  id SERIAL PRIMARY KEY,
  web_resource_id INTEGER NOT NULL REFERENCES cfr_title21_web_resources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 produces 1536-dimensional embeddings
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(web_resource_id, chunk_index)
);

-- Create indexes for web resource chunks
CREATE INDEX IF NOT EXISTS idx_web_resource_chunks_web_resource_id 
ON cfr_title21_web_resource_chunks(web_resource_id);

-- Junction table for linking web resources to regulations (many-to-many)
CREATE TABLE IF NOT EXISTS cfr_title21_web_resource_links (
  id SERIAL PRIMARY KEY,
  web_resource_id INTEGER NOT NULL REFERENCES cfr_title21_web_resources(id) ON DELETE CASCADE,
  regulation_id INTEGER NOT NULL REFERENCES cfr_title21_regulations(id) ON DELETE CASCADE,
  link_type VARCHAR(50), -- 'direct_reference', 'related_topic', 'guidance_for', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(web_resource_id, regulation_id)
);

-- Create indexes for web resource links
CREATE INDEX IF NOT EXISTS idx_web_resource_links_web_resource_id 
ON cfr_title21_web_resource_links(web_resource_id);

CREATE INDEX IF NOT EXISTS idx_web_resource_links_regulation_id 
ON cfr_title21_web_resource_links(regulation_id);

-- Sample data insertion (optional)
-- INSERT INTO Veeva_Doc_Chat_document_index (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary) 
-- VALUES ('sample-id', 'DOC-001', 'Sample Document', 1, 0, 'Standard Operating Procedure', 'STEADYSTATE', 'This is a sample document summary.');

-- ============================================================================
-- GxP Educational Platform Tables
-- ============================================================================

-- Table for storing courses
CREATE TABLE IF NOT EXISTS gxp_courses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- e.g., 'Regulatory Compliance', 'Document Management', 'Workflow Practices'
  difficulty VARCHAR(50) DEFAULT 'beginner', -- 'beginner', 'intermediate', 'advanced'
  estimated_hours DECIMAL(5,2), -- Estimated time to complete in hours
  instructor_id VARCHAR(255), -- Auth0 user ID of the instructor
  is_published BOOLEAN DEFAULT false, -- Only published courses are visible to students
  thumbnail_url TEXT, -- Optional course thumbnail image URL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for courses
CREATE INDEX IF NOT EXISTS idx_gxp_courses_category 
ON gxp_courses(category);

CREATE INDEX IF NOT EXISTS idx_gxp_courses_difficulty 
ON gxp_courses(difficulty);

CREATE INDEX IF NOT EXISTS idx_gxp_courses_instructor_id 
ON gxp_courses(instructor_id);

CREATE INDEX IF NOT EXISTS idx_gxp_courses_is_published 
ON gxp_courses(is_published);

-- Table for storing learning paths (structured sequences of courses)
CREATE TABLE IF NOT EXISTS gxp_learning_paths (
  id SERIAL PRIMARY KEY,
  path_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  course_ids INTEGER[], -- Array of course IDs in order
  estimated_total_hours DECIMAL(5,2),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for learning paths
CREATE INDEX IF NOT EXISTS idx_gxp_learning_paths_category 
ON gxp_learning_paths(category);

CREATE INDEX IF NOT EXISTS idx_gxp_learning_paths_is_published 
ON gxp_learning_paths(is_published);

-- Table for storing course modules
CREATE TABLE IF NOT EXISTS gxp_modules (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES gxp_courses(id) ON DELETE CASCADE,
  module_order INTEGER NOT NULL, -- Order within the course
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(course_id, module_order)
);

-- Create indexes for modules
CREATE INDEX IF NOT EXISTS idx_gxp_modules_course_id 
ON gxp_modules(course_id);

CREATE INDEX IF NOT EXISTS idx_gxp_modules_course_order 
ON gxp_modules(course_id, module_order);

-- Table for storing lessons within modules
CREATE TABLE IF NOT EXISTS gxp_lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES gxp_modules(id) ON DELETE CASCADE,
  lesson_order INTEGER NOT NULL, -- Order within the module
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content_type VARCHAR(50) DEFAULT 'text', -- 'text', 'video', 'interactive', 'document', 'assessment'
  content_data JSONB, -- Flexible content storage (varies by content_type)
  estimated_minutes INTEGER, -- Estimated time to complete in minutes
  cfr_regulation_id INTEGER REFERENCES cfr_title21_regulations(id) ON DELETE SET NULL, -- Link to CFR regulation if applicable
  document_id INTEGER REFERENCES Veeva_Doc_Chat_document_index(id) ON DELETE SET NULL, -- Link to indexed document if applicable
  workflow_template_id INTEGER REFERENCES qms_chat_workflow_templates(id) ON DELETE SET NULL, -- Link to workflow exercise if applicable
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(module_id, lesson_order)
);

-- Create indexes for lessons
CREATE INDEX IF NOT EXISTS idx_gxp_lessons_module_id 
ON gxp_lessons(module_id);

CREATE INDEX IF NOT EXISTS idx_gxp_lessons_module_order 
ON gxp_lessons(module_id, lesson_order);

CREATE INDEX IF NOT EXISTS idx_gxp_lessons_content_type 
ON gxp_lessons(content_type);

CREATE INDEX IF NOT EXISTS idx_gxp_lessons_cfr_regulation_id 
ON gxp_lessons(cfr_regulation_id);

CREATE INDEX IF NOT EXISTS idx_gxp_lessons_document_id 
ON gxp_lessons(document_id);

CREATE INDEX IF NOT EXISTS idx_gxp_lessons_workflow_template_id 
ON gxp_lessons(workflow_template_id);

-- Table for storing lesson content (rich content storage)
CREATE TABLE IF NOT EXISTS gxp_lesson_content (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES gxp_lessons(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- 'text', 'markdown', 'video', 'interactive', 'document', 'assessment'
  content_json JSONB NOT NULL, -- Structured content data
  content_order INTEGER DEFAULT 1, -- Order of content blocks within lesson
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for lesson content
CREATE INDEX IF NOT EXISTS idx_gxp_lesson_content_lesson_id 
ON gxp_lesson_content(lesson_id);

CREATE INDEX IF NOT EXISTS idx_gxp_lesson_content_lesson_order 
ON gxp_lesson_content(lesson_id, content_order);

CREATE INDEX IF NOT EXISTS idx_gxp_lesson_content_type 
ON gxp_lesson_content(content_type);

-- Table for storing assessments (quizzes/tests)
CREATE TABLE IF NOT EXISTS gxp_assessments (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER REFERENCES gxp_lessons(id) ON DELETE CASCADE, -- Optional: assessment can be standalone or part of lesson
  title VARCHAR(255) NOT NULL,
  description TEXT,
  questions_json JSONB NOT NULL, -- Array of question objects
  passing_score DECIMAL(5,2) DEFAULT 70.00, -- Percentage required to pass
  time_limit_minutes INTEGER, -- Optional time limit
  max_attempts INTEGER DEFAULT 3, -- Maximum number of attempts allowed
  shuffle_questions BOOLEAN DEFAULT false, -- Whether to randomize question order
  show_correct_answers BOOLEAN DEFAULT true, -- Whether to show correct answers after submission
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for assessments
CREATE INDEX IF NOT EXISTS idx_gxp_assessments_lesson_id 
ON gxp_assessments(lesson_id);

-- Table for storing student progress
CREATE TABLE IF NOT EXISTS gxp_student_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL, -- Auth0 user ID
  lesson_id INTEGER NOT NULL REFERENCES gxp_lessons(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed', 'skipped'
  progress_percentage DECIMAL(5,2) DEFAULT 0.00, -- Percentage of lesson completed
  time_spent_minutes INTEGER DEFAULT 0, -- Time spent on lesson in minutes
  completed_at TIMESTAMP, -- When lesson was marked as completed
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last time user accessed this lesson
  notes TEXT, -- Student's personal notes for this lesson
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, lesson_id)
);

-- Create indexes for student progress
CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_user_id 
ON gxp_student_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_lesson_id 
ON gxp_student_progress(lesson_id);

CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_status 
ON gxp_student_progress(status);

CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_user_status 
ON gxp_student_progress(user_id, status);

-- Table for storing assessment submissions
CREATE TABLE IF NOT EXISTS gxp_assessment_submissions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  assessment_id INTEGER NOT NULL REFERENCES gxp_assessments(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  answers_json JSONB NOT NULL, -- Student's answers
  score DECIMAL(5,2), -- Calculated score percentage
  passed BOOLEAN, -- Whether student passed (score >= passing_score)
  time_taken_minutes INTEGER, -- Time taken to complete assessment
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  feedback_json JSONB, -- Detailed feedback per question (if enabled)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for assessment submissions
CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_user_id 
ON gxp_assessment_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_assessment_id 
ON gxp_assessment_submissions(assessment_id);

CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_user_assessment 
ON gxp_assessment_submissions(user_id, assessment_id);

CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_submitted_at 
ON gxp_assessment_submissions(submitted_at);

-- Table for storing certificates
CREATE TABLE IF NOT EXISTS gxp_certificates (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  course_id INTEGER NOT NULL REFERENCES gxp_courses(id) ON DELETE CASCADE,
  certificate_number VARCHAR(100) UNIQUE NOT NULL, -- Unique certificate identifier
  certificate_data JSONB, -- Certificate details (name, date, etc.)
  pdf_url TEXT, -- URL to generated PDF certificate
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP, -- Optional expiration date
  is_verified BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for certificates
CREATE INDEX IF NOT EXISTS idx_gxp_certificates_user_id 
ON gxp_certificates(user_id);

CREATE INDEX IF NOT EXISTS idx_gxp_certificates_course_id 
ON gxp_certificates(course_id);

CREATE INDEX IF NOT EXISTS idx_gxp_certificates_certificate_number 
ON gxp_certificates(certificate_number);

CREATE INDEX IF NOT EXISTS idx_gxp_certificates_user_course 
ON gxp_certificates(user_id, course_id);

-- Table for storing badges
CREATE TABLE IF NOT EXISTS gxp_badges (
  id SERIAL PRIMARY KEY,
  badge_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT, -- URL to badge icon/image
  category VARCHAR(100), -- e.g., 'achievement', 'milestone', 'expertise'
  criteria_json JSONB, -- Criteria for earning the badge (e.g., complete X courses, score Y on assessment)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for badges
CREATE INDEX IF NOT EXISTS idx_gxp_badges_category 
ON gxp_badges(category);

-- Table for storing student badges (earned badges)
CREATE TABLE IF NOT EXISTS gxp_student_badges (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  badge_id INTEGER NOT NULL REFERENCES gxp_badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  context_json JSONB, -- Context about how badge was earned (course_id, assessment_id, etc.)
  UNIQUE(user_id, badge_id)
);

-- Create indexes for student badges
CREATE INDEX IF NOT EXISTS idx_gxp_student_badges_user_id 
ON gxp_student_badges(user_id);

CREATE INDEX IF NOT EXISTS idx_gxp_student_badges_badge_id 
ON gxp_student_badges(badge_id);

CREATE INDEX IF NOT EXISTS idx_gxp_student_badges_earned_at 
ON gxp_student_badges(earned_at);

-- Table for tracking educational Q&A interactions (extends existing qms_chat_qa_interactions)
-- This table links Q&A interactions to educational context
CREATE TABLE IF NOT EXISTS gxp_educational_qa (
  id SERIAL PRIMARY KEY,
  qa_interaction_id INTEGER REFERENCES qms_chat_qa_interactions(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  course_id INTEGER REFERENCES gxp_courses(id) ON DELETE SET NULL,
  lesson_id INTEGER REFERENCES gxp_lessons(id) ON DELETE SET NULL,
  context_type VARCHAR(50), -- 'course', 'lesson', 'general'
  is_tutoring_session BOOLEAN DEFAULT false, -- Whether this was a tutoring session vs general Q&A
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for educational Q&A
CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_qa_interaction_id 
ON gxp_educational_qa(qa_interaction_id);

CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_user_id 
ON gxp_educational_qa(user_id);

CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_course_id 
ON gxp_educational_qa(course_id);

CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_lesson_id 
ON gxp_educational_qa(lesson_id);

CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_is_tutoring 
ON gxp_educational_qa(is_tutoring_session);