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
    let uploadedDocCount = 0;
    let uploadedChunkCount = 0;

    try {
      const uploadedDocCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM qms_chat_documents'
      );
      uploadedDocCount = parseInt(uploadedDocCountResult.rows[0].count);
    } catch (e) {
      console.log('Uploaded documents table not accessible:', e.message);
    }

    const docCount = uploadedDocCount;

    try {
      const uploadedChunkCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM qms_chat_document_chunks'
      );
      uploadedChunkCount = parseInt(uploadedChunkCountResult.rows[0].count);
    } catch (e) {
      console.log('Uploaded chunks table not accessible:', e.message);
    }

    const chunkCount = uploadedChunkCount;

    // Get documents with chunk counts and embedding validation
    let uploadedDocChunkStats = { rows: [] };

    try {
      uploadedDocChunkStats = await pool.query(`
        SELECT
          d.id,
          d.original_filename,
          d.document_name,
          COUNT(c.id) as chunk_count,
          COUNT(CASE WHEN c.embedding IS NOT NULL THEN 1 END) as chunks_with_embeddings,
          COUNT(CASE WHEN c.embedding IS NOT NULL THEN 1 END) as chunks_with_valid_embeddings,
          'upload' as source_type
        FROM qms_chat_documents d
        LEFT JOIN qms_chat_document_chunks c ON d.id = c.document_id
        GROUP BY d.id, d.original_filename, d.document_name
      `);
    } catch (e) {
      console.log('Uploaded documents query failed:', e.message);
    }

    const docChunkStats = { rows: uploadedDocChunkStats.rows };
    
    const docsWithChunks = docChunkStats.rows.filter(row => row.chunk_count > 0).length;
    const docsWithoutChunks = docChunkStats.rows.filter(row => row.chunk_count === 0).length;
    const docsWithValidEmbeddings = docChunkStats.rows.filter(row => row.chunks_with_valid_embeddings > 0).length;
    
    // Check for chunks with invalid embeddings
    let uploadedInvalidEmbeddingStats = { rows: [{ chunks_without_embeddings: 0, chunks_with_invalid_embeddings: 0, empty_chunks: 0, short_chunks: 0 }] };

    try {
      uploadedInvalidEmbeddingStats = await pool.query(`
        SELECT
          COUNT(CASE WHEN embedding IS NULL THEN 1 END) as chunks_without_embeddings,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as chunks_with_invalid_embeddings,
          COUNT(CASE WHEN chunk_text IS NULL OR chunk_text = '' THEN 1 END) as empty_chunks,
          COUNT(CASE WHEN LENGTH(chunk_text) < 10 THEN 1 END) as short_chunks
        FROM qms_chat_document_chunks
      `);
    } catch (e) {
      console.log('Uploaded chunks table not accessible:', e.message);
    }

    const invalidStats = {
      chunks_without_embeddings: parseInt(uploadedInvalidEmbeddingStats.rows[0].chunks_without_embeddings),
      chunks_with_invalid_embeddings: parseInt(uploadedInvalidEmbeddingStats.rows[0].chunks_with_invalid_embeddings),
      empty_chunks: parseInt(uploadedInvalidEmbeddingStats.rows[0].empty_chunks),
      short_chunks: parseInt(uploadedInvalidEmbeddingStats.rows[0].short_chunks)
    };
    
    console.log('Chunk statistics:', {
      totalDocuments: docCount,
      totalChunks: chunkCount,
      documentsWithChunks: docsWithChunks,
      documentsWithoutChunks: docsWithoutChunks,
      documentsWithValidEmbeddings: docsWithValidEmbeddings,
      averageChunksPerDoc: docsWithChunks > 0 ? (chunkCount / docsWithChunks).toFixed(1) : 0,
      chunksWithoutEmbeddings: invalidStats.chunks_without_embeddings,
      chunksWithInvalidEmbeddings: invalidStats.chunks_with_invalid_embeddings,
      emptyChunks: invalidStats.empty_chunks,
      shortChunks: invalidStats.short_chunks
    });
    
    // Test vector search if possible
    let vectorSearchTest = null;
    try {
      if (chunkCount > 0) {
        // Try to get a sample embedding from uploaded chunks table
        const sampleChunk = await pool.query(`
          SELECT embedding FROM qms_chat_document_chunks
          WHERE embedding IS NOT NULL
          LIMIT 1
        `);

        if (sampleChunk.rows.length > 0) {
          const testEmbedding = sampleChunk.rows[0].embedding;

          const vectorTest = await pool.query(`
            SELECT
              c.chunk_text,
              d.document_name,
              1 - (c.embedding <=> $1::vector) as similarity
            FROM qms_chat_document_chunks c
            JOIN qms_chat_documents d ON c.document_id = d.id
            WHERE c.embedding IS NOT NULL
            ORDER BY c.embedding <=> $1::vector
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
          originalFilename: row.original_filename,
          name: row.document_name,
          chunkCount: parseInt(row.chunk_count),
          chunksWithEmbeddings: parseInt(row.chunks_with_embeddings),
          chunksWithValidEmbeddings: parseInt(row.chunks_with_valid_embeddings)
        })),
        vectorSearchTest,
        recommendations: generateRecommendations({
          docsWithoutChunks,
          chunksWithoutEmbeddings: invalidStats.chunks_without_embeddings,
          chunksWithInvalidEmbeddings: invalidStats.chunks_with_invalid_embeddings,
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

