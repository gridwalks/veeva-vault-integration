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
    console.log('User ID supplied by request body:', userId);
    if (tokenClaims.sub && tokenClaims.sub !== userId) {
      console.log('User ID mismatch detected between token sub and request payload. Using both values for lookup.');
    }

    // Update the user in Auth0
    let updatedUser;
    try {
      // First, let's try to list users to see what's available
      console.log('Attempting to list users to debug...');
      const users = await management.users.list({ per_page: 5 });
      console.log('Found users:', users.map(u => ({ id: u.user_id, name: u.name, email: u.email })));
      
      const candidateIds = new Set();
      if (userId) {
        candidateIds.add(userId);
      }
      if (tokenClaims.sub) {
        candidateIds.add(tokenClaims.sub);
      }

      const lookupIds = [];
      for (const candidateId of candidateIds) {
        lookupIds.push(candidateId);
        const encodedCandidate = encodeURIComponent(candidateId);
        if (encodedCandidate !== candidateId) {
          lookupIds.push(encodedCandidate);
        }
      }

      console.log('Candidate Auth0 user IDs for lookup:', lookupIds);

      let existingUser;
      let resolvedId;

      for (const candidateId of lookupIds) {
        console.log('Attempting to get user with ID:', candidateId);
        try {
          existingUser = await management.users.get({ id: candidateId });
          resolvedId = existingUser.user_id;
          console.log('User found:', {
            requestedId: candidateId,
            userId: existingUser.user_id,
            name: existingUser.name
          });
          break;
        } catch (getError) {
          if (getError.statusCode === 404 || getError.status === 404) {
            console.log('User not found with ID, trying next candidate...');
            continue;
          }
          throw getError;
        }
      }

      if (!existingUser || !resolvedId) {
        throw Object.assign(new Error('User not found in Auth0'), { statusCode: 404 });
      }

      console.log('Updating user with data:', updateData, 'using resolved ID:', resolvedId);
      updatedUser = await management.users.update({ id: resolvedId }, updateData);
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
      const responseStatus = auth0Error.statusCode || auth0Error.status;
      return {
        statusCode: responseStatus === 404 ? 404 : 500,
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