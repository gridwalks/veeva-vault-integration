import { randomUUID } from 'crypto';
import { getStore } from '@netlify/blobs';
import { writeBlobAudit } from './blob-audit.js';
import { getPool } from './db.js';
import { OpenAI } from 'openai';
import mammoth from 'mammoth';
import { parseDocument } from 'docx-parser';
import { chunkText } from './chunking-utils.js';

const STORE_NAME = 'chat-uploads';
const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour default lifetime

// Initialize OpenAI for embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function decodeFilename(rawName = '') {
  try {
    return decodeURIComponent(rawName);
  } catch (error) {
    return rawName;
  }
}

function normalizeHeader(headers, key) {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();
  for (const headerKey of Object.keys(headers)) {
    if (headerKey.toLowerCase() === lowerKey) {
      return headers[headerKey];
    }
  }
  return undefined;
}

async function generateSignedUrl(store, key, expiresAt) {
  if (!store) return null;

  try {
    if (typeof store.generateSignedUrl === 'function') {
      return await store.generateSignedUrl({
        key,
        expiresAt
      });
    }

    if (typeof store.getSignedUrl === 'function') {
      return await store.getSignedUrl({
        key,
        expiresAt
      });
    }
  } catch (error) {
    console.warn('Failed to generate signed URL for blob:', key, error);
  }

  return null;
}

// Helper function to extract text from different file types
async function extractTextFromFile(fileBuffer, fileName) {
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  
  try {
    switch (fileExtension) {
      case 'pdf':
        // PDF parsing would go here - for now, return placeholder
        return { text: `[PDF content from ${fileName} - text extraction not implemented]`, method: 'pdf' };
        
      case 'docx':
        const docxResult = await parseDocument(fileBuffer);
        return { text: docxResult.text || '', method: 'docx' };
        
      case 'doc':
        const docResult = await mammoth.extractRawText({ buffer: fileBuffer });
        return { text: docResult.value || '', method: 'doc' };
        
      case 'txt':
        return { text: fileBuffer.toString('utf-8'), method: 'txt' };
        
      case 'csv':
        return { text: fileBuffer.toString('utf-8'), method: 'csv' };
        
      default:
        return { text: `[Unsupported file type: ${fileExtension}]`, method: 'unsupported' };
    }
  } catch (error) {
    console.error(`Error extracting text from ${fileName}:`, error);
    return { text: `[Error extracting text from ${fileName}: ${error.message}]`, method: 'error' };
  }
}

