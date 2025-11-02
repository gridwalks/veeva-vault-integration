import { ManagementClient } from 'auth0';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
    console.log('Received authenticated request for sending password reset');

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

    const { userId, email, connection } = payload;

    if (!userId && !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Either user ID or email is required' })
      };
    }

    console.log('Sending password reset:', { userId, email, connection });

    // Get Auth0 Management API credentials
    let domain = process.env.AUTH0_MGMT_DOMAIN;
    const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
    const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
    const auth0ClientId = process.env.VITE_AUTH0_CLIENT_ID;

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

    if (!auth0ClientId) {
      console.error('Missing Auth0 client ID for change_password endpoint');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Server configuration error: Missing Auth0 client ID' 
        })
      };
    }

    // Initialize Auth0 Management Client to get user info if userId provided
    const managementConfig = {
      domain: domain,
      clientId: clientId,
      clientSecret: clientSecret,
      scope: 'read:users'
    };
    
    if (!managementConfig.domain.startsWith('https://')) {
      managementConfig.audience = `https://${domain}/api/v2/`;
      managementConfig.tokenProvider = {
        enableCache: true,
        cacheTTLInSeconds: 3600
      };
    }
    
    const management = new ManagementClient(managementConfig);

    let userEmail = email;
    let connectionName = connection || 'Username-Password-Authentication';

    // If userId is provided, fetch user to get email and connection
    if (userId && !email) {
      try {
        let user;
        if (management.users && typeof management.users.get === 'function') {
          try {
            user = await management.users.get({ id: userId });
          } catch (e) {
            if (e.message && e.message.includes("didn't pass validation")) {
              user = await management.users.get(userId);
            } else {
              throw e;
            }
          }
        } else if (typeof management.getUser === 'function') {
          const result = await management.getUser({ id: userId });
          user = result.data || result;
        } else {
          throw new Error('Unable to find getUser method on management client');
        }

        if (!user || !user.email) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ success: false, error: 'User not found or user has no email' })
          };
        }

        userEmail = user.email;
        
        // Get connection from user's identities
        if (user.identities && user.identities.length > 0) {
          connectionName = user.identities[0].connection || connectionName;
        }
      } catch (auth0Error) {
        console.error('Error fetching user:', auth0Error);
        return {
          statusCode: auth0Error.statusCode || auth0Error.status || 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Failed to fetch user: ' + (auth0Error.message || 'Unknown error')
          })
        };
      }
    }

    if (!userEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Email address is required' })
      };
    }

    // Send password reset email via Authentication API
    console.log('Sending password reset email to:', userEmail);
    try {
      const changePasswordUrl = `https://${domain}/dbconnections/change_password`;
      const changePasswordResponse = await fetch(changePasswordUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: auth0ClientId,
          email: userEmail,
          connection: connectionName
        })
      });

      if (!changePasswordResponse.ok) {
        const errorText = await changePasswordResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        console.error('Failed to send password reset email:', {
          status: changePasswordResponse.status,
          error: errorData
        });

        return {
          statusCode: changePasswordResponse.status,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Failed to send password reset email',
            details: errorData.error || 'Unknown error'
          })
        };
      }

      console.log('Password reset email sent successfully to:', userEmail);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Password reset email sent successfully',
          email: userEmail
        })
      };

    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to send password reset email: ' + (emailError.message || 'Unknown error')
        })
      };
    }

  } catch (error) {
    console.error('Error sending password reset:', error);
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

