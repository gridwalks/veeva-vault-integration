import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('Starting document deletion...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams)
  });

  // Set CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight' })
    };
  }

  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Initialize database
    await initDatabase();
    
    const q = new URL(event.rawUrl).searchParams;
    const documentId = q.get("id");

    if (!documentId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Document ID is required' })
      };
    }

    console.log('Deleting document...', { documentId });

    const pool = getPool();
    let deletedChunks = 0;

    // Delete chunks first (due to foreign key constraint)
    const chunkResult = await pool.query(
      'DELETE FROM qms_chat_document_chunks WHERE document_id = $1',
      [documentId]
    );
    deletedChunks = chunkResult.rowCount;

    // Delete the document
    const result = await pool.query(
      'DELETE FROM qms_chat_documents WHERE id = $1',
      [documentId]
    );

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Document not found' })
      };
    }

    const totalDuration = Date.now() - startTime;
    console.log('Document deletion completed:', {
      totalDuration: `${totalDuration}ms`,
      documentId,
      deletedChunks,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Document deleted successfully',
        documentId,
        deletedChunks,
        duration: totalDuration
      })
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('Delete document error:', {
      message: error.message,
      stack: error.stack,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString(),
      queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams)
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to delete document',
        message: error.message 
      })
    };
  }
};
