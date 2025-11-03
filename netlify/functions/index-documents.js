import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import mammoth from 'mammoth';
import { parseDocument } from 'docx-parser';
import { chunkText, validateChunks, generateChunkPreview } from './chunking-utils.js';

function resolveFilenameFromHeaders(headers, fallbackName = '') {
  const contentDisposition = headers?.get?.('content-disposition');

  if (!contentDisposition) {
    return fallbackName;
  }

  const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (filenameStarMatch?.[1]) {
    try {
      return decodeURIComponent(filenameStarMatch[1]);
    } catch (error) {
      console.warn('Failed to decode RFC5987 filename, falling back to raw value', {
        error: error.message,
        rawValue: filenameStarMatch[1]
      });
      return filenameStarMatch[1];
    }
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }

  return fallbackName;
}

function ensureFilenameHasExtension(fileName, contentType = '') {
  if (!fileName) return fileName;

  if (fileName.includes('.')) {
    return fileName;
  }

  const normalizedContentType = (contentType || '').split(';')[0]?.trim().toLowerCase();
  const extensionMap = {
    'application/pdf': 'pdf',
    'application/x-pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-word.document.macroenabled.12': 'docm',
  };

  const mappedExtension = extensionMap[normalizedContentType];

  if (mappedExtension) {
    return `${fileName}.${mappedExtension}`;
  }

  if (normalizedContentType?.includes('wordprocessingml.document')) {
    return `${fileName}.docx`;
  }

  return fileName;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function looksLikeDocxBuffer(buffer) {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const hasZipSignature = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (!hasZipSignature) {
    return false;
  }

  const contentTypesIndex = buffer.indexOf(Buffer.from('[Content_Types].xml'));
  const wordFolderIndex = buffer.indexOf(Buffer.from('word/'));

  return contentTypesIndex !== -1 && wordFolderIndex !== -1;
}

function isProbablyBinaryBuffer(buffer) {
  const sampleSize = Math.min(buffer.length, 1024);
  let suspiciousBytes = 0;

  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];

    if (byte === 0) {
      suspiciousBytes++;
      continue;
    }

    if (byte < 7 || (byte > 13 && byte < 32)) {
      suspiciousBytes++;
    }
  }

  return suspiciousBytes / sampleSize > 0.3;
}

function isExtractedTextReadable(text) {
  if (!text) {
    return false;
  }

  const sampleLength = Math.min(text.length, 2000);
  if (sampleLength === 0) {
    return false;
  }
  let readableChars = 0;

  for (let i = 0; i < sampleLength; i++) {
    const code = text.charCodeAt(i);

    if (code === 65533) { // replacement character
      continue;
    }

    if (code === 9 || code === 10 || code === 13) {
      readableChars++;
      continue;
    }

    if (code >= 32 && code < 65533) {
      readableChars++;
    }
  }

  return readableChars / sampleLength > 0.6;
}

function decodeBufferToReadableText(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty buffer');
  }

  if (isProbablyBinaryBuffer(buffer)) {
    throw new Error('Buffer appears to contain binary data');
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    const text = buffer.toString('utf16le');
    if (isExtractedTextReadable(text)) {
      return { text, encoding: 'utf16le' };
    }
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const text = buffer.toString('utf16be');
    if (isExtractedTextReadable(text)) {
      return { text, encoding: 'utf16be' };
    }
  }

  const utf8Text = buffer.toString('utf8');
  if (isExtractedTextReadable(utf8Text)) {
    return { text: utf8Text, encoding: 'utf8' };
  }

  const latinText = buffer.toString('latin1');
  if (isExtractedTextReadable(latinText)) {
    return { text: latinText, encoding: 'latin1' };
  }

  throw new Error('Unable to decode buffer to readable text');
}

