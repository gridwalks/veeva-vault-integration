import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import StaticChatPane from "./components/StaticChatPane.jsx";
import Header from "./components/Header.jsx";
import AdminScreen from "./components/AdminScreen.jsx";
import SelectedDocumentViewer from "./components/SelectedDocumentViewer.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import UserProfile from "./components/UserProfile.jsx";
import UserGuide from "./components/UserGuide.jsx";
import MyNotebook from "./components/MyNotebook.jsx";
// Learning Platform components - disabled
// import StudentDashboard from "./components/StudentDashboard.jsx";
// import CourseCatalog from "./components/CourseCatalog.jsx";
// import CourseDetail from "./components/CourseDetail.jsx";
// import LearningPathView from "./components/LearningPathView.jsx";
import { useInactivityLogout } from "./hooks/useInactivityLogout.js";
import { useAdminRole } from "./hooks/useAdminRole.js";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user, getAccessTokenSilently } = useAuth0();
  const { isAdmin, isLoading: isRoleLoading } = useAdminRole();
  const [currentScreen, setCurrentScreen] = useState("main");
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [referencedDocuments, setReferencedDocuments] = useState([]);
  const [referencedExternalResources, setReferencedExternalResources] = useState([]);
  const [localUser, setLocalUser] = useState(null);
  const [showMyNotebook, setShowMyNotebook] = useState(false);
  const [resumeWorkflowId, setResumeWorkflowId] = useState(null);
  const [loadChatSessionId, setLoadChatSessionId] = useState(null);
  const documentViewerRef = useRef(null);
  
  // Educational platform state - disabled
  // const [selectedCourseId, setSelectedCourseId] = useState(null);
  // const [selectedLearningPathId, setSelectedLearningPathId] = useState(null);
  
  // Resizable panel state
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('chatPanelWidth');
    return saved ? parseFloat(saved) : 50; // Default to 50%
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // Set up inactivity logout for authenticated users
  const handleLogout = () => logout({ logoutParams: { returnTo: window.location.origin } });
  useInactivityLogout(handleLogout);

  // Update local user state when Auth0 user changes
  useEffect(() => {
    if (user) {
      setLocalUser(user);
    }
  }, [user]);

  // Load saved panel width on mount
  useEffect(() => {
    const saved = localStorage.getItem('chatPanelWidth');
    if (saved) {
      setLeftPanelWidth(parseFloat(saved));
    }
  }, []);

  // Handle panel resizing
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const containerWidth = rect.width;
    const newWidth = (mouseX / containerWidth) * 100;
    
    // Constrain between 20% and 80%
    const constrainedWidth = Math.max(20, Math.min(80, newWidth));
    setLeftPanelWidth(constrainedWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Save panel width to localStorage when dragging ends
  useEffect(() => {
    if (!isDragging && leftPanelWidth !== null) {
      localStorage.setItem('chatPanelWidth', leftPanelWidth.toString());
    }
  }, [isDragging, leftPanelWidth]);

  // Attach/remove global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection during drag
      document.body.style.cursor = 'col-resize';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handle user profile updates
  const handleUserUpdate = (updatedUser) => {
    console.log('User profile updated:', updatedUser);
    // Update the local user state with the new data
    if (updatedUser && localUser) {
      setLocalUser(prevUser => ({
        ...prevUser,
        name: updatedUser.name,
        picture: updatedUser.picture,
        updated_at: updatedUser.updated_at
      }));
    }
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

// Listen for resume workflow messages from WorkflowHistory
useEffect(() => {
  const handleMessage = (event) => {
    // Verify the origin to ensure the message is from an authorized sender
    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.data && event.data.type === 'RESUME_WORKFLOW') {
      console.log('Received resume workflow message:', event.data);
      setResumeWorkflowId(event.data.instanceId);
      setCurrentScreen('main'); // Switch to main chat screen
    } else if (event.data && event.data.type === 'CLOSE_MY_NOTEBOOK') {
      console.log('Received close My Notebook message');
      setShowMyNotebook(false); // Close the My Notebook modal
    } else if (event.data && event.data.type === 'LOAD_CHAT_SESSION') {
      console.log('Received load chat session message:', event.data);
      setLoadChatSessionId(event.data.sessionId);
      setCurrentScreen('main'); // Switch to main chat screen
      setShowMyNotebook(false); // Close the My Notebook modal
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

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
        user={localUser || user}
        currentScreen={currentScreen}
        onScreenChange={setCurrentScreen}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onMyNotebookOpen={() => setShowMyNotebook(true)}
      />
      
      {/* Main Content Area */}
      {currentScreen === "main" ? (
        /* Main Chat Interface */
        <div 
          ref={containerRef}
          style={{
            display: 'flex',
            height: 'calc(100vh - 60px)',
            margin: '8px 12px',
            gap: '0px'
          }}
        >
          {/* Left Panel - Chat */}
          <div style={{
            width: `${leftPanelWidth}%`,
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            marginRight: '12px'
          }}>
            <StaticChatPane 
              selectedDocuments={selectedDocuments} 
              onOpenDocumentInPane={handleOpenDocumentInPane}
              userId={(localUser || user)?.sub}
              resumeWorkflowId={resumeWorkflowId}
              onResumeWorkflowComplete={() => setResumeWorkflowId(null)}
              loadChatSessionId={loadChatSessionId}
              onLoadChatSessionComplete={() => setLoadChatSessionId(null)}
              onReferencedDocumentsUpdate={(docs, resources) => {
                setReferencedDocuments(docs);
                setReferencedExternalResources(resources);
              }}
              onClearWorkspace={() => {
                setReferencedDocuments([]);
                setReferencedExternalResources([]);
              }}
            />
          </div>

          {/* Resizable Divider */}
          <div
            onMouseDown={handleMouseDown}
            style={{
              width: '6px',
              backgroundColor: isDragging ? '#9ca3af' : '#e5e7eb',
              cursor: 'col-resize',
              flexShrink: 0,
              transition: isDragging ? 'none' : 'background-color 0.2s',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (!isDragging) {
                e.currentTarget.style.backgroundColor = '#d1d5db';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDragging) {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
              }
            }}
          />

          {/* Right Panel - Selected Documents Viewer */}
          <div style={{
            flex: '1',
            minWidth: 0,
            marginLeft: '12px'
          }}>
            <SelectedDocumentViewer 
              ref={documentViewerRef}
              selectedDocuments={selectedDocuments}
              onDocumentsSelected={setSelectedDocuments}
              referencedDocuments={referencedDocuments}
              referencedExternalResources={referencedExternalResources}
            />
          </div>
        </div>
      ) : currentScreen === "admin" ? (
        /* Admin Screen */
        <div style={{ margin: '0 16px' }}>
          <AdminScreen userId={(localUser || user)?.sub} />
        </div>
      ) : currentScreen === "profile" ? (
        /* Profile Screen */
        <UserProfile user={localUser || user} onUpdateUser={handleUserUpdate} />
      ) : currentScreen === "guide" ? (
        /* User Guide Screen */
        <UserGuide />
      ) : null}

      {/* My Notebook Modal */}
      <MyNotebook 
        isOpen={showMyNotebook}
        onClose={() => setShowMyNotebook(false)}
      />
    </div>
  );
}
