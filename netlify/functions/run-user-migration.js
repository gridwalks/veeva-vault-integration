import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const handler = async (event) => {
  console.log('=== RUNNING USER MIGRATION ===');
  
  try {
    // Add user_id column to uploaded documents table
    await pool.query(`
      ALTER TABLE qms_chat_documents 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)
    `);
    console.log('✅ Added user_id column to qms_chat_documents');

    // Add user_id column to uploaded document chunks table
    await pool.query(`
      ALTER TABLE qms_chat_document_chunks 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)
    `);
    console.log('✅ Added user_id column to qms_chat_document_chunks');

    // Add indexes for faster user-specific queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_user_id 
      ON qms_chat_documents(user_id)
    `);
    console.log('✅ Added user_id index to qms_chat_documents');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_document_chunks_user_id 
      ON qms_chat_document_chunks(user_id)
    `);
    console.log('✅ Added user_id index to qms_chat_document_chunks');

    // Add composite indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_user_source 
      ON qms_chat_documents(user_id, source_type)
    `);
    console.log('✅ Added composite index for user + source_type');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_document_chunks_user_document 
      ON qms_chat_document_chunks(user_id, document_id)
    `);
    console.log('✅ Added composite index for user + document_id');

    // Check current document counts
    const countResult = await pool.query(`
      SELECT 
        COUNT(*) as total_uploaded,
        COUNT(user_id) as with_user_id,
        COUNT(*) - COUNT(user_id) as without_user_id
      FROM qms_chat_documents 
      WHERE source_type = 'upload'
    `);
    
    console.log('Document counts after migration:', countResult.rows[0]);

    await pool.end();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'User migration completed successfully',
        counts: countResult.rows[0]
      })
    };

  } catch (error) {
    console.error('Migration error:', error);
    await pool.end();

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
