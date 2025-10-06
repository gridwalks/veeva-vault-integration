import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  console.log('=== CHECK CHUNKS STATUS ===');
  
  try {
    await initDatabase();
    const pool = getPool();
    
    // Get document count
    const docCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_index'
    );
    const docCount = parseInt(docCountResult.rows[0].count);
    
    // Get chunk count
    const chunkCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks'
    );
    const chunkCount = parseInt(chunkCountResult.rows[0].count);
    
    // Get documents with chunk counts
    const docChunkStats = await pool.query(`
      SELECT 
        di.id,
        di.veeva_document_id,
        di.document_name,
        COUNT(dc.id) as chunk_count
      FROM Veeva_Doc_Chat_document_index di
      LEFT JOIN Veeva_Doc_Chat_document_chunks dc ON di.id = dc.document_id
      GROUP BY di.id, di.veeva_document_id, di.document_name
      ORDER BY chunk_count DESC, di.document_name
    `);
    
    const docsWithChunks = docChunkStats.rows.filter(row => row.chunk_count > 0).length;
    const docsWithoutChunks = docChunkStats.rows.filter(row => row.chunk_count === 0).length;
    
    console.log('Chunk statistics:', {
      totalDocuments: docCount,
      totalChunks: chunkCount,
      documentsWithChunks: docsWithChunks,
      documentsWithoutChunks: docsWithoutChunks,
      averageChunksPerDoc: docsWithChunks > 0 ? (chunkCount / docsWithChunks).toFixed(1) : 0
    });
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: {
          totalDocuments: docCount,
          totalChunks: chunkCount,
          documentsWithChunks: docsWithChunks,
          documentsWithoutChunks: docsWithoutChunks,
          averageChunksPerDoc: docsWithChunks > 0 ? parseFloat((chunkCount / docsWithChunks).toFixed(1)) : 0
        },
        documents: docChunkStats.rows.map(row => ({
          id: row.id,
          veevaDocumentId: row.veeva_document_id,
          name: row.document_name,
          chunkCount: parseInt(row.chunk_count)
        })),
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('=== CHECK CHUNKS ERROR ===');
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};

