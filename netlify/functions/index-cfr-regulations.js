import { getPool, initDatabase } from "./db.js";
import { OpenAI } from "openai";
import { chunkText, validateChunks } from './chunking-utils.js';
import { extractTextFromHTMLStructured } from './html-extraction-utils.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to log indexing activities
async function logIndexingActivity(pool, logData) {
  try {
    const {
      operationType,
      sourceType,
      documentId,
      documentName,
      documentType,
      version,
      status,
      processingDurationMs,
      chunksCreated = 0,
      summaryGenerated = false,
      errorMessage = null,
      batchId,
      batchOffset,
      userId = null,
      sessionId = null,
      forceRegenerate = false
    } = logData;

    await pool.query(`
      INSERT INTO qms_chat_indexing_logs (
        operation_type, source_type, document_id, veeva_document_id, 
        document_name, document_number, document_type, version, status,
        processing_duration_ms, chunks_created, summary_generated, error_message,
        batch_id, batch_offset, user_id, session_id, force_regenerate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      operationType, sourceType, documentId, null, // veeva_document_id is null for CFR
      documentName, null, // document_number is null for CFR
      documentType, version, status,
      processingDurationMs, chunksCreated, summaryGenerated, errorMessage,
      batchId, batchOffset, userId, sessionId, forceRegenerate
    ]);

    console.log(`📝 Logged indexing activity: ${operationType} - ${documentName} - ${status}`);
  } catch (error) {
    console.error('Failed to log indexing activity:', error);
    // Don't throw error to avoid breaking the main process
  }
}

// Function to download HTML content from URL
async function downloadHTMLContent(url) {
  try {
    console.log(`Downloading content from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CFR-Indexer/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const htmlContent = await response.text();
    console.log(`Downloaded ${htmlContent.length} characters from ${url}`);
    return htmlContent;
  } catch (error) {
    console.error(`Error downloading from ${url}:`, error);
    throw error;
  }
}

// Function to chunk and embed regulation text
async function chunkAndEmbedRegulation(regulationText, regulationId, pool, startTime = Date.now()) {
  const MAX_CHUNK_PROCESSING_TIME = 20000; // 20 seconds
  try {
    console.log(`Starting chunking process for regulation ${regulationId}...`, {
      textLength: regulationText?.length || 0,
      textPreview: regulationText?.substring(0, 100) || 'No text'
    });
    
    // Chunk the regulation text
    const chunks = chunkText(regulationText, 512, 50); // 512 tokens per chunk with 50 token overlap
    console.log(`Initial chunking created ${chunks.length} chunks`);
    
    const validChunks = validateChunks(chunks);
    console.log(`After validation: ${validChunks.length} valid chunks (filtered out ${chunks.length - validChunks.length})`);

    if (validChunks.length === 0) {
      console.error(`❌ No valid chunks generated for regulation ${regulationId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: 'No valid chunks created'
      };
    }

    // Delete existing chunks for this regulation (in case of re-indexing)
    await pool.query('DELETE FROM cfr_title21_regulation_chunks WHERE regulation_id = $1', [regulationId]);
    console.log(`Deleted existing chunks for regulation ${regulationId}`);

    // Generate embeddings for each chunk in batches
    const batchSize = 5;
    let chunksCreated = 0;

    for (let i = 0; i < validChunks.length; i += batchSize) {
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_CHUNK_PROCESSING_TIME) {
        console.warn(`⏰ Chunk processing timeout warning: ${elapsedTime}ms elapsed`);
        break;
      }
      
      const batchChunks = validChunks.slice(i, Math.min(i + batchSize, validChunks.length));
      
      try {
        // Generate embeddings for the batch
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: batchChunks.map(chunk => chunk.text),
        });

        // Store chunks with embeddings in database
        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j];
          const embedding = embeddingResponse.data[j].embedding;
          const embeddingStr = '[' + embedding.join(',') + ']';

          await pool.query(`
            INSERT INTO cfr_title21_regulation_chunks 
            (regulation_id, chunk_index, chunk_text, embedding, token_count)
            VALUES ($1, $2, $3, $4::vector, $5)
            ON CONFLICT (regulation_id, chunk_index) 
            DO UPDATE SET chunk_text = $3, embedding = $4::vector, token_count = $5, created_at = CURRENT_TIMESTAMP
          `, [
            regulationId,
            chunk.index,
            chunk.text,
            embeddingStr,
            chunk.tokenCount
          ]);

          chunksCreated++;
        }
      } catch (batchError) {
        console.error(`Error processing embedding batch:`, batchError);
        // Continue with next batch
      }
    }

    console.log(`Successfully created ${chunksCreated} chunks with embeddings for regulation ${regulationId}`);
    return { success: true, chunksCreated };

  } catch (error) {
    console.error(`Error in chunkAndEmbedRegulation for ${regulationId}:`, error);
    return { success: false, chunksCreated: 0, error: error.message };
  }
}

// Function to index a single regulation (subchapter or part)
async function indexRegulation(item, granuleData, pool, batchId) {
  const startTime = Date.now();
  const { type, id, granuleId, chapterId, subchapterId } = item;
  
  try {
    console.log(`Indexing ${type}: ${id}`);
    
    // Determine the regulation data
    // granuleData has a 'granules' array where each granule is a chapter
    let regulationData;
    if (type === 'subchapter') {
      // Find subchapter in granule data
      const chapter = granuleData.granules?.find(ch => ch.granuleId === chapterId);
      regulationData = chapter?.subchapters?.find(sc => sc.granuleId === id);
    } else if (type === 'part') {
      // Find part in granule data
      const chapter = granuleData.granules?.find(ch => ch.granuleId === chapterId);
      if (subchapterId) {
        const subchapter = chapter?.subchapters?.find(sc => sc.granuleId === subchapterId);
        regulationData = subchapter?.parts?.find(p => p.granuleId === id);
      } else {
        regulationData = chapter?.parts?.find(p => p.granuleId === id);
      }
    }

    if (!regulationData) {
      throw new Error(`Regulation data not found for ${type} ${id}`);
    }

    // Determine download URL (try htmlLink first, fallback to detailsLink)
    let downloadUrl = regulationData.htmlLink || regulationData.detailsLink;
    if (!downloadUrl) {
      throw new Error(`No download URL available for ${type} ${id}`);
    }

    // Download HTML content
    let htmlContent;
    let extractionMethod = 'html';
    try {
      htmlContent = await downloadHTMLContent(downloadUrl);
    } catch (error) {
      // Try fallback URL if htmlLink failed
      if (regulationData.htmlLink && regulationData.detailsLink && downloadUrl === regulationData.htmlLink) {
        console.log(`htmlLink failed, trying detailsLink as fallback`);
        downloadUrl = regulationData.detailsLink;
        htmlContent = await downloadHTMLContent(downloadUrl);
      } else {
        throw error;
      }
    }

    // Extract text from HTML
    const extractedText = extractTextFromHTMLStructured(htmlContent);
    if (!extractedText || extractedText.trim().length < 100) {
      throw new Error(`Extracted text too short or empty (${extractedText?.length || 0} chars)`);
    }

    console.log(`Extracted ${extractedText.length} characters from ${type} ${id}`);

    // Check if regulation already exists
    const existingReg = await pool.query(
      'SELECT id FROM cfr_title21_regulations WHERE regulation_id = $1',
      [id]
    );

    let regulationDbId;
    if (existingReg.rows.length > 0) {
      // Update existing record
      regulationDbId = existingReg.rows[0].id;
      await pool.query(`
        UPDATE cfr_title21_regulations 
        SET title = $1, granule_id = $2, chapter_id = $3, subchapter_id = $4,
            html_link = $5, details_link = $6, full_text = $7, 
            extraction_method = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `, [
        regulationData.title || id,
        granuleId,
        chapterId,
        subchapterId || null,
        regulationData.htmlLink || null,
        regulationData.detailsLink || null,
        extractedText,
        extractionMethod,
        regulationDbId
      ]);
      console.log(`Updated existing regulation record: ${id}`);
    } else {
      // Create new record
      const insertResult = await pool.query(`
        INSERT INTO cfr_title21_regulations 
        (regulation_id, regulation_type, title, granule_id, chapter_id, subchapter_id,
         html_link, details_link, full_text, extraction_method)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        id,
        type,
        regulationData.title || id,
        granuleId,
        chapterId,
        subchapterId || null,
        regulationData.htmlLink || null,
        regulationData.detailsLink || null,
        extractedText,
        extractionMethod
      ]);
      regulationDbId = insertResult.rows[0].id;
      console.log(`Created new regulation record: ${id} (DB ID: ${regulationDbId})`);
    }

    // Chunk and embed the regulation
    const chunkResult = await chunkAndEmbedRegulation(extractedText, regulationDbId, pool, startTime);

    const processingDuration = Date.now() - startTime;

    // Log indexing activity
    await logIndexingActivity(pool, {
      operationType: 'index',
      sourceType: 'cfr_regulation',
      documentId: regulationDbId,
      documentName: regulationData.title || id,
      documentType: `CFR ${type}`,
      version: '1.0',
      status: chunkResult.success ? 'success' : 'partial_success',
      processingDurationMs: processingDuration,
      chunksCreated: chunkResult.chunksCreated,
      summaryGenerated: false,
      errorMessage: chunkResult.error || null,
      batchId,
      batchOffset: 0,
      userId: null,
      sessionId: null,
      forceRegenerate: false
    });

    return {
      success: chunkResult.success,
      regulationId: id,
      regulationType: type,
      title: regulationData.title || id,
      chunksCreated: chunkResult.chunksCreated,
      error: chunkResult.error,
      processingDuration
    };

  } catch (error) {
    const processingDuration = Date.now() - startTime;
    console.error(`Error indexing regulation ${id}:`, error);

    // Log failure
    await logIndexingActivity(pool, {
      operationType: 'index',
      sourceType: 'cfr_regulation',
      documentId: null,
      documentName: item.title || id,
      documentType: `CFR ${type}`,
      version: '1.0',
      status: 'error',
      processingDurationMs: processingDuration,
      chunksCreated: 0,
      summaryGenerated: false,
      errorMessage: error.message,
      batchId,
      batchOffset: 0,
      userId: null,
      sessionId: null,
      forceRegenerate: false
    });

    return {
      success: false,
      regulationId: id,
      regulationType: type,
      title: item.title || id,
      chunksCreated: 0,
      error: error.message,
      processingDuration
    };
  }
}

