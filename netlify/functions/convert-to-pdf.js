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
    const boundaryMarker = `--${boundary}`;
    const bodyString = body.toString('latin1');
    const rawParts = bodyString.split(boundaryMarker);

    let fileBuffer = null;
    let fileName = 'document';
    let outputFormat = 'pdf';

    // Parse form data manually
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

      if (headers.includes('name="file"')) {
        fileBuffer = Buffer.from(contentBuffer);

        const filenameMatch = headers.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          fileName = filenameMatch[1];
        }
      } else if (headers.includes('name="output"')) {
        outputFormat = contentBuffer.toString('utf-8').trim();
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

    // Detect actual file type from content signature (not just extension)
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    const actualFileType = detectFileType(fileBuffer, fileExtension);
    
    console.log('File type detection:', {
      fileName,
      extensionHint: fileExtension,
      detectedType: actualFileType
    });
    
    // Handle different file types based on actual detected type
    if (actualFileType === 'pdf') {
      // If it's already a PDF, return it directly
      console.log('Document is already a PDF, returning as-is:', {
        fileName,
        fileSize: fileBuffer.length,
        firstBytes: fileBuffer.slice(0, 10).toString('hex')
      });
      
      // Validate that it's actually a PDF by checking the header
      const pdfHeaderBytes = fileBuffer.slice(0, 4);
      const pdfHeader = String.fromCharCode(...pdfHeaderBytes);
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
    } else if (actualFileType === 'txt' || actualFileType === 'rtf') {
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
    } else if (actualFileType === 'docx') {
      // Convert DOCX to HTML with formatting preserved
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ buffer: fileBuffer });
        const htmlContent = result.value;
        
        if (result.messages.length > 0) {
          console.log('Mammoth conversion warnings:', result.messages);
        }
        
        // Return HTML content wrapped in a styled document
        const styledHtml = createStyledHtml(htmlContent, fileName);
        const htmlBuffer = Buffer.from(styledHtml, 'utf-8');
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `inline; filename="${fileName.replace(/\.[^/.]+$/, '')}.html"`,
            'Content-Length': htmlBuffer.length.toString()
          },
          body: htmlBuffer.toString('base64'),
          isBase64Encoded: true
        };
      } catch (error) {
        console.error('DOCX conversion failed:', error);
        throw new Error(`Failed to convert DOCX to HTML: ${error.message}`);
      }
    } else {
      // Unsupported file type
      console.error('Unsupported file type detected:', actualFileType);
      
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: 'Document conversion failed',
          message: `Unable to convert file: unsupported or unrecognized file type`,
          supportedTypes: ['pdf', 'txt', 'rtf', 'docx'],
          detectedType: actualFileType,
          fileName: fileName,
          suggestion: 'The document may be corrupted, password-protected, or in an unsupported format'
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

// Helper function to extract text from various file types
async function extractTextFromFile(fileBuffer, fileName, fileExtension) {
  const normalizedExtension = (fileExtension || '').toLowerCase();
  console.log('Extracting text from file:', { fileName, fileExtension: normalizedExtension });

  try {
    if (normalizedExtension === 'pdf') {
      // Extract text from PDF files using pdf-parse wrapper
      const { extractTextFromPDF } = await import('./pdf-extraction-wrapper.js');
      const pdfResult = await extractTextFromPDF(fileBuffer, fileName);
      return pdfResult.text || '';
    } else if (normalizedExtension === 'docx' || looksLikeDocx(fileBuffer)) {
      // Extract text from DOCX using mammoth
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } else if (normalizedExtension === 'txt' || normalizedExtension === 'rtf') {
      // Simple text extraction
      const decoded = decodeTextBuffer(fileBuffer);
      if (!decoded.readable) {
        throw new Error('Extracted text appears to be binary data.');
      }
      return decoded.text;
    } else {
      // Try as plain text as fallback
      const decoded = decodeTextBuffer(fileBuffer);
      if (!decoded.readable) {
        throw new Error('Extracted text appears to be binary data.');
      }
      return decoded.text;
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error(`Failed to extract text from ${normalizedExtension || 'unknown'} file: ${error.message}`);
  }
}

function looksLikeDocx(buffer) {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const hasZipSignature = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (!hasZipSignature) {
    return false;
  }

  // Check for docx specific entries inside the archive
  const contentTypesIndex = buffer.indexOf(Buffer.from('[Content_Types].xml'));
  const wordFolderIndex = buffer.indexOf(Buffer.from('word/'));

  return contentTypesIndex !== -1 && wordFolderIndex !== -1;
}

function decodeTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return { readable: false, text: '' };
  }

  if (isProbablyBinary(buffer)) {
    return { readable: false, text: '' };
  }

  // Detect UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    const text = buffer.toString('utf16le');
    return { readable: isTextMostlyReadable(text), text };
  }

  // Detect UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const text = buffer.toString('utf16be');
    return { readable: isTextMostlyReadable(text), text };
  }

  const utf8Text = buffer.toString('utf8');
  if (isTextMostlyReadable(utf8Text)) {
    return { readable: true, text: utf8Text };
  }

  // As a last resort, try latin1 which can be useful for Windows-1252 encoded files
  const latinText = buffer.toString('latin1');
  return { readable: isTextMostlyReadable(latinText), text: latinText };
}

