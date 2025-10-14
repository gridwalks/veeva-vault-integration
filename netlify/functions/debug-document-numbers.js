import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== DEBUG DOCUMENT NUMBERS ===');
  
  try {
    await initDatabase();
    const pool = getPool();
    
    // Get all document numbers to see what's actually in the database
    const query = `
      SELECT document_number, document_name, veeva_document_id
      FROM Veeva_Doc_Chat_document_index 
      WHERE document_number ILIKE '%IT%' OR document_number ILIKE '%007%'
      ORDER BY document_number
    `;
    
    const result = await pool.query(query);
    
    console.log(`Found ${result.rows.length} documents with IT or 007 in document number:`);
    result.rows.forEach(doc => {
      console.log(`- ${doc.document_number} | ${doc.document_name} | ${doc.veeva_document_id}`);
    });
    
    // Also check for exact IT-007
    const exactQuery = `
      SELECT document_number, document_name, veeva_document_id
      FROM Veeva_Doc_Chat_document_index 
      WHERE document_number = 'IT-007'
    `;
    
    const exactResult = await pool.query(exactQuery);
    console.log(`\nExact IT-007 match: ${exactResult.rows.length} documents`);
    exactResult.rows.forEach(doc => {
      console.log(`- ${doc.document_number} | ${doc.document_name} | ${doc.veeva_document_id}`);
    });
    
    // Check case variations
    const caseQuery = `
      SELECT document_number, document_name, veeva_document_id
      FROM Veeva_Doc_Chat_document_index 
      WHERE LOWER(document_number) = 'it-007'
    `;
    
    const caseResult = await pool.query(caseQuery);
    console.log(`\nCase-insensitive IT-007 match: ${caseResult.rows.length} documents`);
    caseResult.rows.forEach(doc => {
      console.log(`- ${doc.document_number} | ${doc.document_name} | ${doc.veeva_document_id}`);
    });
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        itDocuments: result.rows,
        exactMatch: exactResult.rows,
        caseInsensitiveMatch: caseResult.rows
      })
    };
    
  } catch (error) {
    console.error('Error debugging document numbers:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