// Helper function to process and index the uploaded document
async function processAndIndexDocument(fileBuffer, fileName, blobKey, userId = null) {
  try {
    console.log(`Processing uploaded document: ${fileName}`);
    
    // Extract text from the file
    const { text: extractedText, method: extractionMethod } = await extractTextFromFile(fileBuffer, fileName);
    
    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`No text extracted from ${fileName}`);
      return { success: false, error: 'No text content found in document' };
    }
    
    console.log(`Text extracted from ${fileName} using ${extractionMethod}: ${extractedText.length} characters`);
    
    // Get database pool
    const pool = getPool();
    if (!pool) {
      throw new Error('Database connection not available');
    }
    
    // Create document record
    const documentId = randomUUID();
    const now = new Date().toISOString();
    
    await pool.query(`
      INSERT INTO qms_chat_documents 
      (id, document_name, document_type, version, document_number, user_id, created_at, updated_at, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        document_name = $2,
        document_type = $3,
        version = $4,
        document_number = $5,
        user_id = $6,
        updated_at = $7,
        source = $9
    `, [
      documentId,
      fileName,
      'uploaded',
      '1.0',
      `UPLOAD-${Date.now()}`,
      userId,
      now,
      now,
      'blob_upload'
    ]);
    
    // Chunk the text
    const chunks = chunkText(extractedText, 1000, 200); // 1000 chars, 200 overlap
    console.log(`Created ${chunks.length} chunks for ${fileName}`);
    
    // Generate embeddings and store chunks
    const batchSize = 10;
    let chunksCreated = 0;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      
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
          
          // Convert embedding array to PostgreSQL vector format
          const embeddingStr = '[' + embedding.join(',') + ']';
          
          await pool.query(`
            INSERT INTO qms_chat_document_chunks 
            (document_id, veeva_document_id, chunk_index, chunk_text, embedding, token_count, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (document_id, chunk_index) 
            DO UPDATE SET chunk_text = $4, embedding = $5, token_count = $6, user_id = $7, created_at = CURRENT_TIMESTAMP
          `, [
            documentId,
            null, // No Veeva document ID for uploaded files
            chunk.index,
            chunk.text,
            embeddingStr,
            chunk.tokenCount,
            userId
          ]);
          
          chunksCreated++;
        }
      } catch (batchError) {
        console.error(`Error processing embedding batch for ${fileName}:`, batchError);
        throw batchError;
      }
    }
    
    console.log(`Successfully indexed ${fileName}: ${chunksCreated} chunks created`);
    
    return { 
      success: true, 
      documentId, 
      chunksCreated,
      textLength: extractedText.length,
      extractionMethod 
    };
    
  } catch (error) {
    console.error(`Error processing document ${fileName}:`, error);
    return { success: false, error: error.message };
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let store;
  try {
    const STORE_INIT_TIMEOUT = 5000; // 5 seconds
    const storePromise = getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Store initialization timeout')), STORE_INIT_TIMEOUT)
    );
    store = await Promise.race([storePromise, timeoutPromise]);
  } catch (error) {
    console.error('Failed to access blob store:', {
      message: error?.message,
      stack: error?.stack,
      storeName: STORE_NAME,
      hasToken: !!process.env.NETLIFY_BLOBS_TOKEN,
      hasSiteId: !!process.env.NETLIFY_BLOBS_SITE_ID
    });
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blob storage is currently unavailable' })
    };
  }

  if (!store || typeof store.set !== 'function') {
    console.error('Blob store is unavailable or missing required methods.');
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blob storage is currently unavailable' })
    };
  }
  const includeUrl = (event.queryStringParameters?.includeUrl || '').toLowerCase() === 'true';
  const headers = event.headers || {};
  const rawFileName = normalizeHeader(headers, 'x-file-name') || normalizeHeader(headers, 'x-filename');
  const fileName = rawFileName ? decodeFilename(rawFileName) : `chat-upload-${Date.now()}`;
  const contentType = normalizeHeader(headers, 'content-type') || 'application/octet-stream';
  const fileSizeHeader = normalizeHeader(headers, 'content-length') || normalizeHeader(headers, 'x-file-size');

  // Enforce upload size limits to avoid function/body limits
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB safe under Netlify limits
  const declaredSize = fileSizeHeader ? parseInt(fileSizeHeader, 10) : null;
  if (declaredSize && declaredSize > MAX_FILE_SIZE) {
    return {
      statusCode: 413,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'File too large', maxSize: MAX_FILE_SIZE, receivedSize: declaredSize })
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request body is empty' })
    };
  }

  const buffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  if (buffer.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No file content received' })
    };
  }

  // Warn if buffer size does not match declared size (if provided)
  if (declaredSize && Math.abs(buffer.length - declaredSize) > 1024) {
    console.warn('Buffer size mismatch detected during blob upload', {
      fileName,
      declaredSize,
      bufferLength: buffer.length,
      difference: buffer.length - declaredSize
    });
  }

  const createdAt = new Date().toISOString();
  const blobKey = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}`;

  try {
    await store.set(blobKey, buffer, {
      metadata: {
        fileName,
        contentType,
        size: buffer.length.toString(),
        declaredSize: fileSizeHeader || buffer.length.toString(),
        createdAt
      }
    });

    let signedUrl = null;
    if (includeUrl) {
      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString();
      signedUrl = await generateSignedUrl(store, blobKey, expiresAt);
    }

    // Process and index the document for AI access
    const processingResult = await processAndIndexDocument(buffer, fileName, blobKey);
    
    await writeBlobAudit({
      action: 'upload',
      blobKey,
      status: 'success',
      metadata: {
        fileName,
        contentType,
        size: buffer.length,
        declaredSize: fileSizeHeader ? Number(fileSizeHeader) : null,
        createdAt,
        includeUrl,
        processingResult: processingResult.success ? {
          documentId: processingResult.documentId,
          chunksCreated: processingResult.chunksCreated,
          textLength: processingResult.textLength,
          extractionMethod: processingResult.extractionMethod
        } : { error: processingResult.error }
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        key: blobKey,
        url: signedUrl,
        createdAt,
        processingResult: processingResult.success ? {
          documentId: processingResult.documentId,
          chunksCreated: processingResult.chunksCreated,
          textLength: processingResult.textLength,
          extractionMethod: processingResult.extractionMethod,
          indexed: true
        } : {
          indexed: false,
          error: processingResult.error
        }
      })
    };
  } catch (error) {
    console.error('Blob upload failed:', {
      message: error?.message,
      stack: error?.stack,
      fileName,
      contentType,
      size: buffer.length
    });
    await writeBlobAudit({
      action: 'upload',
      blobKey,
      status: 'error',
      metadata: {
        fileName,
        contentType,
        size: buffer.length,
        createdAt,
        includeUrl
      },
      errorMessage: error.message
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to upload file' })
    };
  }
};
