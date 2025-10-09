import React from 'react';
import acceleraqaLogo from '../../assets/AceleraQA_logo.png';

export default function AuthScreen({ onLogin }) {
  // Reset body styles to eliminate white borders
  React.useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(to bottom right, #111827 0%, #1f2937 50%, #000000 100%)',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: 0,
      padding: 0
    }}>
      <div style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <img
          src={acceleraqaLogo}
          alt="AcceleraQA logo"
          style={{
            width: '200px',
            height: 'auto',
            margin: '0 auto'
          }}
        />
        <p style={{
          fontSize: '18px',
          color: '#d1d5db',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          margin: 0
        }}>
          Sign in to continue
        </p>
        <button
          onClick={onLogin}
          style={{
            padding: '12px 24px',
            backgroundColor: '#4338ca',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '400',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#312e81';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#4338ca';
          }}
          onFocus={(e) => {
            e.target.style.outline = '2px solid #4338ca';
            e.target.style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            e.target.style.outline = 'none';
          }}
        >
          Log In
        </button>
      </div>
    </div>
  );
}
