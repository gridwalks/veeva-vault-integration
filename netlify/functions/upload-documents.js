import { Pool } from 'pg';
import { OpenAI } from 'openai';
import Groq from 'groq-sdk';
import mammoth from 'mammoth';
import { parseDocument } from 'docx-parser';
import pdfParse from 'pdf-parse';
import { chunkText, validateChunks } from './chunking-utils.js';
import { getStore } from '@netlify/blobs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Helper function to parse multipart form data
function parseMultipartFormData(body, contentType, isBase64Encoded = true) {
  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('No boundary found in content-type header');
  }

  const bodyBuffer = isBase64Encoded
    ? Buffer.from(body, 'base64')
    : Buffer.from(body, 'utf-8');
  const boundaryMarker = `--${boundary}`;
  const bodyString = bodyBuffer.toString('latin1');
  const rawParts = bodyString.split(boundaryMarker);

  const files = [];
  let fileCount = 0;
  let uploadType = 'bulk_import';
  let userId = null;

  for (const rawPart of rawParts) {
    const trimmedPart = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');

    if (!trimmedPart || trimmedPart === '--') {
      continue;
    }

    if (!trimmedPart.includes('Content-Disposition: form-data')) {
      continue;
    }

    const partBuffer = Buffer.from(trimmedPart, 'latin1');
    const headerTerminator = partBuffer.indexOf(Buffer.from('\r\n\r\n', 'latin1'));

    if (headerTerminator === -1) {
      continue;
    }

    const headersBuffer = partBuffer.slice(0, headerTerminator);
    let contentBuffer = partBuffer.slice(headerTerminator + 4);

    // Remove trailing CRLF added before the boundary marker
    if (contentBuffer.length >= 2 && contentBuffer[contentBuffer.length - 2] === 13 && contentBuffer[contentBuffer.length - 1] === 10) {
      contentBuffer = contentBuffer.slice(0, -2);
    }

    const headers = headersBuffer.toString('utf-8');

    if (headers.includes('name="file_')) {
      const fileBuffer = Buffer.from(contentBuffer);
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const fileName = filenameMatch ? filenameMatch[1] : `file_${files.length}`;

      files.push({
        buffer: fileBuffer,
        fileName: fileName,
        size: fileBuffer.length
      });
    } else if (headers.includes('name="fileCount"')) {
      fileCount = parseInt(contentBuffer.toString('utf-8').trim());
    } else if (headers.includes('name="uploadType"')) {
      uploadType = contentBuffer.toString('utf-8').trim();
    } else if (headers.includes('name="userId"')) {
      userId = contentBuffer.toString('utf-8').trim();
    }
  }

  return { files, fileCount, uploadType, userId };
}

