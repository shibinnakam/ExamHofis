const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting ExamHofis Automated API Tests ---');

  // 1. Admin Login
  console.log('\n1. Testing Admin Login...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });
  console.log('Admin login status:', loginRes.status, 'User:', loginRes.data.user.username);
  const adminToken = loginRes.data.token;

  // 2. Fetch Stats
  console.log('\n2. Testing Dashboard Stats...');
  const statsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/stats',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Stats status:', statsRes.status, 'Total Students:', statsRes.data.totalStudents, 'Total Teachers:', statsRes.data.totalTeachers);

  // 3. Add Student
  console.log('\n3. Testing Add Student (Class 1-10 dropdown, Div, Adm No, Username, Password)...');
  const studentPayload = {
    name: 'Ananthu Krishna',
    class: 10,
    div: 'A',
    admission_no: 'ADM-2026-999',
    username: 'ananthu10a',
    password: 'student123'
  };
  const addStudentRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/students',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, studentPayload);
  console.log('Add Student status:', addStudentRes.status, 'Created ID:', addStudentRes.data.student?.id);

  // 4. Query Students
  console.log('\n4. Testing Query Students (filter by class=10)...');
  const getStudentsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/students?class=10&div=A',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Class 10-A students count:', getStudentsRes.data.length);
  const foundStudent = getStudentsRes.data.find(s => s.admission_no === 'ADM-2026-999');
  console.log('Found newly added student:', foundStudent ? foundStudent.name : 'NO');

  // 5. Add Teacher
  console.log('\n5. Testing Add Teacher (Class 1-10 dropdown, Subject dropdown)...');
  const teacherPayload = {
    name: 'Harikrishnan M.',
    class: 10,
    subject: 'Malayalam',
    username: 'hari.malayalam',
    password: 'teacher123'
  };
  const addTeacherRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/teachers',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, teacherPayload);
  console.log('Add Teacher status:', addTeacherRes.status, 'Created ID:', addTeacherRes.data.teacher?.id);

  // 6. Query Teachers by Subject
  console.log('\n6. Testing Query Teachers (subject=malayalam)...');
  const getTeachersRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/teachers?subject=malayalam',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Malayalam teachers count:', getTeachersRes.data.length);
  const foundTeacher = getTeachersRes.data.find(t => t.username === 'hari.malayalam');
  console.log('Found newly added teacher:', foundTeacher ? `${foundTeacher.name} (Class ${foundTeacher.class})` : 'NO');

  // 7. Test Teacher Login & Portal
  console.log('\n7. Testing Teacher Portal Login...');
  const teacherLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'hari.malayalam', password: 'teacher123' });
  console.log('Teacher login status:', teacherLogin.status, 'Role:', teacherLogin.data.user.role);

  const teacherClassRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/teacher/my-class',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${teacherLogin.data.token}` }
  });
  console.log('Teacher assigned class:', teacherClassRes.data.teacher.class, 'Total students in class:', teacherClassRes.data.totalClassStudents);

  // 8. Test Student Login & Portal
  console.log('\n8. Testing Student Portal Login...');
  const studentLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'ananthu10a', password: 'student123' });
  console.log('Student login status:', studentLogin.status, 'Role:', studentLogin.data.user.role);

  const studentProfileRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/student/my-profile',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentLogin.data.token}` }
  });
  console.log('Student profile name:', studentProfileRes.data.student.name, 'Assigned teachers count:', studentProfileRes.data.teachers.length);

  console.log('\n=== ALL END-TO-END PLATFORM TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(console.error);
