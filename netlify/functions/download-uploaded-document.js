import { Pool } from 'pg';
import { getStore } from '@netlify/blobs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const handler = async (event) => {
  console.log('=== DOWNLOAD UPLOADED DOCUMENT ===');
  
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
          created_at
        FROM qms_chat_documents 
        WHERE id = $1 AND source_type = 'upload'
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
          created_at
        FROM qms_chat_documents 
        WHERE id::text = $1 AND source_type = 'upload'
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
          created_at
        FROM qms_chat_documents 
        WHERE (document_name ILIKE $1 OR original_filename ILIKE $1) AND source_type = 'upload'
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
          error: 'Document not found'
        })
      };
    }

    const document = documentResult.rows[0];
    
    console.log('Document found in database:', {
      id: document.id,
      document_name: document.document_name,
      original_filename: document.original_filename,
      blob_url: document.blob_url,
      file_size: document.file_size,
      mime_type: document.mime_type
    });
    
    if (!document.blob_url) {
      console.log('Document has no blob_url, checking if content is available in database');
      
      // If no blob_url, try to return the content from the database
      if (document.content) {
        console.log('Returning content from database');
        const mimeType = document.mime_type || 'text/plain';
        const downloadFilename = document.original_filename || document.document_name;
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${downloadFilename}"`,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          },
          body: document.content
        };
      } else {
        console.log('Document has no blob_url and no content, returning 404');
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'File not available in blob storage and no content in database',
            document: {
              id: document.id,
              document_name: document.document_name,
              original_filename: document.original_filename
            }
          })
        };
      }
    }

    // Check if blob storage is configured before attempting to use it
    if (!process.env.NETLIFY_BLOBS_SITE_ID || !process.env.NETLIFY_BLOBS_TOKEN) {
      console.warn('Blob storage not configured - returning document metadata instead of file content');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Blob storage not configured',
          document: {
            id: document.id,
            name: document.document_name,
            original_filename: document.original_filename,
            mime_type: document.mime_type,
            file_size: document.file_size,
            created_at: document.created_at,
            blob_url: document.blob_url
          },
          note: 'File download not available - blob storage not configured'
        })
      };
    }

    // Get the blob store and retrieve the file using the blob key
    let store;
    try {
      const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN;

      console.log('Environment variables check:', {
        siteID: siteID ? 'present' : 'missing',
        token: token ? 'present' : 'missing',
        siteIDLength: siteID ? siteID.length : 0,
        tokenLength: token ? token.length : 0
      });

      store = await getStore({
        name: 'uploaded-documents',
        siteID,
        token
      });
      console.log('Blob store retrieved successfully for download');
    } catch (storeError) {
      console.error('Error initializing blob store for download:', storeError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Failed to initialize blob store',
          details: storeError.message
        })
      };
    }
    
    const blobKey = document.blob_url;
    
    console.log('Attempting to retrieve file from blob storage:', {
      blobKey: blobKey,
      blobKeyLength: blobKey ? blobKey.length : 0
    });
    
    try {
      // Get file from Netlify Blob storage
      const fileBuffer = await store.get(blobKey, { type: 'arrayBuffer' });
      
      console.log('Blob retrieval result:', {
        hasFileBuffer: !!fileBuffer,
        fileBufferSize: fileBuffer ? fileBuffer.byteLength : 0
      });
      
      if (!fileBuffer) {
        console.log('File not found in blob storage, returning 404');
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'File not found in blob storage',
            blobKey: blobKey
          })
        };
      }

      // Determine filename for download
      const downloadFilename = document.original_filename || document.document_name;
      const mimeType = document.mime_type || 'application/octet-stream';

      // Convert ArrayBuffer to Buffer
      const buffer = Buffer.from(fileBuffer);
      
      console.log(`Downloading file: ${downloadFilename} (${buffer.length} bytes)`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${downloadFilename}"`,
          'Content-Length': buffer.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      };

    } catch (blobError) {
      console.error('Error retrieving file from blob storage:', blobError);
      
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Failed to retrieve file from storage'
        })
      };
    }

  } catch (error) {
    console.error('Download error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };
  }
};
