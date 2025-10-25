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

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('Received token for validation');

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

    const { userId, name, picture } = payload;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'User ID is required' })
      };
    }

    console.log('Profile update request:', { userId, name, picture });

    // Get Auth0 Management API credentials
    let domain = process.env.AUTH0_MGMT_DOMAIN;
    const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
    const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

    // Clean domain - remove https:// prefix if present
    if (domain && domain.startsWith('https://')) {
      domain = domain.replace('https://', '');
    }

    console.log('Auth0 Management API credentials check:', {
      domain: domain ? `present (${domain})` : 'missing',
      clientId: clientId ? `present (${clientId.substring(0, 8)}...)` : 'missing',
      clientSecret: clientSecret ? 'present' : 'missing'
    });

    if (!domain || !clientId || !clientSecret) {
      console.error('Missing Auth0 Management API credentials:', {
        domain: !!domain,
        clientId: !!clientId,
        clientSecret: !!clientSecret
      });
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
    const management = new ManagementClient({
      domain: domain,
      clientId: clientId,
      clientSecret: clientSecret,
      scope: 'read:users update:users'
    });

    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (picture !== undefined) updateData.picture = picture;

    console.log('Updating Auth0 user with data:', updateData);
    console.log('User ID for update:', userId);

    // Update the user in Auth0
    let updatedUser;
    try {
      // First, let's try to list users to see what's available
      console.log('Attempting to list users to debug...');
      const users = await management.users.list({ per_page: 5 });
      console.log('Found users:', users.map(u => ({ id: u.user_id, name: u.name, email: u.email })));
      
      // URL encode the user ID in case it contains special characters
      const encodedUserId = encodeURIComponent(userId);
      console.log('Original user ID:', userId);
      console.log('Encoded user ID:', encodedUserId);
      
      // Try to get the user with the original ID first
      console.log('Attempting to get user with original ID:', userId);
      let existingUser;
      let updateId = userId;
      try {
        existingUser = await management.users.get({ id: userId });
        updateId = existingUser.user_id || userId;
        console.log('User found with original ID:', { userId: existingUser.user_id, name: existingUser.name });
      } catch (getError) {
        console.log('Failed to get user with original ID, trying encoded ID...');
        existingUser = await management.users.get({ id: encodedUserId });
        updateId = existingUser.user_id || encodedUserId;
        console.log('User found with encoded ID:', { userId: existingUser.user_id, name: existingUser.name });
      }

      // Now update the user using the ID returned from Auth0 (preferred) or the format that succeeded
      const updateRequestId = updateId.includes('%') ? updateId : encodeURIComponent(updateId);
      console.log('Updating user with data:', updateData, 'using ID:', updateId, 'request ID:', updateRequestId);
      updatedUser = await management.users.update({ id: updateRequestId }, updateData);
    } catch (auth0Error) {
      console.error('Auth0 Management API error:', {
        message: auth0Error.message,
        status: auth0Error.status,
        statusCode: auth0Error.statusCode,
        error: auth0Error.error,
        error_description: auth0Error.error_description,
        stack: auth0Error.stack,
        fullError: auth0Error
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to update user profile in Auth0: ' + (auth0Error.message || 'Unknown error'),
          details: {
            status: auth0Error.status || auth0Error.statusCode,
            error: auth0Error.error,
            error_description: auth0Error.error_description
          }
        })
      };
    }

    console.log('Auth0 user updated successfully:', {
      userId: updatedUser.user_id,
      name: updatedUser.name,
      picture: updatedUser.picture
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: {
          sub: updatedUser.user_id,
          name: updatedUser.name,
          picture: updatedUser.picture,
          updated_at: updatedUser.updated_at
        }
      })
    };

  } catch (error) {
    console.error('Error updating user profile:', error);
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