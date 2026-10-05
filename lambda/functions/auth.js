const cognitoService = require('../../services/cognitoService');
const dynamoService = require('../../services/dynamoService');

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.rawPath || '';

  try {
    // 1. POST /api/auth/login
    if (method === 'POST' && path.endsWith('/login')) {
      const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
      const { username, password } = body;

      if (!username || !password) {
        return buildResponse(400, { error: 'Username and password are required' });
      }

      // Authenticate with Cognito
      const authResult = await cognitoService.loginUser(username, password);

      // Fetch user profile from DynamoDB
      let userRecord = await dynamoService.getUserByUsername(username);
      let profile = null;

      if (userRecord) {
        if (userRecord.role === 'student') {
          profile = await dynamoService.getStudentByUserId(userRecord.id);
        } else if (userRecord.role === 'teacher') {
          profile = await dynamoService.getTeacherByUserId(userRecord.id);
        }
      }

      return buildResponse(200, {
        success: true,
        token: authResult.idToken || authResult.accessToken,
        accessToken: authResult.accessToken,
        idToken: authResult.idToken,
        user: {
          id: userRecord ? userRecord.id : authResult.user.id,
          username: authResult.user.username,
          role: authResult.user.role,
          profile
        }
      });
    }

    // 2. GET /api/auth/me
    if (method === 'GET' && path.endsWith('/me')) {
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) {
        return buildResponse(401, { error: 'Authorization header missing' });
      }

      const decoded = cognitoService.verifyCognitoToken(token);
      let userRecord = await dynamoService.getUserByUsername(decoded.username);
      let profile = null;

      if (userRecord) {
        if (userRecord.role === 'student') {
          profile = await dynamoService.getStudentByUserId(userRecord.id);
        } else if (userRecord.role === 'teacher') {
          profile = await dynamoService.getTeacherByUserId(userRecord.id);
        }
      }

      return buildResponse(200, {
        user: {
          id: userRecord?.id || decoded.id,
          username: decoded.username,
          role: decoded.role,
          profile
        }
      });
    }

    return buildResponse(404, { error: `Route not found: ${method} ${path}` });
  } catch (err) {
    console.error('[Lambda Auth] Error:', err);
    return buildResponse(err.statusCode || 500, { error: err.message || 'Internal Server Error' });
  }
};
