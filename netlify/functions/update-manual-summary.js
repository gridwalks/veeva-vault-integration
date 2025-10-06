import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('=== UPDATE MANUAL SUMMARY STARTED ===');
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { documentId, manualSummary } = body;
    
    if (!documentId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Document ID is required"
        })
      };
    }

    if (manualSummary === undefined || manualSummary === null) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Manual summary is required"
        })
      };
    }

    // Initialize database
    await initDatabase();
    const pool = getPool();

    console.log('Updating manual summary:', {
      documentId,
      summaryLength: manualSummary.length,
      summaryPreview: manualSummary.substring(0, 100) + '...'
    });

    // Update the manual summary for the document
    const query = `
      UPDATE Veeva_Doc_Chat_document_index 
      SET manual_summary = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, veeva_document_id, document_name, manual_summary, updated_at
    `;

    const result = await pool.query(query, [manualSummary, documentId]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Document not found"
        })
      };
    }

    const updatedDocument = result.rows[0];

    console.log('Manual summary updated successfully:', {
      documentId: updatedDocument.id,
      documentName: updatedDocument.document_name,
      summaryLength: updatedDocument.manual_summary.length,
      updatedAt: updatedDocument.updated_at
    });

    const totalDuration = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        document: {
          id: updatedDocument.id,
          veeva_document_id: updatedDocument.veeva_document_id,
          document_name: updatedDocument.document_name,
          manual_summary: updatedDocument.manual_summary,
          updated_at: updatedDocument.updated_at
        },
        metadata: {
          responseTime: totalDuration
        }
      })
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('=== UPDATE MANUAL SUMMARY ERROR ===');
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to update manual summary",
        message: error.message
      })
    };
  }
};
