import { downloadUrl } from "../api";

export default function IndexedDocumentList({ items = [] }) {
  if (!items?.length) {
    return <p style={{color: '#666', fontStyle: 'italic'}}>No indexed documents found.</p>;
  }

  return (
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
            <a
              href={downloadUrl({ id: doc.veeva_document_id, major: doc.major_version, minor: doc.minor_version })}
              style={{
                padding: '8px 12px',
                backgroundColor: '#007bff',
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
          
          {doc.summary && (
            <div style={{
              backgroundColor: 'white',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #e0e0e0'
            }}>
              <h4 style={{margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#333'}}>
                AI Summary:
              </h4>
              <p style={{
                margin: '0',
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#555'
              }}>
                {doc.summary}
              </p>
            </div>
          )}
          
          <div style={{fontSize: '12px', color: '#999', marginTop: '12px'}}>
            Indexed: {new Date(doc.indexed_at).toLocaleDateString()} | 
            Updated: {new Date(doc.updated_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
