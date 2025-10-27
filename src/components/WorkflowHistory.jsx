import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { getWorkflowInstances, refineWorkflowDocument, updateWorkflowVisibility, resumeWorkflow, deleteWorkflow } from '../api';
import { useAdminRole } from '../hooks/useAdminRole';

export default function WorkflowHistory() {
  const { user } = useAuth0();
  const { isAdmin } = useAdminRole();
  const [instances, setInstances] = useState([]);
  const [filteredInstances, setFilteredInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // New state for user-specific and public workflows
  const [viewMode, setViewMode] = useState('my_workflows'); // 'my_workflows', 'public', 'all'
  
  // Filter state
  const [filters, setFilters] = useState({
    workflowType: 'all',
    status: 'all',
    searchText: '',
    startDate: '',
    endDate: ''
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Load workflow instances on mount and when viewMode changes
  useEffect(() => {
    loadInstances();
  }, [viewMode]);

  // Apply filters whenever instances or filter state changes
  useEffect(() => {
    applyFilters();
  }, [instances, filters]);

  const handleToggleVisibility = async (instanceId, currentIsPublic) => {
    try {
      if (!user) {
        alert('User not authenticated');
        return;
      }
      
      await updateWorkflowVisibility({
        instanceId,
        isPublic: !currentIsPublic,
        userId: user.sub, // Auth0 user ID
        isAdmin: isAdmin
      });
      
      // Reload instances to reflect the change
      await loadInstances();
      alert(`Workflow ${!currentIsPublic ? 'made public' : 'made private'} successfully!`);
    } catch (error) {
      console.error('Error toggling workflow visibility:', error);
      alert('Failed to update workflow visibility. Please try again.');
    }
  };

  const handleResumeWorkflow = async (instanceId) => {
    try {
      if (!user) {
        alert('User not authenticated');
        return;
      }
      
      // Call the resume API
      const data = await resumeWorkflow({
        instanceId,
        userId: user.sub
      });
      
      // Navigate to main chat screen and trigger resume
      // This will need to communicate with the parent component
      if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({
          type: 'RESUME_WORKFLOW',
          instanceId: instanceId,
          workflowData: data
        }, window.location.origin);
      }
      
      alert('Workflow resumed! Switching to chat...');
      
      // Close the My Notebook modal by sending a close message
      if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({
          type: 'CLOSE_MY_NOTEBOOK'
        }, window.location.origin);
      }
      
      // Reload instances to reflect the status change
      await loadInstances();
      
    } catch (error) {
      console.error('Error resuming workflow:', error);
      alert(error.message || 'Failed to resume workflow. It may have expired.');
    }
  };

  const handleDeleteWorkflow = async (instanceId, workflowName) => {
    try {
      if (!user) {
        alert('User not authenticated');
        return;
      }
      
      // Confirm deletion
      const confirmed = window.confirm(
        `Are you sure you want to delete the workflow "${workflowName}"?\n\nThis action cannot be undone.`
      );
      
      if (!confirmed) {
        return;
      }
      
      // Call the delete API
      await deleteWorkflow({
        instanceId,
        userId: user.sub
      });
      
      alert('Workflow deleted successfully!');
      
      // Reload instances to reflect the deletion
      await loadInstances();
      
    } catch (error) {
      console.error('Error deleting workflow:', error);
      alert(error.message || 'Failed to delete workflow. Please try again.');
    }
  };

  const loadInstances = async () => {
    setLoading(true);
    try {
      if (!user) {
        console.log('No user data available');
        return;
      }
      
      const data = await getWorkflowInstances({ 
        status: filters.status === 'all' ? undefined : filters.status,
        limit: 500, // Get more for client-side filtering
        userId: user.sub, // Auth0 user ID
        viewMode: viewMode,
        isAdmin: isAdmin
      });
      
      if (data.success && data.instances) {
        setInstances(data.instances);
      }
    } catch (error) {
      console.error('Error loading workflow instances:', error);
      alert('Failed to load workflow history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...instances];

    // Filter by workflow type
    if (filters.workflowType !== 'all') {
      filtered = filtered.filter(inst => inst.workflowName === filters.workflowType);
    }

    // Filter by status
    if (filters.status !== 'all') {
      filtered = filtered.filter(inst => inst.status === filters.status);
    }

    // Filter by date range
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filtered = filtered.filter(inst => new Date(inst.completedAt || inst.createdAt) >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // End of day
      filtered = filtered.filter(inst => new Date(inst.completedAt || inst.createdAt) <= endDate);
    }

    // Search in responses
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(inst => {
        const responsesString = JSON.stringify(inst.responses || {}).toLowerCase();
        const workflowName = (inst.workflowName || '').toLowerCase();
        const generatedDoc = (inst.generatedDocument || '').toLowerCase();
        
        return workflowName.includes(searchLower) || 
               responsesString.includes(searchLower) ||
               generatedDoc.includes(searchLower);
      });
    }

    setFilteredInstances(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      workflowType: 'all',
      status: 'all',
      searchText: '',
      startDate: '',
      endDate: ''
    });
  };

  const getUniqueWorkflowTypes = () => {
    const types = new Set(instances.map(inst => inst.workflowName).filter(Boolean));
    return Array.from(types).sort();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? 'Just now' : `${diffMins} minutes ago`;
      }
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getPreviewText = (instance) => {
    if (!instance.responses) return 'No responses';
    
    // Try to find a title or first meaningful response
    const responses = instance.responses;
    
    // Look for common title fields
    const titleKeys = ['step_2', 'title', 'name', 'subject'];
    for (const key of titleKeys) {
      if (responses[key]) {
        return responses[key].substring(0, 60) + (responses[key].length > 60 ? '...' : '');
      }
    }
    
    // Fall back to first response
    const firstKey = Object.keys(responses).find(key => key.startsWith('step_'));
    if (firstKey && responses[firstKey]) {
      return responses[firstKey].substring(0, 60) + (responses[firstKey].length > 60 ? '...' : '');
    }
    
    return 'No preview available';
  };

  const handleViewDetails = (instance) => {
    setSelectedInstance(instance);
    setShowDetailModal(true);
  };

  const handleDownload = (instance) => {
    const content = instance.generatedDocument || 'No document generated';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${instance.workflowName}-${instance.id}-${new Date(instance.completedAt || instance.createdAt).toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  };

  // Pagination
  const totalPages = Math.ceil(filteredInstances.length / itemsPerPage);
  const paginatedInstances = filteredInstances.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-end items-center mb-6">
        <button
          onClick={loadInstances}
          disabled={loading}
          className={`px-4 py-2 ${loading ? 'bg-gray-400' : 'bg-indigo-700'} text-white border-none rounded-md text-sm font-medium ${loading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {loading ? 'Refreshing...' : <><img src="/share-icon.png" alt="Refresh" className="w-4 h-4 mr-2 inline" />Refresh</>}
        </button>
      </div>

      {/* View Mode Toggle */}
      <div className="mb-4 py-3 px-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-blue-800">
            View:
          </span>
          <div className="flex gap-2">
            {[
              { value: 'my_workflows', label: 'My Workflows' },
              { value: 'public', label: 'Public Workflows' },
              ...(isAdmin ? [{ value: 'all', label: 'All Workflows' }] : [])
            ].map(mode => (
              <button
                key={mode.value}
                onClick={() => setViewMode(mode.value)}
                className={`py-1.5 px-3 ${viewMode === mode.value ? 'bg-blue-900 text-white' : 'bg-white text-blue-900'} border border-blue-900 rounded-md text-xs font-medium cursor-pointer transition-all`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 p-4 bg-slate-50 border border-gray-200 rounded-lg">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 mb-3">
          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">
              Workflow Type
            </label>
            <select
              value={filters.workflowType}
              onChange={(e) => setFilters(prev => ({ ...prev, workflowType: e.target.value }))}
              className="w-full py-1.5 px-2.5 border border-gray-300 rounded text-xs"
            >
              <option value="all">All Types</option>
              {getUniqueWorkflowTypes().map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full py-1.5 px-2.5 border border-gray-300 rounded text-xs"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="paused">Paused</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">
              From Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full py-1.5 px-2.5 border border-gray-300 rounded text-xs"
            />
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium text-gray-700">
              To Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full py-1.5 px-2.5 border border-gray-300 rounded text-xs"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={filters.searchText}
            onChange={(e) => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
            placeholder="Search in responses and documents..."
            className="flex-1 py-2 px-3 border border-gray-300 rounded text-xs"
          />
          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-500 text-white border-none rounded text-xs font-medium cursor-pointer"
          >
            Clear Filters
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Showing {filteredInstances.length} of {instances.length} workflow{instances.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Instances List */}
      {loading ? (
        <div className="text-center py-15 text-gray-500">
          <div className="mb-4 flex justify-center items-center">
            <img src="/loading-icon.png" alt="Loading" className="w-12 h-12" />
          </div>
          <div className="text-sm">Loading workflow history...</div>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="text-center py-15 text-gray-500 flex flex-col items-center justify-center">
          <div className="mb-4 flex justify-center items-center">
            <img src="/copy-icon.png" alt="Copy" className="w-12 h-12" />
          </div>
          <div className="text-sm mb-2">
            {instances.length === 0 ? 'No workflow history yet' : 'No workflows match your filters'}
          </div>
          {instances.length > 0 && (
            <button
              onClick={clearFilters}
              className="mt-3 px-4 py-2 bg-indigo-700 text-white border-none rounded-md text-xs font-medium cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {paginatedInstances.map((instance) => (
              <div key={instance.id} className="p-4 bg-slate-50 border border-gray-200 rounded-lg transition-all">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h4 className="m-0 text-[15px] font-semibold text-gray-700">
                        {instance.workflowName || 'Unknown Workflow'}
                      </h4>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: instance.status === 'completed' ? '#dcfce7' : 
                                       instance.status === 'in_progress' ? '#fef3c7' : '#fee2e2',
                        color: instance.status === 'completed' ? '#166534' : 
                               instance.status === 'in_progress' ? '#92400e' : '#991b1b',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500',
                      }}>
                        {instance.status === 'completed' ? '✅ Completed' : 
                         instance.status === 'in_progress' ? 
                         <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <img src="/loading-icon.png" alt="In Progress" style={{ width: '12px', height: '12px', marginRight: '4px' }} />
                           In Progress
                         </span> : '❌ Abandoned'}
                      </span>
                      {instance.isPublic && (
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: '#e0f2fe',
                          color: '#0369a1',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}>
                          🌐 Public
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '6px',
                    }}>
                      {formatDate(instance.completedAt || instance.createdAt)} • ID: {instance.id} • Created by: {instance.createdByUserName || 'Unknown User'}
                    </div>
                    <div className="text-sm text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap">
                      {getPreviewText(instance)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleViewDetails(instance)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handleDownload(instance)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Download
                    </button>
                    {/* Show visibility toggle only for workflow owners or admins */}
                    {(instance.userId === user?.sub || isAdmin) && (
                      <button
                        onClick={() => handleToggleVisibility(instance.id, instance.isPublic)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: instance.isPublic ? '#dc2626' : '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {instance.isPublic ? 'Make Private' : 'Make Public'}
                      </button>
                    )}
                    {/* Show Resume button for paused and in-progress workflows */}
                    {(instance.status === 'paused' || instance.status === 'in_progress') && (
                      <button
                        onClick={() => handleResumeWorkflow(instance.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Resume Workflow
                      </button>
                    )}
                    {/* Show Delete button for workflow owners or admins */}
                    {(instance.userId === user?.sub || isAdmin) && (
                      <button
                        onClick={() => handleDeleteWorkflow(instance.id, instance.workflowName)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              marginTop: '24px'
            }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === 1 ? '#e5e7eb' : '#4338ca',
                  color: currentPage === 1 ? '#9ca3af' : '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span style={{
                fontSize: '13px',
                color: '#374151',
              }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#4338ca',
                  color: currentPage === totalPages ? '#9ca3af' : '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedInstance && (
        <WorkflowDetailModal
          instance={selectedInstance}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedInstance(null);
          }}
          onDownload={handleDownload}
          onCopyToClipboard={handleCopyToClipboard}
        />
      )}
    </div>
  );
}

// Workflow Detail Modal Component
function WorkflowDetailModal({ instance, onClose, onDownload, onCopyToClipboard }) {
  const [activeTab, setActiveTab] = useState('edit');
  const [editedDocument, setEditedDocument] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [documentVersions, setDocumentVersions] = useState([]);

  // Initialize document content and versions
  useEffect(() => {
    if (instance) {
      console.log('Initializing document for instance:', instance.id, {
        hasDocumentVersions: !!instance.documentVersions,
        versionsLength: instance.documentVersions?.length || 0,
        hasGeneratedDocument: !!instance.generatedDocument,
        generatedDocumentLength: instance.generatedDocument?.length || 0
      });
      
      // Get the latest version from documentVersions array, or fall back to generatedDocument
      const versions = instance.documentVersions || [];
      if (versions.length > 0) {
        const latestVersion = versions[versions.length - 1];
        console.log('Using latest version from documentVersions:', latestVersion);
        setEditedDocument(latestVersion.document || latestVersion.content || '');
        setCurrentVersion(latestVersion);
        setDocumentVersions(versions);
      } else if (instance.generatedDocument) {
        console.log('Using generatedDocument as fallback');
        setEditedDocument(instance.generatedDocument);
        setCurrentVersion({
          version: 1,
          document: instance.generatedDocument,
          timestamp: instance.completedAt || instance.createdAt,
          type: 'original'
        });
        setDocumentVersions([{
          version: 1,
          document: instance.generatedDocument,
          timestamp: instance.completedAt || instance.createdAt,
          type: 'original'
        }]);
      } else {
        // No document available
        console.log('No document available for this instance');
        setEditedDocument('');
        setCurrentVersion(null);
        setDocumentVersions([]);
      }
    }
  }, [instance]);

  const handleSaveChanges = async () => {
    try {
      // Create a new version entry for the user's direct edits
      const newVersion = {
        version: documentVersions.length + 1,
        document: editedDocument,
        timestamp: new Date().toISOString(),
        type: 'user_edit',
        instructions: null,
        userId: null
      };
      
      const updatedVersions = [...documentVersions, newVersion];
      
      // Update local state
      setDocumentVersions(updatedVersions);
      setCurrentVersion(newVersion);
      
      // Show success message
      alert('Document saved successfully! Your changes have been recorded in the version history.');
      
    } catch (error) {
      console.error('Error saving changes:', error);
      alert('Error saving changes. Please try again.');
    }
  };

  const handleSubmitToAI = async () => {
    if (!editInstructions.trim()) {
      alert('Please provide instructions for AI refinement');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await refineWorkflowDocument({
        instanceId: instance.id,
        currentDocument: editedDocument,
        instructions: editInstructions
      });
      
      // Update the document with the refined version
      setEditedDocument(result.refinedDocument);
      
      // Update version history
      setDocumentVersions(result.versions || []);
      setCurrentVersion(result.currentVersion);
      
      // Clear instructions
      setEditInstructions('');
      
      // Show success message
      alert('Document refined successfully! Check the version history to see the changes.');
      
    } catch (error) {
      console.error('Error submitting to AI:', error);
      alert(`Error refining document: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevertToOriginal = () => {
    if (currentVersion) {
      setEditedDocument(currentVersion.document || currentVersion.content || '');
      setEditInstructions('');
    }
  };

  const handleDownloadCurrent = () => {
    const blob = new Blob([editedDocument], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${instance.workflowName}-${instance.id}-edited-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          position: 'sticky',
          top: 0,
          backgroundColor: '#ffffff',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px',
          zIndex: 10
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px'
          }}>
            <div style={{ flex: 1 }}>
              <h3 style={{
                margin: '0 0 6px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#374151',
              }}>
                {instance.workflowName || 'Workflow Document Editor'}
              </h3>
              <div style={{
                fontSize: '13px',
                color: '#6b7280',
              }}>
                Completed: {new Date(instance.completedAt || instance.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })} • ID: {instance.id}
                {currentVersion && (
                  <span style={{ marginLeft: '12px', color: '#1e40af' }}>
                    • Version {currentVersion.version} ({currentVersion.type})
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: 'none',
                borderRadius: '4px',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          padding: '0 24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{
            display: 'flex',
            gap: '0'
          }}>
            {[
              { id: 'edit', label: 'Edit Document', icon: '✏️' },
              { id: 'ai', label: 'AI Refinement', icon: '🤖' },
              { id: 'history', label: 'Version History', icon: '📚' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 20px',
                  backgroundColor: activeTab === tab.id ? '#ffffff' : 'transparent',
                  color: activeTab === tab.id ? '#4338ca' : '#6b7280',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #4338ca' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                    fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'edit' && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <h4 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#374151',
                }}>
                  Document Editor
                </h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleRevertToOriginal}
                    disabled={!currentVersion}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: currentVersion ? 'pointer' : 'not-allowed',
                      opacity: currentVersion ? 1 : 0.5
                    }}
                  >
                    ↶ Revert
                  </button>
                  <button
                    onClick={handleDownloadCurrent}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    💾 Download
                  </button>
                </div>
              </div>
              
              {editedDocument ? (
                <textarea
                  value={editedDocument}
                  onChange={(e) => setEditedDocument(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '400px',
                    padding: '16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    lineHeight: '1.5',
                    resize: 'vertical',
                    backgroundColor: '#ffffff',
                    color: '#374151'
                  }}
                  placeholder="Edit your document here..."
                />
              ) : (
                <div style={{
                  width: '100%',
                  minHeight: '400px',
                  padding: '16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  lineHeight: '1.5',
                  backgroundColor: '#f8fafc',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                }}>
                  No document available for this workflow instance.
                </div>
              )}
              
              <div style={{
                marginTop: '16px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                <button
                  onClick={handleSaveChanges}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div>
              <h4 style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
              }}>
                AI Document Refinement
              </h4>
              
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px'
              }}>
                <div style={{
                  fontSize: '13px',
                  color: '#1e40af',
                }}>
                  <strong>Current Document:</strong> {editedDocument.length} characters
                  {editedDocument.length === 0 && (
                    <span style={{ color: '#dc2626', marginLeft: '8px' }}>
                      (No document content available)
                    </span>
                  )}
                </div>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}>
                  Instructions for AI Refinement:
                </label>
                <textarea
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  placeholder="Describe how you'd like the AI to improve the document. For example: 'Make the language more professional', 'Add more detail to the risk assessment section', 'Improve the formatting and structure'..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  fontSize: '13px',
                  resize: 'vertical',
                  }}
                />
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                <button
                  onClick={handleSubmitToAI}
                  disabled={isSubmitting || !editInstructions.trim()}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: (isSubmitting || !editInstructions.trim()) ? '#9ca3af' : '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: (isSubmitting || !editInstructions.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src="/loading-icon.png" alt="Processing" style={{ width: '16px', height: '16px', marginRight: '4px' }} />
                      Processing...
                    </span> : '🤖 Submit to AI'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h4 style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
              }}>
                Document Version History
              </h4>
              
              {documentVersions.length === 0 ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6b7280',
                }}>
                  No version history available
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {documentVersions.map((version, index) => {
                    if (!version) return null; // Skip null/undefined versions
                    
                    return (
                      <div
                        key={index}
                        style={{
                          padding: '16px',
                          backgroundColor: version === currentVersion ? '#f0f9ff' : '#f8fafc',
                          border: version === currentVersion ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setCurrentVersion(version);
                          setEditedDocument(version.document || version.content || '');
                        }}
                      >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px'
                      }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#374151',
                        }}>
                          Version {version.version} - {version.type.replace('_', ' ').toUpperCase()}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                        }}>
                          {new Date(version.timestamp).toLocaleString()}
                        </div>
                      </div>
                      {version.instructions && (
                        <div style={{
                          fontSize: '12px',
                          color: '#1e40af',
                          fontStyle: 'italic',
                          marginBottom: '8px',
                        }}>
                          Instructions: {version.instructions}
                        </div>
                      )}
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {(version.document || version.content || '').substring(0, 200)}...
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          position: 'sticky',
          bottom: 0,
          backgroundColor: '#ffffff',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: '#4338ca',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

