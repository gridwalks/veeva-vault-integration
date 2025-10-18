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

    // Get document information from database
    const documentResult = await pool.query(`
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
    `, [documentId]);

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
    
    if (!document.blob_url) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'File not available in blob storage'
        })
      };
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
    
    try {
      // Get file from Netlify Blob storage
      const fileBuffer = await store.get(blobKey, { type: 'arrayBuffer' });
      
      if (!fileBuffer) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'File not found in blob storage'
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