function isProbablyBinary(buffer) {
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

function isTextMostlyReadable(text) {
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

    if (code === 65533) { // Replacement character �
      continue;
    }

    if (code === 9 || code === 10 || code === 13) { // tab, newline, carriage return
      readableChars++;
      continue;
    }

    if (code >= 32 && code < 65533) {
      readableChars++;
    }
  }

  return readableChars / sampleLength > 0.6;
}

// Simple text-to-PDF conversion function
async function convertTextToPdf(textContent, fileName) {
  console.log('Converting text to PDF:', { fileName, textLength: textContent.length });
  
  // Clean and prepare text content
  const cleanText = textContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Escape text for PDF (handle parentheses, backslashes, and other special chars)
  const escapeText = (text) => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
  };

  const wrapLine = (line, maxWidth) => {
    if (!line) {
      return [''];
    }

    const words = line.split(/\s+/);
    const wrapped = [];
    let currentLine = '';

    words.forEach((word) => {
      if (!word) {
        return;
      }

      if (currentLine.length === 0) {
        currentLine = word;
        return;
      }

      if ((currentLine + ' ' + word).length <= maxWidth) {
        currentLine += ' ' + word;
      } else {
        wrapped.push(currentLine);
        if (word.length > maxWidth) {
          for (let i = 0; i < word.length; i += maxWidth) {
            wrapped.push(word.slice(i, i + maxWidth));
          }
          currentLine = '';
        } else {
          currentLine = word;
        }
      }
    });

    if (currentLine.length > 0) {
      wrapped.push(currentLine);
    }

    return wrapped.length > 0 ? wrapped : [''];
  };

  const maxCharsPerLine = 90;
  const maxLinesPerPage = 45; // Leave room for margins
  const processedLines = [];

  if (fileName) {
    processedLines.push(`Document: ${fileName}`);
    processedLines.push('');
  }

  const rawLines = cleanText.split('\n');
  rawLines.forEach((line) => {
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) {
      processedLines.push('');
      return;
    }

    const wrapped = wrapLine(trimmed, maxCharsPerLine);
    wrapped.forEach((wrappedLine) => processedLines.push(wrappedLine));
  });

  if (processedLines.length === 0) {
    processedLines.push('');
  }

  // Break lines into pages
  const pages = [];
  for (let i = 0; i < processedLines.length; i += maxLinesPerPage) {
    pages.push(processedLines.slice(i, i + maxLinesPerPage));
  }

  const objects = [];
  const addObject = (body = '') => {
    const id = objects.length + 1;
    objects.push({ id, body });
    return id;
  };
  const setObjectBody = (id, body) => {
    const index = objects.findIndex((obj) => obj.id === id);
    if (index !== -1) {
      objects[index].body = body;
    }
  };

  const pagesObjectId = addObject();
  const catalogObjectId = addObject();
  const fontObjectId = addObject(`<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>`);

  const pageObjectIds = [];

  pages.forEach((pageLines, pageIndex) => {
    let contentStream = 'BT\n';
    contentStream += '/F1 12 Tf\n';
    contentStream += '72 720 Td\n';

    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        contentStream += '0 -16 Td\n';
      }

      if (!line || line.trim().length === 0) {
        contentStream += '( ) Tj\n';
      } else {
        contentStream += `(${escapeText(line)}) Tj\n`;
      }
    });

    contentStream += 'ET';

    const contentLength = Buffer.byteLength(contentStream, 'utf8');
    const contentObjectId = addObject(`<<
/Length ${contentLength}
>>
stream
${contentStream}
endstream`);

    const pageObjectId = addObject(`<<
/Type /Page
/Parent ${pagesObjectId} 0 R
/MediaBox [0 0 612 792]
/Contents ${contentObjectId} 0 R
/Resources <<
/Font <<
/F1 ${fontObjectId} 0 R
>>
>>
>>`);

    pageObjectIds.push(pageObjectId);

    console.log('Generated PDF page', {
      pageIndex: pageIndex + 1,
      linesOnPage: pageLines.length,
      contentLength
    });
  });

  setObjectBody(pagesObjectId, `<<
/Type /Pages
/Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}]
/Count ${pageObjectIds.length}
>>`);

  setObjectBody(catalogObjectId, `<<
/Type /Catalog
/Pages ${pagesObjectId} 0 R
>>`);

  // Build PDF content with xref table
  let pdfContent = '%PDF-1.4\n';
  let offset = Buffer.byteLength(pdfContent, 'utf8');
  const xrefEntries = ['0000000000 65535 f '];

  objects.forEach(({ id, body }) => {
    const objectString = `${id} 0 obj\n${body}\nendobj\n`;
    const offsetStr = offset.toString().padStart(10, '0');
    xrefEntries.push(`${offsetStr} 00000 n `);
    pdfContent += objectString;
    offset += Buffer.byteLength(objectString, 'utf8');
  });

  const xrefOffset = offset;
  pdfContent += `xref\n0 ${objects.length + 1}\n${xrefEntries.join('\n')}\n`;
  pdfContent += `trailer\n<<\n/Size ${objects.length + 1}\n/Root ${catalogObjectId} 0 R\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  console.log('PDF generation completed:', {
    totalObjects: objects.length,
    pageCount: pages.length,
    totalPdfSize: Buffer.byteLength(pdfContent, 'utf8')
  });

  return Buffer.from(pdfContent, 'utf8');
}

// Helper function to detect file type from content
function detectFileType(buffer, extensionHint) {
  if (!buffer || buffer.length === 0) {
    return extensionHint || 'unknown';
  }

  // Check for DOCX (ZIP signature + docx-specific content)
  if (looksLikeDocx(buffer)) {
    console.log('Detected DOCX file by content signature');
    return 'docx';
  }
  
  // Check for PDF signature
  if (buffer.length >= 4) {
    const header = String.fromCharCode(...buffer.slice(0, 4));
    if (header === '%PDF') {
      console.log('Detected PDF file by signature');
      return 'pdf';
    }
  }
  
  // Check for text-based formats
  const decoded = decodeTextBuffer(buffer);
  if (decoded.readable) {
    console.log('Detected text-based file');
    return extensionHint || 'txt';
  }
  
  // Use extension as fallback
  console.log('Using extension hint as fallback:', extensionHint);
  return extensionHint || 'unknown';
}

// Helper function to create styled HTML from DOCX content
function createStyledHtml(htmlContent, fileName) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName || 'Document'}</title>
  <style>
    body {
      font-family: 'Calibri', 'Arial', 'Helvetica', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000000;
      background-color: #ffffff;
      margin: 0;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Calibri', 'Arial', 'Helvetica', sans-serif;
      font-weight: bold;
      margin-top: 12pt;
      margin-bottom: 6pt;
      color: #000000;
    }
    
    h1 {
      font-size: 16pt;
      border-bottom: 2px solid #2e75b6;
      padding-bottom: 4pt;
      margin-top: 0;
    }
    
    h2 {
      font-size: 14pt;
      color: #2e75b6;
    }
    
    h3 {
      font-size: 12pt;
    }
    
    h4, h5, h6 {
      font-size: 11pt;
    }
    
    /* Paragraphs */
    p {
      margin-top: 0;
      margin-bottom: 8pt;
      text-align: justify;
    }
    
    /* Lists */
    ul, ol {
      margin-top: 0;
      margin-bottom: 8pt;
      padding-left: 30px;
    }
    
    li {
      margin-bottom: 4pt;
    }
    
    /* Tables */
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 8pt;
      margin-bottom: 8pt;
      border: 1px solid #cccccc;
    }
    
    th {
      background-color: #2e75b6;
      color: #ffffff;
      font-weight: bold;
      padding: 8pt;
      text-align: left;
      border: 1px solid #2e75b6;
    }
    
    td {
      padding: 6pt 8pt;
      border: 1px solid #cccccc;
      vertical-align: top;
    }
    
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    
    /* Text formatting */
    strong, b {
      font-weight: bold;
    }
    
    em, i {
      font-style: italic;
    }
    
    u {
      text-decoration: underline;
    }
    
    /* Links */
    a {
      color: #0563c1;
      text-decoration: underline;
    }
    
    a:hover {
      color: #1f497d;
    }
    
    /* Images */
    img {
      max-width: 100%;
      height: auto;
      margin: 8pt 0;
    }
    
    /* Code blocks */
    pre {
      background-color: #f5f5f5;
      border: 1px solid #cccccc;
      border-radius: 4px;
      padding: 10px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    code {
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
    }
    
    /* Blockquotes */
    blockquote {
      border-left: 4px solid #cccccc;
      margin-left: 0;
      padding-left: 16px;
      color: #666666;
      font-style: italic;
    }
    
    /* Horizontal rules */
    hr {
      border: none;
      border-top: 1px solid #cccccc;
      margin: 16pt 0;
    }
    
    /* Print styles */
    @media print {
      body {
        padding: 20px;
      }
      
      @page {
        margin: 1in;
      }
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}
