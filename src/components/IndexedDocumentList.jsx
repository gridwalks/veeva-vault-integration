import { downloadUrl } from "../api";
import { useState } from "react";
import DocumentViewer from "./DocumentViewer.jsx";
import ReactMarkdown from "react-markdown";

export default function IndexedDocumentList({ items = [] }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleViewDocument = (doc) => {
    setSelectedDocument({
      url: downloadUrl({ id: doc.veeva_document_id, major: doc.major_version, minor: doc.minor_version }),
      name: doc.document_name
    });
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  if (!items?.length) {
    return <p style={{color: '#666', fontStyle: 'italic'}}>No indexed documents found.</p>;
  }

  return (
    <>
      <div style={{display: 'grid', gap: '16px', marginTop: '16px'}}>
        {items.map((doc) => (
          <div key={doc.id} style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#f9f9f9'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px'}}>
              <div style={{flex: 1}}>
                <h3 style={{margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600'}}>
                  {doc.document_name}
                </h3>
                <div style={{display: 'flex', gap: '16px', fontSize: '14px', color: '#666', marginBottom: '8px'}}>
                  <span><strong>Number:</strong> {doc.document_number}</span>
                  <span><strong>Version:</strong> {doc.major_version}.{doc.minor_version}</span>
                  <span><strong>Type:</strong> {doc.document_type}</span>
                  <span><strong>Status:</strong> {doc.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleViewDocument(doc)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  View
                </button>
                <a
                  href={downloadUrl({ id: doc.veeva_document_id, major: doc.major_version, minor: doc.minor_version })}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              </div>
            </div>
          
          {doc.summary && (
            <div style={{
              backgroundColor: 'white',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #e0e0e0'
            }}>
              <h4 style={{margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#333'}}>
                Document Summary:
              </h4>
              <div style={{
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#555'
              }}>
                <ReactMarkdown
                  components={{
                    h1: ({children}) => <h1 style={{fontSize: '16px', fontWeight: 'bold', margin: '8px 0 4px 0', color: '#333'}}>{children}</h1>,
                    h2: ({children}) => <h2 style={{fontSize: '15px', fontWeight: 'bold', margin: '6px 0 4px 0', color: '#333'}}>{children}</h2>,
                    h3: ({children}) => <h3 style={{fontSize: '14px', fontWeight: 'bold', margin: '4px 0 2px 0', color: '#333'}}>{children}</h3>,
                    strong: ({children}) => <strong style={{fontWeight: 'bold', color: '#333'}}>{children}</strong>,
                    em: ({children}) => <em style={{fontStyle: 'italic'}}>{children}</em>,
                    code: ({children}) => <code style={{backgroundColor: '#f4f4f4', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '13px'}}>{children}</code>,
                    pre: ({children}) => <pre style={{backgroundColor: '#f4f4f4', padding: '8px', borderRadius: '4px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace'}}>{children}</pre>,
                    p: ({children}) => <p style={{margin: '4px 0'}}>{children}</p>,
                    ul: ({children}) => <ul style={{margin: '4px 0', paddingLeft: '20px'}}>{children}</ul>,
                    ol: ({children}) => <ol style={{margin: '4px 0', paddingLeft: '20px'}}>{children}</ol>,
                    li: ({children}) => <li style={{margin: '2px 0'}}>{children}</li>,
                    a: ({href, children}) => <a href={href} style={{color: '#007bff', textDecoration: 'underline'}} target="_blank" rel="noopener noreferrer">{children}</a>
                  }}
                >
                  {doc.summary}
                </ReactMarkdown>
              </div>
            </div>
          )}
          
          <div style={{fontSize: '12px', color: '#999', marginTop: '12px'}}>
            Indexed: {new Date(doc.indexed_at).toLocaleString()} | 
            Updated: {new Date(doc.updated_at).toLocaleString()}
          </div>
        </div>
      ))}
      </div>

      <DocumentViewer
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        documentUrl={selectedDocument?.url}
        documentName={selectedDocument?.name}
      />
    </>
  );
}
