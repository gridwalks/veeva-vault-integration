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
