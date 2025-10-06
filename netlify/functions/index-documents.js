import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";
import OpenAI from 'openai';
import mammoth from 'mammoth';
import { chunkText, validateChunks, generateChunkPreview } from './chunking-utils.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Local text extraction function
async function extractTextFromBuffer(fileBuffer, fileName) {
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  let extractedText = '';
  let extractionMethod = '';

  console.log(`Extracting text from file: ${fileName} (${fileExtension})`);

  if (fileExtension === 'docx') {
    // Extract text from DOCX files using mammoth
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value;
      extractionMethod = 'mammoth_docx';
      
      console.log('DOCX extraction successful:', {
        textLength: extractedText.length,
        messages: result.messages
      });
    } catch (error) {
      console.error('DOCX extraction failed:', error);
      throw new Error(`Failed to extract text from DOCX file: ${error.message}`);
    }
  } else if (fileExtension === 'pdf') {
    // Extract text from PDF files using pdf-parse
    try {
      // Dynamic import for pdf-parse to handle potential import issues
      const pdfParse = await import('pdf-parse');
      const pdfData = await pdfParse.default(fileBuffer);
      
      extractedText = pdfData.text;
      extractionMethod = 'pdf_parse';
      
      console.log('PDF extraction successful:', {
        pages: pdfData.numpages,
        info: pdfData.info,
        metadata: pdfData.metadata,
        textLength: pdfData.text.length
      });
      
      // Check if PDF appears to be scanned (no text or very little text)
      if (!extractedText || extractedText.trim().length < 10) {
        console.warn('PDF appears to be scanned or image-based - minimal text extracted');
        extractedText = 'This PDF appears to be a scanned document or image-based PDF. Text extraction is limited. Consider using OCR services for better results.';
      }
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw new Error(`Failed to extract text from PDF file: ${error.message}`);
    }
  } else {
    // Try to extract as plain text
    extractedText = fileBuffer.toString('utf-8');
    extractionMethod = 'fallback_text';
  }

  // Clean up the extracted text
  extractedText = extractedText
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks
    .replace(/[ \t]+/g, ' ') // Normalize whitespace
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Remove non-printable characters except newlines and tabs
    .trim();

  console.log('Text extraction successful:', {
    extractedLength: extractedText.length,
    fileType: fileExtension,
    extractionMethod: extractionMethod
  });

  return {
    extractedText,
    extractionMethod,
    fileType: fileExtension,
    textLength: extractedText.length
  };
}

