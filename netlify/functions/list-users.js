import { getCorsHeaders, handleOptionsRequest, extractAuthToken, initAuth0ManagementClient, errorResponses } from './shared-utils.js';

export const handler = async (event) => {
  const headers = getCorsHeaders(['GET'], event);

  if (event.httpMethod === 'OPTIONS') {
    return handleOptionsRequest(headers);
  }

  try {
    // Extract JWT token for authentication
    const auth = extractAuthToken(event);
    if (!auth.valid) {
      return errorResponses.unauthorized(headers);
    }

    console.log('Received authenticated request for listing users');

    // Parse query parameters
    const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
    const page = parseInt(event.queryStringParameters?.page || '0', 10);
    const search = event.queryStringParameters?.search || '';
    const perPage = Math.min(Math.max(limit, 1), 100); // Limit between 1 and 100

    console.log('Fetching users with params:', { limit: perPage, page, search });

    // Initialize Auth0 Management Client
    const { client: management, error: clientError } = initAuth0ManagementClient('read:users read:roles');
    
    if (clientError) {
      console.error(clientError);
      return errorResponses.missingAuth0Credentials(headers);
    }

    // Build query parameters for Auth0 API
    const queryParams = {
      per_page: perPage,
      page: page,
      include_totals: true,
      sort: 'created_at:-1'
    };

    if (search) {
      queryParams.q = `email:*${search}* OR name:*${search}*`;
    }

    console.log('Fetching users from Auth0 with query:', queryParams);

    // Fetch users from Auth0
    let users;
    let total;
    try {
      if (management.users && typeof management.users.getAll === 'function') {
        // Use getAll with pagination
        const result = await management.users.getAll(queryParams);
        users = Array.isArray(result) ? result : result.data || [];
        total = result.total || users.length;
      } else if (management.users && typeof management.users.list === 'function') {
        // Use list method
        const result = await management.users.list(queryParams);
        users = Array.isArray(result) ? result : result.users || result.data || [];
        total = result.total || users.length;
      } else {
        // Direct API call - get access token first
        const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            audience: `https://${domain}/api/v2/`,
            grant_type: 'client_credentials',
            scope: 'read:users read:roles'
          })
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get access token for direct API call');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const response = await fetch(`https://${domain}/api/v2/users?${new URLSearchParams(queryParams)}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Auth0 API error: ${response.status}`);
        }
        
        const data = await response.json();
        users = Array.isArray(data) ? data : data.users || [];
        total = data.total || users.length;
      }

      console.log(`Fetched ${users.length} users (total: ${total})`);

      // Get roles for all users
      let rolesMap = {};
      try {
        if (management.roles && typeof management.roles.getAll === 'function') {
          const allRoles = await management.roles.getAll();
          const rolesList = Array.isArray(allRoles) ? allRoles : allRoles.roles || [];
          console.log('Available roles:', rolesList.map(r => r.name));
        }
      } catch (roleError) {
        console.warn('Could not fetch roles list:', roleError.message);
      }

      // For each user, get their roles
      const usersWithRoles = await Promise.all(users.map(async (user) => {
        let userRoles = [];
        try {
          if (management.users && typeof management.users.getUserRoles === 'function') {
            const rolesResult = await management.users.getUserRoles({ id: user.user_id });
            userRoles = Array.isArray(rolesResult) ? rolesResult : rolesResult.roles || [];
          } else {
            // Direct API call for roles - reuse management client's token
            // For simplicity, we'll just return empty roles if SDK method doesn't exist
            // This is a fallback scenario that shouldn't normally occur
            console.warn('Direct API call for roles not implemented - using empty roles');
            userRoles = [];
          }
        } catch (error) {
          console.warn(`Could not fetch roles for user ${user.user_id}:`, error.message);
        }

        return {
          user_id: user.user_id,
          email: user.email,
          name: user.name || user.nickname || '',
          blocked: user.blocked || false,
          email_verified: user.email_verified || false,
          created_at: user.created_at,
          updated_at: user.updated_at,
          last_login: user.last_login,
          logins_count: user.logins_count || 0,
          roles: userRoles.map(role => role.name || role)
        };
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          users: usersWithRoles,
          pagination: {
            page: page,
            per_page: perPage,
            total: total,
            total_pages: Math.ceil(total / perPage)
          }
        })
      };

    } catch (auth0Error) {
      console.error('Auth0 Management API error:', {
        message: auth0Error.message,
        status: auth0Error.status,
        statusCode: auth0Error.statusCode,
        error: auth0Error.error,
        error_description: auth0Error.error_description
      });
      
      let errorMessage = 'Failed to fetch users';
      
      if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed with Auth0 Management API';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions to list users';
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

  } catch (error) {
    console.error('Error listing users:', error);
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

