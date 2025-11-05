import { getCorsHeaders, handleOptionsRequest, extractAuthToken, parseRequestBody, getJsonParseErrorResponse, initAuth0ManagementClient, errorResponses, createErrorResponse, createSuccessResponse } from './shared-utils.js';

export const handler = async (event) => {
  const headers = getCorsHeaders(['PUT', 'PATCH'], event);

  if (event.httpMethod === 'OPTIONS') {
    return handleOptionsRequest(headers);
  }

  try {
    // Extract JWT token for authentication
    const auth = extractAuthToken(event);
    if (!auth.valid) {
      return errorResponses.unauthorized(headers);
    }

    console.log('Received authenticated request for updating user status');

    // Validate request body
    if (!event.body) {
      return errorResponses.missingBody(headers);
    }

    const payload = parseRequestBody(event.body, headers);
    if (!payload) {
      return getJsonParseErrorResponse(headers);
    }

    const { userId, blocked } = payload;

    if (!userId) {
      return createErrorResponse(400, 'User ID is required', headers);
    }

    if (typeof blocked !== 'boolean') {
      return createErrorResponse(400, 'Blocked status must be a boolean', headers);
    }

    console.log('Updating user status:', { userId, blocked });

    // Initialize Auth0 Management Client
    const { client: management, error: clientError } = initAuth0ManagementClient('read:users update:users');
    
    if (clientError) {
      console.error(clientError);
      return errorResponses.missingAuth0Credentials(headers);
    }

    // Update user blocked status
    try {
      let updatedUser;
      if (management.users && typeof management.users.update === 'function') {
        console.log('Using management.users.update()');
        try {
          updatedUser = await management.users.update(
            { id: userId }, 
            { blocked: blocked }
          );
        } catch (e) {
          if (e.message && e.message.includes("didn't pass validation")) {
            console.log('Retrying update with direct parameters...');
            updatedUser = await management.users.update(
              userId, 
              { blocked: blocked }
            );
          } else {
            throw e;
          }
        }
      }
      else if (typeof management.updateUser === 'function') {
        console.log('Using management.updateUser()');
        const result = await management.updateUser(
          { id: userId }, 
          { blocked: blocked }
        );
        updatedUser = result.data || result;
      }
      else {
        throw new Error('Unable to find updateUser method on management client');
      }

      console.log('User status updated successfully:', {
        user_id: updatedUser.user_id,
        email: updatedUser.email,
        blocked: updatedUser.blocked
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `User ${blocked ? 'disabled' : 'enabled'} successfully`,
          user: {
            user_id: updatedUser.user_id,
            email: updatedUser.email,
            blocked: updatedUser.blocked
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
      
      let errorMessage = 'Failed to update user status';
      
      if (auth0Error.status === 401 || auth0Error.statusCode === 401) {
        errorMessage = 'Authentication failed with Auth0 Management API';
      } else if (auth0Error.status === 403 || auth0Error.statusCode === 403) {
        errorMessage = 'Insufficient permissions to update user';
      } else if (auth0Error.status === 404 || auth0Error.statusCode === 404) {
        errorMessage = 'User not found';
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
    console.error('Error updating user status:', error);
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

