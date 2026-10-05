require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';

// Client configuration options
const clientConfig = {
  region: REGION
};

// If custom endpoint is supplied (e.g. LocalStack or DynamoDB Local)
if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

// If explicit credentials are provided in .env (otherwise AWS SDK automatically uses IAM role or ~/.aws/credentials)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
  };
}

// 1. DynamoDB Client & Document Client
const ddbRawClient = new DynamoDBClient(clientConfig);
const dynamoDocClient = DynamoDBDocumentClient.from(ddbRawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

// 2. Cognito Identity Provider Client
const cognitoClient = new CognitoIdentityProviderClient({
  region: REGION,
  ...(clientConfig.credentials ? { credentials: clientConfig.credentials } : {})
});

// Table names configuration
const TABLES = {
  USERS: process.env.DYNAMODB_TABLE_USERS || 'ExamHofis_Users',
  STUDENTS: process.env.DYNAMODB_TABLE_STUDENTS || 'ExamHofis_Students',
  TEACHERS: process.env.DYNAMODB_TABLE_TEACHERS || 'ExamHofis_Teachers'
};

// Cognito configuration
const COGNITO = {
  USER_POOL_ID: process.env.COGNITO_USER_POOL_ID || '',
  CLIENT_ID: process.env.COGNITO_CLIENT_ID || '',
  CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET || ''
};

// Check if AWS is configured
function isAwsConfigured() {
  return Boolean(
    (process.env.AWS_LAMBDA_FUNCTION_NAME || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)) &&
    COGNITO.USER_POOL_ID &&
    COGNITO.CLIENT_ID
  );
}

module.exports = {
  REGION,
  TABLES,
  COGNITO,
  ddbRawClient,
  dynamoDocClient,
  cognitoClient,
  isAwsConfigured
};
