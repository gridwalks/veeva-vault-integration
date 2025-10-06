import React from 'react';
import acceleraqaLogo from '../../assets/acceleraqa-logo.svg';

export default function Header() {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '20px 16px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e0e0e0'
    }}>
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
    </header>
  );
}
