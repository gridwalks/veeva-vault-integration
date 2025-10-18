import { getStore } from '@netlify/blobs';

const STORE_NAME = 'uploaded-documents';

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

    // Get the blob store with proper configuration
    let store;
    try {
      // Check if blob storage is properly configured
      if (!process.env.NETLIFY_BLOBS_SITE_ID || !process.env.NETLIFY_BLOBS_TOKEN) {
        console.warn('Blob storage not configured - missing NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN');
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
            error: 'Blob storage not configured',
            details: 'Missing required properties when creating a store: siteID, token'
          })
        };
      }

      console.log('Blob storage configuration found, initializing store...');
      const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN;

      store = await getStore({
        name: STORE_NAME,
        siteID,
        token
      });
      console.log('Blob store retrieved successfully');
    } catch (storeError) {
      console.error('Error initializing blob store:', storeError);
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
          error: 'Failed to initialize blob store',
          details: storeError.message
        })
      };
    }
    
    // List all blobs from the store
    console.log('Listing blobs from store:', STORE_NAME);
    const blobList = await store.list();
    console.log(`Found ${blobList.length} blobs in storage`);

    // Convert blobs to document format and apply search filter
    let documents = blobList.map((blob, index) => ({
      id: blob.key, // Use blob key as ID
      document_id: blob.key,
      document_name: blob.key, // Use blob key as name
      document_type: 'uploaded_document',
      version: '1.0',
      ai_summary: null, // Not available from blob metadata
      file_size: blob.size,
      extraction_method: 'blob_storage',
      blob_url: blob.key, // The blob key is the URL
      original_filename: blob.key,
      mime_type: blob.contentType || 'application/octet-stream',
      chunk_count: 0, // Not available from blob metadata
      created_at: blob.lastModified ? new Date(blob.lastModified).toISOString() : new Date().toISOString(),
      updated_at: blob.lastModified ? new Date(blob.lastModified).toISOString() : new Date().toISOString(),
      source_type: 'upload',
      isUploaded: true,
      blob_metadata: {
        key: blob.key,
        size: blob.size,
        contentType: blob.contentType,
        lastModified: blob.lastModified,
        etag: blob.etag
      }
    }));

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      documents = documents.filter(doc => 
        doc.document_name.toLowerCase().includes(searchLower) ||
        doc.original_filename.toLowerCase().includes(searchLower)
      );
      console.log(`Filtered to ${documents.length} documents matching search: "${search}"`);
    }

    // Sort by creation date (newest first)
    documents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply pagination
    const total = documents.length;
    const paginatedDocuments = documents.slice(offset, offset + limit);

    const duration = Date.now() - startTime;
    console.log(`Blob query completed in ${duration}ms, returning ${paginatedDocuments.length} documents`);

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
        source: 'blob_storage'
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
