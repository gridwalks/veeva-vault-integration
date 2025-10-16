import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== LIST ALL DOCUMENTS ===');
  
  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    // Get all Veeva documents
    const veevaQuery = `
      SELECT veeva_document_id, document_number, document_name, 
             major_version, minor_version, document_type, status, 
             summary, manual_summary, indexed_at
      FROM Veeva_Doc_Chat_document_index 
      ORDER BY document_number
    `;
    
    const veevaResult = await pool.query(veevaQuery);
    
    // Get all uploaded documents
    const uploadedQuery = `
      SELECT id, document_name, document_type, ai_summary, 
             created_at, source_type
      FROM qms_chat_documents 
      ORDER BY document_name
    `;
    
    const uploadedResult = await pool.query(uploadedQuery);
    
    // Get document count
    const countQuery = `
      SELECT COUNT(*) as total_documents
      FROM Veeva_Doc_Chat_document_index
    `;
    
    const countResult = await pool.query(countQuery);
    
    console.log('Document listing results:', {
      veevaDocuments: veevaResult.rows.length,
      uploadedDocuments: uploadedResult.rows.length,
      totalDocuments: countResult.rows[0].total_documents
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        summary: {
          totalVeevaDocuments: veevaResult.rows.length,
          totalUploadedDocuments: uploadedResult.rows.length,
          totalDocuments: parseInt(countResult.rows[0].total_documents)
        },
        veevaDocuments: veevaResult.rows.map(doc => ({
          id: doc.veeva_document_id,
          document_number: doc.document_number,
          document_name: doc.document_name,
          version: `${doc.major_version}.${doc.minor_version}`,
          type: doc.document_type,
          status: doc.status,
          hasSummary: !!doc.summary,
          hasManualSummary: !!doc.manual_summary,
          indexedAt: doc.indexed_at
        })),
        uploadedDocuments: uploadedResult.rows.map(doc => ({
          id: doc.id,
          document_name: doc.document_name,
          type: doc.document_type,
          hasSummary: !!doc.ai_summary,
          createdAt: doc.created_at
        }))
      })
    };
    
  } catch (error) {
    console.error('List documents error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};
