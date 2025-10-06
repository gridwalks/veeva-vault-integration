import React from 'react';

export default function LeftMenu({ currentScreen, onScreenChange, onChatOpen, indexedCount, isIndexing, onIndexDocuments, onRegenerateSummaries }) {
  const menuItems = [
    {
      id: 'main',
      icon: '🏠',
      label: 'Main App',
      onClick: () => onScreenChange('main')
    },
    {
      id: 'admin',
      icon: '⚙️',
      label: 'Admin Panel',
      onClick: () => onScreenChange('admin')
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: 0,
      height: '100vh',
      width: '64px',
      backgroundColor: '#1e1e1e',
      borderRight: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '100px',
      gap: '20px',
      zIndex: 1000,
      boxShadow: '2px 0 8px rgba(0, 0, 0, 0.3)'
    }}>
      {menuItems.map((item) => {
        const isActive = item.id === currentScreen;
        
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
