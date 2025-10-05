import { getPool } from "./db.js";

export const handler = async (event) => {
  console.log('=== TEST SUMMARIES STARTED ===');
  try {
    const pool = getPool();
    
    // Get a few sample documents to check their summaries
    const result = await pool.query('SELECT veeva_document_id, document_name, summary FROM document_index LIMIT 5');
    
    console.log('Sample summaries from database:', result.rows.map(row => ({
      id: row.veeva_document_id,
      name: row.document_name,
      summaryLength: row.summary?.length || 0,
      summaryPreview: row.summary ? row.summary.substring(0, 200) + '...' : 'No summary'
    })));
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalRecords: result.rows.length,
        summaries: result.rows.map(row => ({
          id: row.veeva_document_id,
          name: row.document_name,
          summaryLength: row.summary?.length || 0,
          summaryPreview: row.summary ? row.summary.substring(0, 300) : 'No summary',
          hasNewFormat: row.summary ? row.summary.includes('**Purpose & Scope**') : false
        }))
      }),
    };
  } catch (error) {
    console.error('=== TEST SUMMARIES ERROR ===');
    console.error('Error:', { message: error.message, stack: error.stack });
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
