import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
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