// Local text extraction function
async function extractTextFromBuffer(fileBuffer, fileName = '', contentType = '') {
  const normalizedName = fileName || '';
  const normalizedContentType = (contentType || '').split(';')[0]?.trim().toLowerCase();

  let fileExtension = '';

  if (normalizedName.includes('.')) {
    fileExtension = normalizedName.split('.').pop().toLowerCase();
  }

  if (!fileExtension && normalizedContentType) {
    const contentTypeMap = {
      'application/pdf': 'pdf',
      'application/x-pdf': 'pdf',
      'application/octet-stream': '',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-word.document.macroenabled.12': 'docm',
    };

    fileExtension = contentTypeMap[normalizedContentType] || fileExtension;

    if (!fileExtension && normalizedContentType.includes('wordprocessingml.document')) {
      fileExtension = 'docx';
    }
  }

  const isZipArchive = fileBuffer?.length >= 2 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
  if ((!fileExtension || fileExtension === 'bin') && isZipArchive && looksLikeDocxBuffer(fileBuffer)) {
    fileExtension = 'docx';
  }

  let extractedText = '';
  let extractionMethod = '';

  console.log(`Extracting text from file: ${fileName} (${fileExtension || 'unknown'})`, {
    contentType: normalizedContentType || 'unknown'
  });
  console.log(`File buffer info: ${fileBuffer.length} bytes, type: ${typeof fileBuffer}, constructor: ${fileBuffer.constructor.name}`);
  
  // Log first few bytes to check for encoding issues
  const firstBytes = Array.from(fileBuffer.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`First 10 bytes (hex): ${firstBytes}`);

  if (fileExtension === 'docx') {
    console.log('Attempting DOCX text extraction with multiple methods...');
    console.log('Buffer details:', {
      length: fileBuffer.length,
      type: typeof fileBuffer,
      constructor: fileBuffer.constructor.name,
      isBuffer: Buffer.isBuffer(fileBuffer)
    });
    
    let extractionAttempts = [];
    
    // Method 1: Try mammoth.js
    try {
      console.log('Method 1: Trying mammoth.js...');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const mammothText = result.value;
      
      console.log('Mammoth result:', {
        textLength: mammothText.length,
        preview: mammothText.substring(0, 200),
        warnings: result.messages.length,
        containsRawContent: mammothText.includes('[Content_Types]') || mammothText.includes('PK')
      });
      
      // Check if mammoth actually extracted meaningful text
      if (mammothText && mammothText.trim().length > 0 && 
          !mammothText.includes('[Content_Types]') && 
          !mammothText.includes('PK') &&
          !mammothText.includes('.xml')) {
        extractedText = mammothText;
        extractionMethod = 'mammoth_docx';
        console.log('✅ Mammoth extraction successful');
        extractionAttempts.push({ method: 'mammoth', success: true, textLength: mammothText.length });
      } else {
        console.log('❌ Mammoth returned raw content or empty text');
        extractionAttempts.push({ method: 'mammoth', success: false, reason: 'raw_content_or_empty' });
      }
    } catch (mammothError) {
      console.log('❌ Mammoth extraction failed:', mammothError.message);
      extractionAttempts.push({ method: 'mammoth', success: false, reason: mammothError.message });
    }
    
    // Method 2: Try docx-parser if mammoth failed
    if (!extractedText || extractionMethod === 'extraction_failed') {
      try {
        console.log('Method 2: Trying docx-parser...');
        const docxResult = await parseDocument(fileBuffer);
        const docxText = docxResult.text || '';
        
        console.log('Docx-parser result:', {
          textLength: docxText.length,
          preview: docxText.substring(0, 200)
        });
        
        if (docxText && docxText.trim().length > 0) {
          extractedText = docxText;
          extractionMethod = 'docx_parser';
          console.log('✅ Docx-parser extraction successful');
          extractionAttempts.push({ method: 'docx_parser', success: true, textLength: docxText.length });
        } else {
          console.log('❌ Docx-parser returned empty text');
          extractionAttempts.push({ method: 'docx_parser', success: false, reason: 'empty_text' });
        }
      } catch (docxError) {
        console.log('❌ Docx-parser extraction failed:', docxError.message);
        extractionAttempts.push({ method: 'docx_parser', success: false, reason: docxError.message });
      }
    }
    
    // Method 3: As-is UTF-8 conversion (last resort)
    if (!extractedText || extractionMethod === 'extraction_failed') {
      try {
        console.log('Method 3: Returning raw UTF-8 text from buffer...');
        const rawText = fileBuffer.toString('utf-8');

        extractedText = rawText;
        extractionMethod = 'raw_utf8';
        console.log('✅ Raw UTF-8 extraction returned content:', {
          textLength: rawText.length,
          preview: rawText.substring(0, 200)
        });
        extractionAttempts.push({ method: 'raw_utf8', success: true, textLength: rawText.length });
      } catch (simpleError) {
        console.log('❌ Raw UTF-8 extraction failed:', simpleError.message);
        extractionAttempts.push({ method: 'raw_utf8', success: false, reason: simpleError.message });
      }
    }

    // Final fallback: return whatever raw UTF-8 conversion produces, even if empty
    if (!extractedText || extractionMethod === 'extraction_failed') {
      console.log('⚠️ All structured extraction methods failed - falling back to raw UTF-8 output.');
      try {
        extractedText = fileBuffer.toString('utf-8');
        extractionMethod = extractionMethod || 'raw_utf8_fallback';
      } catch (fallbackError) {
        console.log('❌ Raw UTF-8 fallback failed:', fallbackError.message);
        extractedText = '';
        extractionMethod = 'raw_utf8_fallback_failed';
      }
    }
    
    console.log('Extraction summary:', {
      finalMethod: extractionMethod,
      finalTextLength: extractedText.length,
      attempts: extractionAttempts
    });
  } else if (fileExtension === 'pdf') {
    // Extract text from PDF files using pdf-parse wrapper
    try {
      // Use the PDF extraction wrapper to handle pdf-parse issues
      const { extractTextFromPDF, createPDFFallbackText, createScannedPDFText } = await import('./pdf-extraction-wrapper.js');
      
      const pdfResult = await extractTextFromPDF(fileBuffer, fileName);
      
      if (pdfResult.text && pdfResult.text.trim().length >= 10) {
        extractedText = pdfResult.text;
        extractionMethod = pdfResult.method;
        
        console.log('PDF extraction successful:', {
          method: pdfResult.method,
          pages: pdfResult.pages,
          textLength: pdfResult.text.length
        });
      } else if (pdfResult.method === 'pdf_extraction_failed') {
        extractedText = createPDFFallbackText(fileName, fileBuffer.length, pdfResult.error);
        extractionMethod = 'pdf_extraction_failed';
      } else {
        extractedText = createScannedPDFText(fileName, fileBuffer.length);
        extractionMethod = 'pdf_scanned_document';
      }
      
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw new Error(`Failed to extract text from PDF file: ${error.message}`);
    }
  } else {
    // Try to extract as plain text while ensuring readability
    try {
      const decoded = decodeBufferToReadableText(fileBuffer);
      extractedText = decoded.text;
      extractionMethod = `fallback_text_${decoded.encoding}`;
    } catch (plainTextError) {
      console.warn('Plain text extraction failed or produced unreadable output:', plainTextError.message);
      extractedText = 'Document text extraction failed - the file appears to contain binary data or an unsupported format.';
      extractionMethod = 'fallback_text_unreadable';
    }
  }

  // Clean up the extracted text
  extractedText = extractedText
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks
    .replace(/[ \t]+/g, ' ') // Normalize whitespace
    // LESS AGGRESSIVE: Only remove actual control characters, keep Unicode
    .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control characters only
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

// Function to log indexing activities
async function logIndexingActivity(pool, logData) {
  try {
    const {
      operationType,
      sourceType,
      documentId,
      veevaDocumentId,
      documentName,
      documentNumber,
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
      operationType, sourceType, documentId, veevaDocumentId,
      documentName, documentNumber, documentType, version, status,
      processingDurationMs, chunksCreated, summaryGenerated, errorMessage,
      batchId, batchOffset, userId, sessionId, forceRegenerate
    ]);

    console.log(`📝 Logged indexing activity: ${operationType} - ${documentName} - ${status}`);
  } catch (error) {
    console.error('Failed to log indexing activity:', error);
    // Don't throw error to avoid breaking the main process
  }
}

