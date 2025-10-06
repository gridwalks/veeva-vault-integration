import React from 'react';

export default function RightMenu({ activeTab, onTabChange, onChatOpen, indexedCount, isIndexing, onIndexDocuments, onRegenerateSummaries }) {
  const menuItems = [
    {
      id: 'documents',
      icon: '📁',
      label: 'Veeva Documents',
      onClick: () => onTabChange('documents')
    },
    {
      id: 'indexed',
      icon: '🔍',
      label: 'Indexed Documents',
      onClick: () => onTabChange('indexed')
    },
    {
      id: 'chat',
      icon: '💬',
      label: 'Chat with Documents',
      onClick: onChatOpen,
      disabled: indexedCount === 0
    },
    {
      id: 'index',
      icon: '⚡',
      label: 'Index Documents',
      onClick: () => onIndexDocuments(false),
      disabled: isIndexing,
      activeTab: 'documents'
    },
    {
      id: 'regenerate',
      icon: '🔄',
      label: 'Regenerate Summaries',
      onClick: () => onRegenerateSummaries(true),
      disabled: isIndexing,
      activeTab: 'documents'
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      height: '100vh',
      width: '64px',
      backgroundColor: '#1e1e1e',
      borderLeft: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '100px',
      gap: '20px',
      zIndex: 1000,
      boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.3)'
    }}>
      {menuItems.map((item) => {
        // Only show items that should be visible for the current tab
        if (item.activeTab && item.activeTab !== activeTab) {
          return null;
        }

        const isActive = item.id === activeTab;
        
        return (
          <button
            key={item.id}
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.label}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: isActive ? '#007bff' : item.disabled ? '#3a3a3a' : 'transparent',
              color: isActive ? 'white' : item.disabled ? '#666' : '#b0b0b0',
              fontSize: '20px',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              opacity: item.disabled ? 0.4 : 1,
              boxShadow: isActive ? '0 4px 12px rgba(0, 123, 255, 0.3)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (!item.disabled && !isActive) {
                e.target.style.backgroundColor = '#2a2a2a';
                e.target.style.color = 'white';
                e.target.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!item.disabled && !isActive) {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#b0b0b0';
                e.target.style.transform = 'scale(1)';
              }
            }}
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}
