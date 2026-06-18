import { getPool, initDatabase } from "./db.js";
import Groq from 'groq-sdk';
import mammoth from 'mammoth';
import { parseDocument } from 'docx-parser';
import { chunkText, validateChunks, generateChunkPreview } from './chunking-utils.js';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function ensureFilenameHasExtension(fileName, contentType = '') {
  if (!fileName) return fileName;
  if (fileName.includes('.')) return fileName;

  const normalizedContentType = (contentType || '').split(';')[0]?.trim().toLowerCase();
  const extensionMap = {
    'application/pdf': 'pdf',
    'application/x-pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-word.document.macroenabled.12': 'docm',
  };

  const mappedExtension = extensionMap[normalizedContentType];
  if (mappedExtension) return `${fileName}.${mappedExtension}`;
  if (normalizedContentType?.includes('wordprocessingml.document')) return `${fileName}.docx`;
  return fileName;
}

async function extractTextFromBuffer(fileBuffer, fileName = '', contentType = '') {
  const normalizedName = fileName || '';
  const normalizedContentType = (contentType || '').split(';')[0]?.trim().toLowerCase();

  let fileExtension = normalizedName.includes('.')
    ? normalizedName.split('.').pop().toLowerCase()
    : '';

  if (!fileExtension && normalizedContentType) {
    const contentTypeMap = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-word.document.macroenabled.12': 'docm',
    };
    fileExtension = contentTypeMap[normalizedContentType] || fileExtension;
  }

  let extractedText = '';
  let extractionMethod = '';

  if (fileExtension === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      if (result.value && result.value.trim().length > 0 &&
          !result.value.includes('[Content_Types]')) {
        extractedText = result.value;
        extractionMethod = 'mammoth_docx';
      }
    } catch (e) {
      console.log('Mammoth failed:', e.message);
    }

    if (!extractedText) {
      try {
        const docxResult = await parseDocument(fileBuffer);
        if (docxResult.text && docxResult.text.trim().length > 0) {
          extractedText = docxResult.text;
          extractionMethod = 'docx_parser';
        }
      } catch (e) {
        console.log('docx-parser failed:', e.message);
      }
    }

    if (!extractedText) {
      extractedText = fileBuffer.toString('utf-8');
      extractionMethod = 'raw_utf8';
    }
  } else {
    try {
      const text = fileBuffer.toString('utf-8');
      if (text && text.trim().length > 0) {
        extractedText = text;
        extractionMethod = 'utf8';
      }
    } catch (e) {
      throw new Error(`Failed to extract text from ${fileName}`);
    }
  }

  if (!extractedText) {
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
  console.log('=== REGENERATE DOCUMENT SUMMARY STARTED ===');

  try {
    const body = JSON.parse(event.body || '{}');
    const { documentId } = body;

    if (!documentId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Document ID is required' })
      };
    }

    await initDatabase();
    const pool = getPool();

    // Get uploaded document from qms_chat_documents
    const docQuery = await pool.query(
      'SELECT * FROM qms_chat_documents WHERE id = $1',
      [documentId]
    );

    if (docQuery.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Document not found' })
      };
    }

    const doc = docQuery.rows[0];
    console.log(`Found document: ${doc.document_name}`);

    if (!doc.blob_url) {
      throw new Error('Uploaded document has no blob URL');
    }

    console.log(`Downloading from blob storage: ${doc.blob_url}`);
    const blobRes = await fetch(doc.blob_url);

    if (!blobRes.ok) {
      throw new Error(`Failed to download document: ${blobRes.status} ${blobRes.statusText}`);
    }

    const documentArrayBuffer = await blobRes.arrayBuffer();
    const documentBuffer = Buffer.from(documentArrayBuffer);
    const contentType = blobRes.headers.get('content-type') || '';
    let documentName = doc.document_name || doc.original_filename || `document_${doc.id}`;
    documentName = ensureFilenameHasExtension(documentName, contentType);

    const extractionResult = await extractTextFromBuffer(documentBuffer, documentName, contentType);
    const documentText = extractionResult.extractedText;
    console.log(`Extracted ${extractionResult.textLength} characters`);

    if (!documentText || documentText.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    // Generate new AI summary
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

Format as clear, structured bullet points. Be specific and reference actual content from the document.`
        },
        {
          role: "user",
          content: `Document Title: "${doc.document_name}"
Document Type: "${doc.document_type || 'N/A'}"

Please analyze this document and provide a detailed summary:

${documentText.substring(0, 4000)}`
        }
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const groqDuration = Date.now() - openaiStartTime;
    const newSummary = completion.choices[0]?.message?.content || null;
    console.log(`New AI summary generated in ${groqDuration}ms`);

    // Check if document chunks exist
    const chunkCheck = await pool.query(
      'SELECT COUNT(*) as count FROM qms_chat_document_chunks WHERE document_id = $1',
      [doc.id]
    );
    const chunkCount = parseInt(chunkCheck.rows[0].count);

    const duration = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        documentId: doc.id,
        documentName: doc.document_name,
        oldSummary: doc.ai_summary,
        newSummary: newSummary,
        chunksRegenerated: chunkCount === 0,
        chunkCount: chunkCount,
        duration: duration,
        summaryLength: newSummary?.length || 0
      })
    };

  } catch (error) {
    console.error('Error regenerating document summary:', error.message);
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
