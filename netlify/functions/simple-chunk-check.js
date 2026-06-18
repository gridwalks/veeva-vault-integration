import { getPool, initDatabase } from './db.js';

export const handler = async (event) => {
  console.log('=== SIMPLE CHUNK CHECK ===');

  try {
    await initDatabase();
    const pool = getPool();

    if (!pool) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: 'Database connection failed' })
      };
    }

    const results = {
      databaseConnected: true,
      tables: {},
      totalDocuments: 0,
      totalChunks: 0,
      errors: []
    };

    // Check uploaded documents table
    try {
      const uploadedDocs = await pool.query('SELECT COUNT(*) as count FROM qms_chat_documents');
      results.tables.uploadedDocuments = {
        exists: true,
        count: parseInt(uploadedDocs.rows[0].count)
      };
      results.totalDocuments += results.tables.uploadedDocuments.count;
    } catch (e) {
      results.tables.uploadedDocuments = { exists: false, error: e.message };
      results.errors.push(`Uploaded documents table: ${e.message}`);
    }

    // Check uploaded chunks table
    try {
      const uploadedChunks = await pool.query('SELECT COUNT(*) as count FROM qms_chat_document_chunks');
      results.tables.uploadedChunks = {
        exists: true,
        count: parseInt(uploadedChunks.rows[0].count)
      };
      results.totalChunks += results.tables.uploadedChunks.count;
    } catch (e) {
      results.tables.uploadedChunks = { exists: false, error: e.message };
      results.errors.push(`Uploaded chunks table: ${e.message}`);
    }

    // Test basic vector functionality
    let vectorTest = { success: false, error: 'No chunks available' };
    if (results.totalChunks > 0) {
      try {
        const sample = await pool.query(
          'SELECT embedding FROM qms_chat_document_chunks WHERE embedding IS NOT NULL LIMIT 1'
        );
        if (sample.rows.length > 0) {
          vectorTest = { success: true, message: 'Vector functionality working' };
        } else {
          vectorTest = { success: false, error: 'No embeddings found' };
        }
      } catch (e) {
        vectorTest = { success: false, error: e.message };
        results.errors.push(`Vector test: ${e.message}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...results,
        vectorTest,
        recommendations: [
          ...(results.tables.uploadedDocuments?.exists ? [] : ['Create qms_chat_documents table']),
          ...(results.tables.uploadedChunks?.exists ? [] : ['Create qms_chat_document_chunks table']),
          ...(results.totalChunks === 0 ? ['No chunks found - run document indexing'] : []),
          ...(results.errors.length > 0 ? ['Fix database table issues'] : [])
        ]
      })
    };

  } catch (error) {
    console.error('Simple chunk check error:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
