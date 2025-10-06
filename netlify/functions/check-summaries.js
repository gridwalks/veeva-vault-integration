import { getPool } from "./db.js";

export const handler = async (event) => {
  console.log('=== CHECK SUMMARIES STARTED ===');
  try {
    const pool = getPool();
    
    // Get all documents to check their summaries
    const result = await pool.query('SELECT veeva_document_id, document_name, summary FROM Veeva_Doc_Chat_document_index ORDER BY veeva_document_id LIMIT 10');
    
    const summaries = result.rows.map(row => {
      const hasNewFormat = row.summary ? 
        (row.summary.includes('**Purpose & Scope**') || 
         row.summary.includes('**Key Topics**') || 
         row.summary.includes('**Target Audience**')) : false;
      
      return {
        id: row.veeva_document_id,
        name: row.document_name,
        summaryLength: row.summary?.length || 0,
        hasNewFormat,
        summaryStart: row.summary ? row.summary.substring(0, 150) : 'No summary'
      };
    });
    
    const newFormatCount = summaries.filter(s => s.hasNewFormat).length;
    
    console.log('Summary check results:', {
      totalChecked: summaries.length,
      newFormatCount,
      oldFormatCount: summaries.length - newFormatCount
    });
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalChecked: summaries.length,
        newFormatCount,
        oldFormatCount: summaries.length - newFormatCount,
        summaries
      }),
    };
  } catch (error) {
    console.error('=== CHECK SUMMARIES ERROR ===');
    console.error('Error:', { message: error.message, stack: error.stack });
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
