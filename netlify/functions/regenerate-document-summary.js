import { getSessionId } from "./vault-auth.js";
import { getPool, initDatabase } from "./db.js";
import Groq from 'groq-sdk';
import mammoth from 'mammoth';
import { parseDocument } from 'docx-parser';
import { chunkText, validateChunks, generateChunkPreview } from './chunking-utils.js';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

// Local text extraction function (reused from index-documents.js)
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

  if (fileExtension === 'docx') {
    console.log('Attempting DOCX text extraction with multiple methods...');
    
    let extractionAttempts = [];
    
    // Method 1: Try mammoth.js
    try {
      console.log('Method 1: Trying mammoth.js...');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const mammothText = result.value;
      
      if (mammothText && mammothText.trim().length > 0 && 
          !mammothText.includes('[Content_Types]') && 
          !mammothText.includes('PK') &&
          !mammothText.includes('.xml')) {
        extractedText = mammothText;
        extractionMethod = 'mammoth_docx';
        console.log('✅ Mammoth extraction successful');
      } else {
        console.log('❌ Mammoth returned raw content or empty text');
      }
    } catch (mammothError) {
      console.log('❌ Mammoth extraction failed:', mammothError.message);
    }
    
    // Method 2: Try docx-parser if mammoth failed
    if (!extractedText || extractionMethod === 'extraction_failed') {
      try {
        console.log('Method 2: Trying docx-parser...');
        const docxResult = await parseDocument(fileBuffer);
        const docxText = docxResult.text || '';
        
        if (docxText && docxText.trim().length > 0) {
          extractedText = docxText;
          extractionMethod = 'docx_parser';
          console.log('✅ Docx-parser extraction successful');
        } else {
          console.log('❌ Docx-parser returned empty text');
        }
      } catch (docxError) {
        console.log('❌ Docx-parser extraction failed:', docxError.message);
      }
    }
    
    // Method 3: As-is UTF-8 conversion (last resort)
    if (!extractedText || extractionMethod === 'extraction_failed') {
      try {
        console.log('Method 3: Returning raw UTF-8 text from buffer...');
        const rawText = fileBuffer.toString('utf-8');
        extractedText = rawText;
        extractionMethod = 'raw_utf8';
        console.log('✅ Raw UTF-8 extraction returned content');
      } catch (rawError) {
        console.log('❌ Raw UTF-8 extraction failed:', rawError.message);
        extractionMethod = 'extraction_failed';
      }
    }
  } else if (fileExtension === 'pdf') {
    console.log('PDF extraction not implemented in this function - would need pdf-parse');
    // For now, try to extract text as plain text
    try {
      const pdfText = fileBuffer.toString('utf-8');
      if (pdfText && pdfText.trim().length > 0) {
        extractedText = pdfText;
        extractionMethod = 'pdf_utf8';
        console.log('✅ PDF text extraction via UTF-8 successful');
      } else {
        throw new Error('No readable text found in PDF');
      }
    } catch (pdfError) {
      console.log('❌ PDF text extraction failed:', pdfError.message);
      throw new Error('PDF extraction not available in regenerate function');
    }
  } else {
    // For other file types, try direct text conversion
    try {
      console.log('Attempting direct text conversion...');
      const directText = fileBuffer.toString('utf-8');
      if (directText && directText.trim().length > 0) {
        extractedText = directText;
        extractionMethod = 'direct_utf8';
        console.log('✅ Direct UTF-8 conversion successful');
      } else {
        throw new Error('No readable text found');
      }
    } catch (directError) {
      console.log('❌ Direct text conversion failed:', directError.message);
      extractionMethod = 'extraction_failed';
    }
  }

  if (!extractedText || extractionMethod === 'extraction_failed') {
    throw new Error(`Failed to extract text from ${fileName} (${fileExtension || 'unknown'})`);
  }

  return {
    extractedText,
    textLength: extractedText.length,
    extractionMethod,
    fileType: fileExtension || 'unknown'
  };
}

