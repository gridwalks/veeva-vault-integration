import { getPool, initDatabase } from "./db.js";
import { OpenAI } from "openai";
import { chunkText, validateChunks } from './chunking-utils.js';
import { extractTextFromHTMLStructured } from './html-extraction-utils.js';

// Validate OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY environment variable is not set. Embeddings will fail.');
}

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText.substring(0, 200)}`);
    }

    const htmlContent = await response.text();
    console.log(`Downloaded ${htmlContent.length} characters from ${url}`);
    
    if (htmlContent.length < 100) {
      throw new Error(`Downloaded content too short (${htmlContent.length} chars). May be an error page.`);
    }
    
    return htmlContent;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Download timeout after 30 seconds`);
    }
    console.error(`Error downloading from ${url}:`, error.message);
    throw error;
  }
}

// Function to chunk and embed regulation text
async function chunkAndEmbedRegulation(regulationText, regulationId, pool, startTime = Date.now()) {
  const MAX_CHUNK_PROCESSING_TIME = 20000; // 20 seconds
  try {
    // Validate input text
    if (!regulationText || typeof regulationText !== 'string') {
      const errorMsg = `Invalid regulation text: ${regulationText === null ? 'null' : regulationText === undefined ? 'undefined' : typeof regulationText}`;
      console.error(`❌ ${errorMsg} for regulation ${regulationId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: errorMsg
      };
    }

    const trimmedText = regulationText.trim();
    if (trimmedText.length < 20) {
      const errorMsg = `Regulation text too short (${trimmedText.length} chars after trimming). Minimum 20 characters required.`;
      console.error(`❌ ${errorMsg} for regulation ${regulationId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: errorMsg
      };
    }

    console.log(`Starting chunking process for regulation ${regulationId}...`, {
      textLength: regulationText.length,
      trimmedLength: trimmedText.length,
      textPreview: trimmedText.substring(0, 100)
    });
    
    // Chunk the regulation text
    const chunks = chunkText(trimmedText, 512, 50); // 512 tokens per chunk with 50 token overlap
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
        // Check if API key is configured
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY environment variable is not set. Please configure it in Netlify environment variables.');
        }

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

          try {
            const insertResult = await pool.query(`
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

            if (insertResult.rowCount === 0) {
              console.warn(`⚠️ No rows affected when inserting chunk ${chunk.index} for regulation ${regulationId}`);
            }

            chunksCreated++;
            console.log(`✓ Created chunk ${chunk.index} for regulation ${regulationId} (${chunk.text.length} chars, ${chunk.tokenCount} tokens)`);
          } catch (dbError) {
            console.error(`❌ Database error inserting chunk ${chunk.index} for regulation ${regulationId}:`, dbError);
            console.error(`   Chunk text preview: ${chunk.text.substring(0, 100)}`);
            // Continue with next chunk instead of failing entire batch
          }
        }
      } catch (batchError) {
        console.error(`Error processing embedding batch:`, batchError);
        
        // Check if it's an API key error
        if (batchError.code === 'invalid_api_key' || batchError.message?.includes('API key')) {
          const errorMsg = 'Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable in Netlify settings.';
          console.error(`❌ ${errorMsg}`);
          // Return error immediately instead of continuing
          return { 
            success: false, 
            chunksCreated, 
            error: errorMsg 
          };
        }
        
        // For other errors, continue with next batch but log the error
        console.warn(`Continuing with next batch after error: ${batchError.message}`);
      }
    }

    if (chunksCreated === 0 && validChunks.length > 0) {
      // If we have chunks but none were created, it means all batches failed
      const errorMsg = 'Failed to create embeddings for any chunks. Check OpenAI API key configuration.';
      console.error(`❌ ${errorMsg}`);
      return { success: false, chunksCreated: 0, error: errorMsg };
    }

    console.log(`Successfully created ${chunksCreated} chunks with embeddings for regulation ${regulationId}`);
    return { 
      success: chunksCreated > 0, 
      chunksCreated,
      error: chunksCreated === 0 && validChunks.length > 0 ? 'Failed to create embeddings' : undefined
    };

  } catch (error) {
    console.error(`Error in chunkAndEmbedRegulation for ${regulationId}:`, error);
    
    // Provide more helpful error messages
    let errorMessage = error.message;
    if (error.code === 'invalid_api_key' || error.message?.includes('API key')) {
      errorMessage = 'Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable in Netlify settings.';
    }
    
    return { success: false, chunksCreated: 0, error: errorMessage };
  }
}

// Function to index a single regulation (subchapter or part)
async function indexRegulation(item, granuleData, pool, batchId) {
  const startTime = Date.now();
  const { type, id, granuleId, chapterId, subchapterId } = item;
  
  try {
    console.log(`Indexing ${type}: ${id}`, {
      item: item,
      chapterId: chapterId,
      subchapterId: subchapterId,
      granuleId: granuleId
    });
    
    // Determine the regulation data
    // granuleData has a 'granules' array where each granule is a chapter
    let regulationData;
    if (type === 'subchapter') {
      // Find subchapter in granule data
      console.log(`Looking for subchapter ${id} in chapter ${chapterId}`);
      const chapter = granuleData.granules?.find(ch => ch.granuleId === chapterId);
      console.log(`Chapter found:`, !!chapter, chapter ? { granuleId: chapter.granuleId, title: chapter.title } : null);
      if (chapter) {
        console.log(`Chapter has ${chapter.subchapters?.length || 0} subchapters`);
        regulationData = chapter?.subchapters?.find(sc => sc.granuleId === id);
        console.log(`Subchapter found:`, !!regulationData, regulationData ? { granuleId: regulationData.granuleId, title: regulationData.title } : null);
      }
    } else if (type === 'part') {
      // Find part in granule data
      console.log(`Looking for part ${id} in chapter ${chapterId}, subchapter ${subchapterId || 'none'}`);
      const chapter = granuleData.granules?.find(ch => ch.granuleId === chapterId);
      console.log(`Chapter found:`, !!chapter);
      if (subchapterId) {
        const subchapter = chapter?.subchapters?.find(sc => sc.granuleId === subchapterId);
        console.log(`Subchapter found:`, !!subchapter, subchapter ? { partsCount: subchapter.parts?.length || 0 } : null);
        regulationData = subchapter?.parts?.find(p => p.granuleId === id);
        console.log(`Part found:`, !!regulationData, regulationData ? { granuleId: regulationData.granuleId, title: regulationData.title } : null);
      } else {
        regulationData = chapter?.parts?.find(p => p.granuleId === id);
        console.log(`Part found (no subchapter):`, !!regulationData);
      }
    }

    if (!regulationData) {
      console.error(`Regulation data not found for ${type} ${id}`, {
        availableChapters: granuleData.granules?.map(ch => ch.granuleId) || [],
        chapterId: chapterId,
        subchapterId: subchapterId
      });
      throw new Error(`Regulation data not found for ${type} ${id}. Chapter: ${chapterId}, Subchapter: ${subchapterId || 'none'}`);
    }
    
    console.log(`Found regulation data:`, {
      title: regulationData.title,
      granuleId: regulationData.granuleId,
      htmlLink: regulationData.htmlLink,
      detailsLink: regulationData.detailsLink
    });

    // Determine download URL (try htmlLink first, fallback to detailsLink)
    let downloadUrl = regulationData.htmlLink || regulationData.detailsLink;
    if (!downloadUrl) {
      throw new Error(`No download URL available for ${type} ${id}`);
    }

    // Download HTML content
    let htmlContent;
    let extractionMethod = 'html';
    try {
      console.log(`Attempting to download from: ${downloadUrl}`);
      htmlContent = await downloadHTMLContent(downloadUrl);
      console.log(`Successfully downloaded ${htmlContent.length} characters`);
    } catch (error) {
      console.error(`Download failed from ${downloadUrl}:`, error.message);
      // Try fallback URL if htmlLink failed
      if (regulationData.htmlLink && regulationData.detailsLink && downloadUrl === regulationData.htmlLink) {
        console.log(`htmlLink failed, trying detailsLink as fallback: ${regulationData.detailsLink}`);
        downloadUrl = regulationData.detailsLink;
        try {
          htmlContent = await downloadHTMLContent(downloadUrl);
          console.log(`Successfully downloaded ${htmlContent.length} characters from fallback URL`);
        } catch (fallbackError) {
          console.error(`Fallback download also failed:`, fallbackError.message);
          throw new Error(`Failed to download from both URLs. htmlLink: ${error.message}, detailsLink: ${fallbackError.message}`);
        }
      } else {
        throw error;
      }
    }

    // Extract text from HTML
    console.log(`Extracting text from HTML (${htmlContent.length} chars)...`);
    console.log(`HTML preview (first 500 chars):`, htmlContent.substring(0, 500));
    
    // Check if this looks like an error page or redirect
    if (htmlContent.toLowerCase().includes('access denied') || 
        htmlContent.toLowerCase().includes('forbidden') ||
        htmlContent.toLowerCase().includes('403') ||
        htmlContent.toLowerCase().includes('404') ||
        htmlContent.toLowerCase().includes('not found')) {
      throw new Error(`Downloaded page appears to be an error or access denied page`);
    }
    
    let extractedText = extractTextFromHTMLStructured(htmlContent);
    console.log(`Extracted text length: ${extractedText?.length || 0} characters`);
    console.log(`Extracted text preview (first 500 chars):`, extractedText?.substring(0, 500) || 'empty');
    
    if (!extractedText || extractedText.trim().length < 100) {
      console.error(`Extracted text too short:`, {
        length: extractedText?.length || 0,
        trimmedLength: extractedText?.trim().length || 0,
        preview: extractedText?.substring(0, 500) || 'empty',
        htmlLength: htmlContent.length,
        htmlPreview: htmlContent.substring(0, 500)
      });
      
      // If extraction failed but we have HTML, try a more aggressive extraction
      if (htmlContent.length > 1000 && (!extractedText || extractedText.trim().length < 100)) {
        console.log('Trying fallback extraction method...');
        // Fallback: remove all tags and get all text
        const fallbackText = htmlContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (fallbackText.length > 100) {
          console.log(`Fallback extraction successful: ${fallbackText.length} chars`);
          extractedText = fallbackText;
        }
      }
      
      if (!extractedText || extractedText.trim().length < 100) {
        throw new Error(`Extracted text too short or empty (${extractedText?.length || 0} chars, trimmed: ${extractedText?.trim().length || 0} chars). HTML length: ${htmlContent.length}. This may indicate the page requires authentication or JavaScript rendering.`);
      }
    }

    console.log(`Successfully extracted ${extractedText.length} characters from ${type} ${id}`);

    // Check if regulation already exists
    console.log(`Checking if regulation ${id} already exists in database...`);
    const existingReg = await pool.query(
      'SELECT id FROM cfr_title21_regulations WHERE regulation_id = $1',
      [id]
    );
    console.log(`Existing regulation check: ${existingReg.rows.length > 0 ? 'found' : 'not found'}`);

    let regulationDbId;
    if (existingReg.rows.length > 0) {
      // Update existing record
      regulationDbId = existingReg.rows[0].id;
      console.log(`Updating existing regulation record ID: ${regulationDbId}`);
      const updateResult = await pool.query(`
        UPDATE cfr_title21_regulations 
        SET title = $1, granule_id = $2, chapter_id = $3, subchapter_id = $4,
            html_link = $5, details_link = $6, full_text = $7, 
            extraction_method = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING id
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
      console.log(`Updated existing regulation record: ${id} (DB ID: ${regulationDbId}), rows affected: ${updateResult.rowCount}`);
    } else {
      // Create new record
      console.log(`Creating new regulation record for ${id}...`);
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
      regulationDbId = insertResult.rows[0]?.id;
      console.log(`Created new regulation record: ${id} (DB ID: ${regulationDbId}), rows inserted: ${insertResult.rowCount}`);
      
      if (!regulationDbId) {
        throw new Error('Failed to get database ID after insert');
      }
    }

    // Validate that we have text to chunk before proceeding
    if (!extractedText || extractedText.trim().length === 0) {
      const errorMsg = `Cannot chunk regulation ${id}: extracted text is empty (${extractedText?.length || 0} chars)`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (extractedText.trim().length < 20) {
      console.warn(`⚠️ Warning: Regulation ${id} has very short text (${extractedText.trim().length} chars). Chunking may produce no valid chunks.`);
    }

    // Chunk and embed the regulation
    console.log(`Starting chunking for regulation ${id} (DB ID: ${regulationDbId}) with ${extractedText.length} characters of text`);
    const chunkResult = await chunkAndEmbedRegulation(extractedText, regulationDbId, pool, startTime);
    
    if (!chunkResult.success || chunkResult.chunksCreated === 0) {
      const errorDetails = chunkResult.error || 'Unknown error';
      console.error(`❌ Chunking failed for regulation ${id} (DB ID: ${regulationDbId}):`, errorDetails);
      console.error(`   Text length: ${extractedText.length}, Text preview: ${extractedText.substring(0, 200)}`);
      // Don't throw - we still want to save the regulation, but log the error clearly
    } else {
      console.log(`✅ Successfully chunked regulation ${id}: ${chunkResult.chunksCreated} chunks created`);
    }

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
    console.error(`Error indexing regulation ${id}:`, {
      message: error.message,
      stack: error.stack,
      item: item,
      type: type
    });

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
      error: error.message || 'Unknown error occurred',
      processingDuration
    };
  }
}

export const handler = async (event) => {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 25000; // 25 seconds

  console.log('=== CFR REGULATION INDEXING STARTED ===');
  console.log('Event method:', event.httpMethod);
  console.log('Event body length:', event.body?.length || 0);

  try {
    // Initialize database
    console.log('Initializing database...');
    await initDatabase();
    const pool = getPool();
    console.log('Database pool obtained');

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
    console.log('Selected items:', JSON.stringify(selectedItems, null, 2));
    console.log('Granule data structure:', {
      hasGranules: !!granuleData.granules,
      granulesCount: granuleData.granules?.length || 0,
      firstGranule: granuleData.granules?.[0] ? {
        granuleId: granuleData.granules[0].granuleId,
        title: granuleData.granules[0].title,
        hasSubchapters: !!granuleData.granules[0].subchapters,
        subchaptersCount: granuleData.granules[0].subchapters?.length || 0
      } : null
    });

    // Expand subchapters to include all their parts
    const itemsToIndex = [];
    for (const item of selectedItems) {
      if (item.type === 'subchapter') {
        // Find all parts in this subchapter
        const chapter = granuleData.granules?.find(ch => ch.granuleId === item.chapterId);
        if (!chapter) {
          console.warn(`Chapter not found for subchapter ${item.id}, chapterId: ${item.chapterId}`);
          // Still add the subchapter item so we can report the error
          itemsToIndex.push(item);
          continue;
        }
        const subchapter = chapter?.subchapters?.find(sc => sc.granuleId === item.id);
        if (!subchapter) {
          console.warn(`Subchapter not found: ${item.id} in chapter ${item.chapterId}`);
          itemsToIndex.push(item);
          continue;
        }
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
        } else {
          console.warn(`Subchapter ${item.id} has no parts`);
          // Still try to index the subchapter itself
          itemsToIndex.push(item);
        }
      } else {
        // Add the part directly
        itemsToIndex.push(item);
      }
    }

    console.log(`Expanded to ${itemsToIndex.length} items to index (${selectedItems.length} selected, ${itemsToIndex.length - selectedItems.length} parts from subchapters)`);

    // Verify database tables exist
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'cfr_title21_regulations'
        )
      `);
      console.log('CFR regulations table exists:', tableCheck.rows[0]?.exists || false);
      
      if (!tableCheck.rows[0]?.exists) {
        console.warn('CFR regulations table does not exist, attempting to create...');
        await initDatabase();
      }
    } catch (tableError) {
      console.error('Error checking database tables:', tableError);
    }

    const batchId = `cfr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = [];

    // Process each item
    console.log(`Starting to process ${itemsToIndex.length} items...`);
    for (let i = 0; i < itemsToIndex.length; i++) {
      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.warn(`⏰ Approaching timeout, stopping processing`);
        results.push({
          success: false,
          regulationId: itemsToIndex[i].id,
          regulationType: itemsToIndex[i].type,
          title: itemsToIndex[i].title || itemsToIndex[i].id,
          error: 'Processing timeout - not all items were processed',
          chunksCreated: 0
        });
        break;
      }

      console.log(`Processing item ${i + 1}/${itemsToIndex.length}: ${itemsToIndex[i].type} ${itemsToIndex[i].id}`);
      try {
        const result = await indexRegulation(itemsToIndex[i], granuleData, pool, batchId);
        console.log(`Item ${i + 1} result:`, {
          success: result.success,
          regulationId: result.regulationId,
          chunksCreated: result.chunksCreated,
          error: result.error
        });
        results.push(result);
      } catch (itemError) {
        console.error(`Error processing item ${i + 1}:`, itemError);
        results.push({
          success: false,
          regulationId: itemsToIndex[i].id,
          regulationType: itemsToIndex[i].type,
          title: itemsToIndex[i].title || itemsToIndex[i].id,
          error: itemError.message || 'Unknown error',
          chunksCreated: 0
        });
      }
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

