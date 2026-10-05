const { randomUUID: uuidv4 } = require('crypto');
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

function verifyAuth(event) {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) throw { statusCode: 401, message: 'Authentication required' };
  return cognitoService.verifyCognitoToken(token);
}

exports.handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const studentId = pathParams.id;

  try {
    const user = verifyAuth(event);

    // 1. GET /api/students
    if (method === 'GET' && !studentId) {
      const students = await dynamoService.getStudents({
        search: queryParams.search,
        classFilter: queryParams.class,
        div: queryParams.div
      });
      return buildResponse(200, students);
    }

    // 2. GET /api/students/:id
    if (method === 'GET' && studentId) {
      const student = await dynamoService.getStudentById(studentId);
      if (!student) {
        return buildResponse(404, { error: 'Student not found' });
      }
      return buildResponse(200, student);
    }

    // Admin-only operations below
    if (user.role !== 'admin') {
      return buildResponse(403, { error: 'Access denied: admin permission required' });
    }

    // 3. POST /api/students
    if (method === 'POST') {
      const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
      const { name, class: studentClass, div, admission_no, username, password, photo_url } = body;

      if (!name || !name.trim()) return buildResponse(400, { error: 'Student name is required' });
      const classNum = parseInt(studentClass, 10);
      if (isNaN(classNum) || classNum < 1 || classNum > 10) {
        return buildResponse(400, { error: 'Class must be between 1 and 10' });
      }
      if (!div || !div.trim()) return buildResponse(400, { error: 'Division is required' });
      if (!admission_no || !admission_no.trim()) return buildResponse(400, { error: 'Admission number is required' });
      if (!username || !username.trim()) return buildResponse(400, { error: 'Username is required' });
      if (!password || password.length < 4) return buildResponse(400, { error: 'Password must be at least 4 characters' });

      const cleanUsername = username.trim().toLowerCase();
      const cleanAdmission = admission_no.trim().toUpperCase();
      const cleanDiv = div.trim().toUpperCase();

      // Check duplicate admission number in DynamoDB
      const existingAdm = await dynamoService.getStudentByAdmissionNo(cleanAdmission);
      if (existingAdm) {
        return buildResponse(400, { error: `Admission number "${cleanAdmission}" is already registered` });
      }

      // 1. Create in AWS Cognito
      let cognitoUser;
      try {
        cognitoUser = await cognitoService.adminCreateUser({
          username: cleanUsername,
          password,
          role: 'student',
          name: name.trim()
        });
      } catch (cogErr) {
        return buildResponse(400, { error: `Cognito registration error: ${cogErr.message}` });
      }

      const userId = cognitoUser.sub || uuidv4();
      const randomAvatar = Math.floor(Math.random() * 7) + 1;
      const finalPhoto = photo_url || `/avatars/student${randomAvatar}.svg`;

      // 2. Create in DynamoDB Users table
      await dynamoService.createUser({
        id: userId,
        username: cleanUsername,
        role: 'student',
        name: name.trim(),
        plain_password: password
      });

      // 3. Create in DynamoDB Students table
      const newStudent = await dynamoService.createStudent({
        id: uuidv4(),
        user_id: userId,
        name: name.trim(),
        class: classNum,
        div: cleanDiv,
        admission_no: cleanAdmission,
        photo_url: finalPhoto,
        username: cleanUsername,
        plain_password: password
      });

      return buildResponse(201, {
        success: true,
        message: 'Student created successfully in DynamoDB & Cognito',
        student: newStudent
      });
    }

    // 4. PUT /api/students/:id
    if (method === 'PUT' && studentId) {
      const existing = await dynamoService.getStudentById(studentId);
      if (!existing) {
        return buildResponse(404, { error: 'Student not found' });
      }

      const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
      const { name, class: studentClass, div, admission_no, password, photo_url } = body;

      const updates = {};
      if (name) updates.name = name.trim();
      if (studentClass) updates.class = parseInt(studentClass, 10);
      if (div) updates.div = div.trim().toUpperCase();
      if (admission_no) updates.admission_no = admission_no.trim().toUpperCase();
      if (photo_url) updates.photo_url = photo_url;

      // Update password in Cognito if supplied
      if (password && password.trim().length >= 4) {
        await cognitoService.adminSetUserPassword(existing.username, password.trim());
        updates.plain_password = password.trim();
        await dynamoService.updateUser(existing.user_id, { plain_password: password.trim() });
      }

      const updatedStudent = await dynamoService.updateStudent(studentId, updates);
      return buildResponse(200, {
        success: true,
        message: 'Student updated successfully',
        student: updatedStudent
      });
    }

    // 5. DELETE /api/students/:id
    if (method === 'DELETE' && studentId) {
      const student = await dynamoService.getStudentById(studentId);
      if (!student) {
        return buildResponse(404, { error: 'Student not found' });
      }

      // Delete from DynamoDB Students
      await dynamoService.deleteStudent(studentId);

      // Delete from DynamoDB Users
      if (student.user_id) {
        await dynamoService.deleteUser(student.user_id);
      }

      // Delete from Cognito
      if (student.username) {
        await cognitoService.adminDeleteUser(student.username);
      }

      return buildResponse(200, { success: true, message: 'Student deleted successfully' });
    }

    return buildResponse(404, { error: `Method ${method} not supported` });
  } catch (err) {
    console.error('[Lambda Students] Error:', err);
    return buildResponse(err.statusCode || 500, { error: err.message || 'Server error' });
  }
};
