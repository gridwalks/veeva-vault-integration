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
    
    if (fileExtension === 'txt' || fileExtension === 'rtf') {
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
    } else {
      // For other file types, return the original file with a message
      console.log('File type not supported for conversion:', fileExtension);
      
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: 'File type not supported for conversion',
          supportedTypes: ['txt', 'rtf'],
          receivedType: fileExtension,
          suggestion: 'Please use a supported file type or contact support'
        }),
      };
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
