const { v4: uuidv4 } = require('uuid');
const cognitoService = require('../../services/cognitoService');
const dynamoService = require('../../services/dynamoService');

const VALID_SUBJECTS = ['English', 'Malayalam', 'Chemistry', 'Physics', 'Biology', 'Science', 'Maths'];

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
  const teacherId = pathParams.id;

  try {
    const user = verifyAuth(event);

    // 1. GET /api/teachers
    if (method === 'GET' && !teacherId) {
      const teachers = await dynamoService.getTeachers({
        search: queryParams.search,
        classFilter: queryParams.class,
        subject: queryParams.subject
      });
      return buildResponse(200, teachers);
    }

    // 2. GET /api/teachers/:id
    if (method === 'GET' && teacherId) {
      const teacher = await dynamoService.getTeacherById(teacherId);
      if (!teacher) {
        return buildResponse(404, { error: 'Teacher not found' });
      }
      return buildResponse(200, teacher);
    }

    // Admin-only operations below
    if (user.role !== 'admin') {
      return buildResponse(403, { error: 'Access denied: admin permission required' });
    }

    // 3. POST /api/teachers
    if (method === 'POST') {
      const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
      const { name, class: teacherClass, subject, username, password } = body;

      if (!name || !name.trim()) return buildResponse(400, { error: 'Teacher name is required' });
      const classNum = parseInt(teacherClass, 10);
      if (isNaN(classNum) || classNum < 1 || classNum > 10) {
        return buildResponse(400, { error: 'Class must be between 1 and 10' });
      }
      if (!subject || !VALID_SUBJECTS.includes(subject)) {
        return buildResponse(400, { error: `Subject must be one of: ${VALID_SUBJECTS.join(', ')}` });
      }
      if (!username || !username.trim()) return buildResponse(400, { error: 'Username is required' });
      if (!password || password.length < 4) return buildResponse(400, { error: 'Password must be at least 4 characters' });

      const cleanUsername = username.trim().toLowerCase();

      // Check duplicate username
      const existingUser = await dynamoService.getUserByUsername(cleanUsername);
      if (existingUser) {
        return buildResponse(400, { error: `Username "${cleanUsername}" is already taken` });
      }

      // 1. Create in AWS Cognito
      let cognitoUser;
      try {
        cognitoUser = await cognitoService.adminCreateUser({
          username: cleanUsername,
          password,
          role: 'teacher',
          name: name.trim()
        });
      } catch (cogErr) {
        return buildResponse(400, { error: `Cognito registration error: ${cogErr.message}` });
      }

      const userId = cognitoUser.sub || uuidv4();

      // 2. Create in DynamoDB Users table
      await dynamoService.createUser({
        id: userId,
        username: cleanUsername,
        role: 'teacher',
        name: name.trim(),
        plain_password: password
      });

      // 3. Create in DynamoDB Teachers table
      const newTeacher = await dynamoService.createTeacher({
        id: uuidv4(),
        user_id: userId,
        name: name.trim(),
        class: classNum,
        subject,
        username: cleanUsername,
        plain_password: password
      });

      return buildResponse(201, {
        success: true,
        message: 'Teacher added successfully in DynamoDB & Cognito',
        teacher: newTeacher
      });
    }

    // 4. PUT /api/teachers/:id
    if (method === 'PUT' && teacherId) {
      const existing = await dynamoService.getTeacherById(teacherId);
      if (!existing) {
        return buildResponse(404, { error: 'Teacher not found' });
      }

      const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
      const { name, class: teacherClass, subject, password } = body;

      const updates = {};
      if (name) updates.name = name.trim();
      if (teacherClass) updates.class = parseInt(teacherClass, 10);
      if (subject) {
        if (!VALID_SUBJECTS.includes(subject)) {
          return buildResponse(400, { error: `Subject must be one of: ${VALID_SUBJECTS.join(', ')}` });
        }
        updates.subject = subject;
      }

      // Update password in Cognito if supplied
      if (password && password.trim().length >= 4) {
        await cognitoService.adminSetUserPassword(existing.username, password.trim());
        updates.plain_password = password.trim();
        await dynamoService.updateUser(existing.user_id, { plain_password: password.trim() });
      }

      const updatedTeacher = await dynamoService.updateTeacher(teacherId, updates);
      return buildResponse(200, {
        success: true,
        message: 'Teacher updated successfully',
        teacher: updatedTeacher
      });
    }

    // 5. DELETE /api/teachers/:id
    if (method === 'DELETE' && teacherId) {
      const teacher = await dynamoService.getTeacherById(teacherId);
      if (!teacher) {
        return buildResponse(404, { error: 'Teacher not found' });
      }

      // Delete from DynamoDB Teachers
      await dynamoService.deleteTeacher(teacherId);

      // Delete from DynamoDB Users
      if (teacher.user_id) {
        await dynamoService.deleteUser(teacher.user_id);
      }

      // Delete from Cognito
      if (teacher.username) {
        await cognitoService.adminDeleteUser(teacher.username);
      }

      return buildResponse(200, { success: true, message: 'Teacher deleted successfully' });
    }

    return buildResponse(404, { error: `Method ${method} not supported` });
  } catch (err) {
    console.error('[Lambda Teachers] Error:', err);
    return buildResponse(err.statusCode || 500, { error: err.message || 'Server error' });
  }
};
