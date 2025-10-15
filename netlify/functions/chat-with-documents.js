import { getPool, initDatabase } from "./db.js";
import OpenAI from "openai";
import Groq from "groq-sdk";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Function to detect comparison intent in user messages
function detectComparisonIntent(message) {
  if (!message || typeof message !== 'string') {
    return false;
  }
  
  const comparisonKeywords = [
    'compare', 'comparison', 'compare to', 'compare with',
    'differences between', 'difference between', 'diff between',
    'errors based on', 'error based on', 'review against',
    'compliance with', 'comply with', 'against the',
    'versus', 'vs', 'vs.', 'against', 'check against',
    'validate against', 'verify against', 'cross-check',
    'cross reference', 'cross-reference', 'match against',
    'align with', 'alignment with', 'consistency with',
    'inconsistencies', 'gaps', 'missing requirements',
    'requirements mapping', 'traceability'
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // Check for comparison keywords
  const hasComparisonKeywords = comparisonKeywords.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  // Check for document reference patterns
  const hasDocumentReferences = /\b(?:document|doc|file|report|assessment|specification|requirement|srd|risk assessment)\b/i.test(message);
  
  // Check for comparison structure patterns
  const hasComparisonStructure = /\b(?:this|that|these|those)\s+(?:document|doc|file|report|assessment|specification|requirement|srd)\b/i.test(message);
  
  return hasComparisonKeywords && (hasDocumentReferences || hasComparisonStructure);
}

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('=== CHAT WITH DOCUMENTS STARTED ===');
  
  try {
    // Check for required environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "OpenAI API key is not configured. Please contact your administrator.",
          details: "OPENAI_API_KEY environment variable is missing"
        })
      };
    }

    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is not set');
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Database is not configured. Please contact your administrator.",
          details: "DATABASE_URL environment variable is missing"
        })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { message, documentIds, conversationHistory = [], userId } = body;
    
    // Detect comparison intent
    const isComparisonQuery = detectComparisonIntent(message);
    console.log('Comparison intent detected:', isComparisonQuery);
    
    if (!message || !message.trim()) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Message is required"
        })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "User ID is required for document chat"
        })
      };
    }

    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Separate Veeva document IDs from uploaded document IDs
    let veevaDocumentIds = [];
    let uploadedDocumentIds = [];
    
    if (documentIds && Array.isArray(documentIds)) {
      documentIds.forEach(id => {
        if (typeof id === 'string' && id.startsWith('uploaded_')) {
          // Extract the numeric ID after 'uploaded_' prefix
          uploadedDocumentIds.push(parseInt(id.substring(9), 10));
        } else {
          veevaDocumentIds.push(id);
        }
      });
    }

    console.log('Chat request details:', {
      message: message.substring(0, 100) + '...',
      originalDocumentIds: documentIds,
      veevaDocumentIds: veevaDocumentIds.length > 0 ? veevaDocumentIds : 'none',
      uploadedDocumentIds: uploadedDocumentIds.length > 0 ? uploadedDocumentIds : 'none',
      veevaCount: veevaDocumentIds.length,
      uploadedCount: uploadedDocumentIds.length,
      historyLength: conversationHistory.length
    });

    // Generate embedding for the query
    console.log('Generating embedding for user query...');
    const embeddingStartTime = Date.now();
    let queryEmbedding = null;
    
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: message,
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      
      // Validate embedding
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1536) {
        console.error('Invalid embedding generated:', {
          isArray: Array.isArray(queryEmbedding),
          length: queryEmbedding?.length,
          type: typeof queryEmbedding
        });
        queryEmbedding = null;
        vectorSearchFailed = true;
      } else {
        console.log(`Query embedding generated in ${Date.now() - embeddingStartTime}ms`);
      }
    } catch (embeddingError) {
      console.error('Error generating query embedding:', embeddingError);
      queryEmbedding = null;
      vectorSearchFailed = true;
    }

    // Get relevant chunks using semantic search
    let relevantChunks = [];
    let relevantDocuments = [];
    let relevantExternalResources = [];
    let vectorSearchFailed = false;
    
    if (queryEmbedding) {
      // Perform vector similarity search
      console.log('Performing semantic search using embeddings...');
      const vectorSearchStartTime = Date.now();
      
      try {
        // Convert embedding array to PostgreSQL vector format
        const embeddingStr = '[' + queryEmbedding.join(',') + ']';
        
        let veevaChunks = [];
        let uploadedChunks = [];
        
        // Query Veeva document chunks if we have Veeva document IDs
        if (veevaDocumentIds.length > 0) {
          const veevaPlaceholders = veevaDocumentIds.map((_, index) => `$${index + 2}`).join(',');
          // Increase chunk limit for comparison mode to get more comprehensive content
          const chunkLimit = isComparisonQuery ? 10 : 5;
          const veevaQuery = `
            SELECT 
              dc.chunk_text,
              dc.veeva_document_id,
              dc.chunk_index,
              di.document_name,
              di.document_number,
              di.major_version,
              di.minor_version,
              di.document_type,
              di.status,
              1 - (dc.embedding <=> $1::vector) as similarity,
              'veeva' as source_type
            FROM Veeva_Doc_Chat_document_chunks dc
            JOIN Veeva_Doc_Chat_document_index di ON dc.document_id = di.id
            WHERE dc.veeva_document_id IN (${veevaPlaceholders})
            ORDER BY dc.embedding <=> $1::vector
            LIMIT ${chunkLimit}
          `;
          const veevaResult = await pool.query(veevaQuery, [embeddingStr, ...veevaDocumentIds]);
          veevaChunks = veevaResult.rows;
          console.log(`Found ${veevaChunks.length} Veeva chunks (comparison mode: ${isComparisonQuery})`);
        } else if (veevaDocumentIds.length === 0 && uploadedDocumentIds.length === 0) {
          // If no specific docs selected at all, search all Veeva docs
          const veevaQuery = `
            SELECT 
              dc.chunk_text,
              dc.veeva_document_id,
              dc.chunk_index,
              di.document_name,
              di.document_number,
              di.major_version,
              di.minor_version,
              di.document_type,
              di.status,
              1 - (dc.embedding <=> $1::vector) as similarity,
              'veeva' as source_type
            FROM Veeva_Doc_Chat_document_chunks dc
            JOIN Veeva_Doc_Chat_document_index di ON dc.document_id = di.id
            ORDER BY dc.embedding <=> $1::vector
            LIMIT 5
          `;
          const veevaResult = await pool.query(veevaQuery, [embeddingStr]);
          veevaChunks = veevaResult.rows;
          console.log(`Found ${veevaChunks.length} Veeva chunks from all documents`);
        }
        
        // Query uploaded document chunks if we have uploaded document IDs
        if (uploadedDocumentIds.length > 0) {
          const uploadedPlaceholders = uploadedDocumentIds.map((_, index) => `$${index + 2}`).join(',');
          // Increase chunk limit for comparison mode to get more comprehensive content
          const chunkLimit = isComparisonQuery ? 10 : 5;
          const uploadedQuery = `
            SELECT 
              c.chunk_text,
              c.document_id as upload_document_id,
              c.chunk_index,
              d.document_name,
              d.document_type,
              d.ai_summary,
              d.file_size,
              d.original_filename,
              1 - (c.embedding <=> $1::vector) as similarity,
              'upload' as source_type
            FROM qms_chat_document_chunks c
            JOIN qms_chat_documents d ON c.document_id = d.id
            WHERE c.document_id IN (${uploadedPlaceholders}) AND c.user_id = $${uploadedDocumentIds.length + 2}
            ORDER BY c.embedding <=> $1::vector
            LIMIT ${chunkLimit}
          `;
          
          console.log('Executing uploaded document query:', {
            query: uploadedQuery,
            params: [embeddingStr, ...uploadedDocumentIds, userId],
            uploadedDocumentIds,
            userId,
            chunkLimit
          });
          
          const uploadedResult = await pool.query(uploadedQuery, [embeddingStr, ...uploadedDocumentIds, userId]);
          uploadedChunks = uploadedResult.rows;
          console.log(`Found ${uploadedChunks.length} uploaded document chunks for user ${userId} (comparison mode: ${isComparisonQuery})`);
          
          if (uploadedChunks.length === 0) {
            console.log('No uploaded chunks found. Checking if documents exist in database...');
            const docCheckQuery = `
              SELECT id, document_name, user_id 
              FROM qms_chat_documents 
              WHERE id IN (${uploadedPlaceholders}) AND user_id = $${uploadedDocumentIds.length + 1}
            `;
            const docCheckResult = await pool.query(docCheckQuery, [...uploadedDocumentIds, userId]);
            console.log('Document check result:', docCheckResult.rows);
            
            const chunkCheckQuery = `
              SELECT COUNT(*) as chunk_count, document_id 
              FROM qms_chat_document_chunks 
              WHERE document_id IN (${uploadedPlaceholders}) AND user_id = $${uploadedDocumentIds.length + 1}
              GROUP BY document_id
            `;
            const chunkCheckResult = await pool.query(chunkCheckQuery, [...uploadedDocumentIds, userId]);
            console.log('Chunk check result:', chunkCheckResult.rows);
          }
        }
        
        // Combine and sort by similarity
        // For comparison mode, keep more chunks to ensure comprehensive analysis
        const maxChunks = isComparisonQuery ? 20 : 5;
        relevantChunks = [...veevaChunks, ...uploadedChunks]
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, maxChunks);
        
        console.log(`Vector search completed in ${Date.now() - vectorSearchStartTime}ms`);
        console.log(`Found ${relevantChunks.length} relevant chunks with similarity scores:`, 
          relevantChunks.map(c => ({ doc: c.document_name, chunk: c.chunk_index, similarity: c.similarity.toFixed(3) }))
        );
      } catch (vectorError) {
        console.error('Vector search failed:', {
          message: vectorError.message,
          code: vectorError.code,
          detail: vectorError.detail,
          hint: vectorError.hint
        });
        console.warn('Falling back to keyword search. pgvector may not be enabled or vector index may be corrupted.');
        vectorSearchFailed = true;
        queryEmbedding = null; // Force fallback to keyword search
      }
      
      // Get unique documents from the chunks
      const uniqueVeevaDocIds = [...new Set(relevantChunks
        .filter(c => c.source_type === 'veeva' && c.veeva_document_id)
        .map(c => c.veeva_document_id))];
      
      const uniqueUploadedDocIds = [...new Set(relevantChunks
        .filter(c => c.source_type === 'upload' && c.upload_document_id)
        .map(c => c.upload_document_id))];
      
      console.log('Semantic search results:', {
        totalChunks: relevantChunks.length,
        uniqueVeevaDocIds: uniqueVeevaDocIds,
        uniqueUploadedDocIds: uniqueUploadedDocIds,
        chunkDetails: relevantChunks.map(c => ({
          docId: c.veeva_document_id || c.upload_document_id,
          docName: c.document_name,
          docNumber: c.document_number,
          similarity: c.similarity,
          source: c.source_type
        }))
      });
      
      // Fetch Veeva document metadata
      if (uniqueVeevaDocIds.length > 0) {
        const veevaDocPlaceholders = uniqueVeevaDocIds.map((_, index) => `$${index + 1}`).join(',');
        const veevaDocQuery = `
          SELECT veeva_document_id, document_number, document_name, 
                 major_version, minor_version, document_type, status, summary, manual_summary,
                 'veeva' as source_type
          FROM Veeva_Doc_Chat_document_index 
          WHERE veeva_document_id IN (${veevaDocPlaceholders})
        `;
        const veevaDocResult = await pool.query(veevaDocQuery, uniqueVeevaDocIds);
        relevantDocuments.push(...veevaDocResult.rows);
      }
      
      // Fetch uploaded document metadata
      if (uniqueUploadedDocIds.length > 0) {
        const uploadedDocPlaceholders = uniqueUploadedDocIds.map((_, index) => `$${index + 1}`).join(',');
        const uploadedDocQuery = `
          SELECT id as document_id, document_name, document_type, 
                 ai_summary, file_size, original_filename, created_at,
                 'upload' as source_type
          FROM qms_chat_documents
          WHERE id IN (${uploadedDocPlaceholders})
        `;
        const uploadedDocResult = await pool.query(uploadedDocQuery, uniqueUploadedDocIds);
        relevantDocuments.push(...uploadedDocResult.rows);
      }
    }
    
    // Always run keyword search for document numbers, even if semantic search worked
    // This ensures we catch exact document number matches that semantic search might miss
    console.log('Running keyword search for document numbers...');
    const searchTerms = message.toLowerCase().split(' ').filter(term => {
      // Keep terms longer than 3 characters
      if (term.length > 3) return true;
      
      // Keep terms that look like document numbers (contain numbers, hyphens, or are alphanumeric)
      if (/^[a-z0-9\-_]+$/i.test(term)) return true;
      
      // Keep single letters that might be important (like "A", "B", "C" in document codes)
      if (term.length === 1 && /^[a-z]$/i.test(term)) return true;
      
      return false;
    });
    
    console.log('Search terms after filtering:', {
      originalMessage: message,
      allTerms: message.toLowerCase().split(' '),
      filteredTerms: searchTerms
    });
    
    if (searchTerms.length > 0 && veevaDocumentIds.length === 0 && uploadedDocumentIds.length === 0) {
        // Create a search query that looks for terms in document names, summaries, manual summaries, types, and document numbers
        const searchConditions = searchTerms.map((term, index) => 
          `(document_name ILIKE $${index + 1} OR summary ILIKE $${index + 1} OR manual_summary ILIKE $${index + 1} OR document_type ILIKE $${index + 1} OR document_number ILIKE $${index + 1})`
        ).join(' OR ');
        
        const searchParams = searchTerms.map(term => `%${term}%`);
        const query = `
          SELECT veeva_document_id, document_number, document_name, 
                 major_version, minor_version, document_type, status, summary, manual_summary,
                 'veeva' as source_type
          FROM Veeva_Doc_Chat_document_index 
          WHERE ${searchConditions}
          ORDER BY 
            CASE 
              WHEN document_name ILIKE ANY($${searchParams.length + 1}) THEN 1
              WHEN manual_summary ILIKE ANY($${searchParams.length + 2}) THEN 2
              WHEN summary ILIKE ANY($${searchParams.length + 3}) THEN 3
              ELSE 4
            END,
            document_name
          LIMIT 10
        `;
        
        console.log('Keyword search query:', query);
        console.log('Search parameters:', searchParams);
        console.log('Search conditions:', searchConditions);
        
        const result = await pool.query(query, [...searchParams, searchParams, searchParams, searchParams]);
        const keywordSearchDocuments = result.rows;
        
        console.log(`Found ${keywordSearchDocuments.length} relevant documents based on keyword search`);
        console.log('Keyword search documents:', keywordSearchDocuments.map(doc => ({
          id: doc.veeva_document_id,
          number: doc.document_number,
          name: doc.document_name
        })));
        
        // Merge with existing documents from semantic search, avoiding duplicates
        const existingDocIds = new Set(relevantDocuments.map(doc => doc.veeva_document_id || doc.document_id));
        const newDocuments = keywordSearchDocuments.filter(doc => !existingDocIds.has(doc.veeva_document_id));
        relevantDocuments.push(...newDocuments);
        
        console.log(`Added ${newDocuments.length} new documents from keyword search (${relevantDocuments.length} total)`);
        console.log('Final relevant documents:', relevantDocuments.map(doc => ({
          id: doc.veeva_document_id || doc.document_id,
          number: doc.document_number,
          name: doc.document_name,
          source: doc.source_type || 'unknown'
        })));
        
        // For documents found by keyword search but not semantic search, 
        // we need to add their content to the context so the AI can respond about them
        if (newDocuments.length > 0) {
          console.log('Adding keyword-only documents to context for AI response...');
          // These documents will be included in the documentContext via the relevantDocuments array
          // The AI will use their summaries and metadata to respond
        }
    } else if (documentIds && documentIds.length > 0) {
      // Get specific documents by IDs
      const placeholders = documentIds.map((_, index) => `$${index + 1}`).join(',');
      const query = `
        SELECT veeva_document_id, document_number, document_name, 
               major_version, minor_version, document_type, status, summary, manual_summary,
               'veeva' as source_type
        FROM Veeva_Doc_Chat_document_index 
        WHERE veeva_document_id IN (${placeholders})
        ORDER BY document_name
      `;
      
      const result = await pool.query(query, documentIds);
      relevantDocuments = result.rows;
      
      console.log(`Retrieved ${relevantDocuments.length} specific documents for chat`);
    } else if (searchTerms.length === 0) {
      // If no search terms, get the most recent documents
      const query = `
        SELECT veeva_document_id, document_number, document_name, 
               major_version, minor_version, document_type, status, summary, manual_summary,
               'veeva' as source_type
        FROM Veeva_Doc_Chat_document_index 
        ORDER BY updated_at DESC
        LIMIT 5
      `;
      
      const result = await pool.query(query);
      relevantDocuments = result.rows;
      
      console.log(`Retrieved ${relevantDocuments.length} recent documents for chat`);
    }

    // Search for relevant external resources
    console.log('Searching for relevant external resources...');
    try {
      // Extract keywords from the user message for external resource search
      const keywords = message.toLowerCase()
        .split(/\s+/)
        .filter(word => {
          // Keep words longer than 3 characters
          if (word.length > 3) return true;
          
          // Keep words that look like document numbers (contain numbers, hyphens, or are alphanumeric)
          if (/^[a-z0-9\-_]+$/i.test(word)) return true;
          
          // Keep single letters that might be important (like "A", "B", "C" in document codes)
          if (word.length === 1 && /^[a-z]$/i.test(word)) return true;
          
          return false;
        })
        .slice(0, 5); // Take first 5 keywords
      
      if (keywords.length > 0) {
        // Build a condition that checks title, description, and tags properly
        const keywordConditions = keywords.map((_, index) => {
          const paramIndex = index * 2 + 1;
          return `(LOWER(title) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex} OR EXISTS (
            SELECT 1 FROM unnest(tags) AS tag 
            WHERE LOWER(tag) LIKE $${paramIndex + 1}
          ))`;
        }).join(' OR ');
        
        const externalResourceQuery = `
          SELECT id, title, url, description, category, tags, created_at
          FROM qms_chat_external_resources 
          WHERE ${keywordConditions}
          ORDER BY created_at DESC
          LIMIT 3
        `;
        
        // Flatten parameters: for each keyword, add both the pattern for LIKE and the pattern for tag matching
        const keywordParams = [];
        keywords.forEach(keyword => {
          keywordParams.push(`%${keyword}%`); // For title/description LIKE
          keywordParams.push(`%${keyword}%`); // For tag LIKE
        });
        
        const externalResult = await pool.query(externalResourceQuery, keywordParams);
        relevantExternalResources = externalResult.rows;
        
        console.log(`Found ${relevantExternalResources.length} relevant external resources`);
      }
    } catch (externalError) {
      console.error('Error searching external resources:', externalError);
      console.error('Error details:', {
        message: externalError.message,
        stack: externalError.stack
      });
      // Continue without external resources if search fails
      relevantExternalResources = [];
    }

    if (relevantDocuments.length === 0 && relevantChunks.length === 0 && relevantExternalResources.length === 0) {
      console.log('No relevant content found for query:', {
        message: message.substring(0, 100),
        vectorSearchFailed,
        documentIdsProvided: documentIds && documentIds.length > 0,
        documentIdsCount: documentIds ? documentIds.length : 0
      });
      
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: `I couldn't find any relevant documents or external resources to answer your question. 

**Troubleshooting:**
- ${vectorSearchFailed ? 'Vector search is not available (using keyword search fallback)' : 'Vector search completed but found no matches'}
- ${documentIds && documentIds.length > 0 ? `You selected ${documentIds.length} document(s), but none contained relevant content` : 'No specific documents were selected'}
- Please make sure documents have been indexed and contain relevant content
- Try rephrasing your question or selecting different documents`,
          documents: [],
          externalResources: [],
          conversationHistory: [...conversationHistory, { role: 'user', content: message }],
          metadata: {
            vectorSearchFailed,
            documentsUsed: 0,
            chunksUsed: 0,
            externalResourcesUsed: 0,
            usingRAG: false,
            responseTime: 0,
            tokensUsed: 0
          }
        })
      };
    }

    // Build context from relevant chunks or documents
    let documentContext = '';
    
    if (relevantChunks.length > 0) {
      // Use RAG approach with semantic chunks
      console.log('Building context from relevant chunks (RAG)');
      const chunkContext = relevantChunks.map((chunk, index) => {
        return `**Relevant Section ${index + 1}** from "${chunk.document_name}" (${chunk.document_number} v${chunk.major_version}.${chunk.minor_version})
Similarity: ${(chunk.similarity * 100).toFixed(1)}%

${chunk.chunk_text}

---`;
      }).join('\n\n');
      
      // Also include document summaries for any documents that weren't found by semantic search
      const documentsWithChunks = new Set(relevantChunks.map(c => c.veeva_document_id || c.upload_document_id));
      const documentsWithoutChunks = relevantDocuments.filter(doc => {
        const docId = doc.veeva_document_id || doc.document_id;
        return docId && !documentsWithChunks.has(docId);
      });
      
      if (documentsWithoutChunks.length > 0) {
        console.log(`Adding ${documentsWithoutChunks.length} documents found by keyword search but not semantic search`);
        const summaryContext = documentsWithoutChunks.map(doc => {
          let context = `**${doc.document_name}** (${doc.document_number} v${doc.major_version}.${doc.minor_version})
Type: ${doc.document_type || 'Unknown'}
Status: ${doc.status || 'Unknown'}`;

          // Add AI summary if available
          if (doc.summary) {
            context += `\nAI Summary: ${doc.summary}`;
          }

          // Add manual summary if available
          if (doc.manual_summary) {
            context += `\nManual Summary: ${doc.manual_summary}`;
          }

          // If no summaries available
          if (!doc.summary && !doc.manual_summary) {
            context += `\nSummary: No summary available`;
          }

          context += '\n\n---';
          return context;
        }).join('\n\n');
        
        documentContext = chunkContext + '\n\n' + summaryContext;
      } else {
        documentContext = chunkContext;
      }
    } else if (relevantDocuments.length > 0) {
      // Fallback to document summaries
      console.log('Building context from document summaries (keyword search fallback)');
      documentContext = relevantDocuments.map(doc => {
        let context = `**${doc.document_name}** (${doc.document_number} v${doc.major_version}.${doc.minor_version})
Type: ${doc.document_type || 'Unknown'}
Status: ${doc.status || 'Unknown'}`;

        // Add AI summary if available
        if (doc.summary) {
          context += `\nAI Summary: ${doc.summary}`;
        }

        // Add manual summary if available
        if (doc.manual_summary) {
          context += `\nManual Summary: ${doc.manual_summary}`;
        }

        // If no summaries available
        if (!doc.summary && !doc.manual_summary) {
          context += `\nSummary: No summary available`;
        }

        context += '\n\n---';
        return context;
      }).join('\n\n');
    } else {
      // No documents or chunks found - create minimal context
      console.log('No relevant content found, using minimal context');
      documentContext = 'No relevant document content was found for this query.';
    }

    // Build external resources context
    let externalResourcesContext = '';
    if (relevantExternalResources.length > 0) {
      externalResourcesContext = '\n\n**Relevant External Resources:**\n' + 
        relevantExternalResources.map((resource, index) => {
          return `${index + 1}. **${resource.title}** (${resource.category || 'Uncategorized'})
   URL: ${resource.url}
   ${resource.description ? `Description: ${resource.description}` : ''}
   ${resource.tags && resource.tags.length > 0 ? `Tags: ${resource.tags.join(', ')}` : ''}`;
        }).join('\n\n');
    }

    // Prepare the system prompt based on whether this is a comparison query
    const systemPrompt = isComparisonQuery && relevantChunks.length > 0
      ? `You are an AI assistant specialized in comparing pharmaceutical documents. You have access to content from multiple documents and need to perform a comprehensive comparison analysis.

COMPARISON ANALYSIS INSTRUCTIONS:
1. **Document Analysis**: Analyze each document to understand its purpose, scope, and key requirements
2. **Requirements Mapping**: Identify requirements, specifications, or standards in the reference document(s)
3. **Implementation Review**: Check how these requirements are addressed in the target document(s)
4. **Gap Analysis**: Identify missing requirements, inconsistencies, and implementation gaps
5. **Error Detection**: Look for errors, contradictions, or non-compliance issues
6. **Compliance Assessment**: Evaluate adherence to stated requirements and standards

OUTPUT FORMAT REQUIREMENTS:
You MUST provide BOTH structured and narrative outputs:

**Structured Output (Tables/Lists):**
- Create comparison tables showing requirements vs implementation
- Use status indicators: ✓ (Compliant), ✗ (Missing/Gap), ⚠ (Partial/Inconsistent)
- Include specific section references and page numbers when available
- Organize findings by category (Missing Requirements, Inconsistencies, Gaps, etc.)

**Narrative Output:**
- Provide detailed analysis explaining the findings
- Explain the significance of each gap or inconsistency
- Suggest specific actions to address identified issues
- Reference specific document sections and quotes

DOCUMENT CONTEXT:
${documentContext}${externalResourcesContext}

Remember: Be thorough, specific, and actionable in your comparison analysis.`
      : relevantChunks.length > 0
      ? `You are an AI assistant that helps users understand and work with pharmaceutical documents from Veeva Vault. You have access to relevant sections from documents retrieved using semantic search (RAG - Retrieval Augmented Generation) and related external resources.

When answering questions:
1. Use the provided document sections to give accurate, helpful answers based on the actual content
2. Reference specific documents by name and number when relevant
3. If the answer isn't in the provided sections, say so clearly - don't make up information
4. Provide actionable insights based on the document content
5. Maintain a professional, helpful tone appropriate for the pharmaceutical industry
6. If asked about processes, procedures, or compliance topics, focus on what the documents actually say
7. When discussing regulatory standards or practices, use "Good Clinical Practices (GCP)" instead of "Good Manufacturing Practices (GMP)"
8. The similarity percentage indicates how relevant each section is to the query
9. Quote or paraphrase the document sections when answering to show your sources
10. When relevant external resources are available, mention them and suggest users check them for additional information
11. Always provide the external resource titles and URLs when referencing them

Relevant Document Sections:
${documentContext}${externalResourcesContext}`
      : relevantDocuments.length > 0
      ? `You are an AI assistant that helps users understand and work with pharmaceutical documents from Veeva Vault. You have access to both AI-generated summaries and user-added manual summaries from an indexed document collection, as well as related external resources.

When answering questions:
1. Use the provided document context to give accurate, helpful answers
2. Reference specific documents by name and number when relevant
3. If the answer isn't in the provided documents, say so clearly
4. Provide actionable insights based on the document content
5. Maintain a professional, helpful tone appropriate for the pharmaceutical industry
6. If asked about processes, procedures, or compliance topics, focus on what the documents actually say
7. When both AI and manual summaries are available, consider both perspectives and note any differences
8. Prioritize manual summaries when they provide additional context or corrections to AI summaries
9. When discussing regulatory standards or practices, use "Good Clinical Practices (GCP)" instead of "Good Manufacturing Practices (GMP)"
10. When relevant external resources are available, mention them and suggest users check them for additional information
11. Always provide the external resource titles and URLs when referencing them

Document Context:
${documentContext}${externalResourcesContext}`
      : `You are an AI assistant that helps users understand and work with pharmaceutical documents from Veeva Vault. 

I don't have access to any specific documents or external resources for this query. Please make sure documents have been properly indexed and try rephrasing your question or selecting different documents.

${externalResourcesContext}`;

    // Prepare conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    console.log('Sending request to OpenAI:', {
      messageCount: messages.length,
      documentCount: relevantDocuments.length,
      chunkCount: relevantChunks.length,
      externalResourceCount: relevantExternalResources.length,
      usingRAG: relevantChunks.length > 0,
      totalContextLength: systemPrompt.length + message.length,
      systemPromptLength: systemPrompt.length,
      documentContextLength: documentContext.length,
      vectorSearchFailed
    });

    // Call Groq API
    const groqStartTime = Date.now();
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: messages,
      max_tokens: 800,
      temperature: 0.3,
    });

    const groqDuration = Date.now() - groqStartTime;
    const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

    console.log('Groq response received:', {
      responseTime: `${groqDuration}ms`,
      responseLength: response.length,
      responsePreview: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
      tokensUsed: completion.usage?.total_tokens || 0,
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
      finishReason: completion.choices[0]?.finish_reason
    });

    // Store comparison history if this was a comparison query
    if (isComparisonQuery && relevantDocuments.length > 0) {
      try {
        const comparisonMetadata = {
          isComparison: true,
          documentsCompared: relevantDocuments.length,
          chunksAnalyzed: relevantChunks.length,
          comparisonType: 'document_analysis',
          timestamp: new Date().toISOString()
        };
        
        await pool.query(`
          INSERT INTO qms_chat_document_comparisons 
          (user_id, session_id, document_ids, comparison_query, comparison_result, comparison_metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          userId,
          Date.now().toString(), // Simple session identifier
          relevantDocuments.map(doc => doc.veeva_document_id || doc.document_id),
          message,
          response,
          JSON.stringify(comparisonMetadata)
        ]);
        
        console.log('Comparison history stored successfully');
      } catch (comparisonError) {
        console.warn('Error storing comparison history:', comparisonError);
        // Don't fail the request if comparison storage fails
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log('Chat with documents completed:', {
      totalDuration: `${totalDuration}ms`,
      documentsUsed: relevantDocuments.length,
      externalResourcesUsed: relevantExternalResources.length,
      isComparisonQuery,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response, // Keep for backward compatibility
        documents: relevantDocuments.map(doc => ({
          id: doc.veeva_document_id,
          name: doc.document_name,
          number: doc.document_number,
          version: `${doc.major_version}.${doc.minor_version}`,
          type: doc.document_type,
          status: doc.status
        })),
        externalResources: relevantExternalResources.map(resource => ({
          id: resource.id,
          title: resource.title,
          url: resource.url,
          description: resource.description,
          category: resource.category,
          tags: resource.tags || []
        })),
        conversationHistory: [
          ...conversationHistory.slice(-9), // Keep last 9 to make room for new messages
          { role: 'user', content: message },
          { role: 'assistant', content: response }
        ],
        metadata: {
          documentsUsed: relevantDocuments.length,
          chunksUsed: relevantChunks.length,
          externalResourcesUsed: relevantExternalResources.length,
          usingRAG: relevantChunks.length > 0,
          responseTime: groqDuration,
          tokensUsed: completion.usage?.total_tokens || 0,
          isComparisonQuery: isComparisonQuery
        }
      })
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('=== CHAT WITH DOCUMENTS ERROR ===');
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString()
    });

    // Provide more specific error messages based on error type
    let userMessage = "Failed to process chat request";
    let details = error.message;

    if (error.message && (error.message.includes('OpenAI') || error.message.includes('Groq'))) {
      userMessage = "Failed to connect to AI API. Please check your API key configuration.";
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      userMessage = "Failed to connect to the database. Please check your database configuration.";
    } else if (error.message && error.message.includes('vector')) {
      userMessage = "Vector search is not available. Keyword search fallback may be limited.";
    } else if (error.message && error.message.includes('parse')) {
      userMessage = "Failed to parse request data. Please check your input.";
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: userMessage,
        details: details,
        timestamp: new Date().toISOString()
      })
    };
  }
};
