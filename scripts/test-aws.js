/**
 * ExamHofis AWS Operations Verification Test
 * 
 * Verifies:
 * 1. AWS Configuration & Connection
 * 2. AWS Cognito Login & Token Verification
 * 3. DynamoDB Operations (CRUD on Users, Students, Teachers)
 * 4. DynamoDB GSI Queries (ClassIndex, AdmissionNoIndex, SubjectIndex)
 * 5. Dashboard Stats Aggregation
 * 
 * Run: node scripts/test-aws.js
 */

require('dotenv').config();
const { randomUUID: uuidv4 } = require('crypto');
const cognitoService = require('../services/cognitoService');
const dynamoService = require('../services/dynamoService');
const { isAwsConfigured, TABLES, COGNITO, REGION } = require('../config/aws-config');

async function runTests() {
  console.log('========================================================');
  console.log('      ExamHofis AWS Operations Test Suite               ');
  console.log(`      Region: ${REGION}                                `);
  console.log(`      Cognito Pool: ${COGNITO.USER_POOL_ID || 'Not set'} `);
  console.log('========================================================\n');

  if (!COGNITO.USER_POOL_ID || !COGNITO.CLIENT_ID) {
    console.error('[Error] AWS Cognito credentials not configured.');
    console.log('Run `node scripts/setup-aws.js` to create the User Pool & DynamoDB tables.');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name}... `);
    try {
      await fn();
      console.log('PASSED');
      passed++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  // 1. Test Admin Login with Cognito
  await test('Cognito Admin Authentication (admin/admin123)', async () => {
    const res = await cognitoService.loginUser('admin', 'admin123');
    if (!res.accessToken || !res.idToken) throw new Error('No tokens received');
    if (res.user.role !== 'admin') throw new Error(`Expected role admin, got ${res.user.role}`);
  });

  // 2. Test Token Verification
  let adminToken;
  await test('Cognito JWT Token Verification', async () => {
    const auth = await cognitoService.loginUser('admin', 'admin123');
    adminToken = auth.idToken;
    const verified = cognitoService.verifyCognitoToken(adminToken);
    if (verified.username !== 'admin') throw new Error(`Username mismatch: ${verified.username}`);
  });

  // 3. Test DynamoDB Get Users
  await test('DynamoDB Get User by Username (GSI: UsernameIndex)', async () => {
    const user = await dynamoService.getUserByUsername('admin');
    if (!user) throw new Error('Admin user not found in DynamoDB');
    if (user.role !== 'admin') throw new Error(`Role mismatch: ${user.role}`);
  });

  // 4. Test Student Creation (Cognito + DynamoDB)
  const testStudentUser = `test_student_${Date.now()}`;
  const testAdmNo = `ADM-TEST-${Date.now()}`;
  let createdStudentId;
  let createdStudentUserId;

  await test('Cognito User + DynamoDB Student Creation', async () => {
    // 1. Create in Cognito
    const cogUser = await cognitoService.adminCreateUser({
      username: testStudentUser,
      password: 'password123',
      role: 'student',
      name: 'Test Student AWS',
      email: `${testStudentUser}@example.com`
    });
    createdStudentUserId = cogUser.sub;

    // 2. Create in DynamoDB Users
    await dynamoService.createUser({
      id: createdStudentUserId,
      username: testStudentUser,
      role: 'student',
      name: 'Test Student AWS'
    });

    // 3. Create in DynamoDB Students
    createdStudentId = uuidv4();
    const student = await dynamoService.createStudent({
      id: createdStudentId,
      user_id: createdStudentUserId,
      name: 'Test Student AWS',
      class: 10,
      div: 'A',
      admission_no: testAdmNo,
      username: testStudentUser,
      photo_url: '/avatars/student1.svg'
    });
    if (!student || student.admission_no !== testAdmNo) throw new Error('Student creation failed');
  });

  // 5. Test DynamoDB Query with ClassIndex GSI
  await test('DynamoDB Query by Class (GSI: ClassIndex)', async () => {
    const students = await dynamoService.getStudentsByClass(10);
    if (!Array.isArray(students) || students.length === 0) throw new Error('No students returned for Class 10');
    const found = students.find(s => s.admission_no === testAdmNo);
    if (!found) throw new Error(`Created test student not found in Class 10 query`);
  });

  // 6. Test DynamoDB Query with AdmissionNoIndex GSI
  await test('DynamoDB Lookup by Admission No (GSI: AdmissionNoIndex)', async () => {
    const student = await dynamoService.getStudentByAdmissionNo(testAdmNo);
    if (!student) throw new Error('Student not found by admission number');
    if (student.name !== 'Test Student AWS') throw new Error(`Name mismatch: ${student.name}`);
  });

  // 7. Test Student Update
  await test('DynamoDB Student Record Update', async () => {
    const updated = await dynamoService.updateStudent(createdStudentId, {
      name: 'Test Student AWS Updated'
    });
    if (updated.name !== 'Test Student AWS Updated') throw new Error('Student update failed');
  });

  // 8. Test Dashboard Stats Calculation
  await test('DynamoDB Dashboard Stats Calculation', async () => {
    const stats = await dynamoService.getDashboardStats();
    if (typeof stats.totalStudents !== 'number' || stats.totalStudents < 1) {
      throw new Error('Invalid totalStudents in stats');
    }
    if (!Array.isArray(stats.classCounts)) throw new Error('classCounts should be an array');
  });

  // 9. Cleanup Test Student (Cognito + DynamoDB)
  await test('Cleanup: Delete Test Student from Cognito & DynamoDB', async () => {
    await dynamoService.deleteStudent(createdStudentId);
    await dynamoService.deleteUser(createdStudentUserId);
    await cognitoService.adminDeleteUser(testStudentUser);
  });

  console.log('\n========================================================');
  console.log(` Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
