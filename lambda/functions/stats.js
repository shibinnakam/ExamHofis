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
  const path = event.path || event.rawPath || '';

  try {
    const user = verifyAuth(event);

    // 1. GET /api/stats (Admin only)
    if (path.includes('/stats')) {
      if (user.role !== 'admin') {
        return buildResponse(403, { error: 'Access denied: admin required' });
      }
      const stats = await dynamoService.getDashboardStats();
      return buildResponse(200, stats);
    }

    // 2. GET /api/teacher/my-class
    if (path.includes('/teacher/my-class')) {
      if (user.role !== 'teacher') {
        return buildResponse(403, { error: 'Access denied: teacher role required' });
      }

      const teacher = await dynamoService.getTeacherByUserId(user.id);
      if (!teacher) {
        return buildResponse(404, { error: 'Teacher record not found' });
      }

      const students = await dynamoService.getStudentsByClass(teacher.class);
      const allTeachersInClass = await dynamoService.getTeachersByClass(teacher.class);
      const colleagues = allTeachersInClass.filter(t => t.id !== teacher.id);

      return buildResponse(200, {
        teacher,
        students,
        colleagues,
        totalClassStudents: students.length
      });
    }

    // 3. GET /api/student/my-profile
    if (path.includes('/student/my-profile')) {
      if (user.role !== 'student') {
        return buildResponse(403, { error: 'Access denied: student role required' });
      }

      const student = await dynamoService.getStudentByUserId(user.id);
      if (!student) {
        return buildResponse(404, { error: 'Student record not found' });
      }

      const teachers = await dynamoService.getTeachersByClass(student.class);
      const allStudentsInClass = await dynamoService.getStudentsByClass(student.class);
      const classmates = allStudentsInClass.filter(s => s.div === student.div && s.id !== student.id);

      return buildResponse(200, {
        student,
        teachers,
        classmates
      });
    }

    return buildResponse(404, { error: 'Endpoint not found' });
  } catch (err) {
    console.error('[Lambda Stats/Portal] Error:', err);
    return buildResponse(err.statusCode || 500, { error: err.message || 'Server error' });
  }
};
