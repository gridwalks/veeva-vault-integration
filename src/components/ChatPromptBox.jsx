import { useState, useRef, useEffect } from 'react';

export default function ChatPromptBox({ 
  onSend, 
  placeholder = "How can I help?", 
  disabled = false,
  className = ""
}) {
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!message.trim() && !selectedFile) return;
    
    onSend({ 
      message: message.trim(), 
      file: selectedFile 
    });
    
    // Reset form
    setMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isEnabled = message.trim() || selectedFile;

  return (
    <div className={`bg-white rounded-2xl shadow-md border border-gray-200 p-3 sm:p-4 ${className}`}>
      {/* Main input row */}
      <div className="flex items-end gap-3">
        {/* File attachment button */}
        <button
          type="button"
          onClick={triggerFileUpload}
          disabled={disabled}
          className="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full grid place-items-center text-gray-600 hover:text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Attach file"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 text-[14px] sm:text-[15px] font-sans min-h-[52px] max-h-[200px]"
            rows={1}
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!isEnabled || disabled}
          className="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors"
          title="Send message"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Selected file display */}
      {selectedFile && (
        <div className="mt-3 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs sm:text-sm text-gray-700 flex-1 truncate">
            {selectedFile.name}
          </span>
          <button
            type="button"
            onClick={removeFile}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Remove file"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Helper text */}
      <div className="mt-3 text-xs sm:text-sm text-gray-500 text-center">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
