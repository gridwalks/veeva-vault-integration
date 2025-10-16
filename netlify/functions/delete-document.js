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
    const sourceType = q.get("source_type"); // 'veeva' or 'upload'

    if (!documentId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Document ID is required' })
      };
    }

    console.log('Deleting document...', {
      documentId,
      sourceType
    });

    const pool = getPool();
    let result;
    let deletedChunks = 0;

    if (sourceType === 'veeva') {
      // Delete from Veeva document index and related chunks
      console.log('Deleting Veeva document and chunks...');
      
      // First, get the document_id to delete chunks
      const docResult = await pool.query(
        'SELECT id FROM Veeva_Doc_Chat_document_index WHERE veeva_document_id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Veeva document not found' })
        };
      }

      const docId = docResult.rows[0].id;

      // Delete chunks first (due to foreign key constraint)
      const chunkResult = await pool.query(
        'DELETE FROM Veeva_Doc_Chat_document_chunks WHERE document_id = $1',
        [docId]
      );
      deletedChunks = chunkResult.rowCount;

      // Delete the document
      result = await pool.query(
        'DELETE FROM Veeva_Doc_Chat_document_index WHERE veeva_document_id = $1',
        [documentId]
      );

    } else if (sourceType === 'upload') {
      // Delete from uploaded documents and related chunks
      console.log('Deleting uploaded document and chunks...');
      
      // Delete chunks first (due to foreign key constraint)
      const chunkResult = await pool.query(
        'DELETE FROM qms_chat_document_chunks WHERE document_id = $1',
        [documentId]
      );
      deletedChunks = chunkResult.rowCount;

      // Delete the document
      result = await pool.query(
        'DELETE FROM qms_chat_documents WHERE id = $1',
        [documentId]
      );

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid source_type. Must be "veeva" or "upload"' })
      };
    }

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
      sourceType,
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
        sourceType,
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
