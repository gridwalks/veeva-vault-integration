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
      left: '16px',
      top: '80px',
      height: 'calc(100vh - 96px)',
      width: '280px',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 1000,
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f8fafc',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: '600',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Navigation
        </h3>
      </div>

      {/* Menu Items */}
      <div style={{
        flex: 1,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflow: 'auto'
      }}>
        {menuItems.map((item) => {
          const isActive = item.id === currentScreen;
          
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              disabled={item.disabled}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? '#4338ca' : item.disabled ? '#f3f4f6' : 'transparent',
                color: isActive ? 'white' : item.disabled ? '#9ca3af' : '#374151',
                fontSize: '14px',
                fontWeight: '500',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s ease',
                opacity: item.disabled ? 0.5 : 1,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                textAlign: 'left'
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
                  e.target.style.color = '#374151';
                }
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer with Logout */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f8fafc',
        borderBottomLeftRadius: '8px',
        borderBottomRightRadius: '8px'
      }}>
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#dc2626',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.2s ease',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            textAlign: 'left'
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
          <span style={{ fontSize: '16px' }}>🚪</span>
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}
