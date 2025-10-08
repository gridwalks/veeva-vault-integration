import { downloadUrl } from "../api";
import { useState } from "react";
import DocumentViewer from "./DocumentViewer.jsx";

export default function DocumentList({ items = [] }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleViewDocument = (doc) => {
    setSelectedDocument({
      url: downloadUrl({ id: doc.id, major: doc.major, minor: doc.minor }),
      name: doc.name
    });
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  if (!items.length) return <p>No approved documents found.</p>;
  
  return (
    <>
      <ul className="doc-list" style={{paddingLeft:0, listStyle:'none'}}>
        {items.map(d => (
          <li key={d.id} className="doc-row" style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid #eee', padding:'8px 0'}}>
            <div>
              <strong style={{fontSize:'13px'}}>{d.name}</strong>
              <div className="sub" style={{fontSize:11, color:'#555'}}>#{d.number ?? d.id} · {d.status} · v{d.major}.{d.minor}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => handleViewDocument(d)}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                View
              </button>
              <a 
                href={downloadUrl({ id: d.id, major: d.major, minor: d.minor })}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}
              >
                Download
              </a>
            </div>
          </li>
        ))}
      </ul>

      <DocumentViewer
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        documentUrl={selectedDocument?.url}
        documentName={selectedDocument?.name}
      />
    </>
  );
}
