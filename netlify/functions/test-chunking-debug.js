import { getPool, initDatabase } from './db.js';
import { chunkText, validateChunks } from './chunking-utils.js';

export const handler = async (event) => {
  console.log('=== CHUNKING DEBUG TEST ===');
  
  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    if (!pool) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: 'Database connection failed' })
      };
    }
    
    // Test chunking utility
    const testText = `This is a test document for chunking. It contains multiple paragraphs and should be split into appropriate chunks.

This is the second paragraph with more content that should be processed correctly by the chunking algorithm.

This is the third paragraph with additional information that will help us verify that the chunking system is working as expected.`;

    console.log('Testing chunking with text length:', testText.length);
    
    const chunks = chunkText(testText, 512, 50);
    console.log('Chunks created:', chunks.length);
    
    const validatedChunks = validateChunks(chunks);
    console.log('Validated chunks:', validatedChunks.length);
    
    // Test database table existence
    let veevaTableExists = false;
    let uploadedTableExists = false;
    
    try {
      await pool.query('SELECT 1 FROM Veeva_Doc_Chat_document_chunks LIMIT 1');
      veevaTableExists = true;
      console.log('✅ Veeva_Doc_Chat_document_chunks table exists');
    } catch (e) {
      console.log('❌ Veeva_Doc_Chat_document_chunks table does not exist:', e.message);
    }
    
    try {
      await pool.query('SELECT 1 FROM qms_chat_document_chunks LIMIT 1');
      uploadedTableExists = true;
      console.log('✅ qms_chat_document_chunks table exists');
    } catch (e) {
      console.log('❌ qms_chat_document_chunks table does not exist:', e.message);
    }
    
    // Test document tables
    let veevaDocTableExists = false;
    let uploadedDocTableExists = false;
    
    try {
      await pool.query('SELECT 1 FROM Veeva_Doc_Chat_document_index LIMIT 1');
      veevaDocTableExists = true;
      console.log('✅ Veeva_Doc_Chat_document_index table exists');
    } catch (e) {
      console.log('❌ Veeva_Doc_Chat_document_index table does not exist:', e.message);
    }
    
    try {
      await pool.query('SELECT 1 FROM qms_chat_documents LIMIT 1');
      uploadedDocTableExists = true;
      console.log('✅ qms_chat_documents table exists');
    } catch (e) {
      console.log('❌ qms_chat_documents table does not exist:', e.message);
    }
    
    // Get counts if tables exist
    let veevaDocCount = 0;
    let uploadedDocCount = 0;
    let veevaChunkCount = 0;
    let uploadedChunkCount = 0;
    
    if (veevaDocTableExists) {
      const result = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_index');
      veevaDocCount = parseInt(result.rows[0].count);
    }
    
    if (uploadedDocTableExists) {
      const result = await pool.query('SELECT COUNT(*) as count FROM qms_chat_documents');
      uploadedDocCount = parseInt(result.rows[0].count);
    }
    
    if (veevaTableExists) {
      const result = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks');
      veevaChunkCount = parseInt(result.rows[0].count);
    }
    
    if (uploadedTableExists) {
      const result = await pool.query('SELECT COUNT(*) as count FROM qms_chat_document_chunks');
      uploadedChunkCount = parseInt(result.rows[0].count);
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        chunkingTest: {
          textLength: testText.length,
          chunksCreated: chunks.length,
          validatedChunks: validatedChunks.length,
          chunkDetails: chunks.map((c, i) => ({
            index: i,
            length: c.text.length,
            tokens: c.tokenCount,
            preview: c.text.substring(0, 100) + '...'
          }))
        },
        databaseStatus: {
          veevaDocTableExists,
          uploadedDocTableExists,
          veevaChunkTableExists: veevaTableExists,
          uploadedChunkTableExists: uploadedTableExists,
          veevaDocCount,
          uploadedDocCount,
          veevaChunkCount,
          uploadedChunkCount,
          totalDocs: veevaDocCount + uploadedDocCount,
          totalChunks: veevaChunkCount + uploadedChunkCount
        },
        recommendations: [
          ...(veevaTableExists ? [] : ['Create Veeva_Doc_Chat_document_chunks table']),
          ...(uploadedTableExists ? [] : ['Create qms_chat_document_chunks table']),
          ...(veevaDocTableExists ? [] : ['Create Veeva_Doc_Chat_document_index table']),
          ...(uploadedDocTableExists ? [] : ['Create qms_chat_documents table']),
          ...(veevaChunkCount === 0 && uploadedChunkCount === 0 ? ['No chunks found - run document indexing'] : [])
        ]
      })
    };
    
  } catch (error) {
    console.error('Debug test error:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  }
};
