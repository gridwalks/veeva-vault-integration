import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import StaticChatPane from "./components/StaticChatPane.jsx";
import Header from "./components/Header.jsx";
import AdminScreen from "./components/AdminScreen.jsx";
import SelectedDocumentViewer from "./components/SelectedDocumentViewer.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import UserProfile from "./components/UserProfile.jsx";
import { useInactivityLogout } from "./hooks/useInactivityLogout.js";
import { useAdminRole } from "./hooks/useAdminRole.js";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const { isAdmin, isLoading: isRoleLoading } = useAdminRole();
  const [currentScreen, setCurrentScreen] = useState("main");
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const documentViewerRef = useRef(null);

  // Set up inactivity logout for authenticated users
  const handleLogout = () => logout({ logoutParams: { returnTo: window.location.origin } });
  useInactivityLogout(handleLogout);

  // Handle user profile updates
  const handleUserUpdate = (updatedUser) => {
    // This would typically update the user state, but since we're using Auth0's useAuth0 hook,
    // the user object is managed by Auth0. The updated information will be available on next login.
    console.log('User profile updated:', updatedUser);
  };

  const handleOpenDocumentInPane = (document) => {
    console.log('App: handleOpenDocumentInPane called with:', document);
    console.log('App: documentViewerRef.current:', documentViewerRef.current);
    
    // Call the SelectedDocumentViewer's handleOpenDocument function
    if (documentViewerRef.current && documentViewerRef.current.handleOpenDocument) {
      console.log('App: Calling handleOpenDocument on ref');
      try {
        documentViewerRef.current.handleOpenDocument(document);
      } catch (error) {
        console.error('App: Error calling handleOpenDocument:', error);
      }
    } else {
      console.warn('App: documentViewerRef or handleOpenDocument not available');
      console.log('App: documentViewerRef.current:', documentViewerRef.current);
      console.log('App: has handleOpenDocument:', documentViewerRef.current?.handleOpenDocument);
    }
  };

  //temp// Add this in your App component, before the return statement
useEffect(() => {
  console.log('Current Auth0 Config:');
  console.log('Domain:', import.meta.env.VITE_AUTH0_DOMAIN);
  console.log('Client ID:', import.meta.env.VITE_AUTH0_CLIENT_ID);
  console.log('User object:', user);
}, [user]);

  if (!isAuthenticated) {
    return <AuthScreen onLogin={() => loginWithRedirect()} />;
  }

  // Show loading state while checking user role
  if (isRoleLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{
          textAlign: 'center',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e5e7eb',
            borderTop: '4px solid #4338ca',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect non-admin users away from admin screen
  if (currentScreen === "admin" && !isAdmin) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{
          textAlign: 'center',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          maxWidth: '400px',
          padding: '24px'
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px'
          }}>🚫</div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '600' }}>
            Access Denied
          </h2>
          <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
            You don't have permission to access the admin panel. Only users with admin role can access this area.
          </p>
          <button
            onClick={() => setCurrentScreen("main")}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4338ca',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            Return to Main App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Header 
        user={user}
        currentScreen={currentScreen}
        onScreenChange={setCurrentScreen}
        onLogout={handleLogout}
        isAdmin={isAdmin}
      />
      
      {/* Main Content Area */}
      {currentScreen === "main" ? (
        /* Main Chat Interface */
        <div style={{
          display: 'flex',
          height: 'calc(100vh - 60px)',
          margin: '8px 12px',
          gap: '12px'
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
              userId={user?.sub}
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
      ) : currentScreen === "admin" ? (
        /* Admin Screen */
        <div style={{ margin: '0 16px' }}>
          <AdminScreen userId={user?.sub} />
        </div>
      ) : currentScreen === "profile" ? (
        /* Profile Screen */
        <UserProfile user={user} onUpdateUser={handleUserUpdate} />
      ) : null}
    </div>
  );
}
