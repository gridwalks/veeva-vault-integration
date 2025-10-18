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

    // Get the blob store and retrieve the file using the blob key
    let store;
    try {
      // Check if blob storage is properly configured
      if (!process.env.NETLIFY_BLOBS_SITE_ID || !process.env.NETLIFY_BLOBS_TOKEN) {
        console.warn('Blob storage not configured - missing NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN');
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Blob storage not configured',
            details: 'Missing required properties when creating a store: siteID, token'
          })
        };
      }

      const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN;

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
