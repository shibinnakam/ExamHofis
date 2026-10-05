/**
 * AWS Infrastructure Setup Script for ExamHofis
 * 
 * Provisions:
 * 1. DynamoDB Tables:
 *    - ExamHofis_Users (PK: id, GSI: UsernameIndex)
 *    - ExamHofis_Students (PK: id, GSIs: ClassIndex, AdmissionNoIndex, UserIdIndex)
 *    - ExamHofis_Teachers (PK: id, GSIs: ClassIndex, SubjectIndex, UserIdIndex)
 * 2. Cognito User Pool, Client, and Groups:
 *    - User Pool: ExamHofis-Users
 *    - App Client: ExamHofis-WebClient (ADMIN_NO_SRP_AUTH & USER_PASSWORD_AUTH)
 *    - Groups: admin, teacher, student
 * 
 * Run: node scripts/setup-aws.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists
} = require('@aws-sdk/client-dynamodb');
const {
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  CreateGroupCommand,
  ListUserPoolsCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const { ddbRawClient, cognitoClient, REGION, TABLES } = require('../config/aws-config');

async function tableExists(tableName) {
  try {
    await ddbRawClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function createDynamoTables() {
  console.log('\n--- 1. Provisioning AWS DynamoDB Tables ---');

  // 1. Users Table
  if (await tableExists(TABLES.USERS)) {
    console.log(`[DynamoDB] Table "${TABLES.USERS}" already exists.`);
  } else {
    console.log(`[DynamoDB] Creating table "${TABLES.USERS}"...`);
    await ddbRawClient.send(
      new CreateTableCommand({
        TableName: TABLES.USERS,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'username', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'UsernameIndex',
            KeySchema: [{ AttributeName: 'username', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          }
        ]
      })
    );
    console.log(`[DynamoDB] Table "${TABLES.USERS}" created.`);
  }

  // 2. Students Table
  if (await tableExists(TABLES.STUDENTS)) {
    console.log(`[DynamoDB] Table "${TABLES.STUDENTS}" already exists.`);
  } else {
    console.log(`[DynamoDB] Creating table "${TABLES.STUDENTS}"...`);
    await ddbRawClient.send(
      new CreateTableCommand({
        TableName: TABLES.STUDENTS,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'class', AttributeType: 'N' },
          { AttributeName: 'admission_no', AttributeType: 'S' },
          { AttributeName: 'user_id', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'ClassIndex',
            KeySchema: [{ AttributeName: 'class', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          },
          {
            IndexName: 'AdmissionNoIndex',
            KeySchema: [{ AttributeName: 'admission_no', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          },
          {
            IndexName: 'UserIdIndex',
            KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          }
        ]
      })
    );
    console.log(`[DynamoDB] Table "${TABLES.STUDENTS}" created.`);
  }

  // 3. Teachers Table
  if (await tableExists(TABLES.TEACHERS)) {
    console.log(`[DynamoDB] Table "${TABLES.TEACHERS}" already exists.`);
  } else {
    console.log(`[DynamoDB] Creating table "${TABLES.TEACHERS}"...`);
    await ddbRawClient.send(
      new CreateTableCommand({
        TableName: TABLES.TEACHERS,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'class', AttributeType: 'N' },
          { AttributeName: 'subject', AttributeType: 'S' },
          { AttributeName: 'user_id', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'ClassIndex',
            KeySchema: [{ AttributeName: 'class', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          },
          {
            IndexName: 'SubjectIndex',
            KeySchema: [{ AttributeName: 'subject', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          },
          {
            IndexName: 'UserIdIndex',
            KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
          }
        ]
      })
    );
    console.log(`[DynamoDB] Table "${TABLES.TEACHERS}" created.`);
  }
}

async function createCognitoUserPool() {
  console.log('\n--- 2. Provisioning AWS Cognito User Pool & Client ---');

  let poolId = process.env.COGNITO_USER_POOL_ID;
  let clientId = process.env.COGNITO_CLIENT_ID;

  if (poolId && clientId) {
    console.log(`[Cognito] Using existing User Pool: ${poolId}, Client: ${clientId}`);
    return { poolId, clientId };
  }

  console.log('[Cognito] Creating new User Pool: "ExamHofis-Users"...');
  const poolRes = await cognitoClient.send(
    new CreateUserPoolCommand({
      PoolName: 'ExamHofis-Users',
      Policies: {
        PasswordPolicy: {
          MinimumLength: 6,
          RequireUppercase: false,
          RequireLowercase: false,
          RequireNumbers: false,
          RequireSymbols: false
        }
      },
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: false
      },
      AutoVerifiedAttributes: ['email']
    })
  );

  poolId = poolRes.UserPool.Id;
  console.log(`[Cognito] User Pool created! ID: ${poolId}`);

  console.log('[Cognito] Creating App Client: "ExamHofis-WebClient"...');
  const clientRes = await cognitoClient.send(
    new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: 'ExamHofis-WebClient',
      GenerateSecret: false,
      ExplicitAuthFlows: [
        'ALLOW_ADMIN_USER_PASSWORD_AUTH',
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH'
      ]
    })
  );

  clientId = clientRes.UserPoolClient.ClientId;
  console.log(`[Cognito] App Client created! Client ID: ${clientId}`);

  // Create groups: admin, teacher, student
  const groups = [
    { name: 'admin', description: 'ExamHofis Administrator' },
    { name: 'teacher', description: 'ExamHofis Faculty Member' },
    { name: 'student', description: 'ExamHofis Enrolled Student' }
  ];

  for (const g of groups) {
    try {
      await cognitoClient.send(
        new CreateGroupCommand({
          UserPoolId: poolId,
          GroupName: g.name,
          Description: g.description
        })
      );
      console.log(`[Cognito] Created Group "${g.name}"`);
    } catch (grpErr) {
      if (grpErr.name === 'GroupExistsException') {
        console.log(`[Cognito] Group "${g.name}" already exists.`);
      } else {
        console.warn(`[Cognito] Could not create group ${g.name}:`, grpErr.message);
      }
    }
  }

  return { poolId, clientId };
}

async function updateEnvFile({ poolId, clientId }) {
  const envPath = path.join(__dirname, '..', '.env');
  let currentEnv = '';
  if (fs.existsSync(envPath)) {
    currentEnv = fs.readFileSync(envPath, 'utf8');
  }

  const newValues = {
    USE_AWS: 'true',
    AWS_REGION: REGION,
    COGNITO_USER_POOL_ID: poolId,
    COGNITO_CLIENT_ID: clientId,
    DYNAMODB_TABLE_USERS: TABLES.USERS,
    DYNAMODB_TABLE_STUDENTS: TABLES.STUDENTS,
    DYNAMODB_TABLE_TEACHERS: TABLES.TEACHERS
  };

  let updatedEnv = currentEnv;
  for (const [k, v] of Object.entries(newValues)) {
    const regex = new RegExp(`^${k}=.*$`, 'm');
    if (regex.test(updatedEnv)) {
      updatedEnv = updatedEnv.replace(regex, `${k}=${v}`);
    } else {
      updatedEnv += `\n${k}=${v}`;
    }
  }

  fs.writeFileSync(envPath, updatedEnv.trim() + '\n', 'utf8');
  console.log(`\n[Config] Updated .env file successfully with AWS IDs!`);
}

async function main() {
  try {
    console.log('========================================================');
    console.log('      ExamHofis AWS Infrastructure Setup Script         ');
    console.log(`      Target Region: ${REGION}                         `);
    console.log('========================================================');

    await createDynamoTables();
    const { poolId, clientId } = await createCognitoUserPool();
    await updateEnvFile({ poolId, clientId });

    console.log('\n========================================================');
    console.log(' AWS Setup Complete! Next steps:');
    console.log(' 1. Run seed script: node scripts/seed-aws.js');
    console.log(' 2. Run verification test: node scripts/test-aws.js');
    console.log(' 3. Run application: npm run dev');
    console.log('========================================================\n');
  } catch (err) {
    console.error('\n[Error] AWS Setup failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
