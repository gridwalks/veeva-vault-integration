import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== DEBUG FORCE REGENERATE ===');
  try {
    const q = new URL(event.rawUrl).searchParams;
    const forceRegenerate = q.get("force") === 'true';
    const forceParam = q.get("force");
    
    console.log('Force parameter debug:', {
      forceParam,
      forceRegenerate,
      allParams: Object.fromEntries(q.entries())
    });
    
    // Get one existing document to test
    await initDatabase();
    const pool = getPool();
    const existingDoc = await pool.query('SELECT * FROM document_index LIMIT 1');
    
    if (existingDoc.rows.length > 0) {
      const existing = existingDoc.rows[0];
      console.log('Existing document:', {
        id: existing.veeva_document_id,
        name: existing.document_name,
        hasSummary: !!existing.summary,
        summaryLength: existing.summary?.length || 0
      });
      
      // Test the needsUpdate logic
      const mockDocumentData = {
        document_name: existing.document_name,
        major_version: existing.major_version,
        minor_version: existing.minor_version,
        status: existing.status
      };
      
      const needsUpdate = forceRegenerate ||
        existing.document_name !== mockDocumentData.document_name ||
        existing.major_version !== mockDocumentData.major_version ||
        existing.minor_version !== mockDocumentData.minor_version ||
        existing.status !== mockDocumentData.status;
      
      console.log('Update logic test:', {
        needsUpdate,
        forceRegenerate,
        nameChanged: existing.document_name !== mockDocumentData.document_name,
        majorChanged: existing.major_version !== mockDocumentData.major_version,
        minorChanged: existing.minor_version !== mockDocumentData.minor_version,
        statusChanged: existing.status !== mockDocumentData.status
      });
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forceParam,
        forceRegenerate,
        allParams: Object.fromEntries(q.entries()),
        testComplete: true
      }),
    };
  } catch (error) {
    console.error('=== DEBUG FORCE ERROR ===');
    console.error('Error:', { message: error.message, stack: error.stack });
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
