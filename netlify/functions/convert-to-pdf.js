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
      console.log('Document is already a PDF, returning as-is:', {
        fileName,
        fileSize: fileBuffer.length,
        firstBytes: fileBuffer.slice(0, 10).toString('hex')
      });
      
      // Validate that it's actually a PDF by checking the header
      const pdfHeader = fileBuffer.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        console.warn('File has .pdf extension but doesn\'t start with %PDF header');
        // Still return it, but log the warning
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate'
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
  console.log('Converting text to PDF:', { fileName, textLength: textContent.length });
  
  // Clean and prepare text content
  const cleanText = textContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  
  const lines = cleanText.split('\n');
  const maxLinesPerPage = 45; // Leave room for margins
  const linesPerPage = Math.min(lines.length, maxLinesPerPage);
  
  // Escape text for PDF (handle parentheses, backslashes, and other special chars)
  const escapeText = (text) => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '')
      .replace(/\n/g, ' ')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
  };
  
  // Build content stream
  let contentStream = `BT\n`;
  contentStream += `/F1 12 Tf\n`;
  contentStream += `72 720 Td\n`;
  contentStream += `(${escapeText(fileName)}) Tj\n`;
  contentStream += `0 -20 Td\n`;
  
  // Add text lines with proper positioning
  const textLines = lines.slice(0, linesPerPage);
  textLines.forEach((line, index) => {
    const yPosition = 680 - (index * 15);
    
    // Skip empty lines
    if (line.trim().length === 0) {
      return;
    }
    
    // Position text cursor
    contentStream += `72 ${yPosition} Td `;
    
    // Add text (limit line length to prevent overflow)
    const displayLine = line.length > 80 ? line.substring(0, 77) + '...' : line;
    contentStream += `(${escapeText(displayLine)}) Tj\n`;
  });
  
  contentStream += `ET\n`;
  
  // Calculate accurate lengths and offsets
  const contentStreamBytes = Buffer.byteLength(contentStream, 'utf8');
  
  // Build PDF objects
  const objects = [];
  let currentOffset = 0;
  
  // Object 1: Catalog
  const catalogObj = `1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj`;
  objects.push({ id: 1, content: catalogObj, offset: currentOffset });
  currentOffset += Buffer.byteLength(catalogObj + '\n', 'utf8');
  
  // Object 2: Pages
  const pagesObj = `2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj`;
  objects.push({ id: 2, content: pagesObj, offset: currentOffset });
  currentOffset += Buffer.byteLength(pagesObj + '\n', 'utf8');
  
  // Object 3: Page
  const pageObj = `3 0 obj
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
endobj`;
  objects.push({ id: 3, content: pageObj, offset: currentOffset });
  currentOffset += Buffer.byteLength(pageObj + '\n', 'utf8');
  
  // Object 4: Content stream
  const contentObj = `4 0 obj
<<
/Length ${contentStreamBytes}
>>
stream
${contentStream}endstream
endobj`;
  objects.push({ id: 4, content: contentObj, offset: currentOffset });
  currentOffset += Buffer.byteLength(contentObj + '\n', 'utf8');
  
  // Object 5: Font
  const fontObj = `5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj`;
  objects.push({ id: 5, content: fontObj, offset: currentOffset });
  currentOffset += Buffer.byteLength(fontObj + '\n', 'utf8');
  
  // Build xref table
  const xrefEntries = [];
  xrefEntries.push('0000000000 65535 f '); // Free object
  objects.forEach(obj => {
    const offset = obj.offset.toString().padStart(10, '0');
    xrefEntries.push(`${offset} 00000 n `);
  });
  
  const xrefTable = `xref
0 ${objects.length + 1}
${xrefEntries.join('\n')}`;
  
  // Build trailer
  const trailer = `trailer
<<
/Size ${objects.length + 1}
/Root 1 0 R
>>
startxref
${currentOffset}
%%EOF`;
  
  // Combine all parts
  let pdfContent = '%PDF-1.4\n';
  objects.forEach(obj => {
    pdfContent += obj.content + '\n';
  });
  pdfContent += xrefTable + '\n';
  pdfContent += trailer + '\n';
  
  console.log('PDF generation completed:', {
    totalObjects: objects.length,
    contentStreamBytes,
    totalPdfSize: Buffer.byteLength(pdfContent, 'utf8')
  });
  
  return Buffer.from(pdfContent, 'utf8');
}
