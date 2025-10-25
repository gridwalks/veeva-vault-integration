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
      try {
        const parts = jwt.split('.');
        if (parts.length !== 3) {
          throw new Error('Invalid JWT format - expected 3 parts');
        }

        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        
        // Calculate proper padding
        const padLength = 4 - (base64.length % 4);
        const padded = padLength === 4 ? base64 : base64 + '='.repeat(padLength);
        
        const json = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(json);
      } catch (error) {
        console.error('JWT decode error details:', {
          error: error.message,
          tokenLength: jwt ? jwt.length : 0,
          tokenParts: jwt ? jwt.split('.').length : 0
        });
        throw error;
      }
    };

    let tokenClaims = {};
    try {
      tokenClaims = decodeJwt(token);
      console.log('Token claims extracted:', {
        sub: tokenClaims.sub,
        iss: tokenClaims.iss,
        aud: tokenClaims.aud,
        exp: tokenClaims.exp
      });
    } catch (decodeError) {
      console.error('Unable to decode JWT payload:', decodeError.message);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authentication token. Please log out and log back in.',
          details: {
            decodeError: decodeError.message
          }
        })
      };
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
    
    console.log('Management config:', {
      domain: managementConfig.domain,
      audience: managementConfig.audience,
      clientId: managementConfig.clientId ? 'present' : 'missing'
    });
    
    const management = new ManagementClient(managementConfig);

    // Use the token's sub claim as the user ID
    const userIdToUpdate = tokenClaims.sub;
    console.log('Using user ID from token sub claim:', userIdToUpdate);

    if (!userIdToUpdate) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Unable to identify user from authentication token'
        })
      };
    }

    // First verify the user exists and get current data
    console.log('Fetching current user data...');
    let currentUser;
    
    try {
      // Try the management.users.get method
      if (management.users && typeof management.users.get === 'function') {
        console.log('Using management.users.get()');
        try {
          currentUser = await management.users.get({ id: userIdToUpdate });
        } catch (e) {
          if (e.message && e.message.includes("didn't pass validation")) {
            console.log('Retrying with ID as direct parameter...');
            currentUser = await management.users.get(userIdToUpdate);
          } else {
            throw e;
          }
        }
      } 
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

      // Note: We cannot verify the current password via Management API
      // Auth0 doesn't expose password verification through the Management API
      console.log('Note: Current password verification not available via Management API');

      // Update the password
      console.log('Updating user password...');
      
      let updatedUser;
      if (management.users && typeof management.users.update === 'function') {
        console.log('Using management.users.update()');
        try {
          updatedUser = await management.users.update(
            { id: currentUser.user_id }, 
            { password: newPassword, connection: 'Username-Password-Authentication' }
          );
        } catch (e) {
          if (e.message && e.message.includes("didn't pass validation")) {
            console.log('Retrying update with direct parameters...');
            updatedUser = await management.users.update(
              currentUser.user_id, 
              { password: newPassword, connection: 'Username-Password-Authentication' }
            );
          } else {
            throw e;
          }
        }
      }
      else if (typeof management.updateUser === 'function') {
        console.log('Using management.updateUser()');
        const result = await management.updateUser(
          { id: currentUser.user_id }, 
          { password: newPassword, connection: 'Username-Password-Authentication' }
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
        error_description: auth0Error.error_description
      });
      
      let errorMessage = 'Failed to update password';
      
      if (auth0Error.message?.includes('PasswordStrengthError')) {
        errorMessage = 'Password does not meet strength requirements. Please use a stronger password.';
      } else if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed with Auth0 Management API';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions to update password';
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

    console.log('Password change completed successfully');

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
