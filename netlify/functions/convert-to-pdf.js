export const handler = async (event) => {
  console.log('=== PDF CONVERSION STARTED ===');
  console.log('Converting document to PDF...', {
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
    let outputFormat = 'pdf';

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
        } else if (part.includes('name="output"')) {
          const valueStart = part.indexOf('\r\n\r\n') + 4;
          const valueEnd = part.lastIndexOf('\r\n');
          outputFormat = part.slice(valueStart, valueEnd).trim();
        }
      }
    }

    if (!fileBuffer) {
      throw new Error('No file found in request');
    }

    console.log('File received for conversion:', {
      fileName,
      fileSize: fileBuffer.length,
      outputFormat
    });

    // Use a cloud-based document conversion service
    // For this example, we'll use a simple text-to-PDF conversion
    // In production, you would integrate with services like:
    // - CloudConvert API
    // - Adobe Document Services
    // - Aspose.Words API
    // - ILovePDF API
    
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Handle different file types
    if (fileExtension === 'pdf') {
      // If it's already a PDF, return it directly
      console.log('Document is already a PDF, returning as-is');
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString()
        },
        body: fileBuffer.toString('base64'),
        isBase64Encoded: true
      };
    } else if (fileExtension === 'txt' || fileExtension === 'rtf') {
      // Simple text-to-PDF conversion
      const textContent = fileBuffer.toString('utf-8');
      const pdfContent = await convertTextToPdf(textContent, fileName);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName.replace(/\.[^/.]+$/, '')}.pdf"`,
          'Content-Length': pdfContent.length.toString()
        },
        body: pdfContent.toString('base64'),
        isBase64Encoded: true
      };
    } else if (fileExtension === 'docx') {
      // Extract text from DOCX and convert to PDF
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        const textContent = result.value;
        
        if (result.messages.length > 0) {
          console.log('Mammoth extraction warnings:', result.messages);
        }
        
        const pdfContent = await convertTextToPdf(textContent, fileName);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${fileName.replace(/\.[^/.]+$/, '')}.pdf"`,
            'Content-Length': pdfContent.length.toString()
          },
          body: pdfContent.toString('base64'),
          isBase64Encoded: true
        };
      } catch (error) {
        console.error('DOCX conversion failed:', error);
        throw new Error(`Failed to convert DOCX to PDF: ${error.message}`);
      }
    } else {
      // For other file types, try to extract text and convert to PDF
      console.log('Attempting text extraction for file type:', fileExtension);
      
      try {
        // Try to extract text from the file
        const extractedText = await extractTextFromFile(fileBuffer, fileName, fileExtension);
        
        if (extractedText && extractedText.trim().length > 0) {
          const pdfContent = await convertTextToPdf(extractedText, fileName);
          
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${fileName.replace(/\.[^/.]+$/, '')}.pdf"`,
              'Content-Length': pdfContent.length.toString()
            },
            body: pdfContent.toString('base64'),
            isBase64Encoded: true
          };
        } else {
          throw new Error('No text content could be extracted from the document');
        }
      } catch (error) {
        console.error('Text extraction failed:', error);
        
        // Return a 400 error with helpful information
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: 'Document conversion failed',
            message: `Unable to convert ${fileExtension.toUpperCase()} file to PDF: ${error.message}`,
            supportedTypes: ['pdf', 'txt', 'rtf', 'docx'],
            receivedType: fileExtension,
            suggestion: 'The document may be corrupted, password-protected, or in an unsupported format'
          }),
        };
      }
    }

  } catch (error) {
    console.error('=== PDF CONVERSION ERROR ===');
    console.error('PDF conversion error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: 'Document conversion failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};

// Helper function to extract text from various file types
async function extractTextFromFile(fileBuffer, fileName, fileExtension) {
  console.log('Extracting text from file:', { fileName, fileExtension });
  
  try {
    if (fileExtension === 'pdf') {
      // Extract text from PDF files using pdf-parse
      const pdfParse = await import('pdf-parse');
      const pdfData = await pdfParse.default(fileBuffer);
      return pdfData.text;
    } else if (fileExtension === 'docx') {
      // Extract text from DOCX using mammoth
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } else if (fileExtension === 'txt' || fileExtension === 'rtf') {
      // Simple text extraction
      return fileBuffer.toString('utf-8');
    } else {
      // Try as plain text as fallback
      return fileBuffer.toString('utf-8');
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error(`Failed to extract text from ${fileExtension} file: ${error.message}`);
  }
}

// Simple text-to-PDF conversion function
async function convertTextToPdf(textContent, fileName) {
  // This is a basic implementation that creates a simple PDF
  // In production, you would use a proper PDF library like PDFKit or jsPDF
  
  const lines = textContent.split('\n');
  const maxLinesPerPage = 50;
  const linesPerPage = Math.min(lines.length, maxLinesPerPage);
  
  // Create a simple PDF structure (this is a minimal implementation)
  const pdfHeader = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length ${textContent.length + 100}
>>
stream
BT
/F1 12 Tf
72 720 Td
(${fileName}) Tj
0 -20 Td
`;

  const pdfFooter = `
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000${(400 + textContent.length).toString().padStart(3, '0')} 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
${500 + textContent.length}
%%EOF`;

  // Simple text rendering (this is very basic)
  let pdfContent = pdfHeader;
  
  // Add text content (simplified)
  const textLines = lines.slice(0, linesPerPage);
  textLines.forEach((line, index) => {
    const yPosition = 680 - (index * 15);
    pdfContent += `${yPosition} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj 0 -15 Td\n`;
  });
  
  pdfContent += pdfFooter;
  
  return Buffer.from(pdfContent, 'utf-8');
}
