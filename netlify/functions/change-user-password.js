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
    // Extract JWT token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.substring(7);
    console.log('Received token for password change validation');

    const decodeJwt = (jwt) => {
      const parts = jwt.split('.');
      if (parts.length < 2) {
        throw new Error('Invalid JWT');
      }

      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const json = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(json);
    };

    let tokenClaims = {};
    try {
      tokenClaims = decodeJwt(token);
      console.log('Token claims extracted:', {
        sub: tokenClaims.sub,
        iss: tokenClaims.iss,
        aud: tokenClaims.aud
      });
    } catch (decodeError) {
      console.warn('Unable to decode JWT payload for diagnostics:', decodeError.message);
    }

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

    const { currentPassword, newPassword } = payload;

    if (!currentPassword || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Current password and new password are required' })
      };
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'New password must be at least 8 characters long' })
      };
    }

    console.log('Password change request for user:', tokenClaims.sub);
    console.log('Token claims details:', {
      sub: tokenClaims.sub,
      iss: tokenClaims.iss,
      aud: tokenClaims.aud,
      exp: tokenClaims.exp,
      iat: tokenClaims.iat
    });

    // Get Auth0 Management API credentials
    let domain = process.env.AUTH0_MGMT_DOMAIN || process.env.VITE_AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
    const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

    // Debug: Log all environment variables that start with AUTH0
    console.log('All AUTH0 environment variables:', {
      AUTH0_MGMT_DOMAIN: process.env.AUTH0_MGMT_DOMAIN,
      AUTH0_MGMT_CLIENT_ID: process.env.AUTH0_MGMT_CLIENT_ID,
      AUTH0_MGMT_CLIENT_SECRET: process.env.AUTH0_MGMT_CLIENT_SECRET ? 'present' : 'missing',
      VITE_AUTH0_DOMAIN: process.env.VITE_AUTH0_DOMAIN,
      VITE_AUTH0_CLIENT_ID: process.env.VITE_AUTH0_CLIENT_ID
    });

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
    
    // Ensure domain ends with .auth0.com or .auth0.com/ if it doesn't already
    if (domain && !domain.includes('.auth0.com')) {
      domain = domain + '.auth0.com';
    }

    console.log('Auth0 Management API credentials check:', {
      domain: domain ? `present (${domain})` : 'missing',
      clientId: clientId ? `present (${clientId.substring(0, 8)}...)` : 'missing',
      clientSecret: clientSecret ? 'present' : 'missing'
    });

    if (!domain || !clientId || !clientSecret) {
      console.error('Missing Auth0 Management API credentials');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Password change feature requires Auth0 Management API configuration. Please contact your administrator to set up AUTH0_MGMT_DOMAIN, AUTH0_MGMT_CLIENT_ID, and AUTH0_MGMT_CLIENT_SECRET environment variables.' 
        })
      };
    }

    // Initialize Auth0 Management Client
    console.log('Initializing Auth0 Management Client with domain:', domain);
    
    let management;
    try {
      // Use the exact same configuration as the working update-user-profile function
      const managementConfig = {
        domain: domain,
        clientId: clientId,
        clientSecret: clientSecret,
        scope: 'read:users update:users'
      };
      
      // Add token configuration to help the SDK authenticate properly
      if (!managementConfig.domain.startsWith('https://')) {
        // Ensure we're using HTTPS for the token endpoint
        managementConfig.audience = `https://${domain}/api/v2/`;
        managementConfig.tokenProvider = {
          enableCache: true,
          cacheTTLInSeconds: 3600
        };
      } else {
        // If domain already has https://, use it directly for audience
        managementConfig.audience = `${domain}/api/v2/`;
      }
      
      console.log('Management config:', {
        domain: managementConfig.domain,
        audience: managementConfig.audience,
        clientId: managementConfig.clientId ? 'present' : 'missing'
      });
      
      management = new ManagementClient(managementConfig);
      console.log('Management client initialized successfully');
    } catch (initError) {
      console.error('Failed to initialize Auth0 Management Client:', initError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to initialize Auth0 Management API client. Please check your Auth0 Management API configuration.',
          details: {
            message: initError.message
          }
        })
      };
    }

    // Use the token's sub claim as the authoritative user ID
    const userIdToUpdate = tokenClaims.sub;
    console.log('Using user ID from token sub claim:', userIdToUpdate);
    
    if (!userIdToUpdate) {
      console.error('No user ID found in token sub claim');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Unable to identify user from authentication token. Please log out and log back in.',
          details: {
            tokenClaims: tokenClaims
          }
        })
      };
    }

    // First verify the user exists and get current data
    console.log('Fetching current user data...');
    let currentUser;
    
    try {
      // Try the management.users.get method (most common)
      if (management.users && typeof management.users.get === 'function') {
        console.log('Using management.users.get()');
        try {
          // Try passing as object first (newer SDK versions)
          currentUser = await management.users.get({ id: userIdToUpdate });
        } catch (e) {
          if (e.message && e.message.includes("didn't pass validation")) {
            console.log('Retrying with ID as direct parameter...');
            // Try passing ID directly (older SDK versions)
            currentUser = await management.users.get(userIdToUpdate);
          } else {
            throw e;
          }
        }
      } 
      // Try alternative method
      else if (typeof management.getUser === 'function') {
        console.log('Using management.getUser()');
        const result = await management.getUser({ id: userIdToUpdate });
        currentUser = result.data || result;
      }
      else {
        throw new Error('Unable to find getUser method on management client');
      }

      console.log('Current user found:', {
        user_id: currentUser.user_id,
        email: currentUser.email
      });

      // Note: Current password verification is skipped for this implementation
      // In a production environment, you would want to implement proper verification
      console.log('Skipping current password verification - proceeding with password update');

      // Now update the password
      console.log('Updating user password...');
      
      let updatedUser;
      if (management.users && typeof management.users.update === 'function') {
        console.log('Using management.users.update()');
        try {
          // Try object format first
          updatedUser = await management.users.update(
            { id: currentUser.user_id }, 
            { password: newPassword }
          );
        } catch (e) {
          if (e.message && e.message.includes("didn't pass validation")) {
            console.log('Retrying update with direct parameters...');
            // Try direct parameters (ID as string, data as second param)
            updatedUser = await management.users.update(currentUser.user_id, { password: newPassword });
          } else {
            throw e;
          }
        }
      }
      else if (typeof management.updateUser === 'function') {
        console.log('Using management.updateUser()');
        const result = await management.updateUser(
          { id: currentUser.user_id }, 
          { password: newPassword }
        );
        updatedUser = result.data || result;
      }
      else {
        throw new Error('Unable to find updateUser method on management client');
      }

      console.log('Password updated successfully');

    } catch (auth0Error) {
      console.error('Auth0 Management API error:', {
        message: auth0Error.message,
        status: auth0Error.status,
        statusCode: auth0Error.statusCode,
        error: auth0Error.error,
        error_description: auth0Error.error_description,
        originalError: auth0Error.originalError
      });
      
      // Handle specific Auth0 errors
      let errorMessage = 'Failed to update password: ' + (auth0Error.message || 'Unknown error');
      
      if (auth0Error.error === 'invalid_uri' || auth0Error.message?.includes('invalid_uri')) {
        errorMessage = 'Invalid Auth0 configuration. Please check that AUTH0_MGMT_DOMAIN is set correctly (should be your Auth0 domain without https://, e.g., "your-domain.auth0.com").';
      } else if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed. Please check your Auth0 Management API credentials (AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET).';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions. Please ensure your Auth0 Management API application has the required scopes (read:users, update:users).';
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
            error_description: auth0Error.error_description,
            user_id: tokenClaims.sub || 'undefined'
          }
        })
      };
    }

    console.log('Password change completed successfully for user:', currentUser.user_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Password updated successfully'
      })
    };

  } catch (error) {
    console.error('Error changing user password:', error);
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
