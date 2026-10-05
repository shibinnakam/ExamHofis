const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminInitiateAuthCommand,
  InitiateAuthCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const { cognitoClient, COGNITO } = require('../config/aws-config');

/**
 * Calculate SECRET_HASH if Cognito App Client has a client secret configured
 */
function calculateSecretHash(username, clientId, clientSecret) {
  if (!clientSecret) return undefined;
  return crypto
    .createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

/**
 * Create a user in Cognito User Pool with permanent password and assigned group/role
 */
async function adminCreateUser({ username, password, role, name, email }) {
  if (!COGNITO.USER_POOL_ID) {
    throw new Error('COGNITO_USER_POOL_ID is not configured');
  }

  const cleanUsername = username.trim().toLowerCase();
  const userEmail = email || `${cleanUsername}@examhofis.local`;
  const secretHash = calculateSecretHash(cleanUsername, COGNITO.CLIENT_ID, COGNITO.CLIENT_SECRET);

  const attributes = [
    { Name: 'email', Value: userEmail },
    { Name: 'email_verified', Value: 'true' }
  ];

  if (name) {
    attributes.push({ Name: 'name', Value: name });
  }

  try {
    // 1. Create User
    const createParams = {
      UserPoolId: COGNITO.USER_POOL_ID,
      Username: cleanUsername,
      UserAttributes: attributes,
      MessageAction: 'SUPPRESS',
      TemporaryPassword: password
    };

    const createRes = await cognitoClient.send(new AdminCreateUserCommand(createParams));
    const sub = createRes.User?.Attributes?.find(a => a.Name === 'sub')?.Value || createRes.User?.Username;

    // 2. Set permanent password (so user doesn't encounter FORCE_CHANGE_PASSWORD)
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: COGNITO.USER_POOL_ID,
        Username: cleanUsername,
        Password: password,
        Permanent: true
      })
    );

    // 3. Add to Cognito Group (admin, teacher, student)
    if (role) {
      try {
        await cognitoClient.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: COGNITO.USER_POOL_ID,
            Username: cleanUsername,
            GroupName: role
          })
        );
      } catch (grpErr) {
        console.warn(`[Cognito] Could not add user to group ${role}:`, grpErr.message);
      }
    }

    return {
      sub,
      username: cleanUsername,
      email: userEmail,
      role
    };
  } catch (err) {
    console.error(`[Cognito] adminCreateUser failed for ${cleanUsername}:`, err);
    throw err;
  }
}

/**
 * Authenticate user with Cognito using ADMIN_NO_SRP_AUTH or USER_PASSWORD_AUTH
 */
async function loginUser(username, password) {
  if (!COGNITO.USER_POOL_ID || !COGNITO.CLIENT_ID) {
    throw new Error('Cognito configuration missing: USER_POOL_ID or CLIENT_ID');
  }

  const cleanUsername = username.trim().toLowerCase();
  const authParams = {
    USERNAME: cleanUsername,
    PASSWORD: password
  };

  const secretHash = calculateSecretHash(cleanUsername, COGNITO.CLIENT_ID, COGNITO.CLIENT_SECRET);
  if (secretHash) {
    authParams.SECRET_HASH = secretHash;
  }

  try {
    // Try AdminInitiateAuth first (most flexible backend authorization)
    let authResult;
    try {
      const command = new AdminInitiateAuthCommand({
        UserPoolId: COGNITO.USER_POOL_ID,
        ClientId: COGNITO.CLIENT_ID,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: authParams
      });
      const response = await cognitoClient.send(command);
      authResult = response.AuthenticationResult;
    } catch (adminErr) {
      // Fallback to InitiateAuth (USER_PASSWORD_AUTH) if IAM lacks Admin permission
      const command = new InitiateAuthCommand({
        ClientId: COGNITO.CLIENT_ID,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: authParams
      });
      const response = await cognitoClient.send(command);
      authResult = response.AuthenticationResult;
    }

    if (!authResult) {
      throw new Error('Authentication failed: No authentication tokens received from Cognito');
    }

    // Decode ID Token to inspect claims (groups, sub, username)
    const idToken = authResult.IdToken;
    const decoded = jwt.decode(idToken) || {};
    const groups = decoded['cognito:groups'] || [];
    const role = groups[0] || decoded['custom:role'] || 'student';
    const sub = decoded.sub || cleanUsername;

    return {
      success: true,
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      refreshToken: authResult.RefreshToken,
      expiresIn: authResult.ExpiresIn,
      user: {
        id: sub,
        sub,
        username: decoded['cognito:username'] || cleanUsername,
        role,
        groups
      }
    };
  } catch (err) {
    console.error(`[Cognito] Login failed for ${cleanUsername}:`, err.message);
    if (err.name === 'NotAuthorizedException' || err.name === 'UserNotFoundException') {
      throw new Error('Invalid username or password');
    }
    throw err;
  }
}

/**
 * Update user's password in Cognito
 */
async function adminSetUserPassword(username, newPassword) {
  if (!COGNITO.USER_POOL_ID) return;
  const cleanUsername = username.trim().toLowerCase();

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO.USER_POOL_ID,
      Username: cleanUsername,
      Password: newPassword,
      Permanent: true
    })
  );
}

/**
 * Delete a user from Cognito User Pool
 */
async function adminDeleteUser(username) {
  if (!COGNITO.USER_POOL_ID) return;
  const cleanUsername = username.trim().toLowerCase();

  try {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: COGNITO.USER_POOL_ID,
        Username: cleanUsername
      })
    );
  } catch (err) {
    console.warn(`[Cognito] Could not delete user ${cleanUsername}:`, err.message);
  }
}

/**
 * Fetch user details from Cognito
 */
async function adminGetUser(username) {
  if (!COGNITO.USER_POOL_ID) return null;
  const cleanUsername = username.trim().toLowerCase();

  try {
    const res = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: COGNITO.USER_POOL_ID,
        Username: cleanUsername
      })
    );
    return res;
  } catch (err) {
    if (err.name === 'UserNotFoundException') return null;
    throw err;
  }
}

/**
 * Verify / Decode a Cognito JWT Token
 */
function verifyCognitoToken(token) {
  if (!token) throw new Error('Token is required');
  const decoded = jwt.decode(token);
  if (!decoded) throw new Error('Invalid token');

  // Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp && decoded.exp < now) {
    throw new Error('Token has expired');
  }

  const groups = decoded['cognito:groups'] || [];
  const role = groups[0] || decoded['custom:role'] || decoded.role || 'student';

  return {
    id: decoded.sub || decoded.id,
    sub: decoded.sub,
    username: decoded['cognito:username'] || decoded.username,
    role,
    decoded
  };
}

module.exports = {
  adminCreateUser,
  loginUser,
  adminSetUserPassword,
  adminDeleteUser,
  adminGetUser,
  verifyCognitoToken
};
