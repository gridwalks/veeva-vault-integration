import https from 'https';

const ALLOWED_METHODS = ['PUT', 'PATCH'];

// Helper function to make HTTPS requests
function makeHttpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    console.log('Making HTTPS request to:', url);
    
    // Parse URL manually since URL constructor might not be available
    console.log('Parsing URL:', url);
    const urlMatch = url.match(/^https:\/\/([^\/]+)(.*)$/);
    console.log('URL match result:', urlMatch);
    
    if (!urlMatch) {
      console.error('Invalid HTTPS URL:', url);
      reject(new Error(`Invalid HTTPS URL: ${url}`));
      return;
    }
    
    const hostname = urlMatch[1];
    const path = urlMatch[2] || '/';
    console.log('Parsed hostname:', hostname, 'path:', path);
    
    const requestOptions = {
      hostname: hostname,
      port: 443,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    console.log('Request options:', requestOptions);

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: () => Promise.resolve(jsonData),
            text: () => Promise.resolve(data)
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: () => Promise.reject(error),
            text: () => Promise.resolve(data)
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

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
      domain: domain,
      domainLength: domain ? domain.length : 0,
      clientId: clientId ? 'present' : 'missing',
      clientSecret: clientSecret ? 'present' : 'missing',
      allEnvVars: Object.keys(process.env).filter(key => key.includes('AUTH0'))
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

    // Get Auth0 Management API access token
    let accessToken;
    try {
      console.log('Getting Auth0 Management API access token...');
      // Clean domain - remove https:// if it's already there
      const cleanDomain = domain.replace(/^https?:\/\//, '');
      const tokenUrl = `https://${cleanDomain}/oauth/token`;
      console.log('Token request details:', {
        originalDomain: domain,
        cleanDomain: cleanDomain,
        tokenUrl: tokenUrl,
        clientId: clientId ? 'present' : 'missing',
        clientSecret: clientSecret ? 'present' : 'missing',
        audience: `https://${cleanDomain}/api/v2/`
      });
      
      const tokenResponse = await makeHttpsRequest(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          audience: `https://${cleanDomain}/api/v2/`,
          grant_type: 'client_credentials'
        })
      });

      console.log('Token response received:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        ok: tokenResponse.ok
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Failed to get access token:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText
        });
        throw new Error(`Failed to get access token: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;
      console.log('Access token obtained successfully');
    } catch (tokenError) {
      console.error('Failed to get Auth0 access token:', tokenError);
      console.error('Token error details:', {
        message: tokenError.message,
        name: tokenError.name,
        stack: tokenError.stack,
        cause: tokenError.cause
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to get Auth0 access token: ' + tokenError.message
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
      
      const getUserResponse = await makeHttpsRequest(`https://${cleanDomain}/api/v2/users/${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!getUserResponse.ok) {
        const errorText = await getUserResponse.text();
        console.error('Failed to get user:', {
          status: getUserResponse.status,
          statusText: getUserResponse.statusText,
          error: errorText
        });
        throw new Error(`Failed to get user: ${getUserResponse.status} ${getUserResponse.statusText}`);
      }

      currentUser = await getUserResponse.json();
      console.log('Current user retrieved successfully:', currentUser.user_id);
    } catch (getError) {
      console.error('Failed to get user from Auth0:', getError);
      console.error('Get error details:', {
        message: getError.message,
        stack: getError.stack
      });
      
      // If we can't get the user, we can't update them either
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to access user: ' + getError.message
        })
      };
    }

    // Update user in Auth0
    let updatedUser;
    try {
      console.log('Updating user with data:', { id: userId, updateData });
      
      const updateUserResponse = await makeHttpsRequest(`https://${cleanDomain}/api/v2/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!updateUserResponse.ok) {
        const errorText = await updateUserResponse.text();
        console.error('Failed to update user:', {
          status: updateUserResponse.status,
          statusText: updateUserResponse.statusText,
          error: errorText
        });
        throw new Error(`Failed to update user: ${updateUserResponse.status} ${updateUserResponse.statusText}`);
      }

      updatedUser = await updateUserResponse.json();
      console.log('User profile updated successfully:', updatedUser.user_id);
    } catch (updateError) {
      console.error('Failed to update user in Auth0:', updateError);
      console.error('Update error details:', {
        message: updateError.message,
        stack: updateError.stack
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
