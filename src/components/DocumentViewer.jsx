import { useState, useEffect } from "react";

export default function DocumentViewer({ isOpen, onClose, documentUrl, documentName }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contentType, setContentType] = useState(null);
  const [convertedPdfUrl, setConvertedPdfUrl] = useState(null);
  const [htmlContent, setHtmlContent] = useState(null);

  useEffect(() => {
    if (isOpen && documentUrl) {
      setLoading(true);
      setError(null);
      setConvertedPdfUrl(null);
      setHtmlContent(null);
      
      // Convert document
      convertDocumentToPdf(documentUrl);
    }
  }, [isOpen, documentUrl]);

  // Cleanup function to revoke blob URLs
  useEffect(() => {
    return () => {
      if (convertedPdfUrl) {
        URL.revokeObjectURL(convertedPdfUrl);
      }
    };
  }, [convertedPdfUrl]);

  const convertDocumentToPdf = async (url) => {
    try {
      console.log('Starting document conversion...', { url });
      
      // Fetch the document
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`);
      }
      
      const blob = await response.blob();
      const fileType = response.headers.get('content-type') || 'application/octet-stream';
      
      console.log('Document fetched for conversion:', {
        size: blob.size,
        type: fileType
      });

      // Determine the file name with proper extension
      let fileName = documentName || 'document';
      
      // If the document name doesn't have an extension, try to infer it from content-type
      if (!fileName.includes('.')) {
        const extensionMap = {
          'application/pdf': '.pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
          'application/msword': '.doc',
          'text/plain': '.txt',
          'application/rtf': '.rtf'
        };
        
        const extension = extensionMap[fileType] || '';
        fileName = fileName + extension;
      }

      console.log('Using filename for conversion:', fileName);

      // Check if it's already a PDF
      const isPdf = fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
      
      if (isPdf) {
        // It's already a PDF, use it directly
        const pdfUrl = URL.createObjectURL(blob);
        console.log('Document is already a PDF, using directly');
        setConvertedPdfUrl(pdfUrl);
        setContentType('application/pdf');
        setLoading(false);
        return;
      }

      // Create FormData for the conversion request
      const formData = new FormData();
      formData.append('file', blob, fileName);
      formData.append('output', 'html');

      // Convert document to HTML (preserves formatting)
      const convertResponse = await fetch('/api/convert-to-pdf', {
        method: 'POST',
        body: formData
      });

      if (!convertResponse.ok) {
        let errorMessage = `Conversion failed: ${convertResponse.status}`;
        
        try {
          const errorData = await convertResponse.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          // If we can't parse the error response, use the default message
        }
        
        throw new Error(errorMessage);
      }

      const convertedBlob = await convertResponse.blob();
      const convertedType = convertResponse.headers.get('content-type') || 'text/html';
      
      console.log('Document converted successfully:', {
        originalSize: blob.size,
        convertedSize: convertedBlob.size,
        originalType: fileType,
        convertedType: convertedType,
        fileName: fileName
      });
      
      // Validate the converted blob
      if (convertedBlob.size === 0) {
        throw new Error('Converted document is empty');
      }

      // Check if response is HTML
      if (convertedType.includes('html')) {
        // Read blob as text and store HTML content directly
        const htmlText = await convertedBlob.text();
        console.log('HTML content loaded for viewer, length:', htmlText.length);
        setHtmlContent(htmlText);
        setConvertedPdfUrl(null);
        setContentType(convertedType);
      } else {
        // For other formats (PDF), create blob URL
        const convertedUrl = URL.createObjectURL(convertedBlob);
        setConvertedPdfUrl(convertedUrl);
        setHtmlContent(null);
        setContentType(convertedType);
      }
      
    } catch (err) {
      console.error('Document conversion error:', err);
      setError(`Failed to convert document: ${err.message}`);
      
      // Fallback: try to fetch original document
      try {
        const response = await fetch(url);
        setContentType(response.headers.get('content-type'));
      } catch (fetchErr) {
        console.error('Fallback fetch error:', fetchErr);
        setError('Failed to load document');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderDocument = () => {
    if (loading) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Converting document...</p>
          <p style={{ fontSize: '14px', color: '#666', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>This may take a few moments</p>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          flexDirection: 'column',
          gap: '16px',
          color: '#dc3545'
        }}>
          <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{error}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => window.open(documentUrl, '_blank')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Download Original
            </button>
            <button 
              onClick={() => {
                setLoading(true);
                setError(null);
                convertDocumentToPdf(documentUrl);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Retry Conversion
            </button>
          </div>
        </div>
      );
    }

    // Display converted document or original if conversion failed
    const displayUrl = convertedPdfUrl || documentUrl;
    const isPdf = contentType?.includes('pdf');
    const isHtml = contentType?.includes('html');

    if (isPdf || isHtml || htmlContent) {
      return (
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          {(convertedPdfUrl || htmlContent) && (
            <div style={{ 
              backgroundColor: '#d4edda', 
              color: '#155724', 
              padding: '8px 12px', 
              borderRadius: '4px', 
              marginBottom: '16px',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              ✓ Document converted for viewing with formatting preserved
            </div>
          )}
          
          {/* Document Viewer Options */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '16px', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {!htmlContent && (
              <button 
                onClick={() => window.open(displayUrl, '_blank')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                Open in New Tab
              </button>
            )}
            <button 
              onClick={() => {
                if (htmlContent) {
                  // Download HTML content
                  const blob = new Blob([htmlContent], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = documentName ? documentName.replace(/\.[^/.]+$/, '.html') : 'document.html';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                } else {
                  // Download from URL
                  const link = document.createElement('a');
                  link.href = displayUrl;
                  const extension = isPdf ? 'pdf' : 'html';
                  link.download = documentName ? documentName.replace(/\.[^/.]+$/, `.${extension}`) : `document.${extension}`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Download
            </button>
          </div>
          
          {/* Document iframe with fallback */}
          <div style={{ position: 'relative' }}>
            {htmlContent ? (
              /* HTML content using srcdoc */
              <iframe
                srcDoc={htmlContent}
                style={{
                  width: '100%',
                  height: '600px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff'
                }}
                title={documentName}
                sandbox="allow-same-origin"
              />
            ) : (
              /* PDF or other content using src */
              <iframe
                src={isPdf ? `${displayUrl}#toolbar=1&navpanes=1&scrollbar=1` : displayUrl}
                style={{
                  width: '100%',
                  height: '600px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff'
                }}
                title={documentName}
                onError={() => {
                  console.error('Document iframe failed to load');
                }}
              />
            )}
            
            {/* Fallback message if iframe fails */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              padding: '20px',
              borderRadius: '8px',
              display: 'none', // Hidden by default, can be shown via JavaScript if needed
              textAlign: 'center',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }} id="document-fallback">
              <p style={{ fontFamily: 'inherit' }}>Document viewer not supported in this browser.</p>
              <p style={{ fontFamily: 'inherit' }}>Please use the "Download" button above.</p>
            </div>
          </div>
        </div>
      );
    }

    // Fallback for non-PDF documents
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        flexDirection: 'column',
        gap: '16px',
        textAlign: 'center'
      }}>
        <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Document conversion failed. Showing original format.</p>
        <p style={{ fontSize: '14px', color: '#666', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
          Content Type: {contentType || 'Unknown'}
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => window.open(displayUrl, '_blank')}
            style={{
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            View Original
          </button>
          <button 
            onClick={() => {
              setLoading(true);
              setError(null);
              convertDocumentToPdf(documentUrl);
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            Retry PDF Conversion
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8f9fa'
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '18px',
              color: '#333',
              maxWidth: '80%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              {documentName || 'Document Viewer'}
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = documentUrl;
                  link.download = documentName || 'document';
                  link.target = '_blank';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
                title="Download original document"
              >
                Download
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px'
          }}>
            {renderDocument()}
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );
}
