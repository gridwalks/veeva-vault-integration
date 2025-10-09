import { useState, useEffect } from 'react';
import { getWorkflowInstances } from '../api';

export default function WorkflowHistory() {
  const [instances, setInstances] = useState([]);
  const [filteredInstances, setFilteredInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
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

  // Load workflow instances on mount
  useEffect(() => {
    loadInstances();
  }, []);

  // Apply filters whenever instances or filter state changes
  useEffect(() => {
    applyFilters();
  }, [instances, filters]);

  const loadInstances = async () => {
    setLoading(true);
    try {
      const data = await getWorkflowInstances({ 
        status: filters.status === 'all' ? undefined : filters.status,
        limit: 500 // Get more for client-side filtering
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
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h3 style={{
          margin: '0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Workflow History
        </h3>
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
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '14px' }}>Loading workflow history...</div>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
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
                         instance.status === 'in_progress' ? '⏳ In Progress' : '❌ Abandoned'}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '6px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      {formatDate(instance.completedAt || instance.createdAt)} • ID: {instance.id}
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
  const [showAiVersion, setShowAiVersion] = useState(true);

  const responses = instance.responses || {};
  
  // Separate group output variables from step responses
  const groupOutputs = {};
  const stepResponses = {};
  
  Object.keys(responses).forEach(key => {
    if (key.startsWith('step_')) {
      stepResponses[key] = responses[key];
    } else {
      groupOutputs[key] = responses[key];
    }
  });

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
        maxWidth: '900px',
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
                {instance.workflowName || 'Workflow Details'}
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

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Responses Section */}
          <div style={{ marginBottom: '32px' }}>
            <h4 style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              📋 Responses
            </h4>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {/* Step Responses */}
              {Object.keys(stepResponses).sort().map((key) => (
                <div key={key} style={{
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    marginBottom: '4px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {key.replace('step_', 'Step ')}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {stepResponses[key]}
                  </div>
                </div>
              ))}

              {/* Group Synthesized Outputs */}
              {Object.keys(groupOutputs).length > 0 && (
                <>
                  <div style={{
                    borderTop: '2px solid #bfdbfe',
                    paddingTop: '16px',
                    marginTop: '8px'
                  }}>
                    <h5 style={{
                      margin: '0 0 12px 0',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#1e40af',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      🔗 AI Synthesized Sections
                    </h5>
                  </div>
                  
                  {Object.keys(groupOutputs).map((key) => (
                    <div key={key} style={{
                      padding: '16px',
                      backgroundColor: '#f0f9ff',
                      border: '2px solid #bfdbfe',
                      borderRadius: '8px'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#1e40af',
                        marginBottom: '8px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        ✨ {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: '#1e40af',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: '1.6'
                      }}>
                        {groupOutputs[key]}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Generated Document Section */}
          {instance.generatedDocument && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    📄 Generated Document
                  </h4>
                  {instance.documentVersions && instance.documentVersions.length > 1 && (
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: '#f0f9ff',
                      color: '#0369a1',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '500',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      {instance.documentVersions.length} versions
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onCopyToClipboard(instance.generatedDocument)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={() => onDownload(instance)}
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    💾 Download
                  </button>
                </div>
              </div>
              
              <div style={{
                padding: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#374151',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '400px',
                overflow: 'auto'
              }}>
                {instance.generatedDocument}
              </div>
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

