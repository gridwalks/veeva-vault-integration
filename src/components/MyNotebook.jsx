import { useState, useEffect } from 'react';
import WorkflowHistory from './WorkflowHistory';
import ChatHistory from './ChatHistory';

export default function MyNotebook({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('workflow-history');

  const handleLoadSession = (sessionId) => {
    console.log('MyNotebook: Loading chat session:', sessionId);
    
    // Send message to parent window
    if (window.parent && window.parent.postMessage) {
      window.parent.postMessage({
        type: 'LOAD_CHAT_SESSION',
        sessionId: sessionId
      }, window.location.origin);
    }
    
    // Close the modal
    onClose();
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    {
      id: 'workflow-history',
      label: 'Workflow History',
      icon: '📋',
      component: <WorkflowHistory />
    },
    {
      id: 'chat-history',
      label: 'Chat History',
      icon: '💬',
      component: <ChatHistory onLoadSession={handleLoadSession} />
    }
  ];

  const activeTabData = tabs.find(tab => tab.id === activeTab);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        maxWidth: '1400px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <img src="/notebook-icon.png" alt="Notebook" style={{ width: '24px', height: '24px' }} />
            My Notebook
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              color: '#6b7280',
              border: 'none',
              borderRadius: '4px',
              fontSize: '20px',
              cursor: 'pointer',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f3f4f6';
              e.target.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#6b7280';
            }}
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          padding: '0 24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{
            display: 'flex',
            gap: '0'
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 20px',
                  backgroundColor: activeTab === tab.id ? '#ffffff' : 'transparent',
                  color: activeTab === tab.id ? '#4338ca' : '#6b7280',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #4338ca' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: '#ffffff'
        }}>
          {activeTabData && activeTabData.component}
        </div>
      </div>
    </div>
  );
}
