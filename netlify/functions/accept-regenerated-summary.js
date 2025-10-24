import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  const startTime = Date.now();
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { documentId, newSummary } = body;
    
    if (!documentId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Document ID is required'
        })
      };
    }

    if (!newSummary) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'New summary is required'
        })
      };
    }

    console.log(`Accepting regenerated summary for document: ${documentId}`);

    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Update the document with the new summary
    const updateResult = await pool.query(`
      UPDATE Veeva_Doc_Chat_document_index 
      SET summary = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, document_name, summary
    `, [newSummary, documentId]);

    if (updateResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Document not found'
        })
      };
    }

    const updatedDoc = updateResult.rows[0];
    const duration = Date.now() - startTime;
    
    console.log(`Summary updated for document: ${updatedDoc.document_name}`, {
      documentId: updatedDoc.id,
      summaryLength: updatedDoc.summary?.length,
      duration
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        documentId: updatedDoc.id,
        documentName: updatedDoc.document_name,
        summary: updatedDoc.summary,
        duration: duration
      })
    };

  } catch (error) {
    console.error('Error accepting regenerated summary:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      })
    };
  }
};
