import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== DEBUG DOCUMENT SEARCH ===');
  
  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    // Get search term from query parameters
    const q = new URL(event.rawUrl).searchParams;
    const searchTerm = q.get("search") || "QAC-P003";
    
    console.log('Searching for document:', searchTerm);
    
    // Search in Veeva documents
    const veevaQuery = `
      SELECT veeva_document_id, document_number, document_name, 
             major_version, minor_version, document_type, status, 
             summary, manual_summary, indexed_at
      FROM Veeva_Doc_Chat_document_index 
      WHERE document_number ILIKE $1 
         OR document_name ILIKE $1
         OR summary ILIKE $1
         OR manual_summary ILIKE $1
      ORDER BY document_name
    `;
    
    const veevaResult = await pool.query(veevaQuery, [`%${searchTerm}%`]);
    
    // Search in uploaded documents
    const uploadedQuery = `
      SELECT id, document_name, document_type, ai_summary, 
             created_at, source_type
      FROM qms_chat_documents 
      WHERE document_name ILIKE $1 
         OR ai_summary ILIKE $1
      ORDER BY document_name
    `;
    
    const uploadedResult = await pool.query(uploadedQuery, [`%${searchTerm}%`]);
    
    // Get all document numbers to see what's available
    const allNumbersQuery = `
      SELECT DISTINCT document_number, document_name
      FROM Veeva_Doc_Chat_document_index 
      ORDER BY document_number
      LIMIT 20
    `;
    
    const allNumbersResult = await pool.query(allNumbersQuery);
    
    // Get document count
    const countQuery = `
      SELECT COUNT(*) as total_documents
      FROM Veeva_Doc_Chat_document_index
    `;
    
    const countResult = await pool.query(countQuery);
    
    console.log('Search results:', {
      searchTerm,
      veevaMatches: veevaResult.rows.length,
      uploadedMatches: uploadedResult.rows.length,
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
        searchTerm,
        results: {
          veevaDocuments: veevaResult.rows,
          uploadedDocuments: uploadedResult.rows,
          allDocumentNumbers: allNumbersResult.rows,
          totalDocuments: parseInt(countResult.rows[0].total_documents)
        },
        debug: {
          searchQuery: veevaQuery,
          searchParams: [`%${searchTerm}%`]
        }
      })
    };
    
  } catch (error) {
    console.error('Debug search error:', error);
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
