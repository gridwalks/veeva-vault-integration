export const handler = async (event) => {
  console.log('=== UPLOAD DEBUG TEST ===');
  
  try {
    // Check environment variables
    const envCheck = {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasGroqKey: !!process.env.GROQ_API_KEY,
      hasBlobSiteId: !!process.env.NETLIFY_BLOBS_SITE_ID,
      hasBlobToken: !!process.env.NETLIFY_BLOBS_TOKEN,
      nodeVersion: process.version,
      platform: process.platform
    };
    
    console.log('Environment check:', envCheck);
    
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
    
    // Test blob storage
    let blobStatus = 'not tested';
    try {
      const { getStore } = await import('@netlify/blobs');
      
      if (!process.env.NETLIFY_BLOBS_SITE_ID || !process.env.NETLIFY_BLOBS_TOKEN) {
        blobStatus = 'not configured';
      } else {
        const store = await getStore({
          name: 'uploaded-documents',
          siteID: process.env.NETLIFY_BLOBS_SITE_ID,
          token: process.env.NETLIFY_BLOBS_TOKEN
        });
        blobStatus = 'connected';
        console.log('Blob storage test: store available');
      }
    } catch (blobError) {
      blobStatus = `error: ${blobError.message}`;
      console.error('Blob storage test error:', blobError);
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        environment: envCheck,
        database: dbStatus,
        blobStorage: blobStatus,
        message: 'Upload debug test completed'
      })
    };
    
  } catch (error) {
    console.error('Debug test error:', error);
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
