# Admin Role-Based Access Control Implementation

This document describes the implementation of role-based access control for admin screens using Auth0 roles.

## Overview

The application now restricts access to admin screens to only users who have the "admin" role assigned in Auth0. Non-admin users will not see the admin panel menu item and will be redirected away if they try to access admin screens directly.

## Implementation Details

### 1. Custom Hook: `useAdminRole`

**File:** `src/hooks/useAdminRole.js`

This hook checks if the current user has admin privileges by examining multiple possible locations where Auth0 might store role information:

- `user['https://your-domain.com/roles']` - Custom claim (most common)
- `user.roles` - Direct roles property
- `user['https://your-domain.com/app_metadata']?.roles` - App metadata
- `user['https://your-domain.com/user_metadata']?.roles` - User metadata

**Returns:**
- `isAdmin`: boolean - Whether user has admin role
- `isLoading`: boolean - Whether Auth0 is still loading user data
- `error`: string | null - Any error from Auth0
- `debugInfo`: object - Debug information for troubleshooting

### 2. App Component Updates

**File:** `src/App.jsx`

- Added role checking using `useAdminRole` hook
- Added loading state while checking user roles
- Added access denied screen for non-admin users trying to access admin screens
- Passes `isAdmin` prop to Header component

### 3. Header Component Updates

**File:** `src/components/Header.jsx`

- Added `isAdmin` prop
- Conditionally renders admin panel menu item only for admin users
- Non-admin users won't see the admin panel option in the menu

### 4. CSS Animation

**File:** `index.html`

- Added CSS keyframes for loading spinner animation

## Auth0 Configuration Required

To make this work, you need to configure Auth0 to include roles in the user's token:

### Option 1: Custom Claims (Recommended)

1. In Auth0 Dashboard, go to your application
2. Navigate to "Advanced Settings" > "OAuth"
3. In "Token Configuration", add a custom claim:
   - **Namespace:** `https://your-domain.com/roles`
   - **Value:** `roles`

### Option 2: Management API

Use the Auth0 Management API to assign roles programmatically:

```javascript
// Example: Assign admin role to a user
const management = new Management({
  domain: 'your-domain.auth0.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret'
});

await management.assignRolestoUser(
  { id: 'user-id' },
  { roles: ['role-id-for-admin'] }
);
```

### Option 3: Rules/Actions

Create an Auth0 Rule or Action to add roles to the user object:

```javascript
// Auth0 Rule example
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://your-domain.com/roles';
  
  if (event.user.app_metadata && event.user.app_metadata.roles) {
    api.idToken.setCustomClaim(namespace, event.user.app_metadata.roles);
  }
};
```

## Testing

### Debug Information

The implementation includes debug logging in development mode. Check the browser console for:
- User object details
- Roles found in different locations
- Whether admin role is detected

### Test Utility

**File:** `src/utils/roleTest.js`

Contains utility functions for testing role detection:

```javascript
import { testUserRoles } from './utils/roleTest.js';

// Test a user object
const result = testUserRoles(user);
console.log('Test result:', result);
```

## Security Considerations

1. **Client-Side Only**: This implementation only provides UI-level protection. Always implement server-side role validation for sensitive operations.

2. **Token Validation**: Ensure your backend validates the Auth0 token and checks roles before allowing admin operations.

3. **Role Names**: The implementation looks for a role named exactly "admin". Make sure this matches your Auth0 role configuration.

## Troubleshooting

### Common Issues

1. **Admin panel not showing**: Check that the user has the "admin" role assigned in Auth0
2. **Roles not appearing**: Verify Auth0 token configuration includes roles
3. **Access denied for admin users**: Check browser console for debug information

### Debug Steps

1. Open browser console
2. Look for "Admin Role Debug Info" logs
3. Verify the user object contains role information
4. Check that roles are in the expected format (array of strings)
5. Ensure the role name is exactly "admin" (case-sensitive)

## Files Modified

- `src/hooks/useAdminRole.js` - New custom hook
- `src/App.jsx` - Added role checking and access control
- `src/components/Header.jsx` - Conditional admin menu rendering
- `src/utils/roleTest.js` - New testing utility
- `index.html` - Added CSS for loading animation
- `ADMIN-ROLE-IMPLEMENTATION.md` - This documentation

## Next Steps

1. Configure Auth0 to include roles in tokens
2. Assign "admin" role to appropriate users
3. Test the implementation with different user types
4. Consider implementing server-side role validation for API endpoints
5. Update the domain placeholder in `useAdminRole.js` with your actual Auth0 domain
