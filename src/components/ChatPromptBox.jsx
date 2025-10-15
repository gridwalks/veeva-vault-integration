import { useState, useRef, useEffect } from 'react';

export default function ChatPromptBox({ 
  onSend, 
  placeholder = "How can I help?", 
  disabled = false,
  className = "",
  onFilesChange,
  clearFiles
}) {
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Notify parent when files change
  useEffect(() => {
    if (onFilesChange) {
      onFilesChange(selectedFiles);
    }
  }, [selectedFiles, onFilesChange]);

  // Expose clearFiles method to parent
  useEffect(() => {
    if (clearFiles) {
      clearFiles.current = () => {
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
    }
  }, [clearFiles]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!message.trim() && selectedFiles.length === 0) return;
    
    onSend({ 
      message: message.trim(), 
      files: selectedFiles 
    });
    
    // Reset form
    setMessage('');
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // Check file sizes (warn if > 5MB)
      const largeFiles = files.filter(file => file.size > 5 * 1024 * 1024); // 5MB limit
      if (largeFiles.length > 0) {
        const largeFileNames = largeFiles.map(f => f.name).join(', ');
        alert(`Warning: The following files are very large and may take longer to process:\n${largeFileNames}\n\nFiles over 5MB may still fail due to content complexity.`);
      }
      
      setSelectedFiles(prevFiles => [...prevFiles, ...files]);
    }
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const removeFile = (indexToRemove) => {
    setSelectedFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isEnabled = message.trim() || selectedFiles.length > 0;

  // Helper functions for file display
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'txt':
        return '📃';
      case 'csv':
        return '📊';
      default:
        return '📎';
    }
  };

  const getTotalSize = () => {
    return selectedFiles.reduce((total, file) => total + file.size, 0);
  };

  return (
    <div className={`${className}`}>
      {/* Main input container - ChatGPT style */}
      <div className="relative flex items-end gap-2 bg-white border border-gray-300 rounded-2xl shadow-sm hover:shadow-md transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
        {/* File attachment button */}
        <button
          type="button"
          onClick={triggerFileUpload}
          disabled={disabled}
          className="flex-shrink-0 p-2 m-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed rounded-full transition-colors"
          title="Attach file"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="w-full py-3 px-1 border-0 resize-none focus:outline-none disabled:bg-transparent disabled:text-gray-500 text-sm font-sans min-h-[24px] max-h-[200px] bg-transparent"
            rows={1}
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!isEnabled || disabled}
          className="flex-shrink-0 p-2 m-1 bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full transition-colors"
          title="Send message"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Selected files display */}
      {selectedFiles.length > 0 && (
        <div className="mt-2 space-y-2">
          {/* File count and total size header */}
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected ({formatFileSize(getTotalSize())})
            </span>
            {selectedFiles.length > 1 && (
              <button
                type="button"
                onClick={clearAllFiles}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear all files"
              >
                Clear all
              </button>
            )}
          </div>
          
          {/* Individual file list */}
          <div className="max-h-32 overflow-y-auto space-y-1">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="text-sm">{getFileIcon(file.name)}</span>
                <span className="text-xs text-gray-700 flex-1 truncate">
                  {file.name}
                </span>
                <span className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Remove file"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Helper text */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
