import { getPool, initDatabase } from './db.js';

export const handler = async (event, context) => {
  try {
    console.log('Testing Q&A table existence...');
    
    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Check if the Q&A table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'qms_chat_qa_interactions'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;
    console.log('Q&A table exists:', tableExists);

    if (!tableExists) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Q&A table does not exist',
          tableExists: false
        })
      };
    }

    // Check table structure
    const structureCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'qms_chat_qa_interactions'
      ORDER BY ordinal_position;
    `);

    console.log('Table structure:', structureCheck.rows);

    // Try to insert a test record
    const testInsert = await pool.query(`
      INSERT INTO qms_chat_qa_interactions 
      (question, answer, document_ids, document_names, user_id, session_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      'Test question',
      'Test answer',
      ['test-doc-1'],
      ['Test Document'],
      'test-user',
      'test-session'
    ]);

    console.log('Test insert successful:', testInsert.rows[0]);

    // Clean up test record
    await pool.query('DELETE FROM qms_chat_qa_interactions WHERE id = $1', [testInsert.rows[0].id]);
    console.log('Test record cleaned up');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Q&A table is working correctly',
        tableExists: true,
        tableStructure: structureCheck.rows,
        testInsert: testInsert.rows[0]
      })
    };

  } catch (error) {
    console.error('Error testing Q&A table:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Q&A table test failed',
        details: error.message,
        stack: error.stack
      })
    };
  }
};
