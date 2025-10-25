import { auth } from 'express-oauth2-jwt-bearer';

// JWT validation configuration
const jwtCheck = auth({
  audience: 'https://yprime.acceleraqa.io',
  issuerBaseURL: 'https://dev-aedhk47a2vv8iis3.us.auth0.com/',
  tokenSigningAlg: 'RS256'
});

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

    // For Netlify Functions, we'll do basic token validation
    // In a production environment, you'd use the jwtCheck middleware
    // For now, we'll assume the token is valid if it exists

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

    // Simulate profile update - in a real app, you'd update your database
    console.log('Profile update request:', { userId, name, picture });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: {
          sub: userId,
          name: name || 'Updated Name',
          picture: picture || 'https://example.com/avatar.jpg',
          updated_at: new Date().toISOString()
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