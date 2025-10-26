/**
 * Unified text extraction utilities
 * Consolidates duplicate text extraction logic from multiple functions
 */

/**
 * Extract text from various file types
 * @param {Buffer} fileBuffer - File buffer to extract text from
 * @param {string} fileName - Name of the file
 * @param {string} contentType - MIME type of the file (optional)
 * @returns {Promise<{text: string, method: string, pages?: number}>} Extraction result
 */
export async function extractTextFromFile(fileBuffer, fileName, contentType = '') {
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  
  try {
    // Handle text files
    if (fileExtension === 'txt' || fileExtension === 'rtf') {
      const text = fileBuffer.toString('utf-8');
      return {
        text,
        method: 'utf8'
      };
    }

    // Handle CSV files
    if (fileExtension === 'csv') {
      const text = fileBuffer.toString('utf-8');
      return {
        text,
        method: 'csv'
      };
    }

    // Handle PDF files
    if (fileExtension === 'pdf') {
      return await extractTextFromPDF(fileBuffer, fileName);
    }

    // Handle DOCX files
    if (fileExtension === 'docx') {
      return await extractTextFromDOCX(fileBuffer, fileName);
    }

    // Handle DOC files (legacy format)
    if (fileExtension === 'doc') {
      return {
        text: `[DOC Content: ${fileName}] - DOC text extraction not yet implemented. Please use DOCX format.`,
        method: 'doc_placeholder'
      };
    }

    // Handle ZIP archives
    if (fileExtension === 'zip') {
      return {
        text: `[ZIP Archive: ${fileName}] - ZIP processing not yet implemented`,
        method: 'zip_placeholder'
      };
    }

    // Fallback for unknown file types
    return {
      text: `[Unknown file type: ${fileName}] - Text extraction not supported for this file format`,
      method: 'unknown'
    };

  } catch (error) {
    console.error(`Error extracting text from ${fileName}:`, error);
    return {
      text: `[Error extracting text from ${fileName}]: ${error.message}`,
      method: 'error'
    };
  }
}

/**
 * Extract text from PDF files
 * @param {Buffer} fileBuffer - PDF file buffer
 * @param {string} fileName - PDF file name
 * @returns {Promise<{text: string, method: string, pages?: number}>} PDF extraction result
 */
async function extractTextFromPDF(fileBuffer, fileName) {
  try {
    console.log(`Attempting PDF text extraction for ${fileName}...`);
    
    // Use the PDF extraction wrapper to handle pdf-parse issues
    const { extractTextFromPDF: extractPDF, createPDFFallbackText, createScannedPDFText } = await import('./pdf-extraction-wrapper.js');
    
    const pdfResult = await extractPDF(fileBuffer, fileName);
    
    if (pdfResult.text && pdfResult.text.trim().length >= 10) {
      console.log('PDF extraction successful:', {
        method: pdfResult.method,
        pages: pdfResult.pages,
        textLength: pdfResult.text.length
      });
      return {
        text: pdfResult.text,
        method: pdfResult.method,
        pages: pdfResult.pages
      };
    } else if (pdfResult.method === 'pdf_extraction_failed') {
      // Use the structured fallback text
      return {
        text: createPDFFallbackText(fileName, fileBuffer.length, pdfResult.error),
        method: 'pdf_extraction_failed',
        pages: 0
      };
    } else {
      // PDF was processed but appears to be scanned
      return {
        text: createScannedPDFText(fileName, fileBuffer.length),
        method: 'pdf_scanned_document',
        pages: pdfResult.pages || 0
      };
    }
    
  } catch (pdfError) {
    console.error(`PDF extraction failed for ${fileName}:`, pdfError);
    return {
      text: `[PDF Content: ${fileName}] - PDF text extraction failed: ${pdfError.message}`,
      method: 'pdf_error_fallback',
      pages: 0
    };
  }
}

/**
 * Extract text from DOCX files
 * @param {Buffer} fileBuffer - DOCX file buffer
 * @param {string} fileName - DOCX file name
 * @returns {Promise<{text: string, method: string}>} DOCX extraction result
 */
async function extractTextFromDOCX(fileBuffer, fileName) {
  try {
    // Try mammoth first (better for .docx files)
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ buffer: fileBuffer });
    
    if (result.value && result.value.trim().length > 0) {
      return {
        text: result.value,
        method: 'mammoth'
      };
    }
    
    throw new Error('Mammoth returned empty text');
    
  } catch (mammothError) {
    console.log('Mammoth failed, trying docx-parser...');
    try {
      const { parseDocument } = await import('docx-parser');
      const docxResult = await parseDocument(fileBuffer);
      
      if (docxResult.text && docxResult.text.trim().length > 0) {
        return {
          text: docxResult.text,
          method: 'docx_parser'
        };
      }
      
      throw new Error('docx-parser returned empty text');
      
    } catch (docxError) {
      console.error('Both DOCX extraction methods failed:', docxError);
      return {
        text: `[DOCX Content: ${fileName}] - Text extraction failed`,
        method: 'extraction_failed'
      };
    }
  }
}

/**
 * Clean extracted text by normalizing whitespace and removing non-printable characters
 * @param {string} text - Raw extracted text
 * @returns {string} Cleaned text
 */
export function cleanExtractedText(text) {
  if (!text) return '';
  
  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks
    .replace(/[ \t]+/g, ' ') // Normalize whitespace
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Remove non-printable characters except newlines and tabs
    .trim();
}

/**
 * Generate a summary of the extraction result
 * @param {string} fileName - File name
 * @param {string} extractionMethod - Method used for extraction
 * @param {number} textLength - Length of extracted text
 * @returns {string} Summary message
 */
export function generateExtractionSummary(fileName, extractionMethod, textLength) {
  return `Text extraction completed for ${fileName}: ${textLength} characters using ${extractionMethod}`;
}

