export const handler = async (event) => {
  console.log('=== SIMPLE UPLOAD TEST ===');
  
  try {
    // Test basic functionality without blob storage
    const testData = {
      timestamp: new Date().toISOString(),
      test: 'simple_upload_test',
      features: {
        textExtraction: 'enabled',
        chunking: 'enabled', 
        embedding: 'enabled',
        blobStorage: 'disabled',
        database: 'enabled'
      }
    };
    
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
    
    // Test text extraction
    let textExtractionStatus = 'not tested';
    try {
      const { chunkText, validateChunks } = await import('./chunking-utils.js');
      const testText = 'This is a test document for chunking. It should be split into multiple chunks for processing.';
      const chunks = chunkText(testText, 100, 20);
      textExtractionStatus = `working - created ${chunks.length} chunks`;
      console.log('Text extraction test:', { chunks: chunks.length });
    } catch (extractionError) {
      textExtractionStatus = `error: ${extractionError.message}`;
      console.error('Text extraction test error:', extractionError);
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        ...testData,
        database: dbStatus,
        textExtraction: textExtractionStatus,
        message: 'Simple upload test completed - ready for document processing'
      })
    };
    
  } catch (error) {
    console.error('Simple upload test error:', error);
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
