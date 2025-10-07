import { getPool, initDatabase } from './db.js';

export const handler = async (event, context) => {
  // Initialize database connection
  await initDatabase();
  const pool = getPool();

  try {
    console.log('Testing Q&A interactions functionality...');

    // Test 1: Create a Q&A interaction
    console.log('Test 1: Creating Q&A interaction...');
    const createResult = await pool.query(`
      INSERT INTO qms_chat_qa_interactions 
      (question, answer, document_ids, document_names, user_id, session_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      'What is the test question?',
      'This is a test answer.',
      ['doc1', 'doc2'],
      ['Test Document 1', 'Test Document 2'],
      'test-user',
      'test-session-123'
    ]);

    console.log('Q&A interaction created:', createResult.rows[0]);

    // Test 2: Retrieve Q&A interactions
    console.log('Test 2: Retrieving Q&A interactions...');
    const getResult = await pool.query(`
      SELECT * FROM qms_chat_qa_interactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, ['test-user']);

    console.log('Q&A interactions retrieved:', getResult.rows);

    // Test 3: Search Q&A interactions
    console.log('Test 3: Searching Q&A interactions...');
    const searchResult = await pool.query(`
      SELECT * FROM qms_chat_qa_interactions 
      WHERE question ILIKE $1 OR answer ILIKE $1
      ORDER BY created_at DESC
    `, ['%test%']);

    console.log('Search results:', searchResult.rows);

    // Test 4: Clean up test data
    console.log('Test 4: Cleaning up test data...');
    const deleteResult = await pool.query(`
      DELETE FROM qms_chat_qa_interactions 
      WHERE user_id = $1
    `, ['test-user']);

    console.log('Test data cleaned up:', deleteResult.rowCount, 'rows deleted');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Q&A interactions functionality test completed successfully',
        tests: {
          create: createResult.rows[0],
          retrieve: getResult.rows,
          search: searchResult.rows,
          cleanup: deleteResult.rowCount
        }
      })
    };

  } catch (error) {
    console.error('Error testing Q&A interactions:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Q&A interactions test failed',
        details: error.message
      })
    };
  }
};
