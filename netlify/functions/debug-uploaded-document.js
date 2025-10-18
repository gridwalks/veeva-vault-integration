import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const handler = async (event) => {
  console.log('=== DEBUG UPLOADED DOCUMENT ===');
  
  try {
    const { documentId } = event.queryStringParameters || {};
    
    if (!documentId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Document ID is required'
        })
      };
    }

    // Try to find document by ID (both as integer and as string)
    let documentResult;
    
    // First try as integer
    if (/^\d+$/.test(documentId)) {
      documentResult = await pool.query(`
        SELECT 
          id,
          document_name,
          original_filename,
          mime_type,
          file_size,
          blob_url,
          source_type,
          content,
          created_at
        FROM qms_chat_documents 
        WHERE id = $1
      `, [parseInt(documentId)]);
    } else {
      // Try as string (UUID or other format)
      documentResult = await pool.query(`
        SELECT 
          id,
          document_name,
          original_filename,
          mime_type,
          file_size,
          blob_url,
          source_type,
          content,
          created_at
        FROM qms_chat_documents 
        WHERE id::text = $1
      `, [documentId]);
    }
    
    // If not found, try searching by document_name or original_filename
    if (documentResult.rows.length === 0) {
      documentResult = await pool.query(`
        SELECT 
          id,
          document_name,
          original_filename,
          mime_type,
          file_size,
          blob_url,
          source_type,
          content,
          created_at
        FROM qms_chat_documents 
        WHERE document_name ILIKE $1 OR original_filename ILIKE $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [`%${documentId}%`]);
    }

    if (documentResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Document not found',
          documentId
        })
      };
    }

    const document = documentResult.rows[0];
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        document: {
          id: document.id,
          document_name: document.document_name,
          original_filename: document.original_filename,
          mime_type: document.mime_type,
          file_size: document.file_size,
          blob_url: document.blob_url,
          source_type: document.source_type,
          has_content: !!document.content,
          content_length: document.content ? document.content.length : 0,
          created_at: document.created_at
        },
        environment: {
          has_blob_site_id: !!process.env.NETLIFY_BLOBS_SITE_ID,
          has_blob_token: !!process.env.NETLIFY_BLOBS_TOKEN,
          node_env: process.env.NODE_ENV
        }
      })
    };

  } catch (error) {
    console.error('Debug error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
