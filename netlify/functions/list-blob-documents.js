import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const handler = async (event) => {
  console.log('=== LIST BLOB DOCUMENTS ===');
  console.log('Request method:', event.httpMethod);
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Method not allowed',
        allowedMethods: ['GET', 'OPTIONS']
      })
    };
  }

  try {
    const startTime = Date.now();
    
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const limit = parseInt(params.limit || '50', 10);
    const offset = parseInt(params.offset || '0', 10);
    const search = params.search || '';
    const userId = params.userId;

    console.log('Query parameters:', { limit, offset, search, userId });

    // Query uploaded documents from database
    console.log('Querying uploaded documents from database...');
    
    let query = `
      SELECT 
        id,
        document_name,
        document_type,
        version,
        ai_summary,
        file_size,
        extraction_method,
        blob_url,
        original_filename,
        mime_type,
        created_at,
        updated_at,
        source_type,
        user_id
      FROM qms_chat_documents 
      WHERE source_type = 'upload'
    `;
    
    const queryParams = [];
    
    // Add user filter if userId is provided
    if (userId) {
      query += ` AND user_id = $1`;
      queryParams.push(userId);
    }
    
    // Add search filter if search is provided
    if (search) {
      const searchParam = queryParams.length + 1;
      query += ` AND (document_name ILIKE $${searchParam} OR original_filename ILIKE $${searchParam})`;
      queryParams.push(`%${search}%`);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    console.log('Executing query:', query);
    console.log('Query parameters:', queryParams);
    
    const result = await pool.query(query, queryParams);
    const documents = result.rows.map(doc => ({
      id: doc.id,
      document_id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type || 'uploaded_document',
      version: doc.version || '1.0',
      ai_summary: doc.ai_summary,
      file_size: doc.file_size,
      extraction_method: doc.extraction_method,
      blob_url: doc.blob_url,
      original_filename: doc.original_filename,
      mime_type: doc.mime_type || 'application/octet-stream',
      chunk_count: 0, // Will be calculated separately if needed
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      source_type: doc.source_type,
      user_id: doc.user_id,
      isUploaded: true
    }));
    
    console.log(`Found ${documents.length} uploaded documents in database`);

    // Apply pagination
    const total = documents.length;
    const paginatedDocuments = documents.slice(offset, offset + limit);

    const duration = Date.now() - startTime;
    console.log(`Database query completed in ${duration}ms, returning ${paginatedDocuments.length} documents`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        total,
        items: paginatedDocuments,
        pageSize: limit,
        pageOffset: offset,
        duration: `${duration}ms`,
        source: 'database'
      })
    };

  } catch (error) {
    console.error('Error listing blob documents:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to list blob documents',
        details: error.message
      })
    };
  }
};
