import { Pool } from 'pg';
import { getStore } from '@netlify/blobs';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }
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
          'Access-Control-Allow-Origin': '*',
          'X-Frame-Options': 'DENY'
        },
        body: JSON.stringify({
          error: 'Document ID is required'
        })
      };
    }

    const uploadSourceTypes = ['upload', 'uploaded_document', 'uploaded', 'blob_upload'];

    // Safe parameterized queries - complete hardcoded SQL strings to prevent SQL injection
    // Try to find document by ID (both as integer and as string)
    let documentResult;

    if (/^\d+$/.test(documentId)) {
      documentResult = await pool.query(
        'SELECT id, document_name, original_filename, mime_type, file_size, blob_url, content, created_at, source_type FROM qms_chat_documents WHERE id = $1 ORDER BY created_at DESC LIMIT 5',
        [parseInt(documentId, 10)]
      );
    }

    if (!documentResult || documentResult.rows.length === 0) {
      documentResult = await pool.query(
        'SELECT id, document_name, original_filename, mime_type, file_size, blob_url, content, created_at, source_type FROM qms_chat_documents WHERE id::text = $1 ORDER BY created_at DESC LIMIT 5',
        [documentId]
      );
    }

    // If not found, try matching by blob key
    if (documentResult.rows.length === 0) {
      documentResult = await pool.query(
        'SELECT id, document_name, original_filename, mime_type, file_size, blob_url, content, created_at, source_type FROM qms_chat_documents WHERE blob_url = $1 ORDER BY created_at DESC LIMIT 5',
        [documentId]
      );
    }

    // If still not found, try searching by name or original filename (loose match)
    if (documentResult.rows.length === 0) {
      documentResult = await pool.query(
        'SELECT id, document_name, original_filename, mime_type, file_size, blob_url, content, created_at, source_type FROM qms_chat_documents WHERE document_name ILIKE $1 OR original_filename ILIKE $1 ORDER BY created_at DESC LIMIT 5',
        [`%${documentId}%`]
      );
    }

    // Filter results to only include upload-backed documents
    documentResult.rows = documentResult.rows.filter(row => !row.source_type || uploadSourceTypes.includes(row.source_type));

    if (documentResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Frame-Options': 'DENY'
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
      mime_type: document.mime_type,
      source_type: document.source_type
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
            'Cache-Control': 'public, max-age=3600',
            'X-Frame-Options': 'DENY'
          },
          body: document.content
        };
      } else {
        console.log('Document has no blob_url and no content, returning 404');
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Frame-Options': 'DENY'
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
          'Access-Control-Allow-Origin': '*',
          'X-Frame-Options': 'DENY'
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

    const blobKey = document.blob_url;

    const buildCandidateBlobKeys = (key) => {
      const variants = [];

      const addVariant = (value) => {
        if (!value) return;
        if (!variants.includes(value)) {
          variants.push(value);
        }
      };

      if (key) {
        addVariant(key);

        // If the key looks like it contains a namespace/prefix, also try the suffix portion.
        const slashIndex = key.indexOf('/');
        if (slashIndex !== -1 && slashIndex < key.length - 1) {
          addVariant(key.slice(slashIndex + 1));
        }
      }

      // After collecting raw variants, add encoded versions when appropriate.
      const encodedVariants = variants
        .filter(value => /[\s#?]/.test(value) && !/%[0-9A-Fa-f]{2}/.test(value))
        .map(value => encodeURI(value));

      for (const value of encodedVariants) {
        addVariant(value);
      }

      return variants;
    };

    const candidateBlobKeys = buildCandidateBlobKeys(blobKey);

    const inferStoreFromKey = (key) => {
      if (!key) return null;
      const prefix = key.split('/')[0];
      if (prefix && prefix.length > 0 && prefix.length < 64) {
        return prefix;
      }
      return null;
    };

    const inferredStoreName = inferStoreFromKey(blobKey);

    const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;

    console.log('Environment variables check:', {
      siteID: siteID ? 'present' : 'missing',
      token: token ? 'present' : 'missing',
      siteIDLength: siteID ? siteID.length : 0,
      tokenLength: token ? token.length : 0
    });

    const storeCandidates = [
      inferredStoreName,
      'uploaded-documents',
      'documents',
      'chat-uploads'
    ].filter(Boolean);

    const uniqueStoreCandidates = [...new Set(storeCandidates)];

    console.log('Attempting to retrieve file from blob storage:', {
      blobKey,
      blobKeyLength: blobKey ? blobKey.length : 0,
      candidateBlobKeys,
      uniqueStoreCandidates
    });

    let fileBuffer = null;
    let successfulKey = null;
    let successfulStore = null;

    for (const storeName of uniqueStoreCandidates) {
      let store;
      try {
        store = await getStore({
          name: storeName,
          siteID,
          token
        });
      } catch (storeError) {
        console.warn('Failed to initialize blob store candidate:', storeName, storeError);
        continue;
      }

      console.log('Blob store retrieved successfully for download attempt:', storeName);

      for (const candidateKey of candidateBlobKeys) {
        try {
          fileBuffer = await store.get(candidateKey, { type: 'arrayBuffer' });
        } catch (candidateError) {
          console.warn('Blob retrieval attempt failed for key:', candidateKey, 'in store:', storeName, candidateError);
          continue;
        }

        if (fileBuffer) {
          successfulKey = candidateKey;
          successfulStore = storeName;
          break;
        }
      }

      if (fileBuffer) {
        break;
      }
    }

    console.log('Blob retrieval result:', {
      hasFileBuffer: !!fileBuffer,
      fileBufferSize: fileBuffer ? fileBuffer.byteLength : 0,
      successfulKey,
      successfulStore
    });

    if (!fileBuffer) {
      console.log('File not found in blob storage after trying candidates, returning 404');
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Frame-Options': 'DENY'
        },
        body: JSON.stringify({
          error: 'File not found in blob storage',
          attemptedStores: uniqueStoreCandidates,
          attemptedKeys: candidateBlobKeys
        })
      };
    }

    // Determine filename for download
    const downloadFilename = document.original_filename || document.document_name;
    const mimeType = document.mime_type || 'application/octet-stream';

    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(fileBuffer);

    console.log(`Downloading file: ${downloadFilename} (${buffer.length} bytes) from store ${successfulStore}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': buffer.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Download error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };
  }
};