// Helper function to save file to Netlify Blob storage
async function saveFileToBlob(fileBuffer, fileName, mimeType) {
  try {
    // Get the blob store for uploaded documents
    const STORE_INIT_TIMEOUT = 5000; // 5 seconds
    const store = await Promise.race([
      getStore({
        name: 'uploaded-documents',
        siteID: process.env.NETLIFY_BLOBS_SITE_ID,
        token: process.env.NETLIFY_BLOBS_TOKEN
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Store initialization timeout')), STORE_INIT_TIMEOUT))
    ]);
    
    // Generate a unique filename to avoid conflicts
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const blobKey = `documents/${timestamp}_${sanitizedFileName}`;
    
    console.log(`Saving file to Netlify Blob: ${blobKey}`);
    
    // Save file to Netlify Blob with metadata
    await store.set(blobKey, fileBuffer, {
      metadata: {
        originalName: fileName,
        mimeType: mimeType,
        uploadedAt: new Date().toISOString(),
        size: fileBuffer.length.toString()
      }
    });
    
    // Return the blob key (we'll use this to retrieve the file)
    console.log(`File saved to blob storage with key: ${blobKey}`);
    
    return blobKey;
  } catch (error) {
    console.error('Error saving file to blob storage:', error);
    throw error;
  }
}

// Helper function to extract text from different file types
async function extractTextFromFile(fileBuffer, fileName) {
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  let extractedText = '';
  let extractionMethod = '';

  console.log(`Extracting text from ${fileName} (${fileExtension})`);

  try {
    if (fileExtension === 'txt' || fileExtension === 'rtf') {
      extractedText = fileBuffer.toString('utf-8');
      extractionMethod = 'utf8';
    } else if (fileExtension === 'pdf') {
      try {
        const pdfResult = await pdfParse(fileBuffer);
        extractedText = (pdfResult.text || '').replace(/\u0000/g, '').trim();

        if (!extractedText) {
          console.warn(`PDF text extraction returned empty text for ${fileName}`);
          extractedText = `[PDF Content: ${fileName}] - No extractable text found`;
          extractionMethod = 'pdf_empty_fallback';
        } else {
          extractionMethod = 'pdf_parse';
        }
      } catch (pdfError) {
        console.error(`PDF extraction failed for ${fileName}:`, pdfError);
        extractedText = `[PDF Content: ${fileName}] - PDF text extraction failed`;
        extractionMethod = 'pdf_error_fallback';
      }
    } else if (fileExtension === 'docx') {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
        extractionMethod = 'mammoth';
      } catch (mammothError) {
        console.log('Mammoth failed, trying docx-parser...');
        try {
          const docxResult = await parseDocument(fileBuffer);
          extractedText = docxResult.text || '';
          extractionMethod = 'docx_parser';
        } catch (docxError) {
          console.error('Both docx extraction methods failed:', docxError);
          extractedText = `[DOCX Content: ${fileName}] - Text extraction failed`;
          extractionMethod = 'extraction_failed';
        }
      }
    } else if (fileExtension === 'doc') {
      extractedText = `[DOC Content: ${fileName}] - DOC text extraction not yet implemented`;
      extractionMethod = 'doc_placeholder';
    } else if (fileExtension === 'csv') {
      extractedText = fileBuffer.toString('utf-8');
      extractionMethod = 'csv';
    } else if (fileExtension === 'zip') {
      extractedText = `[ZIP Archive: ${fileName}] - ZIP processing not yet implemented`;
      extractionMethod = 'zip_placeholder';
    } else {
      extractedText = `[Unknown file type: ${fileName}]`;
      extractionMethod = 'unknown';
    }

    console.log(`Text extraction completed for ${fileName}: ${extractedText.length} characters using ${extractionMethod}`);
    return { text: extractedText, method: extractionMethod };
  } catch (error) {
    console.error(`Error extracting text from ${fileName}:`, error);
    return { text: `[Error extracting text from ${fileName}]`, method: 'error' };
  }
}

// Helper function to generate AI summary
async function generateSummary(text, fileName) {
  try {
    // Very conservative approach - only use first 1000 characters
    const maxTextLength = Math.min(1000, text.length);
    const truncatedText = text.substring(0, maxTextLength);
    
    console.log(`Generating summary for ${fileName}: ${text.length} chars -> ${truncatedText.length} chars`);
    
    console.log(`Attempting Groq API call with model: openai/gpt-oss-20b`);
    console.log(`Text length being sent: ${truncatedText.length} characters`);
    
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: "Create a brief summary of the document."
        },
        {
          role: "user",
          content: `Summarize: ${fileName}\n\n${truncatedText}`
        }
      ],
      max_tokens: 200,
      temperature: 0.1
    });
    
    console.log(`Groq API call successful for ${fileName}`);

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating summary:', {
      fileName,
      textLength: text.length,
      truncatedLength: Math.min(1000, text.length),
      errorMessage: error.message,
      errorStatus: error.status,
      errorCode: error.code,
      errorType: error.type,
      fullError: error,
      model: "openai/gpt-oss-20b"
    });
    
    // Check if this is a model-related error
    if (error.message && error.message.includes('8192')) {
      console.error('CRITICAL: 8192 token limit error detected! This suggests the model is not working as expected.');
    }
    
    // If summary generation fails, return a basic summary instead of failing the entire upload
    return `Document: ${fileName} (${text.length} characters) - Summary generation failed: ${error.message}`;
  }
}

