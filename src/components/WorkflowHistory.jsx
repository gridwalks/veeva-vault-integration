import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { getWorkflowInstances, refineWorkflowDocument, updateWorkflowVisibility, resumeWorkflow } from '../api';
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
    status: 'completed',
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
        }, '*');
      }
      
      alert('Workflow resumed! Switching to chat...');
      
      // Reload instances to reflect the status change
      await loadInstances();
      
    } catch (error) {
      console.error('Error resuming workflow:', error);
      alert(error.message || 'Failed to resume workflow. It may have expired.');
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
      status: 'completed',
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
    <div style={{
      padding: '24px',
      height: '100%',
      overflow: 'auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <button
          onClick={loadInstances}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#9ca3af' : '#4338ca',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          {loading ? 'Refreshing...' : <><img src="/share-icon.png" alt="Refresh" style={{ width: '16px', height: '16px', marginRight: '8px' }} />Refresh</>}
        </button>
      </div>

      {/* View Mode Toggle */}
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#f0f9ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#1e40af',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            View:
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { value: 'my_workflows', label: 'My Workflows' },
              { value: 'public', label: 'Public Workflows' },
              ...(isAdmin ? [{ value: 'all', label: 'All Workflows' }] : [])
            ].map(mode => (
              <button
                key={mode.value}
                onClick={() => setViewMode(mode.value)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: viewMode === mode.value ? '#1e40af' : '#ffffff',
                  color: viewMode === mode.value ? '#ffffff' : '#1e40af',
                  border: '1px solid #1e40af',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'all 0.2s ease'
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '8px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Workflow Type
            </label>
            <select
              value={filters.workflowType}
              onChange={(e) => setFilters(prev => ({ ...prev, workflowType: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              <option value="all">All Types</option>
              {getUniqueWorkflowTypes().map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="paused">Paused</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              From Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              To Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            value={filters.searchText}
            onChange={(e) => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
            placeholder="Search in responses and documents..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '13px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          />
          <button
            onClick={clearFilters}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b7280',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            Clear Filters
          </button>
        </div>

        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Showing {filteredInstances.length} of {instances.length} workflow{instances.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Instances List */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/loading-icon.png" alt="Loading" style={{ width: '48px', height: '48px' }} />
          </div>
          <div style={{ fontSize: '14px' }}>Loading workflow history...</div>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ 
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <img src="/copy-icon.png" alt="Copy" style={{ width: '48px', height: '48px' }} />
          </div>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>
            {instances.length === 0 ? 'No workflow history yet' : 'No workflows match your filters'}
          </div>
          {instances.length > 0 && (
            <button
              onClick={clearFilters}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#4338ca',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {paginatedInstances.map((instance) => (
              <div key={instance.id} style={{
                padding: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '6px',
                      flexWrap: 'wrap'
                    }}>
                      <h4 style={{
                        margin: 0,
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>
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
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          🌐 Public
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '6px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      {formatDate(instance.completedAt || instance.createdAt)} • ID: {instance.id} • Created by: {instance.createdByUserName || 'Unknown User'}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#4b5563',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
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
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Resume Workflow
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                Previous
              </button>
              <span style={{
                fontSize: '13px',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {instance.workflowName || 'Workflow Document Editor'}
              </h3>
              <div style={{
                fontSize: '13px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    resize: 'vertical'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Document Version History
              </h4>
              
              {documentVersions.length === 0 ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Version {version.version} - {version.type.replace('_', ' ').toUpperCase()}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Instructions: {version.instructions}
                        </div>
                      )}
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

