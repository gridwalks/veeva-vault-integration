import { Pool } from 'pg';
import { OpenAI } from 'openai';
import mammoth from 'mammoth';
import { parseDocument } from 'docx-parser';
import { chunkText } from './chunking-utils.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to parse multipart form data
function parseMultipartFormData(body, contentType) {
  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('No boundary found in content-type header');
  }

  const bodyBuffer = Buffer.from(body, 'base64');
  const boundaryMarker = `--${boundary}`;
  const bodyString = bodyBuffer.toString('latin1');
  const rawParts = bodyString.split(boundaryMarker);

  const files = [];
  let fileCount = 0;
  let uploadType = 'bulk_import';

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
    }
  }

  return { files, fileCount, uploadType };
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
      // For PDF files, we'll need to implement PDF text extraction
      // For now, we'll return a placeholder
      extractedText = `[PDF Content: ${fileName}] - PDF text extraction not yet implemented`;
      extractionMethod = 'pdf_placeholder';
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
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that creates concise, informative summaries of documents. Focus on key points, main topics, and important information."
        },
        {
          role: "user",
          content: `Please create a concise summary of the following document "${fileName}":\n\n${text.substring(0, 4000)}`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating summary:', error);
    return `Summary generation failed for ${fileName}`;
  }
}

// Helper function to store document in database
async function storeDocument(fileName, extractedText, summary, fileSize, extractionMethod) {
  try {
    const result = await pool.query(`
      INSERT INTO Veeva_Doc_Chat_documents 
      (document_name, document_type, version, content, ai_summary, file_size, extraction_method, source_type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      fileName,
      'uploaded_document',
      '1.0',
      extractedText,
      summary,
      fileSize,
      extractionMethod,
      'upload'
    ]);

    return result.rows[0].id;
  } catch (error) {
    console.error('Error storing document:', error);
    throw error;
  }
}

// Helper function to chunk and embed document
async function chunkAndEmbedDocument(documentText, documentId, fileName) {
  try {
    console.log(`Chunking and embedding document ${fileName}...`);
    
    // Chunk the text
    const chunks = chunkText(documentText, {
      maxChunkSize: 1000,
      overlap: 200
    });

    if (chunks.length === 0) {
      console.log(`No valid chunks created for ${fileName}`);
      return { chunksCreated: 0, error: 'No valid chunks created' };
    }

    // Delete existing chunks for this document
    await pool.query('DELETE FROM Veeva_Doc_Chat_document_chunks WHERE document_id = $1', [documentId]);
    console.log(`Deleted existing chunks for document ${documentId}`);

    // Generate embeddings for each chunk in batches
    const batchSize = 10;
    let chunksCreated = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      
      console.log(`Processing embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${batchChunks.length} chunks)`);

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
            INSERT INTO Veeva_Doc_Chat_document_chunks 
            (document_id, veeva_document_id, chunk_index, chunk_text, embedding, token_count)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (document_id, chunk_index) 
            DO UPDATE SET chunk_text = $4, embedding = $5, token_count = $6, created_at = CURRENT_TIMESTAMP
          `, [
            documentId,
            null, // No Veeva document ID for uploaded files
            chunk.index,
            chunk.text,
            embeddingStr,
            chunk.tokenCount
          ]);

          chunksCreated++;
        }
      } catch (batchError) {
        console.error(`Error processing embedding batch:`, batchError);
        throw batchError;
      }
    }

    console.log(`Successfully created ${chunksCreated} chunks with embeddings for ${fileName}`);
    return { chunksCreated, error: null };
  } catch (error) {
    console.error(`Error chunking and embedding document ${fileName}:`, error);
    return { chunksCreated: 0, error: error.message };
  }
}

export const handler = async (event) => {
  console.log('=== DOCUMENT UPLOAD STARTED ===');
  console.log('Processing file upload...', {
    timestamp: new Date().toISOString(),
    contentType: event.headers['content-type']
  });

  try {
    // Parse multipart form data
    const { files, fileCount, uploadType } = parseMultipartFormData(
      event.body, 
      event.headers['content-type']
    );

    console.log(`Received ${files.length} files for upload`);

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

    const results = [];
    let totalChunksCreated = 0;
    let totalErrors = 0;

    // Process each file
    for (const file of files) {
      console.log(`Processing file: ${file.fileName} (${file.size} bytes)`);
      
      try {
        // Extract text from file
        const { text: extractedText, method: extractionMethod } = await extractTextFromFile(
          file.buffer, 
          file.fileName
        );

        // Generate AI summary
        const summary = await generateSummary(extractedText, file.fileName);

        // Store document in database
        const documentId = await storeDocument(
          file.fileName,
          extractedText,
          summary,
          file.size,
          extractionMethod
        );

        // Chunk and embed document
        const { chunksCreated, error: chunkError } = await chunkAndEmbedDocument(
          extractedText,
          documentId,
          file.fileName
        );

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
            extractionMethod
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

    console.log(`Upload processing completed: ${successCount} successful, ${failureCount} failed`);

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
    console.error('Upload processing error:', error);
    
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
        error: error.message
      })
    };
  }
};
