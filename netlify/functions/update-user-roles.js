import { ManagementClient } from 'auth0';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'PUT, PATCH, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Extract JWT token for authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.substring(7);
    console.log('Received authenticated request for updating user roles');

    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Request body is required' })
      };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload' })
      };
    }

    const { userId, role, action } = payload;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'User ID is required' })
      };
    }

    if (!role) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Role is required' })
      };
    }

    if (!action || !['add', 'remove', 'set'].includes(action)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Action must be "add", "remove", or "set"' })
      };
    }

    console.log('Updating user roles:', { userId, role, action });

    // Get Auth0 Management API credentials
    let domain = process.env.AUTH0_MGMT_DOMAIN;
    const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
    const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

    // Clean domain - remove https:// prefix and /api/v2/ suffix if present
    if (domain && domain.startsWith('https://')) {
      domain = domain.replace('https://', '');
    }
    if (domain && domain.endsWith('/api/v2/')) {
      domain = domain.replace('/api/v2/', '');
    }
    if (domain && domain.endsWith('/api/v2')) {
      domain = domain.replace('/api/v2', '');
    }

    if (!domain || !clientId || !clientSecret) {
      console.error('Missing Auth0 Management API credentials');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Server configuration error: Missing Auth0 credentials' 
        })
      };
    }

    // Initialize Auth0 Management Client
    console.log('Initializing Auth0 Management Client with domain:', domain);
    
    const managementConfig = {
      domain: domain,
      clientId: clientId,
      clientSecret: clientSecret,
      scope: 'read:users update:users read:roles create:roles'
    };
    
    // Add token configuration to help the SDK authenticate properly
    if (!managementConfig.domain.startsWith('https://')) {
      managementConfig.audience = `https://${domain}/api/v2/`;
      managementConfig.tokenProvider = {
        enableCache: true,
        cacheTTLInSeconds: 3600
      };
    }
    
    const management = new ManagementClient(managementConfig);

    // Helper function to get access token for direct API calls
    const getAccessToken = async () => {
      const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          audience: `https://${domain}/api/v2/`,
          grant_type: 'client_credentials',
          scope: 'read:users update:users read:roles create:roles'
        })
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token');
      }

      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    };

    try {
      // First, get all roles to find the role ID
      let allRoles;
      try {
        if (management.roles && typeof management.roles.getAll === 'function') {
          allRoles = await management.roles.getAll();
        } else if (management.roles && typeof management.roles.list === 'function') {
          allRoles = await management.roles.list();
        } else {
          // Direct API call
          const accessToken = await getAccessToken();
          const rolesResponse = await fetch(`https://${domain}/api/v2/roles`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!rolesResponse.ok) {
            const errorText = await rolesResponse.text();
            console.error('Failed to fetch roles:', { status: rolesResponse.status, error: errorText });
            throw new Error(`Failed to fetch roles: ${rolesResponse.status}`);
          }
          
          allRoles = await rolesResponse.json();
        }
      } catch (roleFetchError) {
        console.error('Error fetching roles:', roleFetchError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: `Failed to fetch roles from Auth0: ${roleFetchError.message}. Please ensure roles are configured in your Auth0 dashboard.` 
          })
        };
      }

      const rolesList = Array.isArray(allRoles) ? allRoles : (allRoles.roles || []);
      console.log(`Found ${rolesList.length} roles in Auth0:`, rolesList.map(r => r.name || r.id || r));
      
      const targetRole = rolesList.find(r => {
        const roleName = r.name || r;
        return roleName.toLowerCase() === role.toLowerCase() || roleName === role;
      });

      // If role doesn't exist, try to create it
      let roleId;
      if (!targetRole) {
        console.log(`Role "${role}" not found. Attempting to create it...`);
        
        try {
          const accessToken = await getAccessToken();
          const createRoleResponse = await fetch(`https://${domain}/api/v2/roles`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: role,
              description: `Role for ${role} users`
            })
          });
          
          if (!createRoleResponse.ok) {
            const errorText = await createRoleResponse.text();
            console.error('Failed to create role:', { status: createRoleResponse.status, error: errorText });
            
            // If role creation fails, return helpful error
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ 
                success: false, 
                error: `Role "${role}" not found and could not be created. Please create the role "${role}" in your Auth0 dashboard first. Available roles: ${rolesList.length > 0 ? rolesList.map(r => r.name || r).join(', ') : 'none'}` 
              })
            };
          }
          
          const newRole = await createRoleResponse.json();
          roleId = newRole.id || newRole.role_id;
          console.log(`Successfully created role "${role}" with ID: ${roleId}`);
        } catch (createError) {
          console.error('Error creating role:', createError);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              success: false, 
              error: `Role "${role}" not found and creation failed: ${createError.message}. Please create the role "${role}" in your Auth0 dashboard. Available roles: ${rolesList.length > 0 ? rolesList.map(r => r.name || r).join(', ') : 'none'}` 
            })
          };
        }
      } else {
        roleId = targetRole.id || targetRole.role_id || targetRole;
      }

      // Get current user roles
      let currentUserRoles = [];
      if (management.users && typeof management.users.getUserRoles === 'function') {
        const rolesResult = await management.users.getUserRoles({ id: userId });
        currentUserRoles = Array.isArray(rolesResult) ? rolesResult : (rolesResult.roles || []);
      } else {
        // Direct API call
        const accessToken = await getAccessToken();
        const userRolesResponse = await fetch(`https://${domain}/api/v2/users/${userId}/roles`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (userRolesResponse.ok) {
          const userRolesData = await userRolesResponse.json();
          currentUserRoles = Array.isArray(userRolesData) ? userRolesData : (userRolesData.roles || []);
        }
      }

      const currentRoleIds = currentUserRoles.map(r => r.id || r.role_id || r);
      const hasRole = currentRoleIds.includes(roleId);

      // Perform the action
      if (action === 'set') {
        // Set means: remove all other roles, add only this role (if admin/user)
        // For admin/user roles, we typically want exclusive assignment
        const adminRole = rolesList.find(r => (r.name || r) === 'admin');
        const userRole = rolesList.find(r => (r.name || r) === 'user');
        
        // Remove all current roles first
        if (currentRoleIds.length > 0) {
          if (management.users && typeof management.users.removeRoles === 'function') {
            await management.users.removeRoles({ id: userId }, { roles: currentRoleIds });
          } else {
            const accessToken = await management.getAccessToken();
            await fetch(`https://${domain}/api/v2/users/${userId}/roles`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ roles: currentRoleIds })
            });
          }
        }

        // Add the new role
        if (management.users && typeof management.users.assignRoles === 'function') {
          await management.users.assignRoles({ id: userId }, { roles: [roleId] });
        } else {
          const accessToken = await getAccessToken();
          await fetch(`https://${domain}/api/v2/users/${userId}/roles`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ roles: [roleId] })
          });
        }
      } else if (action === 'add') {
        if (!hasRole) {
          if (management.users && typeof management.users.assignRoles === 'function') {
            await management.users.assignRoles({ id: userId }, { roles: [roleId] });
          } else {
            const accessToken = await getAccessToken();
            await fetch(`https://${domain}/api/v2/users/${userId}/roles`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ roles: [roleId] })
            });
          }
        }
      } else if (action === 'remove') {
        if (hasRole) {
          if (management.users && typeof management.users.removeRoles === 'function') {
            await management.users.removeRoles({ id: userId }, { roles: [roleId] });
          } else {
            const accessToken = await getAccessToken();
            await fetch(`https://${domain}/api/v2/users/${userId}/roles`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ roles: [roleId] })
            });
          }
        }
      }

      // Get updated user roles
      let updatedRoles = [];
      if (management.users && typeof management.users.getUserRoles === 'function') {
        const updatedRolesResult = await management.users.getUserRoles({ id: userId });
        updatedRoles = Array.isArray(updatedRolesResult) ? updatedRolesResult : (updatedRolesResult.roles || []);
      } else {
        const accessToken = await getAccessToken();
        const updatedRolesResponse = await fetch(`https://${domain}/api/v2/users/${userId}/roles`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (updatedRolesResponse.ok) {
          const updatedRolesData = await updatedRolesResponse.json();
          updatedRoles = Array.isArray(updatedRolesData) ? updatedRolesData : (updatedRolesData.roles || []);
        }
      }

      console.log('User roles updated successfully:', {
        user_id: userId,
        action,
        role,
        updated_roles: updatedRoles.map(r => r.name || r)
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Role ${action === 'add' ? 'added' : action === 'remove' ? 'removed' : 'set'} successfully`,
          user: {
            user_id: userId,
            roles: updatedRoles.map(r => r.name || r)
          }
        })
      };

    } catch (auth0Error) {
      console.error('Auth0 Management API error:', {
        message: auth0Error.message,
        status: auth0Error.status,
        statusCode: auth0Error.statusCode,
        error: auth0Error.error,
        error_description: auth0Error.error_description
      });
      
      let errorMessage = 'Failed to update user roles';
      
      if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed with Auth0 Management API';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions to update user roles';
      } else if (auth0Error.status === 404 || auth0Error.statusCode === 404) {
        errorMessage = 'User or role not found';
      } else if (auth0Error.message) {
        errorMessage = auth0Error.message;
      }
      
      const responseStatus = auth0Error.statusCode || auth0Error.status || 500;
      return {
        statusCode: responseStatus,
        headers,
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          details: {
            status: responseStatus,
            error: auth0Error.error,
            error_description: auth0Error.error_description
          }
        })
      };
    }

  } catch (error) {
    console.error('Error updating user roles:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error: ' + (error.message || 'Unknown error')
      })
    };
  }
};

