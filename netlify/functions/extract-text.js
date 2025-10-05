import mammoth from 'mammoth';

export const handler = async (event) => {
  console.log('=== TEXT EXTRACTION STARTED ===');
  console.log('Extracting text from document...', {
    timestamp: new Date().toISOString(),
    contentType: event.headers['content-type']
  });

  try {
    // Parse multipart form data
    const boundary = event.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      throw new Error('No boundary found in content-type header');
    }

    const body = Buffer.from(event.body, 'base64');
    const parts = body.toString().split(`--${boundary}`);
    
    let fileBuffer = null;
    let fileName = 'document';

    // Parse form data manually
    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data')) {
        if (part.includes('name="file"')) {
          const fileStart = part.indexOf('\r\n\r\n') + 4;
          const fileEnd = part.lastIndexOf('\r\n');
          fileBuffer = Buffer.from(part.slice(fileStart, fileEnd));
          
          // Extract filename
          const filenameMatch = part.match(/filename="([^"]+)"/);
          if (filenameMatch) {
            fileName = filenameMatch[1];
          }
        }
      }
    }

    if (!fileBuffer) {
      throw new Error('No file found in request');
    }

    console.log('File received for text extraction:', {
      fileName,
      fileSize: fileBuffer.length
    });

    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    let extractedText = '';
    let extractionMethod = '';

    if (fileExtension === 'txt' || fileExtension === 'rtf') {
      // Simple text extraction
      extractedText = fileBuffer.toString('utf-8');
      extractionMethod = 'plain_text';
    } else if (fileExtension === 'docx') {
      // Use mammoth.js for DOCX files
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
        extractionMethod = 'mammoth_docx';
        
        if (result.messages.length > 0) {
          console.log('Mammoth extraction warnings:', result.messages);
        }
      } catch (error) {
        console.error('DOCX extraction failed:', error);
        throw new Error('Failed to extract text from DOCX file');
      }
    } else if (fileExtension === 'doc') {
      // DOC files are binary and harder to parse
      throw new Error('DOC files are not supported. Please convert to DOCX or TXT format.');
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
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        extractedText: extractedText,
        fileName: fileName,
        fileType: fileExtension,
        extractionMethod: extractionMethod,
        textLength: extractedText.length
      }),
    };

  } catch (error) {
    console.error('=== TEXT EXTRACTION ERROR ===');
    console.error('Text extraction error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: 'Text extraction failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