export const handler = async (event) => {
  const startTime = Date.now();
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { documentId, sourceType } = body;
    
    if (!documentId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Document ID is required'
        })
      };
    }

    console.log(`Regenerating summary for document: ${documentId} (source: ${sourceType})`);

    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Get document from database
    const docQuery = await pool.query(`
      SELECT * FROM Veeva_Doc_Chat_document_index 
      WHERE id = $1
    `, [documentId]);

    if (docQuery.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Document not found'
        })
      };
    }

    const doc = docQuery.rows[0];
    console.log(`Found document: ${doc.document_name}`, {
      id: doc.id,
      source_type: doc.source_type,
      veeva_document_id: doc.veeva_document_id,
      blob_url: doc.blob_url,
      document_name: doc.document_name
    });

    let documentText = '';
    let documentBuffer = null;

    // Determine source type if not set
    let actualSourceType = doc.source_type;
    if (!actualSourceType) {
      if (doc.veeva_document_id) {
        actualSourceType = 'veeva';
        console.log('Inferred source type as veeva based on veeva_document_id');
      } else if (doc.blob_url) {
        actualSourceType = 'upload';
        console.log('Inferred source type as upload based on blob_url');
      } else {
        throw new Error(`Cannot determine document source type for document ${doc.id}. No source_type, veeva_document_id, or blob_url found.`);
      }
    }

    // Download document content based on source type
    if (actualSourceType === 'veeva') {
      // For Veeva documents, download from Veeva API
      const sessionId = await getSessionId();
      const domain = process.env.VEEVA_DOMAIN;
      const v = process.env.VEEVA_VERSION || 'v20.3';
      
      const downloadUrl = `https://${domain}/api/${v}/objects/documents/${doc.veeva_document_id}/file`;
      console.log(`Downloading from Veeva: ${downloadUrl}`);
      
      const downloadRes = await fetch(downloadUrl, {
        headers: { "Authorization": sessionId }
      });

      if (!downloadRes.ok) {
        throw new Error(`Failed to download document from Veeva: ${downloadRes.status} ${downloadRes.statusText}`);
      }

      const documentArrayBuffer = await downloadRes.arrayBuffer();
      documentBuffer = Buffer.from(documentArrayBuffer);
      const contentType = downloadRes.headers.get('content-type') || '';
      let documentName = resolveFilenameFromHeaders(downloadRes.headers, doc.document_name || `document_${doc.veeva_document_id}`);
      documentName = ensureFilenameHasExtension(documentName, contentType);
      
      console.log(`Downloaded ${documentBuffer.length} bytes from Veeva`);
      
      // Extract text from document
      const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
      documentText = extractionResult.extractedText;
      console.log(`Extracted ${extractionResult.textLength} characters from Veeva document`);
      
    } else if (actualSourceType === 'upload') {
      // For uploaded documents, we need to get the blob URL and download from there
      if (!doc.blob_url) {
        throw new Error('Uploaded document has no blob URL');
      }
      
      console.log(`Downloading from blob storage: ${doc.blob_url}`);
      const blobRes = await fetch(doc.blob_url);
      
      if (!blobRes.ok) {
        throw new Error(`Failed to download document from blob storage: ${blobRes.status} ${blobRes.statusText}`);
      }
      
      const documentArrayBuffer = await blobRes.arrayBuffer();
      documentBuffer = Buffer.from(documentArrayBuffer);
      const contentType = blobRes.headers.get('content-type') || '';
      let documentName = doc.document_name || doc.original_filename || `document_${doc.id}`;
      documentName = ensureFilenameHasExtension(documentName, contentType);
      
      console.log(`Downloaded ${documentBuffer.length} bytes from blob storage`);
      
      // Extract text from document
      const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
      documentText = extractionResult.extractedText;
      console.log(`Extracted ${extractionResult.textLength} characters from uploaded document`);
      
    } else {
      throw new Error(`Unsupported source type: ${actualSourceType}`);
    }

    if (!documentText || documentText.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    // Generate new AI summary
    console.log(`Generating new AI summary for document: ${doc.id}`);
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
          content: `Document Title: "${doc.document_name}"
Document Type: "${doc.document_type}"
Document Number: "${doc.document_number || 'N/A'}"

Please analyze this document and provide a detailed summary covering the areas above:

${documentText.substring(0, 4000)}`
        }
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const groqDuration = Date.now() - openaiStartTime;
    const newSummary = completion.choices[0]?.message?.content || null;
    
    console.log(`New AI summary generated in ${groqDuration}ms:`, {
      summaryLength: newSummary?.length || 0,
      tokensUsed: completion.usage?.total_tokens || 0
    });

    // Check if document chunks exist
    const chunkCheck = await pool.query(
      'SELECT COUNT(*) as count FROM Veeva_Doc_Chat_document_chunks WHERE document_id = $1',
      [doc.id]
    );
    const chunkCount = parseInt(chunkCheck.rows[0].count);
    const chunksRegenerated = false;

    // If no chunks exist, regenerate them
    if (chunkCount === 0 && documentText) {
      console.log(`No chunks found, regenerating chunks for document: ${doc.id}`);
      
      try {
        // Chunk the document text
        const chunks = chunkText(documentText, {
          maxChunkSize: 1000,
          overlap: 200
        });

        console.log(`Generated ${chunks.length} chunks for document: ${doc.id}`);

        // Validate chunks
        const validationResult = validateChunks(chunks);
        if (!validationResult.isValid) {
          console.warn(`Chunk validation failed for document ${doc.id}:`, validationResult.errors);
        }

        // Store chunks in database (without embeddings for now)
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkPreview = generateChunkPreview(chunk.text, 100);
          
          await pool.query(`
            INSERT INTO Veeva_Doc_Chat_document_chunks 
            (document_id, chunk_index, chunk_text, chunk_preview, chunk_size, created_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          `, [
            doc.id,
            i,
            chunk.text,
            chunkPreview,
            chunk.text.length
          ]);
        }

        console.log(`Stored ${chunks.length} chunks for document: ${doc.id}`);
        
      } catch (chunkError) {
        console.error(`Error regenerating chunks for document ${doc.id}:`, chunkError);
        // Don't fail the whole operation if chunking fails
      }
    } else {
      console.log(`Chunks already exist (${chunkCount} chunks), skipping chunk regeneration`);
    }

    const duration = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        documentId: doc.id,
        documentName: doc.document_name,
        oldSummary: doc.summary,
        newSummary: newSummary,
        chunksRegenerated: chunkCount === 0,
        chunkCount: chunkCount,
        duration: duration,
        summaryLength: newSummary?.length || 0
      })
    };

  } catch (error) {
    console.error('Error regenerating document summary:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      })
    };
  }
};
