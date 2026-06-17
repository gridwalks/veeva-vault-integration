import { Pool } from 'pg';
import { getStore } from '@netlify/blobs';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
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
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
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
    const { STORE_NAMES } = await import('./blob-storage-config.js');
    const STORE_NAME = STORE_NAMES.UPLOADS;
    let store;
    try {
      store = await getStore({
        name: STORE_NAME,
        siteID: process.env.NETLIFY_BLOBS_SITE_ID,
        token: process.env.NETLIFY_BLOBS_TOKEN
      });
    } catch (storeError) {
      console.error('Failed to initialize blob store:', storeError);
      throw new Error('Blob storage is unavailable');
    }
    
    // List all blobs from storage directly
    console.log('Listing all blobs from blob storage...');
    let allBlobs = [];
    
    try {
      // Try to list all blobs
      if (typeof store.list === 'function') {
        const listResult = await store.list();
        allBlobs = Array.isArray(listResult?.blobs) ? listResult.blobs : Array.isArray(listResult) ? listResult : [];
        console.log(`store.list() returned ${allBlobs.length} blobs`);
      } else if (typeof store.listEntries === 'function') {
        const listResult = await store.listEntries();
        allBlobs = Array.isArray(listResult?.blobs) ? listResult.blobs : Array.isArray(listResult) ? listResult : [];
        console.log(`store.listEntries() returned ${allBlobs.length} blobs`);
      } else {
        console.log('Available store methods:', Object.keys(store));
        throw new Error('list method not available on store');
      }
    } catch (listError) {
      console.error('Error listing blobs:', listError);
      throw new Error(`Failed to list blobs: ${listError.message}`);
    }
    
    console.log(`Found ${allBlobs.length} blobs in storage`);
    
    // Get all documents from database for comparison
    console.log('Querying database for blob document references...');
    const dbResult = await pool.query(`
      SELECT blob_url, document_name, original_filename, file_size, created_at, mime_type, ai_summary, user_id
      FROM qms_chat_documents 
      WHERE blob_url IS NOT NULL AND blob_url != ''
    `);
    const dbBlobKeys = new Set(dbResult.rows.map(doc => doc.blob_url));
    const dbDocsMap = new Map();
    dbResult.rows.forEach(doc => {
      dbDocsMap.set(doc.blob_url, doc);
    });
    
    console.log(`Found ${dbBlobKeys.size} blob references in database`);
    
    // Process all blobs and extract directory structure
    const directoryMap = new Map();
    const documents = [];
    let orphanedCount = 0;
    
    for (const blob of allBlobs) {
      const blobKey = blob.key;
      
      // Extract directory structure
      const pathParts = blobKey.split('/');
      const directory = pathParts.length > 1 ? pathParts[0] : '';
      const fileName = pathParts.length > 1 ? pathParts.slice(1).join('/') : blobKey;
      
      // Check if this blob exists in database
      const dbDoc = dbDocsMap.get(blobKey);
      const isOrphaned = !dbDoc;
      
      if (isOrphaned) {
        orphanedCount++;
      }
      
      // Store directory info
      if (!directoryMap.has(directory)) {
        directoryMap.set(directory, []);
      }
      directoryMap.get(directory).push({
        key: blobKey,
        fileName: dbDoc?.original_filename || dbDoc?.document_name || fileName,
        size: dbDoc?.file_size || blob.size || 0,
        metadata: blob.metadata || null,
        lastModified: dbDoc?.created_at || blob.metadata?.createdAt || new Date().toISOString(),
        dbData: dbDoc || null,
        isOrphaned: isOrphaned
      });
    }
    
    console.log(`Found ${directoryMap.size} directories, ${orphanedCount} orphaned blobs`);

    // Convert to document format
    for (const [directory, files] of directoryMap.entries()) {
      for (const file of files) {
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
          mime_type: file.dbData?.mime_type || 'application/octet-stream',
          ai_summary: file.dbData?.ai_summary || null,
          user_id: file.dbData?.user_id || null,
          chunk_count: 0,
          is_orphaned: file.isOrphaned,
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        success: true,
        total,
        items: paginatedDocuments,
        pageSize: limit,
        pageOffset: offset,
        duration: `${duration}ms`,
        source: 'blob',
        directories: directoryMap.size,
        orphanedCount: orphanedCount
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to list blob documents',
        details: error.message
      })
    };
  }
};
