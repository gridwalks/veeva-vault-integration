import React, { useState } from 'react';
import { Menu, User, Shield, LogOut, Home, BookOpen, GraduationCap, HelpCircle } from 'lucide-react';
import acceleraqaLogo from '../../assets/AceleraQA_logo.png';
import MyNotebook from './MyNotebook.jsx';

export default function Header({ user, currentScreen, onScreenChange, onLogout, isAdmin, onMyNotebookOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 bg-slate-50 border-b border-gray-200 h-12">
      {/* Left Section - Logo and App Name */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <img 
          src={acceleraqaLogo} 
          alt="AcceleraQA Logo" 
          className="h-6 w-auto object-contain"
        />
        
        {/* Beta badge */}
        <span className="text-[10px] font-semibold text-gray-500 ml-2 uppercase tracking-wide">
          | Beta
        </span>
      </div>

      {/* Right Section - User Information and Menu */}
      {user && (
        <div className="relative flex items-center gap-4">
          {/* User Info */}
          <div className="flex items-center gap-2">
            {/* User Icon */}
            <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs text-white font-semibold">
              {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </div>
            
            {/* User Details */}
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-700 font-medium">
                {user.email}
              </span>
              <span className="text-[10px] text-gray-500">
                {isAdmin ? 'admin' : 'user'}
              </span>
            </div>
          </div>

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`p-2 rounded-md border-none ${menuOpen ? 'bg-gray-100' : 'bg-transparent'} cursor-pointer flex items-center justify-center transition-all hover:bg-gray-100`}
            aria-label="Toggle menu"
          >
            <Menu style={{ width: '20px', height: '20px', color: '#374151' }} />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <>
              {/* Backdrop to close menu when clicking outside */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              
              {/* Menu Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                {/* Main App */}
                <button
                  onClick={() => {
                    onScreenChange('main');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium cursor-pointer transition-colors hover:bg-gray-50 ${
                    currentScreen === 'main' ? 'bg-gray-100 text-indigo-700' : 'bg-transparent text-gray-700'
                  }`}
                >
                  <Home style={{ width: '16px', height: '16px' }} />
                  <span>Main App</span>
                </button>

                {/* Profile */}
                <button
                  onClick={() => {
                    onScreenChange('profile');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium cursor-pointer transition-colors hover:bg-gray-50 ${
                    currentScreen === 'profile' ? 'bg-gray-100 text-indigo-700' : 'bg-transparent text-gray-700'
                  }`}
                >
                  <User style={{ width: '16px', height: '16px' }} />
                  <span>Profile</span>
                </button>

                {/* Admin Panel - Only show for admin users */}
                {isAdmin && (
                  <button
                    onClick={() => {
                      onScreenChange('admin');
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium cursor-pointer transition-colors hover:bg-gray-50 ${
                      currentScreen === 'admin' ? 'bg-gray-100 text-indigo-700' : 'bg-transparent text-gray-700'
                    }`}
                  >
                    <Shield style={{ width: '16px', height: '16px' }} />
                    <span>Admin Panel</span>
                  </button>
                )}

                {/* Education Platform */}
                <button
                  onClick={() => {
                    onScreenChange('education');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium cursor-pointer transition-colors hover:bg-gray-50 ${
                    currentScreen === 'education' ? 'bg-gray-100 text-indigo-700' : 'bg-transparent text-gray-700'
                  }`}
                >
                  <GraduationCap style={{ width: '16px', height: '16px' }} />
                  <span>Learning Platform</span>
                </button>

                {/* My Notebook */}
                <button
                  onClick={() => {
                    onMyNotebookOpen && onMyNotebookOpen();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium text-gray-700 cursor-pointer transition-colors hover:bg-gray-50 bg-transparent"
                >
                  <BookOpen style={{ width: '16px', height: '16px' }} />
                  <span>My Notebook</span>
                </button>

                {/* User Guide */}
                <button
                  onClick={() => {
                    onScreenChange('guide');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium cursor-pointer transition-colors hover:bg-gray-50 ${
                    currentScreen === 'guide' ? 'bg-gray-100 text-indigo-700' : 'bg-transparent text-gray-700'
                  }`}
                >
                  <HelpCircle style={{ width: '16px', height: '16px' }} />
                  <span>User Guide</span>
                </button>

                {/* Divider */}
                <div className="my-1 h-px bg-gray-200" />

                {/* Log out */}
                <button
                  onClick={() => {
                    onLogout();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 py-3 px-4 border-none text-left text-sm font-medium text-red-600 cursor-pointer transition-colors hover:bg-red-50 bg-transparent"
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
