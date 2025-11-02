import { ManagementClient } from 'auth0';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'PUT, PATCH, OPTIONS'
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
    console.log('Received authenticated request for updating user status');

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

    const { userId, blocked } = payload;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'User ID is required' })
      };
    }

    if (typeof blocked !== 'boolean') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Blocked status must be a boolean' })
      };
    }

    console.log('Updating user status:', { userId, blocked });

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
      scope: 'read:users update:users'
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

    // Update user blocked status
    try {
      let updatedUser;
      if (management.users && typeof management.users.update === 'function') {
        console.log('Using management.users.update()');
        try {
          updatedUser = await management.users.update(
            { id: userId }, 
            { blocked: blocked }
          );
        } catch (e) {
          if (e.message && e.message.includes("didn't pass validation")) {
            console.log('Retrying update with direct parameters...');
            updatedUser = await management.users.update(
              userId, 
              { blocked: blocked }
            );
          } else {
            throw e;
          }
        }
      }
      else if (typeof management.updateUser === 'function') {
        console.log('Using management.updateUser()');
        const result = await management.updateUser(
          { id: userId }, 
          { blocked: blocked }
        );
        updatedUser = result.data || result;
      }
      else {
        throw new Error('Unable to find updateUser method on management client');
      }

      console.log('User status updated successfully:', {
        user_id: updatedUser.user_id,
        email: updatedUser.email,
        blocked: updatedUser.blocked
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `User ${blocked ? 'disabled' : 'enabled'} successfully`,
          user: {
            user_id: updatedUser.user_id,
            email: updatedUser.email,
            blocked: updatedUser.blocked
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
      
      let errorMessage = 'Failed to update user status';
      
      if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed with Auth0 Management API';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions to update user';
      } else if (auth0Error.status === 404 || auth0Error.statusCode === 404) {
        errorMessage = 'User not found';
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
    console.error('Error updating user status:', error);
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