// Helper function to create documents table if it doesn't exist
async function createDocumentsTable() {
  try {
    console.log('Creating qms_chat_documents table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_documents (
        id SERIAL PRIMARY KEY,
        document_name TEXT NOT NULL,
        document_type VARCHAR(255) DEFAULT 'uploaded_document',
        version VARCHAR(50) DEFAULT '1.0',
        content TEXT,
        ai_summary TEXT,
        file_size BIGINT,
        extraction_method VARCHAR(100),
        source_type VARCHAR(50) DEFAULT 'upload',
        blob_url TEXT,
        original_filename TEXT,
        mime_type VARCHAR(255),
        user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add missing columns if they don't exist (for existing tables)
    const columnsToAdd = [
      { name: 'blob_url', type: 'TEXT' },
      { name: 'original_filename', type: 'TEXT' },
      { name: 'mime_type', type: 'VARCHAR(255)' },
      { name: 'user_id', type: 'VARCHAR(255)' }
    ];

    for (const column of columnsToAdd) {
      try {
        await pool.query(`
          ALTER TABLE qms_chat_documents 
          ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
        `);
        console.log(`✅ Ensured column exists: ${column.name}`);
      } catch (error) {
        console.log(`Column ${column.name} might already exist:`, error.message);
      }
    }
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_name ON qms_chat_documents(document_name);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_type ON qms_chat_documents(document_type);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_documents_source_type ON qms_chat_documents(source_type);
    `);
    
    console.log('Veeva_Doc_Chat_documents table created successfully');
  } catch (error) {
    console.error('Error creating Veeva_Doc_Chat_documents table:', error);
    throw error;
  }
}

// Helper function to store document in database
async function storeDocument(fileName, extractedText, summary, fileSize, extractionMethod, blobUrl, originalFileName, mimeType, userId) {
  try {
    // Ensure table structure is up to date
    await createDocumentsTable();

    // Try to insert with all columns first, fall back to basic columns if new ones don't exist
    let result;
    try {
      result = await pool.query(`
        INSERT INTO qms_chat_documents 
        (document_name, document_type, version, content, ai_summary, file_size, extraction_method, source_type, blob_url, original_filename, mime_type, user_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        fileName,
        'uploaded_document',
        '1.0',
        extractedText,
        summary,
        fileSize,
        extractionMethod,
        'upload',
        blobUrl,
        originalFileName,
        mimeType,
        userId
      ]);
    } catch (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('New columns not found, using basic insert...');
        result = await pool.query(`
          INSERT INTO qms_chat_documents 
          (document_name, document_type, version, content, ai_summary, file_size, extraction_method, source_type, user_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
          fileName,
          'uploaded_document',
          '1.0',
          extractedText,
          summary,
          fileSize,
          extractionMethod,
          'upload',
          userId
        ]);
      } else {
        throw error;
      }
    }

    return result.rows[0].id;
  } catch (error) {
    console.error('Error storing document:', error);
    throw error;
  }
}

// Helper function to create chunks table if it doesn't exist
async function createChunksTable() {
  try {
    console.log('Creating Veeva_Doc_Chat_document_chunks table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES qms_chat_documents(id) ON DELETE CASCADE,
        veeva_document_id VARCHAR(255),
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        token_count INTEGER,
        user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, chunk_index)
      );
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_chunks_document_id ON qms_chat_document_chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_chunks_veeva_document_id ON qms_chat_document_chunks(veeva_document_id);
    `);
    
    // Add user_id column for existing deployments
    await pool.query(`
      ALTER TABLE qms_chat_document_chunks
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)
    `);

    console.log('Veeva_Doc_Chat_document_chunks table created successfully');
  } catch (error) {
    console.error('Error creating Veeva_Doc_Chat_document_chunks table:', error);
    throw error;
  }
}

