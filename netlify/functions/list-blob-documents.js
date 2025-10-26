import { getStore } from '@netlify/blobs';

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

    // Initialize blob store
    console.log('Initializing blob store...');
    const STORE_NAME = 'chat-uploads';
    const store = await getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });

    // List all blobs from storage
    console.log('Listing all blobs from blob storage...');
    const listResult = await store.list();
    const blobs = Array.isArray(listResult?.blobs) ? listResult.blobs : Array.isArray(listResult) ? listResult : [];
    
    console.log(`Found ${blobs.length} blobs in storage`);

    // Process blobs to extract directory structure and documents
    const directoryMap = new Map();
    const documents = [];
    
    for (const blob of blobs) {
      const key = blob.key;
      
      // Extract directory structure (first part before /)
      const pathParts = key.split('/');
      const directory = pathParts.length > 1 ? pathParts[0] : '';
      const fileName = pathParts.length > 1 ? pathParts.slice(1).join('/') : key;
      
      // Store directory info
      if (!directoryMap.has(directory)) {
        directoryMap.set(directory, []);
      }
      directoryMap.get(directory).push({
        key: key,
        fileName: fileName,
        size: blob.size || 0,
        metadata: blob.metadata,
        lastModified: blob.metadata?.createdAt || blob.uploadedAt || new Date().toISOString()
      });
    }
    
    console.log(`Found ${directoryMap.size} directories`);

    // Convert to document format
    for (const [directory, files] of directoryMap.entries()) {
      for (const file of files) {
        // Apply search filter if provided
        if (search && !file.fileName.toLowerCase().includes(search.toLowerCase()) && 
            !directory.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }
        
        const document = {
          id: file.key,
          document_id: file.key,
          document_name: file.fileName,
          original_filename: file.fileName,
          document_type: 'blob_document',
          source_type: 'blob',
          file_size: file.size,
          created_at: file.lastModified,
          updated_at: file.lastModified,
          mime_type: 'application/octet-stream',
          chunk_count: 0,
          blob_metadata: {
            key: file.key,
            directory: directory,
            metadata: file.metadata
          },
          isUploaded: true
        };
        
        documents.push(document);
      }
    }
    
    // Sort by created_at descending
    documents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply pagination
    const total = documents.length;
    const paginatedDocuments = documents.slice(offset, offset + limit);

    const duration = Date.now() - startTime;
    console.log(`Blob listing completed in ${duration}ms, returning ${paginatedDocuments.length} documents from ${directoryMap.size} directories`);

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
        source: 'blob',
        directories: directoryMap.size
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
