import { useAuth0 } from '@auth0/auth0-react';
import { useMemo } from 'react';

/**
 * Custom hook to check if the current user has admin role
 * @returns {Object} - { isAdmin: boolean, isLoading: boolean, error: string | null, debugInfo: Object }
 */
export function useAdminRole() {
  const { user, isLoading, error } = useAuth0();

  const { isAdmin, debugInfo } = useMemo(() => {
    if (isLoading || error || !user) {
      return { 
        isAdmin: false, 
        debugInfo: { 
          reason: isLoading ? 'loading' : error ? 'error' : 'no_user',
          user: null 
        } 
      };
    }

    // Check multiple possible locations for roles in Auth0
    const rolesFromCustomClaim = user['https://your-domain.com/roles'];
    const rolesFromRolesProperty = user.roles;
    const rolesFromAppMetadata = user['https://your-domain.com/app_metadata']?.roles;
    const rolesFromUserMetadata = user['https://your-domain.com/user_metadata']?.roles;

    // Collect all roles from different sources
    const allRoles = [
      ...(Array.isArray(rolesFromCustomClaim) ? rolesFromCustomClaim : []),
      ...(Array.isArray(rolesFromRolesProperty) ? rolesFromRolesProperty : []),
      ...(Array.isArray(rolesFromAppMetadata) ? rolesFromAppMetadata : []),
      ...(Array.isArray(rolesFromUserMetadata) ? rolesFromUserMetadata : [])
    ];

    const hasAdminRole = allRoles.includes('admin');

    const debugInfo = {
      user: user,
      rolesFromCustomClaim,
      rolesFromRolesProperty,
      rolesFromAppMetadata,
      rolesFromUserMetadata,
      allRoles,
      hasAdminRole
    };

    // Log debug information in development
    if (process.env.NODE_ENV === 'development') {
      console.log('=== Admin Role Debug Info ===');
      console.log('User:', user);
      console.log('All roles found:', allRoles);
      console.log('Has admin role:', hasAdminRole);
    }

    return { isAdmin: hasAdminRole, debugInfo };
  }, [user, isLoading, error]);

  return {
    isAdmin,
    isLoading,
    error: error?.message || null,
    debugInfo
  };
}