// Helper function to chunk and embed document
async function chunkAndEmbedDocument(documentText, documentId, fileName, userId) {
  try {
    console.log(`Chunking and embedding document ${fileName}...`);
    
    // Ensure chunks table exists
    await createChunksTable();
    
        // Chunk the text
        console.log(`=== CHUNKING DEBUG ===`);
        console.log(`Document text length: ${documentText.length} chars`);
        console.log(`Starting chunking with 8192 tokens per chunk...`);
        
    const rawChunks = chunkText(documentText, 8192, 400);
    console.log(`Created ${rawChunks.length} raw chunks for ${fileName}`);

    const chunks = validateChunks(rawChunks);
    console.log(`Validated chunk count for ${fileName}: ${chunks.length}`);

    if (chunks.length === 0) {
      console.log(`No valid chunks created for ${fileName}`);
      return { chunksCreated: 0, error: 'No valid chunks created' };
    }

    console.log(`Chunk details:`, chunks.map((chunk, index) => ({
          index,
          textLength: chunk.text.length,
          tokenCount: chunk.tokenCount
        })).slice(0, 5)); // Show first 5 chunks

    // Delete existing chunks for this document
    await pool.query('DELETE FROM qms_chat_document_chunks WHERE document_id = $1', [documentId]);
    console.log(`Deleted existing chunks for document ${documentId}`);

    // Generate embeddings for each chunk in batches
    const batchSize = 5; // Reduced batch size for faster processing
    let chunksCreated = 0;

    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
    const embeddingsConfigured = Boolean(process.env.OPENAI_API_KEY);

    if (!embeddingsConfigured) {
      console.warn('OPENAI_API_KEY not configured. Chunks will be stored without embeddings.');
    }

    for (let i = 0; i < chunks.length; i += batchSize) {
      // Check if we're approaching timeout during chunking
      const chunkElapsedTime = Date.now() - processingStartTime;
      if (chunkElapsedTime > MAX_PROCESSING_TIME) {
        console.warn(`Chunking timeout warning: ${chunkElapsedTime}ms elapsed, stopping chunk processing`);
        break;
      }

      const batchChunks = chunks.slice(i, Math.min(i + batchSize, chunks.length));

      console.log(`Processing embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${batchChunks.length} chunks)`);

      let embeddings = null;

      if (embeddingsConfigured) {
        try {
          const embeddingResponse = await openai.embeddings.create({
            model: embeddingModel,
            input: batchChunks.map(chunk => chunk.text),
          });

          embeddings = embeddingResponse.data.map(item => item.embedding);
        } catch (batchError) {
          console.error(`Error generating embeddings (storing chunks without embeddings):`, batchError);
        }
      }

      // Store chunks with embeddings (if available) in database
      for (let j = 0; j < batchChunks.length; j++) {
        const chunk = batchChunks[j];
        const embedding = embeddings ? embeddings[j] : null;
        const embeddingLiteral = Array.isArray(embedding) ? `[${embedding.join(',')}]` : null;

        try {
          await pool.query(`
            INSERT INTO qms_chat_document_chunks
            (document_id, veeva_document_id, chunk_index, chunk_text, embedding, token_count, user_id)
            VALUES ($1, $2, $3, $4, $5::vector, $6, $7)
            ON CONFLICT (document_id, chunk_index)
            DO UPDATE SET chunk_text = $4, embedding = $5::vector, token_count = $6, user_id = $7, created_at = CURRENT_TIMESTAMP
          `, [
            documentId,
            null, // No Veeva document ID for uploaded files
            chunk.index,
            chunk.text,
            embeddingLiteral,
            chunk.tokenCount,
            userId
          ]);
        } catch (dbError) {
          if (embeddingLiteral) {
            console.warn('Falling back to storing chunk without embeddings due to database error', {
              documentId,
              chunkIndex: chunk.index,
              error: dbError.message
            });

            await pool.query(`
              INSERT INTO qms_chat_document_chunks
              (document_id, veeva_document_id, chunk_index, chunk_text, embedding, token_count, user_id)
              VALUES ($1, $2, $3, $4, NULL, $5, $6)
              ON CONFLICT (document_id, chunk_index)
              DO UPDATE SET chunk_text = $4, embedding = NULL, token_count = $5, user_id = $6, created_at = CURRENT_TIMESTAMP
            `, [
              documentId,
              null,
              chunk.index,
              chunk.text,
              chunk.tokenCount,
              userId
            ]);
          } else {
            throw dbError;
          }
        }

        chunksCreated++;
      }
    }

    console.log(`Successfully created ${chunksCreated} chunks for ${fileName}${embeddingsConfigured ? '' : ' (without embeddings)'}`);
    return { chunksCreated, error: null };
  } catch (error) {
    console.error(`Error chunking and embedding document ${fileName}:`, error);
    return { chunksCreated: 0, error: error.message };
  }
}

