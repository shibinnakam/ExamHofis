/**
 * ExamHofis AWS Seed Script
 * 
 * Migrates & seeds admin, teachers, and students into:
 * 1. AWS Cognito (User Pool with groups & permanent passwords)
 * 2. AWS DynamoDB (Users, Students, Teachers tables)
 * 
 * Run: node scripts/seed-aws.js
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const cognitoService = require('../services/cognitoService');
const dynamoService = require('../services/dynamoService');
const { COGNITO } = require('../config/aws-config');

const SAMPLE_TEACHERS = [
  { name: 'Dr. Ananya Nair', class: 10, subject: 'Physics', username: 'ananya.physics', pass: 'teacher123' },
  { name: 'Prof. Rahul Varma', class: 9, subject: 'Maths', username: 'rahul.maths', pass: 'teacher123' },
  { name: 'Mrs. Meera Kurian', class: 10, subject: 'Malayalam', username: 'meera.malayalam', pass: 'teacher123' },
  { name: 'Mr. David Thomas', class: 8, subject: 'English', username: 'david.english', pass: 'teacher123' },
  { name: 'Ms. Sangeetha K.', class: 10, subject: 'Chemistry', username: 'sangeetha.chem', pass: 'teacher123' },
  { name: 'Mr. Gopal Menon', class: 7, subject: 'Biology', username: 'gopal.bio', pass: 'teacher123' },
  { name: 'Mrs. Reshma Joseph', class: 6, subject: 'Science', username: 'reshma.science', pass: 'teacher123' }
];

const SAMPLE_STUDENTS = [
  { name: 'Aarav Krishnan', class: 10, div: 'A', adm: 'ADM-2026-001', username: 'aarav10a', pass: 'student123', photo: '/avatars/student1.svg' },
  { name: 'Diya Pillai', class: 10, div: 'A', adm: 'ADM-2026-002', username: 'diya10a', pass: 'student123', photo: '/avatars/student2.svg' },
  { name: 'Farhan Mohammed', class: 10, div: 'B', adm: 'ADM-2026-003', username: 'farhan10b', pass: 'student123', photo: '/avatars/student3.svg' },
  { name: 'Kavya S.', class: 9, div: 'A', adm: 'ADM-2026-004', username: 'kavya9a', pass: 'student123', photo: '/avatars/student4.svg' },
  { name: 'Rohan Nambiar', class: 8, div: 'C', adm: 'ADM-2026-005', username: 'rohan8c', pass: 'student123', photo: '/avatars/student5.svg' },
  { name: 'Hannah Elsa', class: 7, div: 'B', adm: 'ADM-2026-006', username: 'hannah7b', pass: 'student123', photo: '/avatars/student6.svg' },
  { name: 'Siddharth Menon', class: 10, div: 'A', adm: 'ADM-2026-007', username: 'siddharth10a', pass: 'student123', photo: '/avatars/student7.svg' }
];

async function seedAdmin() {
  console.log('\n--- Seeding Default Admin ---');
  const adminUsername = 'admin';
  const adminPass = 'admin123';

  let userId = uuidv4();

  // Check if admin user exists in Cognito
  try {
    const cogUser = await cognitoService.adminCreateUser({
      username: adminUsername,
      password: adminPass,
      role: 'admin',
      name: 'System Administrator',
      email: 'admin@examhofis.local'
    });
    userId = cogUser.sub || userId;
    console.log(`[Cognito] Default admin created: ${adminUsername}`);
  } catch (err) {
    if (err.name === 'UsernameExistsException') {
      console.log(`[Cognito] Admin already exists in Cognito.`);
      const existing = await cognitoService.adminGetUser(adminUsername);
      userId = existing?.UserAttributes?.find(a => a.Name === 'sub')?.Value || userId;
    } else {
      console.warn(`[Cognito] Warning:`, err.message);
    }
  }

  // Save to DynamoDB
  const existingDbUser = await dynamoService.getUserByUsername(adminUsername);
  if (!existingDbUser) {
    await dynamoService.createUser({
      id: userId,
      username: adminUsername,
      role: 'admin',
      name: 'System Administrator',
      plain_password: adminPass
    });
    console.log(`[DynamoDB] Created admin user record in DynamoDB.`);
  } else {
    console.log(`[DynamoDB] Admin user already exists in DynamoDB.`);
  }
}

async function seedTeachers() {
  console.log('\n--- Seeding Teachers ---');
  for (const t of SAMPLE_TEACHERS) {
    let userId = uuidv4();

    try {
      const cog = await cognitoService.adminCreateUser({
        username: t.username,
        password: t.pass,
        role: 'teacher',
        name: t.name,
        email: `${t.username}@examhofis.local`
      });
      userId = cog.sub || userId;
      console.log(`[Cognito] Created teacher: ${t.name} (${t.username})`);
    } catch (err) {
      if (err.name === 'UsernameExistsException') {
        console.log(`[Cognito] Teacher "${t.username}" already exists.`);
      } else {
        console.warn(`[Cognito] Warning:`, err.message);
      }
    }

    // Save to DynamoDB Users
    const existingDbUser = await dynamoService.getUserByUsername(t.username);
    if (!existingDbUser) {
      await dynamoService.createUser({
        id: userId,
        username: t.username,
        role: 'teacher',
        name: t.name,
        plain_password: t.pass
      });
    }

    // Save to DynamoDB Teachers
    const existingTeacher = await dynamoService.getTeacherByUserId(userId);
    if (!existingTeacher) {
      await dynamoService.createTeacher({
        id: uuidv4(),
        user_id: userId,
        name: t.name,
        class: t.class,
        subject: t.subject,
        username: t.username,
        plain_password: t.pass
      });
      console.log(`[DynamoDB] Added teacher: ${t.name} (${t.subject}, Class ${t.class})`);
    }
  }
}

async function seedStudents() {
  console.log('\n--- Seeding Students ---');
  for (const s of SAMPLE_STUDENTS) {
    let userId = uuidv4();

    try {
      const cog = await cognitoService.adminCreateUser({
        username: s.username,
        password: s.pass,
        role: 'student',
        name: s.name,
        email: `${s.username}@examhofis.local`
      });
      userId = cog.sub || userId;
      console.log(`[Cognito] Created student: ${s.name} (${s.username})`);
    } catch (err) {
      if (err.name === 'UsernameExistsException') {
        console.log(`[Cognito] Student "${s.username}" already exists.`);
      } else {
        console.warn(`[Cognito] Warning:`, err.message);
      }
    }

    // Save to DynamoDB Users
    const existingDbUser = await dynamoService.getUserByUsername(s.username);
    if (!existingDbUser) {
      await dynamoService.createUser({
        id: userId,
        username: s.username,
        role: 'student',
        name: s.name,
        plain_password: s.pass
      });
    }

    // Save to DynamoDB Students
    const existingStudent = await dynamoService.getStudentByAdmissionNo(s.adm);
    if (!existingStudent) {
      await dynamoService.createStudent({
        id: uuidv4(),
        user_id: userId,
        name: s.name,
        class: s.class,
        div: s.div,
        admission_no: s.adm,
        photo_url: s.photo,
        username: s.username,
        plain_password: s.pass
      });
      console.log(`[DynamoDB] Added student: ${s.name} (${s.adm}, Class ${s.class}-${s.div})`);
    }
  }
}

async function main() {
  try {
    console.log('========================================================');
    console.log('   ExamHofis AWS Seed (Cognito & DynamoDB Data Migration) ');
    console.log('========================================================');

    if (!COGNITO.USER_POOL_ID) {
      console.error('[Error] COGNITO_USER_POOL_ID is not configured in .env');
      console.log('Please run `node scripts/setup-aws.js` first to provision resources.');
      process.exit(1);
    }

    await seedAdmin();
    await seedTeachers();
    await seedStudents();

    console.log('\n========================================================');
    console.log(' Seeding Complete! All sample data migrated to AWS.');
    console.log(' Admin credentials: username=admin | password=admin123');
    console.log(' Teacher sample: username=ananya.physics | password=teacher123');
    console.log(' Student sample: username=aarav10a | password=student123');
    console.log('========================================================\n');
  } catch (err) {
    console.error('[Error] Seeding failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
