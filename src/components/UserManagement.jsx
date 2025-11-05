import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createUserWithInvite, listUsers, updateUserStatus, updateUserRoles, sendPasswordReset } from '../api.js';
import { UserPlus, Mail, User, CheckCircle, XCircle, Shield, ShieldOff, Lock, Search, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

export default function UserManagement() {
  const { getAccessTokenSilently } = useAuth0();
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'create'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [warning, setWarning] = useState(null);
  
  // User list state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 0, per_page: 50 });
  const [actionLoading, setActionLoading] = useState({}); // Track loading state per user action

  // Create user form state
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    connection: 'Username-Password-Authentication'
  });

  // Load users on mount and when search/page changes
  useEffect(() => {
    if (activeTab === 'list') {
      loadUsers();
    }
  }, [activeTab, currentPage, searchQuery]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenSilently();
      const result = await listUsers({
        limit: pagination.per_page,
        page: currentPage,
        search: searchQuery,
        accessToken
      });

      if (result.success) {
        setUsers(result.users || []);
        setPagination(result.pagination || { total: 0, total_pages: 0, per_page: 50 });
      } else {
        setError(result.error || 'Failed to load users');
      }
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear errors when user starts typing
    if (error) setError(null);
    if (success) setSuccess(null);
    if (warning) setWarning(null);
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setWarning(null);

    // Validate email
    if (!formData.email) {
      setError('Email is required');
      setLoading(false);
      return;
    }

    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      // Get the access token
      const accessToken = await getAccessTokenSilently();
      
      const result = await createUserWithInvite({
        email: formData.email,
        name: formData.name || undefined,
        connection: formData.connection,
        accessToken: accessToken
      });

      if (result.success) {
        if (result.warning) {
          setWarning(result.warning + (result.emailError ? ` Error: ${result.emailError}` : ''));
        } else {
          setSuccess(`User created successfully! Invitation email sent to ${formData.email}`);
        }
        
        // Reset form
        setFormData({
          email: '',
          name: '',
          connection: 'Username-Password-Authentication'
        });

        // Refresh user list if on list tab
        if (activeTab === 'list') {
          loadUsers();
        }
      } else {
        // Show error with helpful message if available
        const errorMsg = result.error || 'Failed to create user';
        const helpfulMsg = result.helpfulMessage;
        setError(helpfulMsg ? `${errorMsg}. ${helpfulMsg}` : errorMsg);
      }
    } catch (err) {
      console.error('Error creating user:', err);
      const errorMsg = err.message || 'Failed to create user';
      const helpfulMsg = err.helpfulMessage || (err.response && err.response.helpfulMessage);
      setError(helpfulMsg ? `${errorMsg}. ${helpfulMsg}` : errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      email: '',
      name: '',
      connection: 'Username-Password-Authentication'
    });
    setError(null);
    setSuccess(null);
    setWarning(null);
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const newStatus = !currentStatus;
    const actionKey = `status-${userId}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    
    try {
      const accessToken = await getAccessTokenSilently();
      const result = await updateUserStatus({
        userId,
        blocked: newStatus,
        accessToken
      });

      if (result.success) {
        setSuccess(`User ${newStatus ? 'disabled' : 'enabled'} successfully`);
        // Refresh user list
        loadUsers();
      } else {
        setError(result.error || `Failed to ${newStatus ? 'disable' : 'enable'} user`);
      }
    } catch (err) {
      console.error('Error updating user status:', err);
      setError(err.message || `Failed to ${newStatus ? 'disable' : 'enable'} user`);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleChangeRole = async (userId, currentRoles, targetRole) => {
    const actionKey = `role-${userId}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    
    try {
      const accessToken = await getAccessTokenSilently();
      const hasRole = currentRoles.includes(targetRole);
      
      // If user already has the role, remove it; otherwise, set it (removing other role first)
      const action = hasRole ? 'remove' : 'set';
      
      const result = await updateUserRoles({
        userId,
        role: targetRole,
        action,
        accessToken
      });

      if (result.success) {
        setSuccess(`User role updated successfully`);
        // Refresh user list
        loadUsers();
      } else {
        setError(result.error || 'Failed to update user role');
      }
    } catch (err) {
      console.error('Error updating user role:', err);
      setError(err.message || 'Failed to update user role');
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleSendPasswordReset = async (userId, email) => {
    const actionKey = `reset-${userId}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    
    try {
      const accessToken = await getAccessTokenSilently();
      const result = await sendPasswordReset({
        userId,
        email,
        connection: 'Username-Password-Authentication',
        accessToken
      });

      if (result.success) {
        setSuccess(`Password reset email sent to ${email}`);
      } else {
        setError(result.error || 'Failed to send password reset email');
      }
    } catch (err) {
      console.error('Error sending password reset:', err);
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(0);
    loadUsers();
  };

  return (
    <div style={{
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '20px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <button
          onClick={() => {
            setActiveTab('list');
            setError(null);
            setSuccess(null);
            setWarning(null);
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'list' ? '#4338ca' : 'transparent',
            color: activeTab === 'list' ? 'white' : '#374151',
            border: 'none',
            borderBottom: activeTab === 'list' ? '2px solid #4338ca' : '2px solid transparent',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          User List
        </button>
        <button
          onClick={() => {
            setActiveTab('create');
            setError(null);
            setSuccess(null);
            setWarning(null);
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'create' ? '#4338ca' : 'transparent',
            color: activeTab === 'create' ? 'white' : '#374151',
            border: 'none',
            borderBottom: activeTab === 'create' ? '2px solid #4338ca' : '2px solid transparent',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Create User
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '4px',
          color: '#991b1b',
          fontSize: '14px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <XCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {warning && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: '4px',
          color: '#92400e',
          fontSize: '14px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <XCircle size={16} />
          <span>{warning}</span>
        </div>
      )}

      {success && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#d1fae5',
          border: '1px solid #a7f3d0',
          borderRadius: '4px',
          color: '#065f46',
          fontSize: '14px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* User List Tab */}
      {activeTab === 'list' && (
        <div>
          {/* Search */}
          <form onSubmit={handleSearch} style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px'
          }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email or name..."
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                backgroundColor: '#4338ca',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Search size={16} />
              Search
            </button>
            <button
              type="button"
              onClick={loadUsers}
              disabled={loadingUsers}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loadingUsers ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {loadingUsers ? <Loader2 size={16} className="animate-spin" /> : 'Refresh'}
            </button>
          </form>

          {/* Refresh Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '12px'
          }}>
            <button
              type="button"
              onClick={loadUsers}
              disabled={loadingUsers}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4338ca',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loadingUsers ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: loadingUsers ? 0.6 : 1
              }}
              title="Refresh user list"
            >
              {loadingUsers ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>

          {/* User Table */}
          {loadingUsers ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280'
            }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
              <p>Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280'
            }}>
              <p>No users found</p>
            </div>
          ) : (
            <>
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Email</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Name</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Status</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Roles</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Logins</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Last Login</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.user_id} style={{
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <td style={{
                          padding: '12px',
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>{user.email}</td>
                        <td style={{
                          padding: '12px',
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>{user.name || '-'}</td>
                        <td style={{
                          padding: '12px',
                          fontSize: '14px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: user.blocked ? '#fee2e2' : '#d1fae5',
                            color: user.blocked ? '#991b1b' : '#065f46'
                          }}>
                            {user.blocked ? 'Disabled' : 'Active'}
                          </span>
                        </td>
                        <td style={{
                          padding: '12px',
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {user.roles && user.roles.length > 0 ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {user.roles.map((role, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    backgroundColor: role === 'admin' ? '#dbeafe' : '#f3f4f6',
                                    color: role === 'admin' ? '#1e40af' : '#374151'
                                  }}
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>No roles</span>
                          )}
                        </td>
                        <td style={{
                          padding: '12px',
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          textAlign: 'center'
                        }}>
                          {user.logins_count !== undefined && user.logins_count !== null ? user.logins_count : 0}
                        </td>
                        <td style={{
                          padding: '12px',
                          fontSize: '14px',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {user.last_login ? (
                            new Date(user.last_login).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          ) : (
                            <span style={{ color: '#9ca3af' }}>Never</span>
                          )}
                        </td>
                        <td style={{
                          padding: '12px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          <div style={{
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap'
                          }}>
                            <button
                              onClick={() => handleToggleUserStatus(user.user_id, user.blocked)}
                              disabled={actionLoading[`status-${user.user_id}`]}
                              title={user.blocked ? 'Enable user' : 'Disable user'}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: user.blocked ? '#10b981' : '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: actionLoading[`status-${user.user_id}`] ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '500',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: actionLoading[`status-${user.user_id}`] ? 0.6 : 1
                              }}
                            >
                              {user.blocked ? <CheckCircle size={14} /> : <XCircle size={14} />}
                              {user.blocked ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              onClick={() => handleChangeRole(user.user_id, user.roles || [], 'admin')}
                              disabled={actionLoading[`role-${user.user_id}`]}
                              title={user.roles?.includes('admin') ? 'Remove admin role' : 'Assign admin role'}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: user.roles?.includes('admin') ? '#f3f4f6' : '#3b82f6',
                                color: user.roles?.includes('admin') ? '#374151' : 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: actionLoading[`role-${user.user_id}`] ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '500',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: actionLoading[`role-${user.user_id}`] ? 0.6 : 1
                              }}
                            >
                              {user.roles?.includes('admin') ? <ShieldOff size={14} /> : <Shield size={14} />}
                              {user.roles?.includes('admin') ? 'Remove Admin' : 'Make Admin'}
                            </button>
                            <button
                              onClick={() => handleSendPasswordReset(user.user_id, user.email)}
                              disabled={actionLoading[`reset-${user.user_id}`]}
                              title="Send password reset email"
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#6b7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: actionLoading[`reset-${user.user_id}`] ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '500',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: actionLoading[`reset-${user.user_id}`] ? 0.6 : 1
                              }}
                            >
                              <Lock size={14} />
                              Reset Password
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.total_pages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '20px'
                }}>
                  <button
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0 || loadingUsers}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: currentPage === 0 ? '#f3f4f6' : '#4338ca',
                      color: currentPage === 0 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <span style={{
                    fontSize: '14px',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Page {currentPage + 1} of {pagination.total_pages} ({pagination.total} total)
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(pagination.total_pages - 1, currentPage + 1))}
                    disabled={currentPage >= pagination.total_pages - 1 || loadingUsers}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: currentPage >= pagination.total_pages - 1 ? '#f3f4f6' : '#4338ca',
                      color: currentPage >= pagination.total_pages - 1 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: currentPage >= pagination.total_pages - 1 ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Create User Tab */}
      {activeTab === 'create' && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px'
          }}>
            <UserPlus size={20} color="#4338ca" />
            <h2 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Create New User
            </h2>
          </div>

          <form onSubmit={handleSubmit} style={{
            backgroundColor: '#f9fafb',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            {/* Email Field */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <Mail size={14} />
                Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="user@example.com"
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Name Field */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <User size={14} />
                Name (Optional)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Full Name"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Connection Field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Connection
              </label>
              <input
                type="text"
                value={formData.connection}
                onChange={(e) => handleInputChange('connection', e.target.value)}
                placeholder="Username-Password-Authentication"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '12px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Default: Username-Password-Authentication
              </p>
            </div>

            {/* Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  opacity: loading ? 0.6 : 1
                }}
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: loading ? '#9ca3af' : '#4338ca',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Create User & Send Invite</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#0c4a6e',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>How it works:</p>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>Creates a new user in Auth0 via the Management API</li>
              <li>Immediately sends a change password (invitation) email to the user</li>
              <li>The user will receive an email with a link to set their password</li>
              <li>If the email fails to send, the user will still be created (you can send the invite manually later)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
