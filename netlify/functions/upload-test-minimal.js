export const handler = async (event) => {
  console.log('=== MINIMAL UPLOAD TEST ===');
  
  try {
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: ''
      };
    }

    // Handle non-POST requests (allow GET for testing)
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['GET', 'POST', 'OPTIONS']
        })
      };
    }

    console.log('Processing minimal upload test...', {
      method: event.httpMethod,
      contentType: event.headers['content-type'],
      bodyLength: event.body?.length || 0
    });

    // For GET requests, return test data without processing
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: true,
          message: 'Minimal upload test - GET request received',
          timestamp: new Date().toISOString(),
          method: 'GET',
          note: 'Use POST to test actual upload processing'
        })
      };
    }

    // Test database connection
    let dbStatus = 'not tested';
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      const result = await pool.query('SELECT NOW() as current_time');
      dbStatus = 'connected';
      console.log('Database test result:', result.rows[0]);
      await pool.end();
    } catch (dbError) {
      dbStatus = `error: ${dbError.message}`;
      console.error('Database test error:', dbError);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        message: 'Minimal upload test completed',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        environment: {
          hasDatabaseUrl: !!process.env.DATABASE_URL,
          hasOpenaiKey: !!process.env.OPENAI_API_KEY,
          hasGroqKey: !!process.env.GROQ_API_KEY
        }
      })
    };

  } catch (error) {
    console.error('Minimal upload test error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
