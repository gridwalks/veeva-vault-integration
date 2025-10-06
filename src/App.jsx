import { useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import StaticChatPane from "./components/StaticChatPane.jsx";
import Header from "./components/Header.jsx";
import LeftMenu from "./components/LeftMenu.jsx";
import AdminScreen from "./components/AdminScreen.jsx";
import SelectedDocumentViewer from "./components/SelectedDocumentViewer.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const [currentScreen, setCurrentScreen] = useState("main");
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const documentViewerRef = useRef(null);

  const handleOpenDocumentInPane = (document) => {
    console.log('handleOpenDocumentInPane called with:', document);
    console.log('documentViewerRef.current:', documentViewerRef.current);
    
    // Call the SelectedDocumentViewer's handleOpenDocument function
    if (documentViewerRef.current && documentViewerRef.current.handleOpenDocument) {
      console.log('Calling handleOpenDocument on ref');
      documentViewerRef.current.handleOpenDocument(document);
    } else {
      console.warn('documentViewerRef or handleOpenDocument not available');
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onLogin={() => loginWithRedirect()} />;
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Header user={user} />
      
      {/* Main Content Area */}
      {currentScreen === "main" ? (
        /* Main Chat Interface */
        <div style={{
          display: 'flex',
          height: 'calc(100vh - 120px)',
          margin: '0 16px 0 312px',
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
            <StaticChatPane 
              selectedDocuments={selectedDocuments} 
              onOpenDocumentInPane={handleOpenDocumentInPane}
            />
          </div>

                {/* Right Panel - Selected Documents Viewer */}
                <div style={{
                  flex: '1'
                }}>
                  <SelectedDocumentViewer 
                    ref={documentViewerRef}
                    selectedDocuments={selectedDocuments}
                    onDocumentsSelected={setSelectedDocuments}
                  />
                </div>
        </div>
      ) : (
        /* Admin Screen */
        <div style={{ margin: '0 16px 0 312px' }}>
          <AdminScreen />
        </div>
      )}

      {/* Left Menu */}
            <LeftMenu
              currentScreen={currentScreen}
              onScreenChange={setCurrentScreen}
              onChatOpen={() => {}} // Chat is now always visible
              onLogout={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            />
    </div>
  );
}
