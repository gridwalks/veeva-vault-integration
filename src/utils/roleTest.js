/**
 * Utility function to test role-based access control
 * This can be used for debugging and testing purposes
 */

/**
 * Test function to simulate different user roles
 * @param {Object} user - Auth0 user object
 * @returns {Object} - Test results
 */
export function testUserRoles(user) {
  console.log('=== Role Testing Debug Info ===');
  console.log('User object:', user);
  
  if (!user) {
    console.log('❌ No user object provided');
    return { hasAdminRole: false, reason: 'No user object' };
  }

  // Check common Auth0 role locations
  const rolesFromCustomClaim = user['https://your-domain.com/roles'];
  const rolesFromRolesProperty = user.roles;
  const rolesFromAppMetadata = user['https://your-domain.com/app_metadata']?.roles;
  const rolesFromUserMetadata = user['https://your-domain.com/user_metadata']?.roles;

  console.log('Roles from custom claim (https://your-domain.com/roles):', rolesFromCustomClaim);
  console.log('Roles from roles property:', rolesFromRolesProperty);
  console.log('Roles from app_metadata:', rolesFromAppMetadata);
  console.log('Roles from user_metadata:', rolesFromUserMetadata);

  // Check all possible role locations
  const allRoles = [
    ...(Array.isArray(rolesFromCustomClaim) ? rolesFromCustomClaim : []),
    ...(Array.isArray(rolesFromRolesProperty) ? rolesFromRolesProperty : []),
    ...(Array.isArray(rolesFromAppMetadata) ? rolesFromAppMetadata : []),
    ...(Array.isArray(rolesFromUserMetadata) ? rolesFromUserMetadata : [])
  ];

  console.log('All roles found:', allRoles);
  
  const hasAdminRole = allRoles.includes('admin');
  console.log('Has admin role:', hasAdminRole ? '✅' : '❌');

  return {
    hasAdminRole,
    allRoles,
    rolesFromCustomClaim,
    rolesFromRolesProperty,
    rolesFromAppMetadata,
    rolesFromUserMetadata
  };
}

/**
 * Instructions for Auth0 configuration
 */
export const AUTH0_ROLE_CONFIG_INSTRUCTIONS = `
=== Auth0 Role Configuration Instructions ===

1. In your Auth0 Dashboard:
   - Go to User Management > Roles
   - Create a role called "admin"
   - Assign this role to users who should have admin access

2. Configure the Auth0 React SDK to include roles in the ID token:
   - In your Auth0 application settings, go to "Advanced Settings" > "OAuth"
   - Add a custom claim in the "Token Configuration" section
   - Use namespace: "https://your-domain.com/roles"
   - Value: "roles"

3. Alternative: Use Auth0 Management API to assign roles programmatically

4. Test the configuration:
   - Login with a user who has the admin role
   - Check the browser console for role debugging information
   - Verify the admin panel appears in the menu

Note: Replace "your-domain.com" with your actual Auth0 domain in the useAdminRole.js hook.
`;
