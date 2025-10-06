import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getIndexedDocuments } from "./api";
import StaticChatPane from "./components/StaticChatPane.jsx";
import Header from "./components/Header.jsx";
import LeftMenu from "./components/LeftMenu.jsx";
import AdminScreen from "./components/AdminScreen.jsx";
import IndexedDocumentList from "./components/IndexedDocumentList.jsx";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const [indexedData, setIndexedData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [currentScreen, setCurrentScreen] = useState("main");
  const [selectedDocuments, setSelectedDocuments] = useState([]);

  async function loadIndexed(offset = 0) {
    console.log('Loading indexed documents...', { offset });
    try {
      const res = await getIndexedDocuments({ limit: 50, offset });
      console.log('Indexed documents loaded successfully:', {
        total: res.total,
        items: res.items?.length || 0,
        duration: res.duration
      });
      setIndexedData(res);
    } catch (err) {
      console.error('Error loading indexed documents:', {
        message: err.message,
        stack: err.stack,
        offset
      });
      setIndexedData({ items: [], total: 0, pageOffset: 0, pageSize: 50, error: err.message });
    }
  }

  useEffect(() => { 
    console.log('App authentication state changed:', { isAuthenticated });
    if (isAuthenticated) {
      console.log('User authenticated, loading indexed documents...');
      loadIndexed(0);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <Header />
        <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px", textAlign: "center"}}>
          <h1>Approved Documents</h1>
          <p>Please log in to view documents.</p>
          <button onClick={() => loginWithRedirect()}>Log in</button>
        </main>
      </>
    );
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Header user={user} />
      <div style={{ textAlign: 'right', margin: '10px 16px 10px 90px' }}>
        <button 
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          style={{
            padding: '8px 16px',
            backgroundColor: '#4338ca',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#312e81'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
        >
          Log out
        </button>
      </div>
      
      {/* Main Content Area */}
      {currentScreen === "main" ? (
        /* Main Chat Interface */
        <div style={{
          display: 'flex',
          height: 'calc(100vh - 120px)',
          margin: '0 90px 0 90px',
          gap: '16px'
        }}>
          {/* Left Panel - Chat */}
          <div style={{
            flex: '1',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          }}>
            <StaticChatPane selectedDocuments={selectedDocuments} />
          </div>

          {/* Right Panel - Indexed Documents for Selection */}
          <div style={{
            flex: '1',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '24px',
            overflow: 'auto',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px 0', 
              textAlign: 'center', 
              color: '#374151',
              fontSize: '20px',
              fontWeight: '600',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Available Documents
            </h2>
            <p style={{ 
              textAlign: 'center', 
              color: '#6b7280', 
              marginBottom: '20px',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Select documents to chat with from the indexed documents below.
            </p>
            
            {indexedData.error && <p style={{color:'#b00020'}}>Error: {indexedData.error}</p>}
            
            <IndexedDocumentList 
              items={indexedData.items} 
              onDocumentsSelected={setSelectedDocuments}
            />
            
            <div className="pager" style={{display:'flex', gap:12, alignItems:'center', marginTop:12, justifyContent:'center'}}>
              <button 
                disabled={indexedData.pageOffset <= 0} 
                onClick={() => {
                  const newOffset = Math.max(0, indexedData.pageOffset - indexedData.pageSize);
                  console.log('Previous indexed page clicked:', { newOffset, currentOffset: indexedData.pageOffset });
                  loadIndexed(newOffset);
                }}
              >
                Prev
              </button>
              <span>{indexedData.pageOffset + 1}–{indexedData.pageOffset + (indexedData.items?.length || 0)} of {indexedData.total}</span>
              <button 
                disabled={indexedData.pageOffset + indexedData.pageSize >= indexedData.total} 
                onClick={() => {
                  const newOffset = indexedData.pageOffset + indexedData.pageSize;
                  console.log('Next indexed page clicked:', { newOffset, currentOffset: indexedData.pageOffset });
                  loadIndexed(newOffset);
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Admin Screen */
        <AdminScreen />
      )}

      {/* Left Menu */}
      <LeftMenu
        currentScreen={currentScreen}
        onScreenChange={setCurrentScreen}
        onChatOpen={() => {}} // Chat is now always visible
        indexedCount={indexedData.items.length}
        isIndexing={false}
        onIndexDocuments={() => {}}
        onRegenerateSummaries={() => {}}
      />
    </div>
  );
}
