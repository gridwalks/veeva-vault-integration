import React from 'react';
import acceleraqaLogo from '../../assets/acceleraqa-logo.svg';

export default function Header({ user }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 16px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e0e0e0'
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
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#5C3E9E',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: '-0.5px'
        }}>
          AcceleraQA
        </h1>
        
        {/* Beta badge */}
        <span style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#666666',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          marginLeft: '8px'
        }}>
          | BETA
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
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            color: '#666666'
          }}>
            👤
          </div>
          
          {/* User Details */}
          <span style={{
            fontSize: '14px',
            color: '#666666',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            {user.email} (admin)
          </span>
        </div>
      )}
    </header>
  );
}