// Function to generate embeddings and store chunks
async function chunkAndEmbedDocument(documentText, documentId, veevaDocumentId, pool, startTime = Date.now()) {
  const MAX_CHUNK_PROCESSING_TIME = 20000; // 20 seconds for chunk processing
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

    // Generate embeddings for each chunk in batches - smaller batches for faster processing
    const batchSize = 5; // Reduced batch size for faster processing and better timeout handling
    let chunksCreated = 0;

    for (let i = 0; i < validChunks.length; i += batchSize) {
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_CHUNK_PROCESSING_TIME) {
        console.warn(`⏰ Chunk processing timeout warning: ${elapsedTime}ms elapsed, stopping chunk processing`);
        break;
      }
      
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
  const MAX_EXECUTION_TIME = 25000; // 25 seconds to leave buffer for response
  console.log('=== DOCUMENT INDEXING STARTED ===');
  console.log('Starting document indexing process...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams),
    eventMethod: event.httpMethod,
    eventPath: event.path,
    maxExecutionTime: MAX_EXECUTION_TIME
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

    // Query Veeva for approved documents - get latest steady-state version per document
    let vql = `
      SELECT id, document_number__v, name__v, status__v, major_version_number__v, minor_version_number__v, subtype__v, type__v
      FROM document_versions
        WHERE status__v = STEADYSTATE() AND
        (subtype__v = 'Standard Operating Procedure' OR 
         subtype__v = 'Work Instruction' OR 
         subtype__v = 'Policy')
    `;

    if (nameLike) vql += ` AND (name__v LIKE '%${nameLike.replace(/'/g, "''")}%' OR document_number__v LIKE '%${nameLike.replace(/'/g, "''")}%') `;
    vql += " ORDER BY document_number__v, major_version_number__v DESC, minor_version_number__v DESC ";

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

    // Process results to get only the latest steady-state version per document
    // Since we ordered by document_number__v, major DESC, minor DESC, we can deduplicate
    const seenDocuments = new Map();
    const allVersions = data.data || [];
    const documents = [];
    
    for (const doc of allVersions) {
      const docNumber = doc.document_number__v;
      if (!seenDocuments.has(docNumber)) {
        seenDocuments.set(docNumber, true);
        documents.push(doc);
      }
    }
    
    console.log('Step 8.5: Deduplicated to latest steady-state versions:', {
      totalVersions: allVersions.length,
      uniqueDocuments: documents.length
    });
    console.log('Step 9: Getting database pool...');
    const pool = getPool();
    console.log('Step 9: Database pool obtained:', {
      hasPool: !!pool,
      poolType: typeof pool
    });
    
    const results = [];
    
    // Generate batch ID for this indexing session
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Apply batch processing to avoid timeout - use smaller batches for better timeout handling
    const startIndex = batchOffset;
    const endIndex = Math.min(startIndex + batchSize, documents.length);
    const documentsToProcess = documents.slice(startIndex, endIndex);
    
    console.log(`📦 Batch processing configuration:`, {
      totalDocuments: documents.length,
      batchSize,
      batchOffset,
      startIndex,
      endIndex,
      documentsInThisBatch: documentsToProcess.length,
      remainingAfterBatch: documents.length - endIndex,
      maxExecutionTime: MAX_EXECUTION_TIME
    });

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
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.warn(`⏰ Timeout warning: ${elapsedTime}ms elapsed, stopping processing to avoid timeout`);
        break;
      }
      
      const doc = documentsToProcess[i];
      const globalIndex = startIndex + i;
      const docStartTime = Date.now();
      const docDuration = Date.now() - docStartTime; // Initialize here for use in logging
      
      // Progress tracking
      const progressPercent = Math.round(((globalIndex + 1) / documents.length) * 100);
      console.log(`📊 Progress: ${globalIndex + 1}/${documents.length} (${progressPercent}%) - ${elapsedTime}ms elapsed`);
      
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
                  const documentArrayBuffer = await downloadRes.arrayBuffer();
                  // Convert ArrayBuffer to Node.js Buffer - keep binary data intact
                  const documentBuffer = Buffer.from(documentArrayBuffer);
                  const contentType = downloadRes.headers.get('content-type') || '';
                  let documentName = resolveFilenameFromHeaders(downloadRes.headers, doc.name__v || `document_${doc.id}`);
                  documentName = ensureFilenameHasExtension(documentName, contentType);
                  
                  console.log(`Buffer conversion: ArrayBuffer ${documentArrayBuffer.byteLength} bytes -> Buffer ${documentBuffer.length} bytes`);
                  console.log(`Downloaded ${documentBuffer.byteLength} bytes for document: ${doc.id}`);
                  console.log('Resolved document download metadata:', {
                    originalName: doc.name__v,
                    resolvedName: documentName,
                    contentType,
                    hasExtension: documentName.includes('.')
                  });
                  
                  // Extract text from document using local extraction
                  console.log(`Extracting text from document: ${doc.id}`);
                  const extractionStartTime = Date.now();
                  
                  try {
                    const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
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
                    
                    const completion = await groq.chat.completions.create({
                      model: "openai/gpt-oss-20b",
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

                    const groqDuration = Date.now() - openaiStartTime;
                    updatedSummary = completion.choices[0]?.message?.content || null;
                    console.log(`Groq API response received for document: ${doc.id}`, {
                      responseTime: `${groqDuration}ms`,
                      summaryLength: updatedSummary?.length || 0,
                      tokensUsed: completion.usage?.total_tokens || 0,
                      promptTokens: completion.usage?.prompt_tokens || 0,
                      completionTokens: completion.usage?.completion_tokens || 0,
                      totalProcessingTime: extractionDuration + groqDuration,
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
                    const documentArrayBuffer = await downloadRes.arrayBuffer();
                    // Convert ArrayBuffer to Node.js Buffer - keep binary data intact
                    const documentBuffer = Buffer.from(documentArrayBuffer);
                    const contentType = downloadRes.headers.get('content-type') || '';
                    let documentName = resolveFilenameFromHeaders(downloadRes.headers, doc.name__v || `document_${doc.id}`);
                    documentName = ensureFilenameHasExtension(documentName, contentType);
                    
                    console.log(`Buffer conversion: ArrayBuffer ${documentArrayBuffer.byteLength} bytes -> Buffer ${documentBuffer.length} bytes`);
                    console.log('Resolved document download metadata:', {
                      originalName: doc.name__v,
                      resolvedName: documentName,
                      contentType,
                      hasExtension: documentName.includes('.')
                    });
                    const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
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
            
            // Declare chunkResult outside the conditional for logging
            let chunkResult = null;
            
            // Chunk and embed if we have document text
            if (documentTextForChunking) {
              console.log(`Chunking and embedding document for RAG: ${doc.id}`);
              chunkResult = await chunkAndEmbedDocument(
                documentTextForChunking,
                existing.id,
                doc.id,
                pool,
                startTime
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

          // Log the indexing activity
          await logIndexingActivity(pool, {
            operationType: forceRegenerate ? 'force_regenerate' : 'regenerate',
            sourceType: 'veeva',
            documentId: existing.id,
            veevaDocumentId: doc.id,
            documentName: doc.name__v,
            documentNumber: doc.document_number__v,
            documentType: doc.type__v,
            version: `${doc.major_version_number__v}.${doc.minor_version_number__v}`,
            status: 'success',
            processingDurationMs: docDuration,
            chunksCreated: chunkResult?.chunksCreated || 0,
            summaryGenerated: !!updatedSummary,
            batchId: batchId,
            batchOffset: globalIndex,
            forceRegenerate: forceRegenerate
          });
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
                  const documentArrayBuffer = await downloadRes.arrayBuffer();
                  // Convert ArrayBuffer to Node.js Buffer
                  const documentBuffer = Buffer.from(documentArrayBuffer);
                  const contentType = downloadRes.headers.get('content-type') || '';
                  let documentName = resolveFilenameFromHeaders(downloadRes.headers, doc.name__v || `document_${doc.id}`);
                  documentName = ensureFilenameHasExtension(documentName, contentType);
                  console.log('Resolved document download metadata:', {
                    originalName: doc.name__v,
                    resolvedName: documentName,
                    contentType,
                    hasExtension: documentName.includes('.')
                  });
                  const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
                  const documentText = extractionResult.extractedText;
                  
                  if (documentText && documentText.trim().length > 0) {
                    console.log(`✓ Extracted ${extractionResult.textLength} characters, starting chunking and embedding...`);
                    try {
                      const chunkResult = await chunkAndEmbedDocument(
                        documentText,
                        existing.id,
                        doc.id,
                        pool,
                        startTime
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

            // Log the indexing activity
            await logIndexingActivity(pool, {
              operationType: 'index',
              sourceType: 'veeva',
              documentId: existing.id,
              veevaDocumentId: doc.id,
              documentName: doc.name__v,
              documentNumber: doc.document_number__v,
              documentType: doc.type__v,
              version: `${doc.major_version_number__v}.${doc.minor_version_number__v}`,
              status: 'skipped',
              processingDurationMs: docDuration,
              chunksCreated: 0,
              summaryGenerated: false,
              batchId: batchId,
              batchOffset: globalIndex,
              forceRegenerate: forceRegenerate
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
              const documentArrayBuffer = await downloadRes.arrayBuffer();
              // Convert ArrayBuffer to Node.js Buffer - keep binary data intact
              const documentBuffer = Buffer.from(documentArrayBuffer);
              const contentType = downloadRes.headers.get('content-type') || '';
              let documentName = resolveFilenameFromHeaders(downloadRes.headers, doc.name__v || `document_${doc.id}`);
              documentName = ensureFilenameHasExtension(documentName, contentType);

              console.log(`Buffer conversion: ArrayBuffer ${documentArrayBuffer.byteLength} bytes -> Buffer ${documentBuffer.length} bytes`);

              console.log(`Downloaded ${documentBuffer.byteLength} bytes for document: ${doc.id}`);
              console.log('Resolved document download metadata:', {
                originalName: doc.name__v,
                resolvedName: documentName,
                contentType,
                hasExtension: documentName.includes('.')
              });

              // Extract text from document using local extraction
              console.log(`Extracting text from document: ${doc.id}`);
              const extractionStartTime = Date.now();

              try {
                const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
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
                
                const completion = await groq.chat.completions.create({
                  model: "openai/gpt-oss-20b",
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

                const groqDuration = Date.now() - openaiStartTime;
                summary = completion.choices[0]?.message?.content || null;
                console.log(`Groq API response received for new document: ${doc.id}`, {
                  responseTime: `${groqDuration}ms`,
                  summaryLength: summary?.length || 0,
                  tokensUsed: completion.usage?.total_tokens || 0,
                  promptTokens: completion.usage?.prompt_tokens || 0,
                  completionTokens: completion.usage?.completion_tokens || 0,
                  totalProcessingTime: extractionDuration + groqDuration,
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
                    
                    const completion = await groq.chat.completions.create({
                      model: "openai/gpt-oss-20b",
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
                    console.log(`Groq API response received for fallback document: ${doc.id}`, {
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

          // Declare chunkResult outside the conditional for logging
          let chunkResult = null;

          // Chunk and embed the new document for RAG (if we have document text)
          if (documentText && documentText.trim().length > 0) {
            console.log(`Chunking and embedding new document for RAG: ${doc.id}`);
            chunkResult = await chunkAndEmbedDocument(
              documentText,
              newDocumentId, // Use the newly created document_index id
              doc.id,
              pool,
              startTime
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

          // Log the indexing activity
          await logIndexingActivity(pool, {
            operationType: 'index',
            sourceType: 'veeva',
            documentId: newDocumentId,
            veevaDocumentId: doc.id,
            documentName: doc.name__v,
            documentNumber: doc.document_number__v,
            documentType: doc.type__v,
            version: `${doc.major_version_number__v}.${doc.minor_version_number__v}`,
            status: 'success',
            processingDurationMs: docDuration,
            chunksCreated: chunkResult?.chunksCreated || 0,
            summaryGenerated: !!summary,
            batchId: batchId,
            batchOffset: globalIndex,
            forceRegenerate: forceRegenerate
          });
        }

        console.log(`=== DOCUMENT ${globalIndex + 1} COMPLETED ===`);
        console.log(`Document processed in ${docDuration}ms: ${doc.name__v}`);
        
      } catch (error) {
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

        // Log the indexing activity
        await logIndexingActivity(pool, {
          operationType: 'index',
          sourceType: 'veeva',
          documentId: null,
          veevaDocumentId: doc.id,
          documentName: doc.name__v,
          documentNumber: doc.document_number__v,
          documentType: doc.type__v,
          version: `${doc.major_version_number__v}.${doc.minor_version_number__v}`,
          status: 'error',
          processingDurationMs: docDuration,
          chunksCreated: 0,
          summaryGenerated: false,
          errorMessage: error.message,
          batchId: batchId,
          batchOffset: globalIndex,
          forceRegenerate: forceRegenerate
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const wasTimeout = totalDuration > MAX_EXECUTION_TIME;
    const stats = {
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      unchanged: results.filter(r => r.action === 'unchanged').length,
      errors: results.filter(r => r.action === 'error').length,
      timeout: wasTimeout
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
    
    if (wasTimeout) {
      console.warn('⚠️ Processing stopped due to timeout - some documents may not have been processed');
    }
    
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

