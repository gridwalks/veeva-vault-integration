import { ManagementClient } from 'auth0';
import crypto from 'crypto';

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
    console.log('Received authenticated request for user creation');

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

    const { email, name, password, connection } = payload;

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Email is required' })
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid email format' })
      };
    }

    const connectionName = connection || 'Username-Password-Authentication';
    console.log('Creating user with:', { email, name, connection: connectionName });

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

    console.log('Auth0 Management API credentials check:', {
      domain: domain ? `present (${domain})` : 'missing',
      clientId: clientId ? `present (${clientId.substring(0, 8)}...)` : 'missing',
      clientSecret: clientSecret ? 'present' : 'missing',
      auth0ClientId: auth0ClientId ? `present (${auth0ClientId.substring(0, 8)}...)` : 'missing'
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

    // Initialize Auth0 Management Client
    console.log('Initializing Auth0 Management Client with domain:', domain);
    
    const managementConfig = {
      domain: domain,
      clientId: clientId,
      clientSecret: clientSecret,
      scope: 'read:users create:users'
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

    // Step 1: Create user via Management API
    console.log('Creating user in Auth0...');
    let newUser;
    try {
      const userData = {
        email: email,
        connection: connectionName,
        verify_email: false, // Don't send verification email yet, we'll send change_password email instead
        email_verified: false
      };

      if (name) {
        userData.name = name;
      }

      if (password) {
        userData.password = password;
      } else {
        // If no password provided, generate a secure temporary password
        // User will reset it via the change_password email
        userData.password = generateSecurePassword();
        userData.verify_email = false;
      }

      // Create user using Management API
      if (management.users && typeof management.users.create === 'function') {
        console.log('Using management.users.create()');
        newUser = await management.users.create(userData);
      } else if (typeof management.createUser === 'function') {
        console.log('Using management.createUser()');
        const result = await management.createUser(userData);
        newUser = result.data || result;
      } else {
        throw new Error('Unable to find createUser method on management client');
      }

      console.log('User created successfully:', {
        user_id: newUser.user_id,
        email: newUser.email,
        name: newUser.name
      });

    } catch (auth0Error) {
      console.error('Auth0 Management API error during user creation:', {
        message: auth0Error.message,
        status: auth0Error.status,
        statusCode: auth0Error.statusCode,
        error: auth0Error.error,
        error_description: auth0Error.error_description
      });
      
      let errorMessage = 'Failed to create user';
      
      if (auth0Error.message?.includes('already exists') || auth0Error.error === 'user_exists') {
        errorMessage = 'A user with this email already exists';
      } else if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed with Auth0 Management API';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions to create user';
      } else if (auth0Error.message) {
        errorMessage = auth0Error.message;
      }
      
      const responseStatus = auth0Error.statusCode || auth0Error.status || 500;
      return {
        statusCode: responseStatus === 409 ? 409 : responseStatus,
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

    // Step 2: Send change password (invitation) email via Authentication API
    console.log('Sending change password email...');
    try {
      const changePasswordUrl = `https://${domain}/dbconnections/change_password`;
      const changePasswordResponse = await fetch(changePasswordUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: auth0ClientId,
          email: email,
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

        console.error('Failed to send change password email:', {
          status: changePasswordResponse.status,
          error: errorData
        });

        // User was created, but email failed - still return success but with warning
        console.warn('User created but invitation email failed to send');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            warning: 'User created but invitation email failed to send. Please send the invitation manually.',
            user: {
              user_id: newUser.user_id,
              email: newUser.email,
              name: newUser.name
            },
            emailError: errorData.error || 'Unknown error'
          })
        };
      }

      console.log('Change password email sent successfully');

    } catch (emailError) {
      console.error('Error sending change password email:', emailError);
      
      // User was created, but email failed - still return success but with warning
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          warning: 'User created but invitation email failed to send. Please send the invitation manually.',
          user: {
            user_id: newUser.user_id,
            email: newUser.email,
            name: newUser.name
          },
          emailError: emailError.message || 'Unknown error'
        })
      };
    }

    // Success - user created and email sent
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'User created and invitation email sent successfully',
        user: {
          user_id: newUser.user_id,
          email: newUser.email,
          name: newUser.name
        }
      })
    };

  } catch (error) {
    console.error('Error creating user with invite:', error);
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

// Helper function to generate a secure temporary password
function generateSecurePassword() {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const randomValues = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  
  return password;
}

