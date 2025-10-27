import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Calendar, CheckCircle, XCircle, Save, X, Edit3, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth0 } from '@auth0/auth0-react';
import { updateUserProfile, changeUserPassword } from '../api.js';

export default function UserProfile({ user, onUpdateUser }) {
  const { getAccessTokenSilently } = useAuth0();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    picture: ''
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(null);

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        picture: user.picture || ''
      });
    }
  }, [user]);

  // Update form data when user data changes (for real-time updates)
  useEffect(() => {
    if (user && !isEditing) {
      setFormData({
        name: user.name || '',
        picture: user.picture || ''
      });
    }
  }, [user, isEditing]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePasswordChange = (field, value) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear errors when user starts typing
    if (passwordError) setPasswordError(null);
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const validatePassword = (password) => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    // Use simple character checks instead of lookahead to avoid ReDoS
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/\d/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Get the access token
      const accessToken = await getAccessTokenSilently();
      
      const updatedUser = await updateUserProfile({
        userId: user.sub,
        name: formData.name,
        picture: formData.picture,
        accessToken: accessToken
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

  const handlePasswordSave = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    // Validate passwords
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordError('New password and confirmation are required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    const passwordValidation = validatePassword(passwordData.newPassword);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    setIsChangingPassword(true);

    try {
      const accessToken = await getAccessTokenSilently();
      
      await changeUserPassword({
        newPassword: passwordData.newPassword,
        userId: user.sub,
        accessToken: accessToken
      });

      setPasswordSuccess('Password changed successfully!');
      setPasswordData({
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handlePasswordCancel = () => {
    setPasswordData({
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordError(null);
    setPasswordSuccess(null);
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
    <div className="bg-slate-50 min-h-[calc(100vh-60px)] p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-700 flex items-center justify-center text-white text-xl font-semibold">
              <User style={{ width: '24px', height: '24px' }} />
            </div>
            <div>
              <h1 className="m-0 text-2xl font-semibold text-gray-700">
                User Profile
              </h1>
              <p className="m-0 text-sm text-gray-500">
                Manage your account information
              </p>
            </div>
          </div>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-700 text-white border-none rounded-md text-sm font-medium cursor-pointer transition-colors hover:bg-indigo-800"
            >
              <Edit3 style={{ width: '16px', height: '16px' }} />
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={loading}
                className={`flex items-center gap-2 px-4 py-2 ${loading ? 'bg-gray-400' : 'bg-green-600'} text-white border-none rounded-md text-sm font-medium ${loading ? 'cursor-not-allowed' : 'cursor-pointer'} transition-colors`}
              >
                <Save style={{ width: '16px', height: '16px' }} />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className={`flex items-center gap-2 px-4 py-2 bg-gray-500 text-white border-none rounded-md text-sm font-medium ${loading ? 'cursor-not-allowed' : 'cursor-pointer'} transition-colors`}
              >
                <X style={{ width: '16px', height: '16px' }} />
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-100 border border-green-600 rounded-md py-3 px-4 mb-6 flex items-center gap-2 text-green-800 text-sm">
            <CheckCircle style={{ width: '16px', height: '16px' }} />
            {success}
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-600 rounded-md py-3 px-4 mb-6 flex items-center gap-2 text-red-800 text-sm">
            <XCircle style={{ width: '16px', height: '16px' }} />
            {error}
          </div>
        )}

        {/* Password Success/Error Messages */}
        {passwordSuccess && (
          <div className="bg-green-100 border border-green-600 rounded-md py-3 px-4 mb-6 flex items-center gap-2 text-green-800 text-sm">
            <CheckCircle style={{ width: '16px', height: '16px' }} />
            {passwordSuccess}
          </div>
        )}

        {passwordError && (
          <div className="bg-red-100 border border-red-600 rounded-md py-3 px-4 mb-6 flex items-center gap-2 text-red-800 text-sm">
            <XCircle style={{ width: '16px', height: '16px' }} />
            {passwordError}
          </div>
        )}

        {/* Profile Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          {/* Profile Picture */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-200">
            <div 
              className="w-20 h-20 rounded-full bg-indigo-700 flex items-center justify-center text-white text-3xl font-semibold bg-cover bg-center"
              style={{
                backgroundImage: user.picture ? `url(${user.picture})` : 'none',
              }}
            >
              {!user.picture && (user.name ? user.name.charAt(0).toUpperCase() : 'U')}
            </div>
            <div>
              <h3 className="m-0 mb-1 text-lg font-semibold text-gray-700">
                Profile Picture
              </h3>
              <p className="m-0 text-sm text-gray-500">
                {isEditing ? 'Enter a URL for your profile picture' : 'Your profile picture'}
              </p>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="grid gap-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full py-3 px-3 border border-gray-300 rounded-md text-sm outline-none transition-colors focus:border-indigo-700"
                />
              ) : (
                <p className="m-0 text-base text-gray-700">
                  {user.name || 'Not provided'}
                </p>
              )}
            </div>

            {/* Profile Picture URL Field */}
            {isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Picture URL
                </label>
                <input
                  type="url"
                  value={formData.picture}
                  onChange={(e) => handleInputChange('picture', e.target.value)}
                  placeholder="https://example.com/your-picture.jpg"
                  className="w-full py-3 px-3 border border-gray-300 rounded-md text-sm outline-none transition-colors focus:border-indigo-700"
                />
              </div>
            )}
          </div>
        </div>

        {/* Password Change Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
              <Lock style={{ width: '20px', height: '20px' }} />
            </div>
            <div>
              <h3 className="m-0 mb-1 text-lg font-semibold text-gray-700">
                Change Password
              </h3>
              <p className="m-0 text-sm text-gray-500">
                Update your account password
              </p>
            </div>
          </div>

          <div className="grid gap-5">

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                  className="w-full py-3 px-3 pr-10 border border-gray-300 rounded-md text-sm outline-none transition-colors focus:border-indigo-700"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('new')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-gray-500 p-1"
                >
                  {showPasswords.new ? (
                    <EyeOff style={{ width: '16px', height: '16px' }} />
                  ) : (
                    <Eye style={{ width: '16px', height: '16px' }} />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Must be at least 8 characters with uppercase, lowercase, and number
              </p>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                  className="w-full py-3 px-3 pr-10 border border-gray-300 rounded-md text-sm outline-none transition-colors focus:border-indigo-700"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('confirm')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-gray-500 p-1"
                >
                  {showPasswords.confirm ? (
                    <EyeOff style={{ width: '16px', height: '16px' }} />
                  ) : (
                    <Eye style={{ width: '16px', height: '16px' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Password Change Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handlePasswordCancel}
                disabled={isChangingPassword}
                className={`px-4 py-2 bg-gray-500 text-white border-none rounded-md text-sm font-medium transition-colors ${isChangingPassword ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSave}
                disabled={isChangingPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                className={`flex items-center gap-2 px-4 py-2 ${isChangingPassword || !passwordData.newPassword || !passwordData.confirmPassword ? 'bg-gray-400' : 'bg-green-600'} text-white border-none rounded-md text-sm font-medium transition-colors ${isChangingPassword || !passwordData.newPassword || !passwordData.confirmPassword ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <Lock style={{ width: '16px', height: '16px' }} />
                {isChangingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>

        {/* Read-only Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6 shadow-sm">
          <h3 className="m-0 mb-5 text-lg font-semibold text-gray-700">
            Account Information
          </h3>

          <div className="grid gap-5">
            {/* Email */}
            <div className="flex items-center gap-3">
              <Mail style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              <div>
                <p className="m-0 mb-1 text-sm font-medium text-gray-700">
                  Email Address
                </p>
                <p className="m-0 text-base text-gray-700">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Email Verified Status */}
            <div className="flex items-center gap-3">
              {user.email_verified ? (
                <CheckCircle style={{ width: '20px', height: '20px', color: '#10b981' }} />
              ) : (
                <XCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
              )}
              <div>
                <p className="m-0 mb-1 text-sm font-medium text-gray-700">
                  Email Verification
                </p>
                <p className={`m-0 text-base ${user.email_verified ? 'text-green-600' : 'text-red-600'}`}>
                  {user.email_verified ? 'Verified' : 'Not verified'}
                </p>
              </div>
            </div>

            {/* Roles */}
            {userRoles.length > 0 && (
              <div className="flex items-center gap-3">
                <Shield style={{ width: '20px', height: '20px', color: '#6b7280' }} />
                <div>
                  <p className="m-0 mb-1 text-sm font-medium text-gray-700">
                    Roles
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {userRoles.map((role, index) => (
                      <span
                        key={index}
                        className={`py-1 px-2 text-white rounded text-xs font-medium ${role === 'admin' ? 'bg-indigo-700' : 'bg-gray-500'}`}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Account Created */}
            <div className="flex items-center gap-3">
              <Calendar style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              <div>
                <p className="m-0 mb-1 text-sm font-medium text-gray-700">
                  Account Created
                </p>
                <p className="m-0 text-base text-gray-700">
                  {formatDate(user.created_at)}
                </p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="flex items-center gap-3">
              <Calendar style={{ width: '20px', height: '20px', color: '#6b7280' }} />
              <div>
                <p className="m-0 mb-1 text-sm font-medium text-gray-700">
                  Last Updated
                </p>
                <p className="m-0 text-base text-gray-700">
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
