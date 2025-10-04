import { useState, useEffect } from "react";

export default function DocumentViewer({ isOpen, onClose, documentUrl, documentName }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contentType, setContentType] = useState(null);

  useEffect(() => {
    if (isOpen && documentUrl) {
      setLoading(true);
      setError(null);
      
      // Fetch document to determine content type
      fetch(documentUrl)
        .then(response => {
          setContentType(response.headers.get('content-type'));
          return response.blob();
        })
        .catch(err => {
          setError('Failed to load document');
          console.error('Document loading error:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, documentUrl]);

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
          <p>Loading document...</p>
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
            Download Instead
          </button>
        </div>
      );
    }

    // Handle different content types
    if (contentType?.includes('pdf')) {
      return (
        <iframe
          src={documentUrl}
          style={{
            width: '100%',
            height: '600px',
            border: 'none',
            borderRadius: '4px'
          }}
          title={documentName}
        />
      );
    }

    if (contentType?.includes('text/')) {
      return (
        <iframe
          src={documentUrl}
          style={{
            width: '100%',
            height: '600px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
          title={documentName}
        />
      );
    }

    // For other file types, show download option
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
        <p>This document type cannot be previewed in the browser.</p>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Content Type: {contentType || 'Unknown'}
        </p>
        <button 
          onClick={() => window.open(documentUrl, '_blank')}
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
          Download Document
        </button>
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
