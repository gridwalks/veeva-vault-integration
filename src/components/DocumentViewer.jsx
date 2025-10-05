import { useState, useEffect } from "react";

export default function DocumentViewer({ isOpen, onClose, documentUrl, documentName }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contentType, setContentType] = useState(null);
  const [convertedPdfUrl, setConvertedPdfUrl] = useState(null);

  useEffect(() => {
    if (isOpen && documentUrl) {
      setLoading(true);
      setError(null);
      setConvertedPdfUrl(null);
      
      // Convert document to PDF
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
      console.log('Starting document conversion to PDF...', { url });
      
      // Create a FormData object to send the document
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

      // Create FormData for the conversion request
      const formData = new FormData();
      formData.append('file', blob, fileName);
      formData.append('output', 'pdf');

      // Use a document conversion service (you can replace this with your preferred service)
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
      const pdfUrl = URL.createObjectURL(convertedBlob);
      
      console.log('Document converted to PDF successfully:', {
        originalSize: blob.size,
        convertedSize: convertedBlob.size,
        pdfUrl: pdfUrl,
        originalType: fileType,
        fileName: fileName
      });
      
      // Validate the PDF blob
      if (convertedBlob.size === 0) {
        throw new Error('Generated PDF is empty');
      }
      
      // Check if the blob looks like a PDF
      const firstBytes = await convertedBlob.slice(0, 4).text();
      if (!firstBytes.startsWith('%PDF')) {
        console.warn('Generated file may not be a valid PDF - header check failed');
      }

      setConvertedPdfUrl(pdfUrl);
      setContentType('application/pdf');
      
    } catch (err) {
      console.error('Document conversion error:', err);
      setError(`Failed to convert document to PDF: ${err.message}`);
      
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
          <p>Converting document to PDF...</p>
          <p style={{ fontSize: '14px', color: '#666' }}>This may take a few moments</p>
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
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => window.open(documentUrl, '_blank')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
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
                cursor: 'pointer'
              }}
            >
              Retry Conversion
            </button>
          </div>
        </div>
      );
    }

    // Display converted PDF or original if conversion failed
    const displayUrl = convertedPdfUrl || documentUrl;
    const isPdf = contentType?.includes('pdf') || convertedPdfUrl;

    if (isPdf) {
      return (
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          {convertedPdfUrl && (
            <div style={{ 
              backgroundColor: '#d4edda', 
              color: '#155724', 
              padding: '8px 12px', 
              borderRadius: '4px', 
              marginBottom: '16px',
              fontSize: '14px'
            }}>
              ✓ Document converted to PDF for viewing
            </div>
          )}
          
          {/* PDF Viewer Options */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '16px', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button 
              onClick={() => window.open(displayUrl, '_blank')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Open in New Tab
            </button>
            <button 
              onClick={() => {
                const link = document.createElement('a');
                link.href = displayUrl;
                link.download = documentName || 'document.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Download PDF
            </button>
          </div>
          
          {/* PDF iframe with fallback */}
          <div style={{ position: 'relative' }}>
            <iframe
              src={`${displayUrl}#toolbar=1&navpanes=1&scrollbar=1`}
              style={{
                width: '100%',
                height: '600px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
              title={documentName}
              onError={() => {
                console.error('PDF iframe failed to load');
              }}
            />
            
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
              textAlign: 'center'
            }} id="pdf-fallback">
              <p>PDF viewer not supported in this browser.</p>
              <p>Please use the "Open in New Tab" or "Download PDF" buttons above.</p>
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
        <p>Document conversion failed. Showing original format.</p>
        <p style={{ fontSize: '14px', color: '#666' }}>
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
              fontSize: '16px'
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
              fontSize: '16px'
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
              whiteSpace: 'nowrap'
            }}>
              {documentName || 'Document Viewer'}
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.open(documentUrl, '_blank')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Download"
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
                  fontSize: '14px'
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
