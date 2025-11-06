import { getPool } from './db.js';
import { verifyAdminRole } from './security-utils.js';

/**
 * Netlify serverless function to delete all Veeva data from the database
 * DELETE: Remove all Veeva documents and chunks
 */
export async function handler(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Verify admin role
    const authResult = await verifyAdminRole(event);
    if (!authResult.authorized) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Admin role required to delete Veeva data'
        })
      };
    }

    if (event.httpMethod !== 'DELETE') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          error: 'Method not allowed',
          message: `Method ${event.httpMethod} is not supported`
        })
      };
    }

    const pool = getPool();
    const startTime = Date.now();

    console.log('Starting Veeva data deletion...');

    // Get counts before deletion for reporting
    const chunksCountResult = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks');
    const documentsCountResult = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_index');
    
    const chunksCount = parseInt(chunksCountResult.rows[0].count);
    const documentsCount = parseInt(documentsCountResult.rows[0].count);

    console.log(`Found ${documentsCount} Veeva documents and ${chunksCount} chunks to delete`);

    // Delete in order: chunks first (due to foreign key constraint), then documents
    // The foreign key should have ON DELETE CASCADE, but we'll delete chunks first to be safe
    const deleteChunksResult = await pool.query('DELETE FROM Veeva_Doc_Chat_document_chunks');
    const deletedChunks = deleteChunksResult.rowCount || 0;

    const deleteDocumentsResult = await pool.query('DELETE FROM Veeva_Doc_Chat_document_index');
    const deletedDocuments = deleteDocumentsResult.rowCount || 0;

    const duration = Date.now() - startTime;

    console.log(`Veeva data deletion completed in ${duration}ms:`, {
      deletedDocuments,
      deletedChunks
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deletedDocuments,
        deletedChunks,
        duration
      })
    };
  } catch (error) {
    console.error('Error deleting Veeva data:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
}

