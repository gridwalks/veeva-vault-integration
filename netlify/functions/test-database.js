import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== DATABASE CONNECTION TEST ===');
  console.log('Testing database connection...', {
    timestamp: new Date().toISOString()
  });

  try {
    console.log('Test 1: Checking environment variables...');
    console.log('Environment check:', {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlLength: process.env.DATABASE_URL?.length || 0,
      databaseUrlPreview: process.env.DATABASE_URL ? 
        process.env.DATABASE_URL.substring(0, 20) + '...' : 'undefined'
    });

    console.log('Test 2: Initializing database schema...');
    await initDatabase();
    console.log('Test 2: Database schema initialization completed');

    console.log('Test 3: Getting database pool...');
    const pool = getPool();
    console.log('Test 3: Database pool obtained:', {
      hasPool: !!pool,
      poolType: typeof pool
    });

    console.log('Test 4: Testing simple query...');
    const testQuery = await pool.query('SELECT NOW() as current_time');
    console.log('Test 4: Simple query result:', {
      success: true,
      currentTime: testQuery.rows[0]?.current_time
    });

    console.log('Test 5: Checking Veeva_Doc_Chat_document_index table...');
    const tableCheck = await pool.query(`
      SELECT 
        table_name, 
        column_name, 
        data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Veeva_Doc_Chat_document_index' 
      ORDER BY ordinal_position
    `);
    
    console.log('Test 5: Table structure:', {
      columnCount: tableCheck.rows.length,
      columns: tableCheck.rows.map(row => ({
        name: row.column_name,
        type: row.data_type
      }))
    });

    console.log('Test 6: Counting existing records...');
    const countQuery = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_index');
    const recordCount = parseInt(countQuery.rows[0]?.count || 0);
    console.log('Test 6: Record count:', {
      totalRecords: recordCount
    });

    console.log('Test 7: Testing insert operation...');
    const testInsert = await pool.query(`
      INSERT INTO Veeva_Doc_Chat_document_index 
      (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      'test-doc-123',
      'TEST-001',
      'Test Document',
      1,
      0,
      'Test Type',
      'TEST',
      'This is a test summary'
    ]);

    const insertedId = testInsert.rows[0]?.id;
    console.log('Test 7: Insert test result:', {
      success: true,
      insertedId: insertedId,
      rowCount: testInsert.rowCount
    });

    console.log('Test 8: Testing select operation...');
    const selectTest = await pool.query(
      'SELECT * FROM Veeva_Doc_Chat_document_index WHERE id = $1',
      [insertedId]
    );
    
    console.log('Test 8: Select test result:', {
      success: true,
      found: selectTest.rows.length > 0,
      record: selectTest.rows[0] ? {
        id: selectTest.rows[0].id,
        veeva_document_id: selectTest.rows[0].veeva_document_id,
        document_name: selectTest.rows[0].document_name
      } : null
    });

    console.log('Test 9: Cleaning up test record...');
    await pool.query('DELETE FROM Veeva_Doc_Chat_document_index WHERE id = $1', [insertedId]);
    console.log('Test 9: Test record deleted');

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        tests: {
          environment: {
            hasDatabaseUrl: !!process.env.DATABASE_URL
          },
          schema: {
            initialized: true,
            columnCount: tableCheck.rows.length
          },
          connection: {
            success: true,
            currentTime: testQuery.rows[0]?.current_time
          },
          operations: {
            select: true,
            insert: true,
            delete: true
          }
        },
        recordCount: recordCount,
        timestamp: new Date().toISOString()
      }),
    };

  } catch (error) {
    console.error('=== DATABASE TEST ERROR ===');
    console.error('Database test error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
