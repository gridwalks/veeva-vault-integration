import { getPool, initDatabase } from "./db.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  console.log('=== CHAT DIAGNOSTIC STARTED ===');
  
  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      overallHealth: 'unknown',
      issues: [],
      recommendations: [],
      details: {}
    };
    
    // 1. Check pgvector extension
    console.log('Checking pgvector extension...');
    try {
      const vectorCheck = await pool.query(`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) as vector_extension_exists
      `);
      diagnostics.details.pgvectorEnabled = vectorCheck.rows[0].vector_extension_exists;
      
      if (!vectorCheck.rows[0].vector_extension_exists) {
        diagnostics.issues.push('pgvector extension is not enabled');
        diagnostics.recommendations.push('Enable pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;');
      }
    } catch (error) {
      diagnostics.issues.push(`Error checking pgvector: ${error.message}`);
      diagnostics.details.pgvectorError = error.message;
    }
    
    // 2. Check document and chunk counts
    console.log('Checking document and chunk counts...');
    try {
      const docCount = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_index');
      const chunkCount = await pool.query('SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks');
      const chunkWithEmbeddingCount = await pool.query(`
        SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks 
        WHERE embedding IS NOT NULL AND array_length(embedding, 1) = 1536
      `);
      
      diagnostics.details.documentCount = parseInt(docCount.rows[0].count);
      diagnostics.details.chunkCount = parseInt(chunkCount.rows[0].count);
      diagnostics.details.validEmbeddingCount = parseInt(chunkWithEmbeddingCount.rows[0].count);
      
      if (diagnostics.details.documentCount === 0) {
        diagnostics.issues.push('No documents found in database');
        diagnostics.recommendations.push('Run document indexing first');
      }
      
      if (diagnostics.details.chunkCount === 0) {
        diagnostics.issues.push('No document chunks found');
        diagnostics.recommendations.push('Documents may not have been chunked properly during indexing');
      }
      
      if (diagnostics.details.validEmbeddingCount === 0) {
        diagnostics.issues.push('No chunks with valid embeddings found');
        diagnostics.recommendations.push('Re-run document indexing to generate embeddings');
      }
      
      if (diagnostics.details.validEmbeddingCount < diagnostics.details.chunkCount) {
        const invalidCount = diagnostics.details.chunkCount - diagnostics.details.validEmbeddingCount;
        diagnostics.issues.push(`${invalidCount} chunks have invalid or missing embeddings`);
        diagnostics.recommendations.push('Check embedding generation during indexing process');
      }
    } catch (error) {
      diagnostics.issues.push(`Error checking document/chunk counts: ${error.message}`);
      diagnostics.details.countError = error.message;
    }
    
    // 3. Test embedding generation
    console.log('Testing embedding generation...');
    try {
      if (process.env.OPENAI_API_KEY) {
        const testQuery = "test query for embedding";
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: testQuery,
        });
        
        const embedding = embeddingResponse.data[0].embedding;
        diagnostics.details.embeddingGeneration = {
          success: true,
          dimension: embedding.length,
          expectedDimension: 1536,
          isValid: embedding.length === 1536 && embedding.every(val => typeof val === 'number' && !isNaN(val))
        };
        
        if (!diagnostics.details.embeddingGeneration.isValid) {
          diagnostics.issues.push('Generated embedding is invalid');
          diagnostics.recommendations.push('Check OpenAI API key and model configuration');
        }
      } else {
        diagnostics.issues.push('OpenAI API key not configured');
        diagnostics.recommendations.push('Set OPENAI_API_KEY environment variable');
        diagnostics.details.embeddingGeneration = { success: false, error: 'No API key' };
      }
    } catch (error) {
      diagnostics.issues.push(`Error generating test embedding: ${error.message}`);
      diagnostics.details.embeddingGeneration = { success: false, error: error.message };
    }
    
    // 4. Test vector similarity search
    console.log('Testing vector similarity search...');
    try {
      if (diagnostics.details.pgvectorEnabled && diagnostics.details.validEmbeddingCount > 0) {
        // Get a sample embedding from the database
        const sampleChunk = await pool.query(`
          SELECT embedding FROM Veeva_Doc_Chat_document_chunks 
          WHERE embedding IS NOT NULL 
          LIMIT 1
        `);
        
        if (sampleChunk.rows.length > 0) {
          const testEmbedding = sampleChunk.rows[0].embedding;
          const testQuery = `
            SELECT 
              dc.chunk_text,
              dc.veeva_document_id,
              di.document_name,
              1 - (dc.embedding <=> $1::vector) as similarity
            FROM Veeva_Doc_Chat_document_chunks dc
            JOIN Veeva_Doc_Chat_document_index di ON dc.document_id = di.id
            WHERE dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> $1::vector
            LIMIT 3
          `;
          
          const vectorTest = await pool.query(testQuery, [testEmbedding]);
          diagnostics.details.vectorSearch = {
            success: true,
            resultsFound: vectorTest.rows.length,
            sampleSimilarities: vectorTest.rows.map(row => ({
              document: row.document_name,
              similarity: row.similarity,
              chunkPreview: row.chunk_text.substring(0, 100) + '...'
            }))
          };
          
          if (vectorTest.rows.length === 0) {
            diagnostics.issues.push('Vector search returned no results');
            diagnostics.recommendations.push('Check vector index and chunk data integrity');
          }
        } else {
          diagnostics.issues.push('No valid embeddings found for vector search test');
          diagnostics.recommendations.push('Re-run document indexing to generate embeddings');
        }
      } else {
        diagnostics.details.vectorSearch = { 
          success: false, 
          error: 'Prerequisites not met (pgvector or valid embeddings)' 
        };
      }
    } catch (error) {
      diagnostics.issues.push(`Error testing vector search: ${error.message}`);
      diagnostics.details.vectorSearch = { success: false, error: error.message };
    }
    
    // 5. Check for documents with zero chunks
    console.log('Checking for documents without chunks...');
    try {
      const docsWithoutChunks = await pool.query(`
        SELECT 
          di.id,
          di.veeva_document_id,
          di.document_name,
          COUNT(dc.id) as chunk_count
        FROM Veeva_Doc_Chat_document_index di
        LEFT JOIN Veeva_Doc_Chat_document_chunks dc ON di.id = dc.document_id
        GROUP BY di.id, di.veeva_document_id, di.document_name
        HAVING COUNT(dc.id) = 0
        ORDER BY di.document_name
        LIMIT 10
      `);
      
      diagnostics.details.documentsWithoutChunks = docsWithoutChunks.rows.map(row => ({
        id: row.id,
        veevaDocumentId: row.veeva_document_id,
        name: row.document_name
      }));
      
      if (docsWithoutChunks.rows.length > 0) {
        diagnostics.issues.push(`${docsWithoutChunks.rows.length} documents have no chunks`);
        diagnostics.recommendations.push('Re-run indexing for documents without chunks');
      }
    } catch (error) {
      diagnostics.issues.push(`Error checking documents without chunks: ${error.message}`);
    }
    
    // 6. Check chunk quality
    console.log('Checking chunk quality...');
    try {
      const chunkQuality = await pool.query(`
        SELECT 
          COUNT(*) as total_chunks,
          COUNT(CASE WHEN chunk_text IS NULL OR chunk_text = '' THEN 1 END) as empty_chunks,
          COUNT(CASE WHEN LENGTH(chunk_text) < 10 THEN 1 END) as short_chunks,
          COUNT(CASE WHEN embedding IS NULL THEN 1 END) as chunks_without_embeddings,
          COUNT(CASE WHEN array_length(embedding, 1) != 1536 THEN 1 END) as invalid_embeddings
        FROM Veeva_Doc_Chat_document_chunks
      `);
      
      const quality = chunkQuality.rows[0];
      diagnostics.details.chunkQuality = {
        totalChunks: parseInt(quality.total_chunks),
        emptyChunks: parseInt(quality.empty_chunks),
        shortChunks: parseInt(quality.short_chunks),
        chunksWithoutEmbeddings: parseInt(quality.chunks_without_embeddings),
        invalidEmbeddings: parseInt(quality.invalid_embeddings)
      };
      
      if (quality.empty_chunks > 0) {
        diagnostics.issues.push(`${quality.empty_chunks} chunks have empty text`);
      }
      if (quality.short_chunks > 0) {
        diagnostics.issues.push(`${quality.short_chunks} chunks are very short (< 10 chars)`);
      }
      if (quality.chunks_without_embeddings > 0) {
        diagnostics.issues.push(`${quality.chunks_without_embeddings} chunks have no embeddings`);
      }
      if (quality.invalid_embeddings > 0) {
        diagnostics.issues.push(`${quality.invalid_embeddings} chunks have invalid embeddings`);
      }
    } catch (error) {
      diagnostics.issues.push(`Error checking chunk quality: ${error.message}`);
    }
    
    // Determine overall health
    if (diagnostics.issues.length === 0) {
      diagnostics.overallHealth = 'healthy';
    } else if (diagnostics.issues.some(issue => 
      issue.includes('pgvector') || 
      issue.includes('embedding') || 
      issue.includes('vector search')
    )) {
      diagnostics.overallHealth = 'critical';
    } else {
      diagnostics.overallHealth = 'warning';
    }
    
    console.log('=== CHAT DIAGNOSTIC COMPLETED ===');
    console.log('Overall health:', diagnostics.overallHealth);
    console.log('Issues found:', diagnostics.issues.length);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(diagnostics)
    };
    
  } catch (error) {
    console.error('=== CHAT DIAGNOSTIC ERROR ===');
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
        timestamp: new Date().toISOString(),
        overallHealth: 'error'
      })
    };
  }
};
