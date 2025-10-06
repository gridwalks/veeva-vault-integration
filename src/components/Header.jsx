import React, { useState } from 'react';
import { Menu, User, Shield, LogOut, Home } from 'lucide-react';
import acceleraqaLogo from '../../assets/AceleraQA_logo.png';

export default function Header({ user, currentScreen, onScreenChange, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

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
            width: 'auto',
            objectFit: 'contain'
          }} 
        />
        
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

      {/* Right Section - User Information and Menu */}
      {user && (
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          {/* User Info */}
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

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: menuOpen ? '#f3f4f6' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!menuOpen) e.target.style.backgroundColor = '#f3f4f6';
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) e.target.style.backgroundColor = 'transparent';
            }}
            aria-label="Toggle menu"
          >
            <Menu style={{ width: '20px', height: '20px', color: '#374151' }} />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <>
              {/* Backdrop to close menu when clicking outside */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 40
                }}
                onClick={() => setMenuOpen(false)}
              />
              
              {/* Menu Dropdown */}
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '8px',
                width: '224px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                padding: '4px 0',
                zIndex: 50
              }}>
                {/* Main App */}
                <button
                  onClick={() => {
                    onScreenChange('main');
                    setMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    border: 'none',
                    backgroundColor: currentScreen === 'main' ? '#f3f4f6' : 'transparent',
                    color: currentScreen === 'main' ? '#4338ca' : '#374151',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    textAlign: 'left',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (currentScreen !== 'main') e.target.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (currentScreen !== 'main') e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <Home style={{ width: '16px', height: '16px' }} />
                  <span>Main App</span>
                </button>

                {/* Admin Panel */}
                <button
                  onClick={() => {
                    onScreenChange('admin');
                    setMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    border: 'none',
                    backgroundColor: currentScreen === 'admin' ? '#f3f4f6' : 'transparent',
                    color: currentScreen === 'admin' ? '#4338ca' : '#374151',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    textAlign: 'left',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (currentScreen !== 'admin') e.target.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (currentScreen !== 'admin') e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <Shield style={{ width: '16px', height: '16px' }} />
                  <span>Admin Panel</span>
                </button>

                {/* Divider */}
                <div style={{
                  margin: '4px 0',
                  height: '1px',
                  backgroundColor: '#e5e7eb'
                }} />

                {/* Log out */}
                <button
                  onClick={() => {
                    onLogout();
                    setMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#dc2626',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    textAlign: 'left',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#fef2f2';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <LogOut style={{ width: '16px', height: '16px' }} />
                  <span>Log out</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
