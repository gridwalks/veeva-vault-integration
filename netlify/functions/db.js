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
      )
    `);

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_index_veeva_id 
      ON document_index(veeva_document_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_index_number 
      ON document_index(document_number)
    `);

    // Add manual_summary column if it doesn't exist (for existing installations)
    try {
      await client.query(`
        ALTER TABLE document_index 
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
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document_index(id) ON DELETE CASCADE,
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
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
      ON document_chunks(document_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_veeva_document_id 
      ON document_chunks(veeva_document_id)
    `);

    console.log('Document chunks table created or already exists');

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
