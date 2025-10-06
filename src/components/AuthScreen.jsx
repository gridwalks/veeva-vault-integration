import React from 'react';
import acceleraqaLogo from '../../assets/AceleraQA_logo.png';

export default function AuthScreen({ onLogin }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '16px',
        padding: '48px 40px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        maxWidth: '400px',
        width: '100%'
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <img 
            src={acceleraqaLogo} 
            alt="AcceleraQA Logo" 
            style={{ 
              height: '48px', 
              width: '48px'
            }} 
          />
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '32px',
              fontWeight: '700',
              color: '#4338ca',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              letterSpacing: '-0.025em'
            }}>
              AcceleraQA
            </h1>
            <span style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#6b7280',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Beta
            </span>
          </div>
        </div>

        {/* Welcome Message */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            margin: '0 0 8px 0',
            fontSize: '24px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Welcome Back
          </h2>
          <p style={{
            margin: 0,
            fontSize: '16px',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            lineHeight: '1.5'
          }}>
            Sign in to access your document management system
          </p>
        </div>

        {/* Login Button */}
        <button
          onClick={onLogin}
          style={{
            width: '100%',
            padding: '16px 24px',
            backgroundColor: '#4338ca',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px rgba(67, 56, 202, 0.3)',
            marginBottom: '24px'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#312e81';
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 16px rgba(67, 56, 202, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#4338ca';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 12px rgba(67, 56, 202, 0.3)';
          }}
        >
          Sign In with Auth0
        </button>

        {/* Features List */}
        <div style={{
          textAlign: 'left',
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            What you can do:
          </h3>
          <ul style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {[
              '📄 Manage Veeva documents',
              '🔍 Search indexed content',
              '💬 Chat with your documents',
              '⚡ Generate AI summaries'
            ].map((feature, index) => (
              <li key={index} style={{
                fontSize: '14px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb',
          fontSize: '12px',
          color: '#9ca3af',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Secure authentication powered by Auth0
        </div>
      </div>
    </div>
  );
}