export const handler = async (event) => {
  const functionStartTime = Date.now();
  console.log('=== DOCUMENT UPLOAD STARTED ===');
  console.log('Processing file upload...', {
    timestamp: new Date().toISOString(),
    contentType: event.headers['content-type'],
    method: event.httpMethod,
    bodyLength: event.body?.length || 0,
    functionTimeout: '26 seconds (configured)'
  });

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Handle non-POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Method not allowed',
        allowedMethods: ['POST', 'OPTIONS']
      })
    };
  }

  try {
    // Parse multipart form data
    console.log('Parsing multipart form data...');
    const parseStartTime = Date.now();
    
    const { files, fileCount, uploadType, userId } = parseMultipartFormData(
      event.body,
      event.headers['content-type'],
      event.isBase64Encoded !== false
    );

    const parseDuration = Date.now() - parseStartTime;
    console.log(`Multipart parsing completed in ${parseDuration}ms`);
    console.log(`Received ${files.length} files for upload:`, {
      fileCount,
      uploadType,
      fileNames: files.map(f => f.fileName)
    });

    if (files.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          error: 'No files received'
        })
      };
    }

    // Validate userId is provided
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          error: 'User ID is required for document upload'
        })
      };
    }

    const results = [];
    let totalChunksCreated = 0;
    let totalErrors = 0;
    const processingStartTime = Date.now();
    const MAX_PROCESSING_TIME = 20000; // 20 seconds to leave buffer for response

    // Process each file
    for (const file of files) {
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - processingStartTime;
      if (elapsedTime > MAX_PROCESSING_TIME) {
        console.warn(`Processing timeout warning: ${elapsedTime}ms elapsed`);
        results.push({
          fileName: file.fileName,
          success: false,
          error: 'Processing timeout - file too large or complex for current timeout settings'
        });
        totalErrors++;
        continue;
      }
      console.log(`Processing file: ${file.fileName} (${file.size} bytes)`);
      
      try {
        // Save file to Netlify Blob storage first
        let blobKey = null;
        let mimeType = 'application/octet-stream';
        
        try {
          // Determine MIME type based on file extension
          const fileExtension = file.fileName.split('.').pop()?.toLowerCase() || '';
          const mimeTypeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'rtf': 'application/rtf'
          };
          mimeType = mimeTypeMap[fileExtension] || 'application/octet-stream';
          
          console.log(`Attempting to save file to blob storage: ${file.fileName} (${mimeType})`);
          blobKey = await saveFileToBlob(file.buffer, file.fileName, mimeType);
          console.log(`✅ File saved to blob storage with key: ${blobKey}`);
        } catch (blobError) {
          console.error(`❌ Failed to save file to blob storage:`, {
            fileName: file.fileName,
            error: blobError.message,
            stack: blobError.stack
          });
          // Continue processing even if blob storage fails
          blobKey = null;
        }

        // Extract text from file
        const { text: extractedText, method: extractionMethod } = await extractTextFromFile(
          file.buffer, 
          file.fileName
        );

        // Generate AI summary (skip for large files to avoid token limits and timeouts)
        console.log(`=== FILE PROCESSING DEBUG ===`);
        console.log(`File: ${file.fileName}, Text length: ${extractedText.length} chars`);
        console.log(`Summary generation: ${extractedText.length > 5000 ? 'SKIPPED' : 'PROCEEDING'}`);
        
        let summary = '';
        if (extractedText.length > 5000) {
          console.log(`Skipping AI summary generation for large file: ${file.fileName} (${extractedText.length} chars)`);
          // Create a basic text-based summary instead
          summary = `Document: ${file.fileName} (${extractedText.length} characters)`;
          console.log(`Created basic summary for large file: ${summary.length} chars`);
        } else {
          try {
            console.log(`Generating AI summary for: ${file.fileName}`);
            const summaryStartTime = Date.now();
            summary = await generateSummary(extractedText, file.fileName);
            const summaryDuration = Date.now() - summaryStartTime;
            console.log(`AI summary generated in ${summaryDuration}ms for: ${file.fileName}`);
          } catch (summaryError) {
            console.error(`Summary generation failed for ${file.fileName}:`, summaryError);
            // Fallback to basic text summary
            const firstParagraph = extractedText.split('\n\n')[0] || extractedText.substring(0, 500);
            summary = `Document: ${file.fileName} (${extractedText.length} characters)\n\nFirst section: ${firstParagraph.substring(0, 200)}...`;
            console.log(`Created fallback summary: ${summary.length} chars`);
          }
        }

        // Store document in database
        console.log(`=== DATABASE STORAGE DEBUG ===`);
        console.log(`Storing document in database: ${file.fileName}`);
        console.log(`Document details: ${extractedText.length} chars, ${file.size} bytes`);
        
        const storeStartTime = Date.now();
        const documentId = await storeDocument(
          file.fileName,
          extractedText,
          summary,
          file.size,
          extractionMethod,
          blobKey,
          file.fileName,
          mimeType,
          userId
        );
        const storeDuration = Date.now() - storeStartTime;
        console.log(`Document stored in database in ${storeDuration}ms with ID: ${documentId}`);

        // Chunk and embed document
        console.log(`Chunking and embedding document: ${file.fileName}`);
        const chunkStartTime = Date.now();
        const { chunksCreated, error: chunkError } = await chunkAndEmbedDocument(
          extractedText,
          documentId,
          file.fileName,
          userId
        );
        const chunkDuration = Date.now() - chunkStartTime;
        console.log(`Chunking and embedding completed in ${chunkDuration}ms for: ${file.fileName}`);

        if (chunkError) {
          totalErrors++;
          results.push({
            fileName: file.fileName,
            success: false,
            error: chunkError,
            documentId,
            chunksCreated: 0
          });
        } else {
          totalChunksCreated += chunksCreated;
          results.push({
            fileName: file.fileName,
            success: true,
            documentId,
            chunksCreated,
            summary: summary.substring(0, 200) + (summary.length > 200 ? '...' : ''),
            extractionMethod,
            blobKey: blobKey,
            originalFileName: file.fileName,
            mimeType: mimeType
          });
        }

      } catch (error) {
        console.error(`Error processing file ${file.fileName}:`, error);
        totalErrors++;
        results.push({
          fileName: file.fileName,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalFunctionTime = Date.now() - functionStartTime;

    console.log(`Upload processing completed: ${successCount} successful, ${failureCount} failed`);
    console.log(`Total function execution time: ${totalFunctionTime}ms`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        message: `Successfully processed ${successCount} of ${files.length} files`,
        stats: {
          filesProcessed: files.length,
          successful: successCount,
          failed: failureCount,
          documentsIndexed: successCount,
          chunksCreated: totalChunksCreated,
          errors: totalErrors
        },
        results
      })
    };

  } catch (error) {
    const totalFunctionTime = Date.now() - functionStartTime;
    console.error('Upload processing error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
      totalFunctionTime: `${totalFunctionTime}ms`
    });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        error: 'Upload failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
