import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;

let pool = null;
let supabaseClient = null;

// Netlify Supabase integration injects SUPABASE_DATABASE_URL; fall back to DATABASE_URL for local dev
function getConnectionString() {
  return process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
}

// Derive https://<ref>.supabase.co from the pooler connection string
function deriveSupabaseUrl() {
  const connStr = getConnectionString() || '';
  const match = connStr.match(/postgres\.([a-z0-9]+):/);
  if (match) return `https://${match[1]}.supabase.co`;
  return process.env.SUPABASE_URL || null;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      ssl: { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    const url = deriveSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Cannot derive Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }
  return supabaseClient;
}

export async function initDatabase() {
  const client = getPool();
  
  try {
    console.log('Initializing database schema...');
    const startTime = Date.now();
    
    await client.query(`
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
      )
    `);

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_document_index_veeva_id 
      ON Veeva_Doc_Chat_document_index(veeva_document_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_document_index_number 
      ON Veeva_Doc_Chat_document_index(document_number)
    `);

    // Add manual_summary column if it doesn't exist (for existing installations)
    try {
      await client.query(`
        ALTER TABLE Veeva_Doc_Chat_document_index 
        ADD COLUMN IF NOT EXISTS manual_summary TEXT
      `);
      console.log('Manual summary column added or already exists');
    } catch (alterError) {
      console.log('Manual summary column may already exist:', alterError.message);
    }

    // Enable pgvector extension for vector similarity search
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('pgvector extension enabled');
    } catch (vectorError) {
      console.warn('Could not enable pgvector extension:', vectorError.message);
      console.warn('Vector search features will not be available. Please enable pgvector manually.');
    }

    // Create document_chunks table for RAG
    await client.query(`
      CREATE TABLE IF NOT EXISTS Veeva_Doc_Chat_document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES Veeva_Doc_Chat_document_index(id) ON DELETE CASCADE,
        veeva_document_id VARCHAR(255) NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        token_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, chunk_index)
      )
    `);

    // Create indexes for chunks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_chunks_document_id 
      ON Veeva_Doc_Chat_document_chunks(document_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_Veeva_Doc_Chat_chunks_veeva_document_id 
      ON Veeva_Doc_Chat_document_chunks(veeva_document_id)
    `);

    console.log('Document chunks table created or already exists');

    // Create Q&A interactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_qa_interactions (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        document_ids TEXT[],
        document_names TEXT[],
        user_id VARCHAR(255),
        session_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for Q&A interactions
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_created_at 
      ON qms_chat_qa_interactions(created_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_user_id 
      ON qms_chat_qa_interactions(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_qa_interactions_session_id 
      ON qms_chat_qa_interactions(session_id)
    `);

    console.log('Q&A interactions table created or already exists');

    // Create chat sessions table
    await client.query(`
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
      )
    `);

    // Create indexes for chat sessions
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_user_id 
      ON qms_chat_sessions(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_sessions_created_at 
      ON qms_chat_sessions(created_at)
    `);

    console.log('Chat sessions table created or already exists');

    // Create document comparison history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_document_comparisons (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        session_id VARCHAR(255),
        document_ids TEXT[],
        comparison_query TEXT,
        comparison_result TEXT,
        comparison_metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for document comparisons
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_user_id 
      ON qms_chat_document_comparisons(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_session_id 
      ON qms_chat_document_comparisons(session_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_created_at 
      ON qms_chat_document_comparisons(created_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_document_comparisons_document_ids 
      ON qms_chat_document_comparisons USING gin (document_ids)
    `);

    console.log('Document comparison history table created or already exists');

    // Create CFR Title 21 regulations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cfr_title21_regulations (
        id SERIAL PRIMARY KEY,
        regulation_id VARCHAR(255) UNIQUE NOT NULL,
        regulation_type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        granule_id VARCHAR(255),
        chapter_id VARCHAR(255),
        subchapter_id VARCHAR(255),
        html_link TEXT,
        details_link TEXT,
        full_text TEXT,
        ai_summary TEXT,
        extraction_method VARCHAR(100),
        source_date VARCHAR(255),
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for CFR regulations
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_regulation_id 
      ON cfr_title21_regulations(regulation_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_regulation_type 
      ON cfr_title21_regulations(regulation_type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_chapter_id 
      ON cfr_title21_regulations(chapter_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulations_subchapter_id 
      ON cfr_title21_regulations(subchapter_id)
    `);

    console.log('CFR Title 21 regulations table created or already exists');

    // Add source_date column if it doesn't exist (migration for existing databases)
    try {
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'cfr_title21_regulations' 
            AND column_name = 'source_date'
          ) THEN
            ALTER TABLE cfr_title21_regulations ADD COLUMN source_date VARCHAR(255);
            RAISE NOTICE 'Added source_date column to cfr_title21_regulations';
          END IF;
        END $$;
      `);
      console.log('Verified source_date column exists in cfr_title21_regulations');
    } catch (migrationError) {
      console.warn('Error checking/adding source_date column (may already exist):', migrationError.message);
    }

    // Create CFR Title 21 regulation chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cfr_title21_regulation_chunks (
        id SERIAL PRIMARY KEY,
        regulation_id INTEGER NOT NULL REFERENCES cfr_title21_regulations(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        token_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(regulation_id, chunk_index)
      )
    `);

    // Create index for CFR regulation chunks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cfr_title21_regulation_chunks_regulation_id 
      ON cfr_title21_regulation_chunks(regulation_id)
    `);

    console.log('CFR Title 21 regulation chunks table created or already exists');

    // Create CFR Title 21 web resources table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cfr_title21_web_resources (
        id SERIAL PRIMARY KEY,
        source_url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        source_type VARCHAR(50),
        domain VARCHAR(255),
        full_text TEXT,
        ai_summary TEXT,
        extraction_method VARCHAR(100),
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_checked_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active'
      )
    `);

    // Create indexes for web resources
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resources_source_url 
      ON cfr_title21_web_resources(source_url)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resources_source_type 
      ON cfr_title21_web_resources(source_type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resources_domain 
      ON cfr_title21_web_resources(domain)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resources_status 
      ON cfr_title21_web_resources(status)
    `);

    console.log('CFR Title 21 web resources table created or already exists');

    // Create CFR Title 21 web resource chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cfr_title21_web_resource_chunks (
        id SERIAL PRIMARY KEY,
        web_resource_id INTEGER NOT NULL REFERENCES cfr_title21_web_resources(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        token_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(web_resource_id, chunk_index)
      )
    `);

    // Create index for web resource chunks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resource_chunks_web_resource_id 
      ON cfr_title21_web_resource_chunks(web_resource_id)
    `);

    console.log('CFR Title 21 web resource chunks table created or already exists');

    // Create CFR Title 21 web resource links table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cfr_title21_web_resource_links (
        id SERIAL PRIMARY KEY,
        web_resource_id INTEGER NOT NULL REFERENCES cfr_title21_web_resources(id) ON DELETE CASCADE,
        regulation_id INTEGER NOT NULL REFERENCES cfr_title21_regulations(id) ON DELETE CASCADE,
        link_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(web_resource_id, regulation_id)
      )
    `);

    // Create indexes for web resource links
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resource_links_web_resource_id 
      ON cfr_title21_web_resource_links(web_resource_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_resource_links_regulation_id 
      ON cfr_title21_web_resource_links(regulation_id)
    `);

    console.log('CFR Title 21 web resource links table created or already exists');

    // Create pharmaceutical practices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pharmaceutical_practices (
        id SERIAL PRIMARY KEY,
        practice_code VARCHAR(10) UNIQUE NOT NULL,
        practice_name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for pharmaceutical practices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pharmaceutical_practices_practice_code 
      ON pharmaceutical_practices(practice_code)
    `);

    console.log('Pharmaceutical practices table created or already exists');

    // Create practice-regulation associations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS practice_regulation_associations (
        id SERIAL PRIMARY KEY,
        practice_id INTEGER NOT NULL REFERENCES pharmaceutical_practices(id) ON DELETE CASCADE,
        regulation_id INTEGER NOT NULL REFERENCES cfr_title21_regulations(id) ON DELETE CASCADE,
        association_type VARCHAR(50) DEFAULT 'primary',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(practice_id, regulation_id)
      )
    `);

    // Create indexes for practice-regulation associations
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_practice_regulation_associations_practice_id 
      ON practice_regulation_associations(practice_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_practice_regulation_associations_regulation_id 
      ON practice_regulation_associations(regulation_id)
    `);

    console.log('Practice-regulation associations table created or already exists');

    // Seed initial pharmaceutical practices
    try {
      await client.query(`
        INSERT INTO pharmaceutical_practices (practice_code, practice_name, description) VALUES
          ('GCP', 'Good Clinical Practices', 'Standards for the design, conduct, performance, monitoring, auditing, recording, analyses, and reporting of clinical trials that involve the participation of human subjects.'),
          ('GMP', 'Good Manufacturing Practices', 'Regulations that require manufacturers, processors, and packagers of drugs, medical devices, and certain types of food and blood to take proactive steps to ensure that their products are safe, pure, and effective.'),
          ('GLP', 'Good Laboratory Practices', 'Regulations that ensure the quality and integrity of nonclinical laboratory studies that support research or marketing permits for products regulated by the FDA.'),
          ('GDP', 'Good Distribution Practices', 'Guidelines for the proper distribution of medicinal products for human use to ensure that the quality and integrity of medicines is maintained throughout the supply chain.')
        ON CONFLICT (practice_code) DO NOTHING
      `);
      console.log('Initial pharmaceutical practices seeded');
    } catch (seedError) {
      console.warn('Error seeding pharmaceutical practices (may already exist):', seedError.message);
    }

    // ============================================================================
    // GxP Educational Platform Tables
    // ============================================================================

    // Create courses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        difficulty VARCHAR(50) DEFAULT 'beginner',
        estimated_hours DECIMAL(5,2),
        instructor_id VARCHAR(255),
        is_published BOOLEAN DEFAULT false,
        thumbnail_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_courses_category 
      ON gxp_courses(category)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_courses_difficulty 
      ON gxp_courses(difficulty)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_courses_instructor_id 
      ON gxp_courses(instructor_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_courses_is_published 
      ON gxp_courses(is_published)
    `);

    console.log('GxP courses table created or already exists');

    // Create learning paths table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_learning_paths (
        id SERIAL PRIMARY KEY,
        path_name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        course_ids INTEGER[],
        estimated_total_hours DECIMAL(5,2),
        is_published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_learning_paths_category 
      ON gxp_learning_paths(category)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_learning_paths_is_published 
      ON gxp_learning_paths(is_published)
    `);

    console.log('GxP learning paths table created or already exists');

    // Create modules table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_modules (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES gxp_courses(id) ON DELETE CASCADE,
        module_order INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, module_order)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_modules_course_id 
      ON gxp_modules(course_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_modules_course_order 
      ON gxp_modules(course_id, module_order)
    `);

    console.log('GxP modules table created or already exists');

    // Create lessons table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_lessons (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES gxp_modules(id) ON DELETE CASCADE,
        lesson_order INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        content_type VARCHAR(50) DEFAULT 'text',
        content_data JSONB,
        estimated_minutes INTEGER,
        cfr_regulation_id INTEGER REFERENCES cfr_title21_regulations(id) ON DELETE SET NULL,
        document_id INTEGER REFERENCES Veeva_Doc_Chat_document_index(id) ON DELETE SET NULL,
        workflow_template_id INTEGER REFERENCES qms_chat_workflow_templates(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(module_id, lesson_order)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lessons_module_id 
      ON gxp_lessons(module_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lessons_module_order 
      ON gxp_lessons(module_id, lesson_order)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lessons_content_type 
      ON gxp_lessons(content_type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lessons_cfr_regulation_id 
      ON gxp_lessons(cfr_regulation_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lessons_document_id 
      ON gxp_lessons(document_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lessons_workflow_template_id 
      ON gxp_lessons(workflow_template_id)
    `);

    console.log('GxP lessons table created or already exists');

    // Create lesson content table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_lesson_content (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER NOT NULL REFERENCES gxp_lessons(id) ON DELETE CASCADE,
        content_type VARCHAR(50) NOT NULL,
        content_json JSONB NOT NULL,
        content_order INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lesson_content_lesson_id 
      ON gxp_lesson_content(lesson_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lesson_content_lesson_order 
      ON gxp_lesson_content(lesson_id, content_order)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_lesson_content_type 
      ON gxp_lesson_content(content_type)
    `);

    console.log('GxP lesson content table created or already exists');

    // Create assessments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_assessments (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER REFERENCES gxp_lessons(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        questions_json JSONB NOT NULL,
        passing_score DECIMAL(5,2) DEFAULT 70.00,
        time_limit_minutes INTEGER,
        max_attempts INTEGER DEFAULT 3,
        shuffle_questions BOOLEAN DEFAULT false,
        show_correct_answers BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_assessments_lesson_id 
      ON gxp_assessments(lesson_id)
    `);

    console.log('GxP assessments table created or already exists');

    // Create student progress table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_student_progress (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        lesson_id INTEGER NOT NULL REFERENCES gxp_lessons(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'not_started',
        progress_percentage DECIMAL(5,2) DEFAULT 0.00,
        time_spent_minutes INTEGER DEFAULT 0,
        completed_at TIMESTAMP,
        last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, lesson_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_user_id 
      ON gxp_student_progress(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_lesson_id 
      ON gxp_student_progress(lesson_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_status 
      ON gxp_student_progress(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_progress_user_status 
      ON gxp_student_progress(user_id, status)
    `);

    console.log('GxP student progress table created or already exists');

    // Create assessment submissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_assessment_submissions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        assessment_id INTEGER NOT NULL REFERENCES gxp_assessments(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        answers_json JSONB NOT NULL,
        score DECIMAL(5,2),
        passed BOOLEAN,
        time_taken_minutes INTEGER,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        feedback_json JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_user_id 
      ON gxp_assessment_submissions(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_assessment_id 
      ON gxp_assessment_submissions(assessment_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_user_assessment 
      ON gxp_assessment_submissions(user_id, assessment_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_assessment_submissions_submitted_at 
      ON gxp_assessment_submissions(submitted_at)
    `);

    console.log('GxP assessment submissions table created or already exists');

    // Create certificates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_certificates (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        course_id INTEGER NOT NULL REFERENCES gxp_courses(id) ON DELETE CASCADE,
        certificate_number VARCHAR(100) UNIQUE NOT NULL,
        certificate_data JSONB,
        pdf_url TEXT,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_verified BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_certificates_user_id 
      ON gxp_certificates(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_certificates_course_id 
      ON gxp_certificates(course_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_certificates_certificate_number 
      ON gxp_certificates(certificate_number)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_certificates_user_course 
      ON gxp_certificates(user_id, course_id)
    `);

    console.log('GxP certificates table created or already exists');

    // Create badges table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_badges (
        id SERIAL PRIMARY KEY,
        badge_name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        icon_url TEXT,
        category VARCHAR(100),
        criteria_json JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_badges_category 
      ON gxp_badges(category)
    `);

    console.log('GxP badges table created or already exists');

    // Create student badges table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_student_badges (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        badge_id INTEGER NOT NULL REFERENCES gxp_badges(id) ON DELETE CASCADE,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        context_json JSONB,
        UNIQUE(user_id, badge_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_badges_user_id 
      ON gxp_student_badges(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_badges_badge_id 
      ON gxp_student_badges(badge_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_student_badges_earned_at 
      ON gxp_student_badges(earned_at)
    `);

    console.log('GxP student badges table created or already exists');

    // Create educational Q&A table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gxp_educational_qa (
        id SERIAL PRIMARY KEY,
        qa_interaction_id INTEGER REFERENCES qms_chat_qa_interactions(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        course_id INTEGER REFERENCES gxp_courses(id) ON DELETE SET NULL,
        lesson_id INTEGER REFERENCES gxp_lessons(id) ON DELETE SET NULL,
        context_type VARCHAR(50),
        is_tutoring_session BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_qa_interaction_id 
      ON gxp_educational_qa(qa_interaction_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_user_id 
      ON gxp_educational_qa(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_course_id 
      ON gxp_educational_qa(course_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_lesson_id 
      ON gxp_educational_qa(lesson_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gxp_educational_qa_is_tutoring 
      ON gxp_educational_qa(is_tutoring_session)
    `);

    console.log('GxP educational Q&A table created or already exists');

    const duration = Date.now() - startTime;
    console.log(`Database schema initialized successfully in ${duration}ms`);
  } catch (error) {
    console.error('Error initializing database:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    throw error;
  }
}
