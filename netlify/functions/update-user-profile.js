const ALLOWED_METHODS = ['PUT', 'PATCH'];

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

  if (!ALLOWED_METHODS.includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed',
        allowedMethods: ALLOWED_METHODS
      })
    };
  }

  try {
    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Request body is required'
        })
      };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON payload'
        })
      };
    }

    const { userId, name, picture } = payload;

    // Validate required fields
    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'User ID is required'
        })
      };
    }

    // Validate Auth0 Management API credentials
    const domain = process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
    const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

    console.log('Auth0 Management API credentials check:', {
      domain: domain ? 'present' : 'missing',
      clientId: clientId ? 'present' : 'missing',
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
          error: 'Server configuration error: Missing Auth0 Management API credentials'
        })
      };
    }

    // Initialize Auth0 Management Client
    let management;
    try {
      // Dynamic import to avoid module loading issues
      const { ManagementClient } = await import('auth0');
      
      management = new ManagementClient({
        domain: domain,
        clientId: clientId,
        clientSecret: clientSecret,
        scope: 'read:users update:users'
      });
      console.log('Auth0 Management Client initialized successfully');
    } catch (initError) {
      console.error('Failed to initialize Auth0 Management Client:', initError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to initialize Auth0 client: ' + initError.message
        })
      };
    }

    // Prepare update data
    const updateData = {};
    
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    
    if (picture !== undefined) {
      updateData.picture = picture.trim();
    }

    // Validate that at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'At least one field (name or picture) must be provided for update'
        })
      };
    }

    console.log('Updating user profile:', { userId, updateData });

    // First, try to get the user to verify we can access them
    let currentUser;
    try {
      console.log('Getting current user info for:', userId);
      currentUser = await management.getUser({ id: userId });
      console.log('Current user retrieved successfully:', currentUser.user_id);
    } catch (getError) {
      console.error('Failed to get user from Auth0:', getError);
      console.error('Get error details:', {
        message: getError.message,
        statusCode: getError.statusCode,
        status: getError.status,
        response: getError.response
      });
      throw getError;
    }

    // Update user in Auth0
    let updatedUser;
    try {
      console.log('Calling management.updateUser with:', { id: userId, updateData });
      updatedUser = await management.updateUser(
        { id: userId },
        updateData
      );
      console.log('User profile updated successfully:', updatedUser.user_id);
    } catch (updateError) {
      console.error('Failed to update user in Auth0:', updateError);
      console.error('Update error details:', {
        message: updateError.message,
        statusCode: updateError.statusCode,
        status: updateError.status,
        response: updateError.response
      });
      throw updateError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: {
          sub: updatedUser.user_id,
          name: updatedUser.name,
          picture: updatedUser.picture,
          email: updatedUser.email,
          email_verified: updatedUser.email_verified,
          created_at: updatedUser.created_at,
          updated_at: updatedUser.updated_at
        }
      })
    };

  } catch (error) {
    console.error('Error updating user profile:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      name: error.name
    });
    
    // Handle specific Auth0 errors
    if (error.statusCode === 404) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'User not found'
        })
      };
    }
    
    if (error.statusCode === 400) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: error.message || 'Invalid request data'
        })
      };
    }

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