// Function to generate embeddings and store chunks
async function chunkAndEmbedDocument(documentText, documentId, veevaDocumentId, pool) {
  try {
    console.log(`Starting chunking process for document ${veevaDocumentId}...`, {
      textLength: documentText?.length || 0,
      textPreview: documentText?.substring(0, 100) || 'No text'
    });
    
    // Chunk the document text
    const chunks = chunkText(documentText, 512, 50); // 512 tokens per chunk with 50 token overlap
    console.log(`Initial chunking created ${chunks.length} chunks`);
    
    const validChunks = validateChunks(chunks);
    console.log(`After validation: ${validChunks.length} valid chunks (filtered out ${chunks.length - validChunks.length})`);

    if (validChunks.length === 0) {
      console.error(`❌ No valid chunks generated for document ${veevaDocumentId}`, {
        initialChunkCount: chunks.length,
        textLength: documentText?.length || 0,
        reason: chunks.length === 0 ? 'chunking_failed' : 'all_chunks_filtered_out'
      });
      return { 
        success: false, 
        chunksCreated: 0,
        error: chunks.length === 0 ? 'Chunking failed - no chunks created' : 'All chunks filtered out by validation'
      };
    }

    // Delete existing chunks for this document (in case of re-indexing)
    await pool.query('DELETE FROM Veeva_Doc_Chat_document_chunks WHERE document_id = $1', [documentId]);
    console.log(`Deleted existing chunks for document ${documentId}`);

    // Generate embeddings for each chunk in batches
    const batchSize = 10; // OpenAI recommends batching embeddings
    let chunksCreated = 0;

    for (let i = 0; i < validChunks.length; i += batchSize) {
      const batchChunks = validChunks.slice(i, Math.min(i + batchSize, validChunks.length));
      
      console.log(`Processing embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validChunks.length / batchSize)} (${batchChunks.length} chunks)`);

      try {
        // Generate embeddings for the batch
        const embeddingStartTime = Date.now();
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: batchChunks.map(chunk => chunk.text),
        });

        const embeddingDuration = Date.now() - embeddingStartTime;
        console.log(`Generated ${embeddingResponse.data.length} embeddings in ${embeddingDuration}ms`);

        // Store chunks with embeddings in database
        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j];
          const embedding = embeddingResponse.data[j].embedding;

          // Convert embedding array to PostgreSQL vector format
          const embeddingStr = '[' + embedding.join(',') + ']';

          await pool.query(`
            INSERT INTO Veeva_Doc_Chat_document_chunks 
            (document_id, veeva_document_id, chunk_index, chunk_text, embedding, token_count)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (document_id, chunk_index) 
            DO UPDATE SET chunk_text = $4, embedding = $5, token_count = $6, created_at = CURRENT_TIMESTAMP
          `, [
            documentId,
            veevaDocumentId,
            chunk.index,
            chunk.text,
            embeddingStr,
            chunk.tokenCount
          ]);

          chunksCreated++;
          
          if ((chunksCreated % 10) === 0) {
            console.log(`Stored ${chunksCreated}/${validChunks.length} chunks with embeddings`);
          }
        }
      } catch (batchError) {
        console.error(`Error processing embedding batch:`, {
          message: batchError.message,
          batchStart: i,
          batchSize: batchChunks.length
        });
        // Continue with next batch
      }
    }

    console.log(`Successfully created ${chunksCreated} chunks with embeddings for document ${veevaDocumentId}`);
    return { success: true, chunksCreated };

  } catch (error) {
    console.error(`Error in chunkAndEmbedDocument for ${veevaDocumentId}:`, {
      message: error.message,
      stack: error.stack
    });
    return { success: false, chunksCreated: 0, error: error.message };
  }
}

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('=== DOCUMENT INDEXING STARTED ===');
  console.log('Starting document indexing process...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams),
    eventMethod: event.httpMethod,
    eventPath: event.path
  });

  // Quick test response
  if (event.queryStringParameters?.test === 'true') {
    console.log('Returning test response');
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: 0,
        processed: 0,
        duration: 100,
        stats: { created: 0, updated: 0, unchanged: 0, errors: 0 },
        results: [],
        test: true
      }),
    };
  }

  try {
    // Initialize database
    console.log('Step 1: Initializing database...');
    await initDatabase();
    console.log('Step 1: Database initialization completed');
    
    console.log('Step 2: Getting environment variables...');
    const domain = process.env.VAULT_DOMAIN;
    const v = process.env.VAULT_API_VERSION;
    const q = new URL(event.rawUrl).searchParams;

    console.log('Environment check:', {
      hasDomain: !!domain,
      hasApiVersion: !!v,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      domain: domain,
      apiVersion: v
    });

    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    const forceRegenerate = q.get("force") === 'true';
    const batchSize = Math.min(Number(q.get("batchSize") || 5), 10); // Process max 10 docs per batch to avoid timeout
    const batchOffset = Number(q.get("batchOffset") || 0);

    console.log('Step 3: Querying Veeva for documents...', {
      nameLike,
      limit,
      forceRegenerate,
      forceParam: q.get("force"),
      batchSize,
      batchOffset,
      domain,
      apiVersion: v
    });

    // Query Veeva for approved documents
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, type__v
      FROM documents
        WHERE status__v = STEADYSTATE() AND
        subtype__v = 'Standard Operating Procedure'
    `;

    if (nameLike) vql += ` AND name__v CONTAINS '${nameLike.replace(/'/g, "''")}' `;
    vql += " ORDER BY name__v ";

    console.log('VQL Query:', vql);

    console.log('Step 4: Getting Veeva session ID...');
    const sessionId = await getSessionId();
    console.log('Step 4: Session ID obtained:', {
      hasSessionId: !!sessionId,
      sessionIdLength: sessionId?.length || 0
    });

    const body = new URLSearchParams({ q: vql });
    console.log('Step 5: Making Veeva API request...', {
      url: `https://${domain}/api/${v}/query`,
      body: body.toString()
    });

    const res = await fetch(`https://${domain}/api/${v}/query`, {
      method: "POST",
      headers: {
        "Authorization": sessionId,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-VaultAPI-DescribeQuery": "true",
        "X-VaultAPI-PageSize": String(limit),
      },
      body,
    });

    console.log('Step 6: Veeva API response received:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries())
    });

    const data = await res.json();
    console.log('Step 7: Veeva API response parsed:', {
      responseStatus: data.responseStatus,
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      responseDetails: data.responseDetails,
      errors: data.errors
    });

    if (!res.ok || (data.responseStatus !== "SUCCESS" && data.responseStatus !== "WARNING")) {
      console.error('Veeva query failed:', {
        status: res.status,
        statusText: res.statusText,
        responseStatus: data.responseStatus,
        responseDetails: data.responseDetails,
        errors: data.errors
      });
      return { statusCode: res.status || 500, body: JSON.stringify(data) };
    }

    console.log('Step 8: Veeva query successful:', {
      totalDocuments: data.data?.length || 0,
      responseDetails: data.responseDetails
    });

    const documents = data.data || [];
    console.log('Step 9: Getting database pool...');
    const pool = getPool();
    console.log('Step 9: Database pool obtained:', {
      hasPool: !!pool,
      poolType: typeof pool
    });
    
    const results = [];

    // Apply batch processing to avoid timeout
    const startIndex = batchOffset;
    const endIndex = Math.min(startIndex + batchSize, documents.length);
    const documentsToProcess = documents.slice(startIndex, endIndex);

    console.log(`Step 10: Processing documents in batch...`, {
      totalDocuments: documents.length,
      batchSize,
      batchOffset,
      startIndex,
      endIndex,
      documentsToProcess: documentsToProcess.length,
      remainingDocuments: documents.length - endIndex
    });
    
    if (documents.length === 0) {
      console.log('WARNING: No documents returned from Veeva query!');
      console.log('This could mean:');
      console.log('1. No documents match the VQL criteria');
      console.log('2. Veeva query is incorrect');
      console.log('3. Veeva API permissions issue');
      console.log('4. Veeva domain/version configuration issue');
    }

    for (let i = 0; i < documentsToProcess.length; i++) {
      const doc = documentsToProcess[i];
      const globalIndex = startIndex + i;
      const docStartTime = Date.now();
      
      try {
        console.log(`=== PROCESSING DOCUMENT ${globalIndex + 1}/${documents.length} (Batch ${Math.floor(startIndex/batchSize) + 1}) ===`);
        console.log(`Document: ${doc.name__v} (${doc.id})`);
        console.log(`Document details:`, {
          id: doc.id,
          number: doc.document_number__v,
          name: doc.name__v,
          status: doc.status__v,
          major: doc.major_version_number__v,
          minor: doc.minor_version_number__v,
          type: doc.type__v
        });
        
        // Check if document already exists
        console.log(`Checking if document ${doc.id} already exists in database...`);
        const existingDoc = await pool.query(
          'SELECT * FROM Veeva_Doc_Chat_document_index WHERE veeva_document_id = $1',
          [doc.id]
        );
        
        console.log(`Database lookup result:`, {
          found: existingDoc.rows.length > 0,
          rowCount: existingDoc.rows.length,
          existingRecord: existingDoc.rows[0] ? {
            id: existingDoc.rows[0].id,
            document_name: existingDoc.rows[0].document_name,
            major_version: existingDoc.rows[0].major_version,
            minor_version: existingDoc.rows[0].minor_version,
            status: existingDoc.rows[0].status
          } : null
        });

        const documentData = {
          veeva_document_id: doc.id,
          document_number: doc.document_number__v,
          document_name: doc.name__v,
          major_version: doc.major_version_number__v,
          minor_version: doc.minor_version_number__v,
          document_type: doc.type__v,
          status: doc.status__v,
        };

        console.log(`Prepared document data:`, documentData);

        // If document exists, check if we need to update
        if (existingDoc.rows.length > 0) {
          console.log(`Document exists, checking if update needed...`);
          const existing = existingDoc.rows[0];
          const needsUpdate = forceRegenerate ||
            existing.document_name !== documentData.document_name ||
            existing.major_version !== documentData.major_version ||
            existing.minor_version !== documentData.minor_version ||
            existing.status !== documentData.status;

          console.log(`Update check:`, {
            needsUpdate,
            forceRegenerate,
            forceParam: q.get("force"),
            nameChanged: existing.document_name !== documentData.document_name,
            majorChanged: existing.major_version !== documentData.major_version,
            minorChanged: existing.minor_version !== documentData.minor_version,
            statusChanged: existing.status !== documentData.status,
            existingSummary: existing.summary ? existing.summary.substring(0, 100) + '...' : 'No summary'
          });

          if (needsUpdate) {
            console.log(`Updating existing document: ${doc.name__v}${forceRegenerate ? ' (force regenerate enabled)' : ''}`);
            
            // TEMPORARY: Force regenerate all documents regardless of condition
            if (forceRegenerate) {
              console.log(`FORCE REGENERATE CONFIRMED for document: ${doc.id}`);
            }
            
            let updatedSummary = existing.summary;
            let documentTextForChunking = null;
            
            // If force regenerate is enabled, generate new summary
            if (forceRegenerate) {
              console.log(`Force regenerating summary for document: ${doc.id}`);
              try {
                // Download document content
                console.log(`Downloading content for document: ${doc.id}`);
                const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.id}/file`;
                console.log(`Download URL: ${downloadUrl}`);
                
                const downloadRes = await fetch(downloadUrl, {
                  headers: { "Authorization": sessionId }
                });

                console.log(`Download response:`, {
                  status: downloadRes.status,
                  statusText: downloadRes.statusText,
                  ok: downloadRes.ok,
                  contentType: downloadRes.headers.get('content-type')
                });

                if (downloadRes.ok) {
                  const documentBuffer = await downloadRes.arrayBuffer();
                  const documentName = doc.name__v || `document_${doc.id}`;
                  
                  console.log(`Downloaded ${documentBuffer.byteLength} bytes for document: ${doc.id}`);
                  
                  // Extract text from document using local extraction
                  console.log(`Extracting text from document: ${doc.id}`);
                  const extractionStartTime = Date.now();
                  
                  try {
                    const extractionResult = await extractTextFromBuffer(documentBuffer, documentName);
                    const extractionDuration = Date.now() - extractionStartTime;
                    
                    console.log(`Text extraction completed in ${extractionDuration}ms for document: ${doc.id}`, {
                      extractedLength: extractionResult.textLength,
                      extractionMethod: extractionResult.extractionMethod,
                      fileType: extractionResult.fileType
                    });

                    const documentText = extractionResult.extractedText;
                    documentTextForChunking = documentText; // Save for chunking later
                    
                    if (!documentText || documentText.trim().length === 0) {
                      throw new Error('No text content extracted from document');
                    }

                    // Generate new summary using improved OpenAI prompt
                    console.log(`Generating new AI summary for document: ${doc.id}`);
                    console.log(`Sending document to OpenAI API:`, {
                      documentId: doc.id,
                      documentName: doc.name__v,
                      documentType: doc.type__v,
                      documentNumber: doc.document_number__v,
                      textLength: documentText.length,
                      textPreview: documentText.substring(0, 200) + '...'
                    });
                    const openaiStartTime = Date.now();
                    
                    const completion = await openai.chat.completions.create({
                      model: "gpt-3.5-turbo",
                      messages: [
                        {
                          role: "system",
                          content: `You are a pharmaceutical document analyst. Create detailed, actionable summaries that help users quickly understand:

1. **Purpose & Scope**: What is this document for and who should use it?
2. **Key Topics**: What main subjects does it cover (procedures, policies, systems, etc.)?
3. **Target Audience**: Who is this document intended for (roles, departments, users)?
4. **High-Level Process**: What are the main steps or workflow described?
5. **Important Requirements**: Any critical compliance, quality, or regulatory requirements?
6. **Key Responsibilities**: Who does what in the described processes?
7. **Timeline/Deadlines**: Any important timeframes or schedules?

Format as clear, structured bullet points. Be specific and reference actual content from the document. Avoid generic statements like "contains various information" - instead describe what specific information is included.`
                        },
                        {
                          role: "user",
                          content: `Document Title: "${doc.name__v}"
Document Type: "${doc.type__v}"
Document Number: "${doc.document_number__v}"

Please analyze this document and provide a detailed summary covering the areas above:

${documentText.substring(0, 4000)}`
                        }
                      ],
                      max_tokens: 800,
                      temperature: 0.2,
                    });

                    const openaiDuration = Date.now() - openaiStartTime;
                    updatedSummary = completion.choices[0]?.message?.content || null;
                    console.log(`OpenAI API response received for document: ${doc.id}`, {
                      responseTime: `${openaiDuration}ms`,
                      summaryLength: updatedSummary?.length || 0,
                      tokensUsed: completion.usage?.total_tokens || 0,
                      promptTokens: completion.usage?.prompt_tokens || 0,
                      completionTokens: completion.usage?.completion_tokens || 0,
                      totalProcessingTime: extractionDuration + openaiDuration,
                      summaryPreview: updatedSummary ? updatedSummary.substring(0, 150) + '...' : 'No summary'
                    });
                    
                  } catch (extractionError) {
                    console.error(`Text extraction failed for document ${doc.id} during force regenerate:`, {
                      message: extractionError.message,
                      documentId: doc.id,
                      documentName: doc.name__v
                    });
                    // Keep existing summary if extraction fails
                    console.log(`Keeping existing summary due to extraction failure`);
                  }
                } else {
                  console.error(`Failed to download document content during force regenerate: ${doc.id}`, {
                    status: downloadRes.status,
                    statusText: downloadRes.statusText
                  });
                  // Keep existing summary if download fails
                  console.log(`Keeping existing summary due to download failure`);
                }
              } catch (error) {
                console.error(`Error during force regenerate for document ${doc.id}:`, {
                  message: error.message,
                  stack: error.stack,
                  documentId: doc.id,
                  documentName: doc.name__v
                });
                // Keep existing summary if generation fails
                console.log(`Keeping existing summary due to error`);
              }
            }
            
            console.log(`Executing UPDATE query for document ${doc.id}...`);
            
            // Update existing record with new summary if force regenerate was used
            const updateResult = await pool.query(`
              UPDATE Veeva_Doc_Chat_document_index 
              SET document_name = $1, major_version = $2, minor_version = $3, 
                  status = $4, summary = $5, updated_at = CURRENT_TIMESTAMP
              WHERE veeva_document_id = $6
            `, [
              documentData.document_name,
              documentData.major_version,
              documentData.minor_version,
              documentData.status,
              updatedSummary,
              doc.id
            ]);
            
            const updateTimestamp = new Date().toISOString();
            console.log(`UPDATE query result:`, {
              rowCount: updateResult.rowCount,
              command: updateResult.command,
              timestamp: updateTimestamp,
              documentId: doc.id,
              documentName: doc.name__v,
              action: forceRegenerate ? 'force_regenerate' : 'metadata_update'
            });
            
            // Always chunk and embed the document (regardless of forceRegenerate)
            // Check if chunks exist, if not, download and chunk
            if (!documentTextForChunking) {
              console.log(`No document text from summary generation, checking if chunks exist for document: ${doc.id}`);
              
              try {
                const chunkCheck = await pool.query(
                  'SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks WHERE document_id = $1',
                  [existing.id]
                );
                const chunkCount = parseInt(chunkCheck.rows[0].count);
                
                if (chunkCount === 0) {
                  console.log(`No chunks found, downloading and chunking document: ${doc.id}`);
                  
                  // Download and extract text for chunking
                  const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.id}/file`;
                  const downloadRes = await fetch(downloadUrl, {
                    headers: { "Authorization": sessionId }
                  });
                  
                  if (downloadRes.ok) {
                    const documentBuffer = await downloadRes.arrayBuffer();
                    const documentName = doc.name__v || `document_${doc.id}`;
                    const extractionResult = await extractTextFromBuffer(documentBuffer, documentName);
                    documentTextForChunking = extractionResult.extractedText;
                    console.log(`Extracted ${extractionResult.textLength} characters for chunking`);
                  }
                } else {
                  console.log(`Chunks already exist (${chunkCount} chunks), skipping chunking`);
                }
              } catch (chunkCheckError) {
                console.error(`Error checking/creating chunks:`, chunkCheckError);
              }
            }
            
            // Chunk and embed if we have document text
            if (documentTextForChunking) {
              console.log(`Chunking and embedding document for RAG: ${doc.id}`);
              const chunkResult = await chunkAndEmbedDocument(
                documentTextForChunking,
                existing.id,
                doc.id,
                pool
              );
              console.log(`Chunking result:`, {
                success: chunkResult.success,
                chunksCreated: chunkResult.chunksCreated,
                error: chunkResult.error
              });
            }
            
          results.push({
            action: 'updated',
            document: documentData,
            summary: updatedSummary,
            timestamp: updateTimestamp,
            chunked: !!documentTextForChunking,
            chunkingAttempted: true
          });
          console.log(`Document updated: ${doc.name__v} at ${updateTimestamp}`);
          } else {
            console.log(`Document unchanged: ${doc.name__v}`);
            console.log(`Checking chunk status for unchanged document ${doc.id} (db id: ${existing.id})...`);
            
            // Track chunking info for response
            let chunkingInfo = {
              chunkCheckAttempted: true,
              chunkCount: null,
              chunkingAttempted: false,
              chunkingSuccess: false,
              chunkingError: null
            };
            
            // Even if document is unchanged, check if it needs chunking
            try {
              const chunkCheck = await pool.query(
                'SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks WHERE document_id = $1',
                [existing.id]
              );
              const chunkCount = parseInt(chunkCheck.rows[0].count);
              chunkingInfo.chunkCount = chunkCount;
              
              console.log(`Chunk check result for ${doc.name__v}:`, {
                documentId: doc.id,
                dbId: existing.id,
                chunkCount: chunkCount,
                needsChunking: chunkCount === 0
              });
              
              if (chunkCount === 0) {
                console.log(`⚠️ Document unchanged but has no chunks, will download and chunk: ${doc.id}`);
                chunkingInfo.chunkingAttempted = true;
                
                // Download and extract text for chunking
                const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.id}/file`;
                const downloadRes = await fetch(downloadUrl, {
                  headers: { "Authorization": sessionId }
                });
                
                if (downloadRes.ok) {
                  const documentBuffer = await downloadRes.arrayBuffer();
                  const documentName = doc.name__v || `document_${doc.id}`;
                  const extractionResult = await extractTextFromBuffer(documentBuffer, documentName);
                  const documentText = extractionResult.extractedText;
                  
                  if (documentText && documentText.trim().length > 0) {
                    console.log(`✓ Extracted ${extractionResult.textLength} characters, starting chunking and embedding...`);
                    try {
                      const chunkResult = await chunkAndEmbedDocument(
                        documentText,
                        existing.id,
                        doc.id,
                        pool
                      );
                      chunkingInfo.chunkingSuccess = chunkResult.success;
                      chunkingInfo.chunksCreated = chunkResult.chunksCreated || 0;
                      chunkingInfo.chunkingError = chunkResult.error || null;
                      console.log(`✓ Chunking completed for ${doc.name__v}:`, {
                        success: chunkResult.success,
                        chunksCreated: chunkResult.chunksCreated,
                        error: chunkResult.error
                      });
                    } catch (chunkError) {
                      console.error(`✗ Chunking threw exception for ${doc.id}:`, chunkError);
                      chunkingInfo.chunkingError = chunkError.message;
                      chunkingInfo.chunkingSuccess = false;
                    }
                  } else {
                    console.error(`✗ No text extracted from document ${doc.id}`);
                    chunkingInfo.chunkingError = 'No text extracted';
                  }
                } else {
                  console.error(`✗ Failed to download document for chunking: ${doc.id}`, {
                    status: downloadRes.status,
                    statusText: downloadRes.statusText
                  });
                  chunkingInfo.chunkingError = `Download failed: ${downloadRes.status}`;
                }
              } else {
                console.log(`✓ Document unchanged and already has ${chunkCount} chunks - skipping`);
              }
            } catch (chunkCheckError) {
              console.error(`✗ Error checking/creating chunks for unchanged document ${doc.id}:`, {
                message: chunkCheckError.message,
                stack: chunkCheckError.stack
              });
              chunkingInfo.chunkingError = chunkCheckError.message;
            }
            
            results.push({
              action: 'unchanged',
              document: documentData,
              summary: existing.summary,
              chunkingDebug: chunkingInfo
            });
          }
        } else {
          console.log(`Document does not exist, creating new record...`);
          // New document - fetch content and generate summary
          console.log(`Processing new document: ${doc.name__v}`);
          let summary = null;
          let documentText = null; // Define at this scope for chunking later
          try {
            // Download document content
            console.log(`Downloading content for document: ${doc.id}`);
            const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.id}/file`;
            console.log(`Download URL: ${downloadUrl}`);
            
            const downloadRes = await fetch(downloadUrl, {
              headers: { "Authorization": sessionId }
            });

            console.log(`Download response:`, {
              status: downloadRes.status,
              statusText: downloadRes.statusText,
              ok: downloadRes.ok,
              contentType: downloadRes.headers.get('content-type')
            });

            if (downloadRes.ok) {
              const documentBuffer = await downloadRes.arrayBuffer();
              const documentName = doc.name__v || `document_${doc.id}`;
              
              console.log(`Downloaded ${documentBuffer.byteLength} bytes for document: ${doc.id}`);
              
              // Extract text from document using local extraction
              console.log(`Extracting text from document: ${doc.id}`);
              const extractionStartTime = Date.now();
              
              try {
                const extractionResult = await extractTextFromBuffer(documentBuffer, documentName);
                const extractionDuration = Date.now() - extractionStartTime;
                
                console.log(`Text extraction completed in ${extractionDuration}ms for document: ${doc.id}`, {
                  extractedLength: extractionResult.textLength,
                  extractionMethod: extractionResult.extractionMethod,
                  fileType: extractionResult.fileType
                });

                documentText = extractionResult.extractedText; // Assign to outer scope variable
                
                if (!documentText || documentText.trim().length === 0) {
                  throw new Error('No text content extracted from document');
                }

                // Generate summary using OpenAI
                console.log(`Generating AI summary for document: ${doc.id}`);
                console.log(`Sending new document to OpenAI API:`, {
                  documentId: doc.id,
                  documentName: doc.name__v,
                  documentType: doc.type__v,
                  documentNumber: doc.document_number__v,
                  textLength: documentText.length,
                  textPreview: documentText.substring(0, 200) + '...',
                  isNewDocument: true
                });
                const openaiStartTime = Date.now();
                
                const completion = await openai.chat.completions.create({
                  model: "gpt-3.5-turbo",
                  messages: [
                    {
                      role: "system",
                      content: `You are a pharmaceutical document analyst. Create detailed, actionable summaries that help users quickly understand:

1. **Purpose & Scope**: What is this document for and who should use it?
2. **Key Topics**: What main subjects does it cover (procedures, policies, systems, etc.)?
3. **Target Audience**: Who is this document intended for (roles, departments, users)?
4. **High-Level Process**: What are the main steps or workflow described?
5. **Important Requirements**: Any critical compliance, quality, or regulatory requirements?
6. **Key Responsibilities**: Who does what in the described processes?
7. **Timeline/Deadlines**: Any important timeframes or schedules?

Format as clear, structured bullet points. Be specific and reference actual content from the document. Avoid generic statements like "contains various information" - instead describe what specific information is included.`
                    },
                    {
                      role: "user",
                      content: `Document Title: "${doc.name__v}"
Document Type: "${doc.type__v}"
Document Number: "${doc.document_number__v}"

Please analyze this document and provide a detailed summary covering the areas above:

${documentText.substring(0, 4000)}`
                    }
                  ],
                  max_tokens: 800,
                  temperature: 0.2,
                });

                const openaiDuration = Date.now() - openaiStartTime;
                summary = completion.choices[0]?.message?.content || null;
                console.log(`OpenAI API response received for new document: ${doc.id}`, {
                  responseTime: `${openaiDuration}ms`,
                  summaryLength: summary?.length || 0,
                  tokensUsed: completion.usage?.total_tokens || 0,
                  promptTokens: completion.usage?.prompt_tokens || 0,
                  completionTokens: completion.usage?.completion_tokens || 0,
                  totalProcessingTime: extractionDuration + openaiDuration,
                  summaryPreview: summary ? summary.substring(0, 150) + '...' : 'No summary'
                });
                
              } catch (extractionError) {
                console.error(`Text extraction failed for document ${doc.id}:`, {
                  message: extractionError.message,
                  documentId: doc.id,
                  documentName: doc.name__v
                });
                
                // Fallback: try to use the document as plain text
                try {
                  const fallbackText = new TextDecoder().decode(documentBuffer);
                  if (fallbackText && fallbackText.trim().length > 0) {
                    console.log(`Using fallback text extraction for document: ${doc.id}`);
                    console.log(`Sending fallback document to OpenAI API:`, {
                      documentId: doc.id,
                      documentName: doc.name__v,
                      documentType: doc.type__v,
                      documentNumber: doc.document_number__v,
                      textLength: fallbackText.length,
                      textPreview: fallbackText.substring(0, 200) + '...',
                      extractionMethod: 'fallback_plain_text'
                    });
                    
                    const completion = await openai.chat.completions.create({
                      model: "gpt-3.5-turbo",
                      messages: [
                        {
                          role: "system",
                          content: `You are a pharmaceutical document analyst. Create detailed, actionable summaries that help users quickly understand:

1. **Purpose & Scope**: What is this document for and who should use it?
2. **Key Topics**: What main subjects does it cover (procedures, policies, systems, etc.)?
3. **Target Audience**: Who is this document intended for (roles, departments, users)?
4. **High-Level Process**: What are the main steps or workflow described?
5. **Important Requirements**: Any critical compliance, quality, or regulatory requirements?
6. **Key Responsibilities**: Who does what in the described processes?
7. **Timeline/Deadlines**: Any important timeframes or schedules?

Format as clear, structured bullet points. Be specific and reference actual content from the document. Avoid generic statements like "contains various information" - instead describe what specific information is included.`
                        },
                        {
                          role: "user",
                          content: `Document Title: "${doc.name__v}"
Document Type: "${doc.type__v}"
Document Number: "${doc.document_number__v}"

Please analyze this document and provide a detailed summary covering the areas above:

${fallbackText.substring(0, 4000)}`
                        }
                      ],
                      max_tokens: 800,
                      temperature: 0.2,
                    });

                    summary = completion.choices[0]?.message?.content || null;
                    console.log(`OpenAI API response received for fallback document: ${doc.id}`, {
                      summaryLength: summary?.length || 0,
                      tokensUsed: completion.usage?.total_tokens || 0,
                      promptTokens: completion.usage?.prompt_tokens || 0,
                      completionTokens: completion.usage?.completion_tokens || 0,
                      summaryPreview: summary ? summary.substring(0, 150) + '...' : 'No summary'
                    });
                  } else {
                    throw new Error('No readable text found in document');
                  }
                } catch (fallbackError) {
                  console.error(`Fallback text extraction also failed for document ${doc.id}:`, fallbackError);
                  throw extractionError; // Re-throw original error
                }
              }
            } else {
              console.error(`Failed to download document content: ${doc.id}`, {
                status: downloadRes.status,
                statusText: downloadRes.statusText
              });
            }
          } catch (error) {
            console.error(`Error generating summary for document ${doc.id}:`, {
              message: error.message,
              stack: error.stack,
              documentId: doc.id,
              documentName: doc.name__v
            });
            // Continue without summary
          }

          // Insert new record
          console.log(`Inserting new document record: ${doc.id}`);
          console.log(`INSERT query parameters:`, [
            documentData.veeva_document_id,
            documentData.document_number,
            documentData.document_name,
            documentData.major_version,
            documentData.minor_version,
            documentData.document_type,
            documentData.status,
            summary
          ]);
          
          const insertResult = await pool.query(`
            INSERT INTO Veeva_Doc_Chat_document_index 
            (veeva_document_id, document_number, document_name, major_version, minor_version, document_type, status, summary, indexed_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
          `, [
            documentData.veeva_document_id,
            documentData.document_number,
            documentData.document_name,
            documentData.major_version,
            documentData.minor_version,
            documentData.document_type,
            documentData.status,
            summary
          ]);

          const insertTimestamp = new Date().toISOString();
          const newDocumentId = insertResult.rows[0].id;
          console.log(`INSERT query result:`, {
            rowCount: insertResult.rowCount,
            command: insertResult.command,
            oid: insertResult.oid,
            newDocumentId: newDocumentId,
            timestamp: insertTimestamp,
            documentId: doc.id,
            documentName: doc.name__v
          });

          // Chunk and embed the new document for RAG (if we have document text)
          if (documentText && documentText.trim().length > 0) {
            console.log(`Chunking and embedding new document for RAG: ${doc.id}`);
            const chunkResult = await chunkAndEmbedDocument(
              documentText,
              newDocumentId, // Use the newly created document_index id
              doc.id,
              pool
            );
            console.log(`Chunking result for new document:`, {
              success: chunkResult.success,
              chunksCreated: chunkResult.chunksCreated,
              error: chunkResult.error
            });
          } else {
            console.log(`No document text available for chunking new document: ${doc.id}`);
          }

          results.push({
            action: 'created',
            document: documentData,
            summary: summary,
            timestamp: insertTimestamp
          });
          console.log(`Document inserted: ${doc.name__v} at ${insertTimestamp}`);
        }

        const docDuration = Date.now() - docStartTime;
        console.log(`=== DOCUMENT ${globalIndex + 1} COMPLETED ===`);
        console.log(`Document processed in ${docDuration}ms: ${doc.name__v}`);
        
      } catch (error) {
        const docDuration = Date.now() - docStartTime;
        console.error(`=== DOCUMENT ${globalIndex + 1} ERROR ===`);
        console.error(`Error processing document ${doc.id} after ${docDuration}ms:`, {
          message: error.message,
          stack: error.stack,
          documentId: doc.id,
          documentName: doc.name__v,
          documentNumber: doc.document_number__v,
          errorType: error.constructor.name
        });
        
        results.push({
          action: 'error',
          document: {
            veeva_document_id: doc.id,
            document_number: doc.document_number__v,
            document_name: doc.name__v,
          },
          error: error.message
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const stats = {
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      unchanged: results.filter(r => r.action === 'unchanged').length,
      errors: results.filter(r => r.action === 'error').length
    };

    console.log('=== DOCUMENT INDEXING COMPLETED ===');
    console.log('Document indexing completed:', {
      totalDuration: `${totalDuration}ms`,
      totalDocuments: documents.length,
      processed: results.length,
      batchInfo: {
        batchSize,
        batchOffset,
        startIndex,
        endIndex,
        documentsInBatch: documentsToProcess.length,
        hasMoreBatches: endIndex < documents.length
      },
      stats,
      timestamp: new Date().toISOString()
    });
    
    if (documents.length === 0) {
      console.log('=== TROUBLESHOOTING INFO ===');
      console.log('No documents were processed. Check the following:');
      console.log('1. Veeva VQL query:', vql);
      console.log('2. Environment variables:', {
        domain: domain,
        apiVersion: v,
        hasUsername: !!process.env.VAULT_USERNAME,
        hasPassword: !!process.env.VAULT_PASSWORD
      });
      console.log('3. Try accessing the list-approved endpoint first to verify Veeva connection');
      console.log('4. Check Veeva permissions for the user account');
    }

    const responseTimestamp = new Date().toISOString();
    const response = {
      total: documents.length,
      processed: results.length,
      duration: totalDuration,
      stats,
      results: results,
      batchInfo: {
        batchSize,
        batchOffset,
        startIndex,
        endIndex,
        documentsInBatch: documentsToProcess.length,
        hasMoreBatches: endIndex < documents.length,
        nextBatchOffset: endIndex < documents.length ? endIndex : null
      },
      timestamp: responseTimestamp,
      completedAt: responseTimestamp
    };

    console.log('Final response being sent:', response);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (e) {
    const totalDuration = Date.now() - startTime;
    console.error('=== DOCUMENT INDEXING ERROR ===');
    console.error('Index documents error:', {
      message: e.message,
      stack: e.stack,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString()
    });
    console.error('=== ERROR DETAILS ===');
    console.error('Error type:', e.constructor.name);
    console.error('Error message:', e.message);
    console.error('Error stack:', e.stack);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
