import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Calendar, CheckCircle, XCircle, Save, X, Edit3 } from 'lucide-react';
import { updateUserProfile } from '../api.js';

export default function UserProfile({ user, onUpdateUser }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    picture: ''
  });

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        picture: user.picture || ''
      });
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedUser = await updateUserProfile({
        userId: user.sub,
        name: formData.name,
        picture: formData.picture
      });

      // Call parent callback to update user in app state
      if (onUpdateUser) {
        onUpdateUser(updatedUser);
      }

      setSuccess('Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user.name || '',
      picture: user.picture || ''
    });
    setIsEditing(false);
    setError(null);
    setSuccess(null);
  };

  // Get user roles from various possible locations
  const getUserRoles = () => {
    if (!user) return [];
    
    const auth0Domain = user.iss || import.meta.env.VITE_AUTH0_DOMAIN;
    const customClaimNamespace = auth0Domain ? `https://${auth0Domain.replace('https://', '').replace('.auth0.com', '')}.auth0.com/roles` : 'https://your-domain.com/roles';
    
    const rolesFromCustomClaim = user[customClaimNamespace];
    const rolesFromAcceleraqaClaim = user['https://acceleraqa.com/roles'];
    const rolesFromRolesProperty = user.roles;
    const rolesFromAppMetadata = user['https://your-domain.com/app_metadata']?.roles;
    const rolesFromUserMetadata = user['https://your-domain.com/user_metadata']?.roles;

    const allRoles = [
      ...(Array.isArray(rolesFromCustomClaim) ? rolesFromCustomClaim : []),
      ...(Array.isArray(rolesFromAcceleraqaClaim) ? rolesFromAcceleraqaClaim : []),
      ...(Array.isArray(rolesFromRolesProperty) ? rolesFromRolesProperty : []),
      ...(Array.isArray(rolesFromAppMetadata) ? rolesFromAppMetadata : []),
      ...(Array.isArray(rolesFromUserMetadata) ? rolesFromUserMetadata : [])
    ];

    return allRoles;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const userRoles = getUserRoles();

  return (
    <div style={{
      backgroundColor: '#f8fafc',
      minHeight: 'calc(100vh - 60px)',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#4338ca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: '600'
            }}>
              <User style={{ width: '24px', height: '24px' }} />
            </div>
            <div>
              <h1 style={{
                margin: '0',
                fontSize: '24px',
                fontWeight: '600',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                User Profile
              </h1>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Manage your account information
              </p>
            </div>
          </div>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#4338ca',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#312e81';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#4338ca';
              }}
            >
              <Edit3 style={{ width: '16px', height: '16px' }} />
              Edit Profile
            </button>
          ) : (
            <div style={{
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  backgroundColor: loading ? '#9ca3af' : '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <Save style={{ width: '16px', height: '16px' }} />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <X style={{ width: '16px', height: '16px' }} />
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div style={{
            backgroundColor: '#d1fae5',
            border: '1px solid #10b981',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#065f46',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <CheckCircle style={{ width: '16px', height: '16px' }} />
            {success}
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#991b1b',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <XCircle style={{ width: '16px', height: '16px' }} />
            {error}
          </div>
        )}

        {/* Profile Information */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          {/* Profile Picture */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
            paddingBottom: '24px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: '#4338ca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '32px',
              fontWeight: '600',
              backgroundImage: user.picture ? `url(${user.picture})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}>
              {!user.picture && (user.name ? user.name.charAt(0).toUpperCase() : 'U')}
            </div>
            <div>
              <h3 style={{
                margin: '0 0 4px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Profile Picture
              </h3>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {isEditing ? 'Enter a URL for your profile picture' : 'Your profile picture'}
              </p>
            </div>
          </div>

          {/* Editable Fields */}
          <div style={{
            display: 'grid',
            gap: '24px'
          }}>
            {/* Name Field */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#4338ca';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db';
                  }}
                />
              ) : (
                <p style={{
                  margin: '0',
                  fontSize: '16px',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {user.name || 'Not provided'}
                </p>
              )}
            </div>

            {/* Profile Picture URL Field */}
            {isEditing && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Profile Picture URL
                </label>
                <input
                  type="url"
                  value={formData.picture}
                  onChange={(e) => handleInputChange('picture', e.target.value)}
                  placeholder="https://example.com/your-picture.jpg"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#4338ca';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db';
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Read-only Information */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          marginTop: '24px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{
            margin: '0 0 20px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Account Information
          </h3>

          <div style={{
            display: 'grid',
            gap: '20px'
          }}>
            {/* Email */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Mail style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              <div>
                <p style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Email Address
                </p>
                <p style={{
                  margin: '0',
                  fontSize: '16px',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {user.email}
                </p>
              </div>
            </div>

            {/* Email Verified Status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              {user.email_verified ? (
                <CheckCircle style={{ width: '20px', height: '20px', color: '#10b981' }} />
              ) : (
                <XCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
              )}
              <div>
                <p style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Email Verification
                </p>
                <p style={{
                  margin: '0',
                  fontSize: '16px',
                  color: user.email_verified ? '#10b981' : '#ef4444',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {user.email_verified ? 'Verified' : 'Not verified'}
                </p>
              </div>
            </div>

            {/* Roles */}
            {userRoles.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <Shield style={{ width: '20px', height: '20px', color: '#6b7280' }} />
                <div>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Roles
                  </p>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}>
                    {userRoles.map((role, index) => (
                      <span
                        key={index}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: role === 'admin' ? '#4338ca' : '#6b7280',
                          color: '#ffffff',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Account Created */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Calendar style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              <div>
                <p style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Account Created
                </p>
                <p style={{
                  margin: '0',
                  fontSize: '16px',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {formatDate(user.created_at)}
                </p>
              </div>
            </div>

            {/* Last Updated */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Calendar style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              <div>
                <p style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Last Updated
                </p>
                <p style={{
                  margin: '0',
                  fontSize: '16px',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {formatDate(user.updated_at)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
