const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkTable() {
  try {
    console.log('Checking database structure...');
    
    // Check if user_id column exists
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'qms_chat_documents' 
      AND column_name = 'user_id'
    `);
    console.log('user_id column check:', result.rows);
    
    // Check document counts
    const countResult = await pool.query(`
      SELECT COUNT(*) as total, 
             COUNT(user_id) as with_user_id,
             COUNT(*) - COUNT(user_id) as without_user_id
      FROM qms_chat_documents 
      WHERE source_type = 'upload'
    `);
    console.log('Document counts:', countResult.rows[0]);
    
    // Check some sample documents
    const sampleResult = await pool.query(`
      SELECT id, document_name, user_id, created_at
      FROM qms_chat_documents 
      WHERE source_type = 'upload'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('Sample documents:', sampleResult.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkTable();
