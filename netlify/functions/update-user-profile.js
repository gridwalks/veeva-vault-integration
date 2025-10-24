import { ManagementClient } from 'auth0';

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

    if (!domain || !clientId || !clientSecret) {
      console.error('Missing Auth0 Management API credentials');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Server configuration error'
        })
      };
    }

    // Initialize Auth0 Management Client
    const management = new ManagementClient({
      domain: domain,
      clientId: clientId,
      clientSecret: clientSecret,
      scope: 'update:users'
    });

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

    // Update user in Auth0
    const updatedUser = await management.updateUser(
      { id: userId },
      updateData
    );

    console.log('User profile updated successfully:', updatedUser.user_id);

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
        error: 'Internal server error'
      })
    };
  }
};