export const handler = async (event) => {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 25000; // 25 seconds

  console.log('=== CFR REGULATION INDEXING STARTED ===');

  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          details: parseError.message
        })
      };
    }

    const { selectedItems, granuleData } = requestBody;

    if (!selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'selectedItems array is required and must not be empty'
        })
      };
    }

    if (!granuleData) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'granuleData is required'
        })
      };
    }

    console.log(`Processing ${selectedItems.length} selected items`);

    // Expand subchapters to include all their parts
    const itemsToIndex = [];
    for (const item of selectedItems) {
      if (item.type === 'subchapter') {
        // Find all parts in this subchapter
        const chapter = granuleData.granules?.find(ch => ch.granuleId === item.chapterId);
        const subchapter = chapter?.subchapters?.find(sc => sc.granuleId === item.id);
        if (subchapter?.parts && subchapter.parts.length > 0) {
          // Add all parts from this subchapter
          for (const part of subchapter.parts) {
            itemsToIndex.push({
              type: 'part',
              id: part.granuleId || part.title,
              granuleId: part.granuleId,
              chapterId: item.chapterId,
              subchapterId: item.id,
              title: part.title
            });
          }
        }
      } else {
        // Add the part directly
        itemsToIndex.push(item);
      }
    }

    console.log(`Expanded to ${itemsToIndex.length} items to index (${selectedItems.length} selected, ${itemsToIndex.length - selectedItems.length} parts from subchapters)`);

    const batchId = `cfr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = [];

    // Process each item
    for (let i = 0; i < itemsToIndex.length; i++) {
      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.warn(`⏰ Approaching timeout, stopping processing`);
        results.push({
          success: false,
          regulationId: itemsToIndex[i].id,
          error: 'Processing timeout - not all items were processed'
        });
        break;
      }

      const result = await indexRegulation(itemsToIndex[i], granuleData, pool, batchId);
      results.push(result);
    }

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalChunks = results.reduce((sum, r) => sum + (r.chunksCreated || 0), 0);

    console.log(`=== CFR REGULATION INDEXING COMPLETED ===`);
    console.log(`Processed: ${results.length}, Success: ${successCount}, Failed: ${failureCount}, Total chunks: ${totalChunks}, Duration: ${totalDuration}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        total: results.length,
        processed: results.length,
        successful: successCount,
        failed: failureCount,
        totalChunksCreated: totalChunks,
        duration: totalDuration,
        results
      })
    };

  } catch (error) {
    console.error('Error in CFR regulation indexing:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

