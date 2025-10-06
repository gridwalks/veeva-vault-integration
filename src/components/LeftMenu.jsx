import React from 'react';

export default function LeftMenu({ currentScreen, onScreenChange, onChatOpen, indexedCount, isIndexing, onIndexDocuments, onRegenerateSummaries, onLogout }) {
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
      top: '64px',
      height: 'calc(100vh - 64px)',
      width: '64px',
      backgroundColor: '#ffffff',
      borderRight: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: '24px',
      paddingBottom: '24px',
      zIndex: 1000,
      boxShadow: '1px 0 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      {/* Top Menu Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {menuItems.map((item) => {
        const isActive = item.id === currentScreen;
        
        return (
          <button
            key={item.id}
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.label}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: isActive ? '#4338ca' : item.disabled ? '#f3f4f6' : 'transparent',
              color: isActive ? 'white' : item.disabled ? '#9ca3af' : '#6b7280',
              fontSize: '18px',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              opacity: item.disabled ? 0.5 : 1,
              boxShadow: isActive ? '0 1px 3px 0 rgba(67, 56, 202, 0.1)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (!item.disabled && !isActive) {
                e.target.style.backgroundColor = '#f3f4f6';
                e.target.style.color = '#374151';
              }
            }}
            onMouseLeave={(e) => {
              if (!item.disabled && !isActive) {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6b7280';
              }
            }}
          >
            {item.icon}
          </button>
        );
      })}
      </div>

      {/* Bottom Logout Button */}
      <button
        onClick={onLogout}
        title="Log out"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#dc2626',
          fontSize: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          opacity: 1
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#fef2f2';
          e.target.style.color = '#b91c1c';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.color = '#dc2626';
        }}
      >
        🚪
      </button>
    </div>
  );
}
