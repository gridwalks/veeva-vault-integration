import { getPool, initDatabase } from "./db.js";

function generateRecommendations(stats) {
  const recommendations = [];
  
  if (stats.docsWithoutChunks > 0) {
    recommendations.push({
      priority: 'high',
      issue: `${stats.docsWithoutChunks} documents have no chunks`,
      solution: 'Re-run document indexing to generate chunks and embeddings'
    });
  }
  
  if (stats.chunksWithoutEmbeddings > 0) {
    recommendations.push({
      priority: 'high',
      issue: `${stats.chunksWithoutEmbeddings} chunks have no embeddings`,
      solution: 'Re-run document indexing to generate embeddings for existing chunks'
    });
  }
  
  if (stats.chunksWithInvalidEmbeddings > 0) {
    recommendations.push({
      priority: 'high',
      issue: `${stats.chunksWithInvalidEmbeddings} chunks have invalid embeddings`,
      solution: 'Check embedding generation process and re-run indexing'
    });
  }
  
  if (stats.vectorSearchTest && !stats.vectorSearchTest.success) {
    recommendations.push({
      priority: 'critical',
      issue: 'Vector search test failed',
      solution: 'Check pgvector extension and vector index configuration'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      issue: 'No issues detected',
      solution: 'System appears to be functioning correctly'
    });
  }
  
  return recommendations;
}

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
    
    // Get documents with chunk counts and embedding validation
    const docChunkStats = await pool.query(`
      SELECT 
        di.id,
        di.veeva_document_id,
        di.document_name,
        COUNT(dc.id) as chunk_count,
        COUNT(CASE WHEN dc.embedding IS NOT NULL THEN 1 END) as chunks_with_embeddings,
        COUNT(CASE WHEN dc.embedding IS NOT NULL AND array_length(dc.embedding, 1) = 1536 THEN 1 END) as chunks_with_valid_embeddings
      FROM Veeva_Doc_Chat_document_index di
      LEFT JOIN Veeva_Doc_Chat_document_chunks dc ON di.id = dc.document_id
      GROUP BY di.id, di.veeva_document_id, di.document_name
      ORDER BY chunk_count DESC, di.document_name
    `);
    
    const docsWithChunks = docChunkStats.rows.filter(row => row.chunk_count > 0).length;
    const docsWithoutChunks = docChunkStats.rows.filter(row => row.chunk_count === 0).length;
    const docsWithValidEmbeddings = docChunkStats.rows.filter(row => row.chunks_with_valid_embeddings > 0).length;
    
    // Check for chunks with invalid embeddings
    const invalidEmbeddingStats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as chunks_without_embeddings,
        COUNT(CASE WHEN embedding IS NOT NULL AND array_length(embedding, 1) != 1536 THEN 1 END) as chunks_with_invalid_embeddings,
        COUNT(CASE WHEN chunk_text IS NULL OR chunk_text = '' THEN 1 END) as empty_chunks,
        COUNT(CASE WHEN LENGTH(chunk_text) < 10 THEN 1 END) as short_chunks
      FROM Veeva_Doc_Chat_document_chunks
    `);
    
    const invalidStats = invalidEmbeddingStats.rows[0];
    
    console.log('Chunk statistics:', {
      totalDocuments: docCount,
      totalChunks: chunkCount,
      documentsWithChunks: docsWithChunks,
      documentsWithoutChunks: docsWithoutChunks,
      documentsWithValidEmbeddings: docsWithValidEmbeddings,
      averageChunksPerDoc: docsWithChunks > 0 ? (chunkCount / docsWithChunks).toFixed(1) : 0,
      chunksWithoutEmbeddings: parseInt(invalidStats.chunks_without_embeddings),
      chunksWithInvalidEmbeddings: parseInt(invalidStats.chunks_with_invalid_embeddings),
      emptyChunks: parseInt(invalidStats.empty_chunks),
      shortChunks: parseInt(invalidStats.short_chunks)
    });
    
    // Test vector search if possible
    let vectorSearchTest = null;
    try {
      if (chunkCount > 0) {
        // Get a sample embedding for testing
        const sampleChunk = await pool.query(`
          SELECT embedding FROM Veeva_Doc_Chat_document_chunks 
          WHERE embedding IS NOT NULL AND array_length(embedding, 1) = 1536
          LIMIT 1
        `);
        
        if (sampleChunk.rows.length > 0) {
          const testEmbedding = sampleChunk.rows[0].embedding;
          const vectorTest = await pool.query(`
            SELECT 
              dc.chunk_text,
              di.document_name,
              1 - (dc.embedding <=> $1::vector) as similarity
            FROM Veeva_Doc_Chat_document_chunks dc
            JOIN Veeva_Doc_Chat_document_index di ON dc.document_id = di.id
            WHERE dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> $1::vector
            LIMIT 3
          `, [testEmbedding]);
          
          vectorSearchTest = {
            success: true,
            resultsFound: vectorTest.rows.length,
            sampleResults: vectorTest.rows.map(row => ({
              document: row.document_name,
              similarity: row.similarity,
              chunkPreview: row.chunk_text.substring(0, 100) + '...'
            }))
          };
        } else {
          vectorSearchTest = { success: false, error: 'No valid embeddings found for testing' };
        }
      } else {
        vectorSearchTest = { success: false, error: 'No chunks available for testing' };
      }
    } catch (error) {
      vectorSearchTest = { success: false, error: error.message };
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: {
          totalDocuments: docCount,
          totalChunks: chunkCount,
          documentsWithChunks: docsWithChunks,
          documentsWithoutChunks: docsWithoutChunks,
          documentsWithValidEmbeddings: docsWithValidEmbeddings,
          averageChunksPerDoc: docsWithChunks > 0 ? parseFloat((chunkCount / docsWithChunks).toFixed(1)) : 0,
          chunksWithoutEmbeddings: parseInt(invalidStats.chunks_without_embeddings),
          chunksWithInvalidEmbeddings: parseInt(invalidStats.chunks_with_invalid_embeddings),
          emptyChunks: parseInt(invalidStats.empty_chunks),
          shortChunks: parseInt(invalidStats.short_chunks)
        },
        documents: docChunkStats.rows.map(row => ({
          id: row.id,
          veevaDocumentId: row.veeva_document_id,
          name: row.document_name,
          chunkCount: parseInt(row.chunk_count),
          chunksWithEmbeddings: parseInt(row.chunks_with_embeddings),
          chunksWithValidEmbeddings: parseInt(row.chunks_with_valid_embeddings)
        })),
        vectorSearchTest,
        recommendations: generateRecommendations({
          docsWithoutChunks,
          chunksWithoutEmbeddings: parseInt(invalidStats.chunks_without_embeddings),
          chunksWithInvalidEmbeddings: parseInt(invalidStats.chunks_with_invalid_embeddings),
          vectorSearchTest
        }),
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

