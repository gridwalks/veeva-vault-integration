import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const handler = async (event) => {
  console.log('=== LIST UPLOADED DOCUMENTS ===');
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

    // Validate userId is provided
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: 'User ID is required to list uploaded documents'
        })
      };
    }

    // Build the WHERE clause for search
    // First check if user_id column exists, then build appropriate query
    let baseWhereClause;
    const queryParams = [userId];
    let paramIndex = 2;

    try {
      // Check if user_id column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'qms_chat_documents' 
        AND column_name = 'user_id'
      `);
      
      if (columnCheck.rows.length > 0) {
        // Column exists - include both user-specific and legacy documents
        baseWhereClause = "WHERE source_type = 'upload' AND (user_id = $1 OR user_id IS NULL)";
      } else {
        // Column doesn't exist - show all uploaded documents
        baseWhereClause = "WHERE source_type = 'upload'";
        queryParams.length = 0; // Remove userId from params
        paramIndex = 1;
      }
    } catch (error) {
      console.log('Column check failed, using fallback query:', error.message);
      // Fallback to showing all uploaded documents
      baseWhereClause = "WHERE source_type = 'upload'";
      queryParams.length = 0; // Remove userId from params
      paramIndex = 1;
    }

    if (search) {
      baseWhereClause += ` AND (document_name ILIKE $${paramIndex} OR ai_summary ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM qms_chat_documents
      ${baseWhereClause}
    `;
    
    console.log('Executing count query:', countQuery);
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);
    console.log(`Found ${total} total uploaded documents`);

    // Get paginated documents with chunk counts
    queryParams.push(limit, offset);
    
    // Build WHERE clause for documents query with table aliases
    // Use the same logic as the count query
    let documentsWhereClause = baseWhereClause.replace('source_type', 'd.source_type');
    if (search) {
      const searchParamIndex = queryParams.length;
      documentsWhereClause += ` AND (d.document_name ILIKE $${searchParamIndex} OR d.ai_summary ILIKE $${searchParamIndex})`;
    }
    
    const documentsQuery = `
      SELECT 
        d.id,
        d.document_name,
        d.document_type,
        d.version,
        d.content,
        d.ai_summary,
        d.file_size,
        d.extraction_method,
        d.blob_url,
        d.original_filename,
        d.mime_type,
        d.created_at,
        d.updated_at,
        COUNT(c.id) as chunk_count
      FROM qms_chat_documents d
      LEFT JOIN qms_chat_document_chunks c ON d.id = c.document_id
      ${documentsWhereClause}
      GROUP BY d.id, d.document_name, d.document_type, d.version, d.content, 
               d.ai_summary, d.file_size, d.extraction_method, d.blob_url, 
               d.original_filename, d.mime_type, d.created_at, d.updated_at
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    console.log('Executing documents query with params:', queryParams);
    const documentsResult = await pool.query(documentsQuery, queryParams);
    
    const documents = documentsResult.rows.map(doc => ({
      id: doc.id,
      document_id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      version: doc.version,
      ai_summary: doc.ai_summary,
      file_size: doc.file_size,
      extraction_method: doc.extraction_method,
      blob_url: doc.blob_url,
      original_filename: doc.original_filename,
      mime_type: doc.mime_type,
      chunk_count: parseInt(doc.chunk_count, 10),
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      source_type: 'upload',
      isUploaded: true
    }));

    const duration = Date.now() - startTime;
    console.log(`Query completed in ${duration}ms, returning ${documents.length} documents`);

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
        items: documents,
        pageSize: limit,
        pageOffset: offset,
        duration: `${duration}ms`
      })
    };

  } catch (error) {
    console.error('Error listing uploaded documents:', {
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
        error: 'Failed to list uploaded documents',
        details: error.message
      })
    };
  }
};

