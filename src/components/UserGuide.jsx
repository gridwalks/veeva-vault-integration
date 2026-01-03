import React, { useState } from 'react';
import { 
  HelpCircle, 
  MessageSquare, 
  FileText, 
  Workflow, 
  BookOpen, 
  Eye, 
  Home, 
  User, 
  Shield, 
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Navigation,
  Search,
  Download,
  Upload,
  Settings
} from 'lucide-react';

export default function UserGuide() {
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    gettingStarted: false,
    features: false,
    navigation: false,
    commonTasks: false,
    tips: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-60px)] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-full bg-indigo-700 flex items-center justify-center text-white text-xl font-semibold">
            <HelpCircle style={{ width: '24px', height: '24px' }} />
          </div>
          <div>
            <h1 className="m-0 text-2xl font-semibold text-gray-700">
              User Guide
            </h1>
            <p className="m-0 text-sm text-gray-500">
              Learn how to use the application
            </p>
          </div>
        </div>

        {/* Application Overview */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <button
            onClick={() => toggleSection('overview')}
            className="w-full flex items-center justify-between text-left border-none bg-transparent cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700">
                <HelpCircle style={{ width: '20px', height: '20px' }} />
              </div>
              <h2 className="m-0 text-xl font-semibold text-gray-700">
                What is this application?
              </h2>
            </div>
            {expandedSections.overview ? (
              <ChevronDown style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            ) : (
              <ChevronRight style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            )}
          </button>
          
          {expandedSections.overview && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-gray-700 leading-relaxed mb-4">
                This is an <strong>AI-enabled learning assistant</strong> designed specifically for <strong>Quality Assurance GxP professionals</strong>. 
                The application helps you master regulatory compliance, quality assurance practices, and pharmaceutical industry standards 
                through intelligent document interaction, guided learning, and workflow automation.
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                As your learning assistant, the application helps you:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4 ml-4">
                <li>Learn from regulatory documents and quality standards using AI-powered chat</li>
                <li>Understand GxP compliance requirements through interactive document exploration</li>
                <li>Create quality documents (CAPAs, deviations, etc.) with guided workflows</li>
                <li>Compare and analyze documents to identify compliance requirements</li>
                <li>Access comprehensive educational courses and learning paths</li>
                <li>Track your learning progress and review your study history</li>
                <li>Get personalized assistance for quality assurance questions</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                All features are secured with authentication, ensuring your data and learning progress remain protected.
              </p>
            </div>
          )}
        </div>

        {/* Getting Started */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <button
            onClick={() => toggleSection('gettingStarted')}
            className="w-full flex items-center justify-between text-left border-none bg-transparent cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                <Navigation style={{ width: '20px', height: '20px' }} />
              </div>
              <h2 className="m-0 text-xl font-semibold text-gray-700">
                Getting Started
              </h2>
            </div>
            {expandedSections.gettingStarted ? (
              <ChevronDown style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            ) : (
              <ChevronRight style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            )}
          </button>
          
          {expandedSections.gettingStarted && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">1. Authentication</h3>
                  <p className="text-gray-700 leading-relaxed">
                    When you first access the application, you'll be prompted to log in using the secure authentication system. 
                    Once authenticated, you'll have access to all features based on your user role.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">2. Main Interface</h3>
                  <p className="text-gray-700 leading-relaxed">
                    The main screen is divided into two resizable panels:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-2">
                    <li><strong>Left Panel:</strong> Chat interface where you interact with AI and documents</li>
                    <li><strong>Right Panel:</strong> Document viewer for viewing and comparing documents</li>
                  </ul>
                  <p className="text-gray-700 leading-relaxed mt-2">
                    You can drag the divider between panels to adjust their sizes. Your preference is saved automatically.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">3. First Steps</h3>
                  <ol className="list-decimal list-inside text-gray-700 space-y-2 ml-4">
                    <li>Start by asking a question about GxP compliance or quality assurance in the chat interface</li>
                    <li>Select documents from the document viewer to focus your learning on specific topics</li>
                    <li>Explore the Learning Platform to access courses and structured learning paths</li>
                    <li>Check out "My Notebook" to review your learning history and past conversations</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Core Features */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <button
            onClick={() => toggleSection('features')}
            className="w-full flex items-center justify-between text-left border-none bg-transparent cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                <Settings style={{ width: '20px', height: '20px' }} />
              </div>
              <h2 className="m-0 text-xl font-semibold text-gray-700">
                Core Features
              </h2>
            </div>
            {expandedSections.features ? (
              <ChevronDown style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            ) : (
              <ChevronRight style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            )}
          </button>
          
          {expandedSections.features && (
            <div className="mt-6 pt-6 border-t border-gray-200 space-y-6">
              {/* Document Chat */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare style={{ width: '18px', height: '18px', color: '#4338ca' }} />
                  <h3 className="text-lg font-semibold text-gray-700">Document Chat</h3>
                </div>
                <p className="text-gray-700 leading-relaxed mb-2">
                  Learn from your indexed documents using AI-powered assistance. The system uses semantic search 
                  to find relevant document sections and provides educational, context-aware answers to help you 
                  understand GxP compliance and quality assurance principles.
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Ask questions about regulatory documents and quality standards in natural language</li>
                  <li>Select specific documents to focus your learning on particular topics</li>
                  <li>Get educational answers based on both AI-generated and manual summaries</li>
                  <li>View referenced document sections to understand the source material</li>
                  <li>Learn through Socratic questioning or direct answers based on your preference</li>
                  <li>Provide feedback with thumbs up/down buttons to improve your learning experience</li>
                </ul>
              </div>

              {/* Document Indexing */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText style={{ width: '18px', height: '18px', color: '#4338ca' }} />
                  <h3 className="text-lg font-semibold text-gray-700">Document Indexing</h3>
                </div>
                <p className="text-gray-700 leading-relaxed mb-2">
                  Regulatory and quality documents are indexed with AI-generated summaries and stored for fast retrieval. 
                  The system creates semantic embeddings for intelligent search, making it easy to find and learn from 
                  relevant GxP compliance materials.
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Documents are automatically summarized using AI to highlight key learning points</li>
                  <li>Manual summaries can be added or edited to enhance your understanding</li>
                  <li>Documents are chunked for semantic search (RAG) to find relevant sections</li>
                  <li>Search by document name with pagination support</li>
                  <li>View document metadata, versions, and summaries to understand context</li>
                </ul>
              </div>

              {/* Workflow Management */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Workflow style={{ width: '18px', height: '18px', color: '#4338ca' }} />
                  <h3 className="text-lg font-semibold text-gray-700">Workflow Management</h3>
                </div>
                <p className="text-gray-700 leading-relaxed mb-2">
                  Create structured documents (CAPAs, deviations, etc.) through guided step-by-step workflows. 
                  The AI detects when you want to create a document and guides you through the process.
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>AI automatically detects workflow triggers in chat (e.g., "create a CAPA")</li>
                  <li>Step-by-step guided questions with validation</li>
                  <li>Support for various input types (text, dropdown, date, file upload, etc.)</li>
                  <li>AI-powered document generation and polishing</li>
                  <li>Version history for all document edits</li>
                  <li>Resume or view past workflows from My Notebook</li>
                </ul>
              </div>

              {/* My Notebook */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen style={{ width: '18px', height: '18px', color: '#4338ca' }} />
                  <h3 className="text-lg font-semibold text-gray-700">My Notebook</h3>
                </div>
                <p className="text-gray-700 leading-relaxed mb-2">
                  Access your personal workspace with chat history and workflow history. All your past 
                  conversations and created documents are saved here.
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>View all your chat sessions with search and filter options</li>
                  <li>Reload previous chat sessions to continue conversations</li>
                  <li>Browse workflow history with detailed views</li>
                  <li>Resume suspended workflows</li>
                  <li>Download generated documents</li>
                </ul>
              </div>

              {/* Document Viewer */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Eye style={{ width: '18px', height: '18px', color: '#4338ca' }} />
                  <h3 className="text-lg font-semibold text-gray-700">Document Viewer</h3>
                </div>
                <p className="text-gray-700 leading-relaxed mb-2">
                  View, compare, and interact with documents in the right panel. Supports multiple document 
                  types including PDFs, Word documents, and other file formats.
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>View selected documents side-by-side</li>
                  <li>Compare documents with AI assistance</li>
                  <li>Download documents directly</li>
                  <li>View document metadata and summaries</li>
                  <li>Navigate through document versions</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Guide */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <button
            onClick={() => toggleSection('navigation')}
            className="w-full flex items-center justify-between text-left border-none bg-transparent cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700">
                <Navigation style={{ width: '20px', height: '20px' }} />
              </div>
              <h2 className="m-0 text-xl font-semibold text-gray-700">
                Navigation Guide
              </h2>
            </div>
            {expandedSections.navigation ? (
              <ChevronDown style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            ) : (
              <ChevronRight style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            )}
          </button>
          
          {expandedSections.navigation && (
            <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Home style={{ width: '16px', height: '16px', color: '#4338ca' }} />
                  <h3 className="text-base font-semibold text-gray-700">Main App</h3>
                </div>
                <p className="text-gray-700 text-sm ml-6">
                  Returns to the main chat interface with document viewer. This is your primary workspace.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <User style={{ width: '16px', height: '16px', color: '#4338ca' }} />
                  <h3 className="text-base font-semibold text-gray-700">Profile</h3>
                </div>
                <p className="text-gray-700 text-sm ml-6">
                  View and edit your user profile, including name, profile picture, and change your password.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield style={{ width: '16px', height: '16px', color: '#4338ca' }} />
                  <h3 className="text-base font-semibold text-gray-700">Admin Panel</h3>
                </div>
                <p className="text-gray-700 text-sm ml-6">
                  <strong>Admin only.</strong> Access administrative features including document management, 
                  workflow templates, Q&A management, indexing logs, and system settings.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap style={{ width: '16px', height: '16px', color: '#4338ca' }} />
                  <h3 className="text-base font-semibold text-gray-700">Learning Platform</h3>
                </div>
                <p className="text-gray-700 text-sm ml-6">
                  Access the educational platform with courses, learning paths, assessments, and study notes 
                  for GxP compliance training.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen style={{ width: '16px', height: '16px', color: '#4338ca' }} />
                  <h3 className="text-base font-semibold text-gray-700">My Notebook</h3>
                </div>
                <p className="text-gray-700 text-sm ml-6">
                  Opens a modal with tabs for Chat History and Workflow History. Access all your past 
                  conversations and created documents.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Common Tasks */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <button
            onClick={() => toggleSection('commonTasks')}
            className="w-full flex items-center justify-between text-left border-none bg-transparent cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-700">
                <Search style={{ width: '20px', height: '20px' }} />
              </div>
              <h2 className="m-0 text-xl font-semibold text-gray-700">
                Common Tasks
              </h2>
            </div>
            {expandedSections.commonTasks ? (
              <ChevronDown style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            ) : (
              <ChevronRight style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            )}
          </button>
          
          {expandedSections.commonTasks && (
            <div className="mt-6 pt-6 border-t border-gray-200 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Starting a Chat Session</h3>
                <ol className="list-decimal list-inside text-gray-700 space-y-2 ml-4">
                  <li>Type your question in the chat input box at the bottom of the left panel</li>
                  <li>Press Enter or click the send button</li>
                  <li>The AI will search through indexed documents and provide an answer</li>
                  <li>View referenced document sections that appear in the chat</li>
                  <li>Continue the conversation with follow-up questions</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Selecting Documents</h3>
                <ol className="list-decimal list-inside text-gray-700 space-y-2 ml-4">
                  <li>Use the document search in the right panel to find documents</li>
                  <li>Click on a document to view it in the document viewer</li>
                  <li>Select documents to focus your chat queries on specific documents</li>
                  <li>Selected documents will be highlighted and used for context in chat</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Creating a Workflow Document</h3>
                <ol className="list-decimal list-inside text-gray-700 space-y-2 ml-4">
                  <li>In the chat, mention that you want to create a document (e.g., "I need to create a CAPA")</li>
                  <li>The AI will detect the workflow trigger and offer to start the workflow</li>
                  <li>Type "yes" or "start workflow" to begin</li>
                  <li>Answer the guided questions step by step</li>
                  <li>Review the generated document</li>
                  <li>Use AI polishing to improve the document quality</li>
                  <li>Download or save the final document</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Viewing Documents</h3>
                <ol className="list-decimal list-inside text-gray-700 space-y-2 ml-4">
                  <li>Navigate to the document viewer in the right panel</li>
                  <li>Search for documents by name</li>
                  <li>Click on a document to view its content</li>
                  <li>View document metadata, summaries, and versions</li>
                  <li>Download documents using the download button</li>
                  <li>Compare multiple documents side-by-side</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Accessing History</h3>
                <ol className="list-decimal list-inside text-gray-700 space-y-2 ml-4">
                  <li>Click on "My Notebook" in the header menu</li>
                  <li>Switch between "Chat History" and "Workflow History" tabs</li>
                  <li>Search and filter your history</li>
                  <li>Click on a chat session to reload it</li>
                  <li>Click on a workflow to view details or resume it</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Tips & Best Practices */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <button
            onClick={() => toggleSection('tips')}
            className="w-full flex items-center justify-between text-left border-none bg-transparent cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700">
                <Lightbulb style={{ width: '20px', height: '20px' }} />
              </div>
              <h2 className="m-0 text-xl font-semibold text-gray-700">
                Tips & Best Practices
              </h2>
            </div>
            {expandedSections.tips ? (
              <ChevronDown style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            ) : (
              <ChevronRight style={{ width: '20px', height: '20px', color: '#6b7280' }} />
            )}
          </button>
          
          {expandedSections.tips && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">💡 Effective Chat Queries</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                    <li>Be specific in your questions for better results</li>
                    <li>Select relevant documents before asking questions to focus the context</li>
                    <li>Use follow-up questions to dive deeper into topics</li>
                    <li>Provide feedback with thumbs up/down to help improve responses</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">📚 Document Management</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                    <li>Documents must be indexed before they can be used in chat</li>
                    <li>Manual summaries complement AI summaries for better context</li>
                    <li>Use the search function to quickly find documents by name</li>
                    <li>Check document versions to ensure you're viewing the latest content</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">⚙️ Workflow Tips</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                    <li>Save your progress frequently - you can pause workflows and resume later</li>
                    <li>Use AI polishing to improve document quality and professionalism</li>
                    <li>Review generated documents carefully before finalizing</li>
                    <li>Access workflow history to view or download past documents</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">🎯 Productivity Shortcuts</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                    <li>Adjust panel sizes by dragging the divider - your preference is saved</li>
                    <li>Use keyboard shortcuts where available (ESC to close modals)</li>
                    <li>Access My Notebook quickly from the header menu</li>
                    <li>Bookmark frequently used documents for quick access</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">🔒 Security & Privacy</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                    <li>All data is secured with authentication</li>
                    <li>Your chat sessions and workflows are private to your account</li>
                    <li>Admin features are restricted to users with admin role</li>
                    <li>Documents are accessed through secure serverless proxies</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-6">
          <p className="text-sm text-indigo-800 m-0">
            <strong>Need more help?</strong> If you have questions or encounter issues, contact your system 
            administrator or refer to the system documentation for technical details.
          </p>
        </div>
      </div>
    </div>
  );
}

