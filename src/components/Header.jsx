import React from 'react';
import acceleraqaLogo from '../../assets/acceleraqa-logo.svg';

export default function Header({ user }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      backgroundColor: '#f8fafc',
      borderBottom: '1px solid #e5e7eb',
      height: '64px'
    }}>
      {/* Left Section - Logo and App Name */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        {/* Logo */}
        <img 
          src={acceleraqaLogo} 
          alt="AcceleraQA Logo" 
          style={{ 
            height: '32px', 
            width: '32px'
          }} 
        />
        
        {/* Main text */}
        <h1 style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: '600',
          color: '#4338ca',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          letterSpacing: '-0.025em'
        }}>
          AcceleraQA
        </h1>
        
        {/* Beta badge */}
        <span style={{
          fontSize: '12px',
          fontWeight: '600',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          marginLeft: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          | Beta
        </span>
      </div>

      {/* Right Section - User Information */}
      {user && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {/* User Icon */}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#4338ca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            color: '#ffffff',
            fontWeight: '600'
          }}>
            {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
          </div>
          
          {/* User Details */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{
              fontSize: '14px',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: '500'
            }}>
              {user.email}
            </span>
            <span style={{
              fontSize: '12px',
              color: '#6b7280',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              admin
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
