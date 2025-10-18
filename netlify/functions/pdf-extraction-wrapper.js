// PDF extraction wrapper to handle pdf-parse library issues
// This wrapper specifically handles the test file error in pdf-parse v1.1.1

export async function extractTextFromPDF(fileBuffer, fileName) {
  try {
    const pdfParse = await import('pdf-parse');
    
    // First attempt: try with minimal options
    try {
      const pdfData = await pdfParse.default(fileBuffer);
      
      if (pdfData && pdfData.text) {
        return {
          text: pdfData.text,
          method: 'pdf_parse',
          pages: pdfData.numpages,
          info: pdfData.info,
          metadata: pdfData.metadata
        };
      }
    } catch (firstError) {
      console.log('First PDF extraction attempt failed:', firstError.message);
      
      // Check if it's the specific test file error
      if (firstError.message && firstError.message.includes('test/data/')) {
        console.log('Detected pdf-parse test file error, trying alternative approach...');
        
        // Second attempt: try with different buffer handling
        try {
          // Create a completely clean buffer
          const cleanBuffer = Buffer.alloc(fileBuffer.length);
          fileBuffer.copy(cleanBuffer);
          
          const pdfData = await pdfParse.default(cleanBuffer);
          
          if (pdfData && pdfData.text) {
            return {
              text: pdfData.text,
              method: 'pdf_parse_clean',
              pages: pdfData.numpages,
              info: pdfData.info,
              metadata: pdfData.metadata
            };
          }
        } catch (secondError) {
          console.log('Second PDF extraction attempt failed:', secondError.message);
          
          // Third attempt: try with Uint8Array
          try {
            const uint8Array = new Uint8Array(fileBuffer);
            const pdfData = await pdfParse.default(uint8Array);
            
            if (pdfData && pdfData.text) {
              return {
                text: pdfData.text,
                method: 'pdf_parse_uint8',
                pages: pdfData.numpages,
                info: pdfData.info,
                metadata: pdfData.metadata
              };
            }
          } catch (thirdError) {
            console.log('Third PDF extraction attempt failed:', thirdError.message);
          }
        }
      }
      
      // If all attempts failed, throw the original error
      throw firstError;
    }
    
    // If we get here, the PDF was processed but had no text
    throw new Error('PDF processed but no text content found');
    
  } catch (error) {
    console.error(`PDF extraction failed for ${fileName}:`, error);
    
    // Return a structured error response
    return {
      text: null,
      method: 'pdf_extraction_failed',
      error: error.message,
      pages: 0,
      info: null,
      metadata: null
    };
  }
}

export function createPDFFallbackText(fileName, fileSize, errorMessage) {
  const fileSizeKB = Math.round(fileSize / 1024);
  
  return `[PDF Document: ${fileName} - Extraction Failed]

Document Information:
- File Size: ${fileSizeKB} KB
- Upload Date: ${new Date().toISOString()}
- Status: Successfully uploaded but text extraction failed

Note: This PDF document has been successfully uploaded to the system and is available for download. However, text extraction failed: ${errorMessage}. The document structure and metadata have been preserved.

The document can still be referenced in conversations and is available for download, though full text search within the PDF content is currently limited.`;
}

export function createScannedPDFText(fileName, fileSize) {
  const fileSizeKB = Math.round(fileSize / 1024);
  
  return `[PDF Document: ${fileName} - Scanned Document]

Document Information:
- File Size: ${fileSizeKB} KB
- Upload Date: ${new Date().toISOString()}
- Status: Successfully uploaded but appears to be scanned/image-based

Note: This PDF appears to be a scanned document or image-based PDF. Text extraction is limited. The document is available in the knowledge base and can be referenced in conversations, though full text search within the PDF content is currently limited. Consider using OCR services for better text extraction results.`;
}
