import { Pool } from 'pg';
import { OpenAI } from 'openai';
import Groq from 'groq-sdk';
// Dynamic imports to avoid test file issues
// import mammoth from 'mammoth';
// import { parseDocument } from 'docx-parser';
// import pdfParse from 'pdf-parse';
// import { chunkText, validateChunks } from './chunking-utils.js';

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

// Simple multipart parser using built-in Node.js capabilities
function parseMultipartSimple(body, contentType) {
  console.log('Parsing multipart with simple method...');
  
  try {
    // For now, just return mock data to test the rest of the pipeline
    return {
      files: [{
        buffer: Buffer.from('This is a test document content for testing purposes.'),
        fileName: 'test-document.txt',
        size: 60
      }],
      fileCount: 1,
      uploadType: 'test',
      userId: 'test-user'
    };
  } catch (error) {
    console.error('Simple multipart parsing error:', error);
    throw error;
  }
}

// Simple text extraction with dynamic imports
async function extractTextSimple(fileBuffer, fileName) {
  console.log(`Extracting text from ${fileName}`);
  
  try {
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    
    if (fileExtension === 'pdf') {
      try {
        // Use the PDF extraction wrapper to handle pdf-parse issues
        const { extractTextFromPDF, createPDFFallbackText, createScannedPDFText } = await import('./pdf-extraction-wrapper.js');
        
        const pdfResult = await extractTextFromPDF(fileBuffer, fileName);
        
        if (pdfResult.text && pdfResult.text.trim().length >= 10) {
          return { text: pdfResult.text, method: pdfResult.method };
        } else if (pdfResult.method === 'pdf_extraction_failed') {
          return { 
            text: createPDFFallbackText(fileName, fileBuffer.length, pdfResult.error), 
            method: 'pdf_extraction_failed' 
          };
        } else {
          return { 
            text: createScannedPDFText(fileName, fileBuffer.length), 
            method: 'pdf_scanned_document' 
          };
        }
      } catch (pdfError) {
        console.error(`PDF extraction failed for ${fileName}:`, pdfError);
        return { 
          text: `[PDF Content: ${fileName}] - PDF text extraction failed: ${pdfError.message}`, 
          method: 'pdf_error_fallback' 
        };
      }
    } else if (fileExtension === 'docx') {
      // Dynamic import for DOCX parsing
      const mammoth = await import('mammoth');
      const result = await mammoth.default.extractRawText({ buffer: fileBuffer });
      return {
        text: result.value || 'No text extracted from DOCX',
        method: 'mammoth'
      };
    } else {
      // Default to UTF-8 for text files
      return {
        text: fileBuffer.toString('utf-8'),
        method: 'simple_utf8'
      };
    }
  } catch (error) {
    console.error(`Error extracting text from ${fileName}:`, error);
    return {
      text: `Error extracting text from ${fileName}: ${error.message}`,
      method: 'error'
    };
  }
}

// Simple summary generation
async function generateSummarySimple(text, fileName) {
  console.log(`Generating summary for ${fileName}`);
  return `Document: ${fileName} (${text.length} characters) - Test summary`;
}

// Simple document storage
async function storeDocumentSimple(fileName, extractedText, summary, fileSize, extractionMethod, userId) {
  console.log(`Storing document: ${fileName}`);
  
  try {
    const result = await pool.query(`
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

    return result.rows[0].id;
  } catch (error) {
    console.error('Error storing document:', error);
    throw error;
  }
}

export const handler = async (event) => {
  console.log('=== SIMPLE UPLOAD HANDLER ===');
  
  try {
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

    // Handle non-POST requests (allow GET for testing)
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['GET', 'POST', 'OPTIONS']
        })
      };
    }

    console.log('Processing simple upload...', {
      method: event.httpMethod,
      contentType: event.headers['content-type'],
      bodyLength: event.body?.length || 0
    });

    // For GET requests, return test data without processing
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: true,
          message: 'Simple upload test - GET request received',
          timestamp: new Date().toISOString(),
          method: 'GET',
          note: 'Use POST to test actual upload processing with mock data'
        })
      };
    }

    // Parse multipart data
    const { files, fileCount, uploadType, userId } = parseMultipartSimple(
      event.body,
      event.headers['content-type']
    );

    console.log(`Received ${files.length} files for upload`);

    if (files.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: 'No files received'
        })
      };
    }

    const results = [];

    // Process each file
    for (const file of files) {
      console.log(`Processing file: ${file.fileName} (${file.size} bytes)`);
      
      try {
        // Extract text
        const { text: extractedText, method: extractionMethod } = await extractTextSimple(
          file.buffer, 
          file.fileName
        );

        // Generate summary
        const summary = await generateSummarySimple(extractedText, file.fileName);

        // Store document
        const documentId = await storeDocumentSimple(
          file.fileName,
          extractedText,
          summary,
          file.size,
          extractionMethod,
          userId
        );

        results.push({
          fileName: file.fileName,
          success: true,
          documentId,
          chunksCreated: 0,
          summary: summary.substring(0, 200),
          extractionMethod
        });

        console.log(`✅ Successfully processed: ${file.fileName}`);

      } catch (error) {
        console.error(`❌ Error processing file ${file.fileName}:`, error);
        results.push({
          fileName: file.fileName,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`Simple upload completed: ${successCount} successful, ${failureCount} failed`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: `Successfully processed ${successCount} of ${files.length} files`,
        results
      })
    };

  } catch (error) {
    console.error('Simple upload error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: 'Upload failed',
        details: error.message
      })
    };
  }
};
