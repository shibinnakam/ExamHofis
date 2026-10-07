const { randomUUID: uuidv4 } = require('crypto');
const {
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand
} = require('@aws-sdk/lib-dynamodb');
const { dynamoDocClient, TABLES } = require('../config/aws-config');

// =========================================================================
// 1. USER OPERATIONS (ExamHofis_Users)
// =========================================================================

async function getUserById(id) {
  const params = {
    TableName: TABLES.USERS,
    Key: { id: String(id) }
  };
  const result = await dynamoDocClient.send(new GetCommand(params));
  return result.Item || null;
}

async function getUserByUsername(username) {
  const cleanUsername = String(username).trim().toLowerCase();
  const params = {
    TableName: TABLES.USERS,
    IndexName: 'UsernameIndex',
    KeyConditionExpression: 'username = :u',
    ExpressionAttributeValues: {
      ':u': cleanUsername
    }
  };
  const result = await dynamoDocClient.send(new QueryCommand(params));
  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

async function createUser(user) {
  const id = user.id || uuidv4();
  const cleanUsername = String(user.username).trim().toLowerCase();
  const item = {
    id: String(id),
    username: cleanUsername,
    role: user.role,
    name: user.name || '',
    plain_password: user.plain_password || '',
    password_hash: user.password_hash || '',
    created_at: user.created_at || new Date().toISOString()
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: TABLES.USERS,
      Item: item
    })
  );
  return item;
}

async function updateUser(id, updates) {
  const updateKeys = Object.keys(updates).filter(k => k !== 'id');
  if (updateKeys.length === 0) return await getUserById(id);

  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  const updateExpressions = [];

  updateKeys.forEach((key, idx) => {
    const attrName = `#attr${idx}`;
    const attrVal = `:val${idx}`;
    ExpressionAttributeNames[attrName] = key;
    ExpressionAttributeValues[attrVal] = updates[key];
    updateExpressions.push(`${attrName} = ${attrVal}`);
  });

  const params = {
    TableName: TABLES.USERS,
    Key: { id: String(id) },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoDocClient.send(new UpdateCommand(params));
  return result.Attributes;
}

async function deleteUser(id) {
  await dynamoDocClient.send(
    new DeleteCommand({
      TableName: TABLES.USERS,
      Key: { id: String(id) }
    })
  );
  return true;
}

// =========================================================================
// 2. STUDENT OPERATIONS (ExamHofis_Students)
// =========================================================================

async function getStudents({ search, classFilter, div } = {}) {
  let items = [];

  if (classFilter && classFilter !== 'all') {
    const classNum = parseInt(classFilter, 10);
    const queryParams = {
      TableName: TABLES.STUDENTS,
      IndexName: 'ClassIndex',
      KeyConditionExpression: '#cls = :classVal',
      ExpressionAttributeNames: { '#cls': 'class' },
      ExpressionAttributeValues: { ':classVal': classNum }
    };
    const result = await dynamoDocClient.send(new QueryCommand(queryParams));
    items = result.Items || [];
  } else {
    const result = await dynamoDocClient.send(new ScanCommand({ TableName: TABLES.STUDENTS }));
    items = result.Items || [];
  }

  // Filter in-memory for div and search
  if (div && div !== 'all') {
    const divUpper = String(div).trim().toUpperCase();
    items = items.filter(s => String(s.div).toUpperCase() === divUpper);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.admission_no && s.admission_no.toLowerCase().includes(q)) ||
      (s.username && s.username.toLowerCase().includes(q))
    );
  }

  // Sort by class ASC, div ASC, name ASC
  items.sort((a, b) => {
    if (a.class !== b.class) return a.class - b.class;
    if (a.div !== b.div) return a.div.localeCompare(b.div);
    return a.name.localeCompare(b.name);
  });

  return items;
}

async function getStudentById(id) {
  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: TABLES.STUDENTS,
      Key: { id: String(id) }
    })
  );
  return result.Item || null;
}

async function getStudentByUserId(userId) {
  const params = {
    TableName: TABLES.STUDENTS,
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': String(userId) }
  };
  const result = await dynamoDocClient.send(new QueryCommand(params));
  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

async function getStudentByAdmissionNo(admissionNo) {
  const cleanAdm = String(admissionNo).trim().toUpperCase();
  const params = {
    TableName: TABLES.STUDENTS,
    IndexName: 'AdmissionNoIndex',
    KeyConditionExpression: 'admission_no = :adm',
    ExpressionAttributeValues: { ':adm': cleanAdm }
  };
  const result = await dynamoDocClient.send(new QueryCommand(params));
  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

async function createStudent(data) {
  const id = data.id || uuidv4();
  const item = {
    id: String(id),
    user_id: String(data.user_id),
    name: data.name.trim(),
    class: parseInt(data.class, 10),
    div: data.div.trim().toUpperCase(),
    admission_no: data.admission_no.trim().toUpperCase(),
    photo_url: data.photo_url || '',
    username: data.username ? data.username.trim().toLowerCase() : '',
    plain_password: data.plain_password || '',
    created_at: data.created_at || new Date().toISOString()
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: TABLES.STUDENTS,
      Item: item
    })
  );
  return item;
}

async function updateStudent(id, updates) {
  const updateKeys = Object.keys(updates).filter(k => k !== 'id');
  if (updateKeys.length === 0) return await getStudentById(id);

  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  const updateExpressions = [];

  updateKeys.forEach((key, idx) => {
    const attrName = `#attr${idx}`;
    const attrVal = `:val${idx}`;
    ExpressionAttributeNames[attrName] = key;
    ExpressionAttributeValues[attrVal] = updates[key];
    updateExpressions.push(`${attrName} = ${attrVal}`);
  });

  const params = {
    TableName: TABLES.STUDENTS,
    Key: { id: String(id) },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoDocClient.send(new UpdateCommand(params));
  return result.Attributes;
}

async function deleteStudent(id) {
  await dynamoDocClient.send(
    new DeleteCommand({
      TableName: TABLES.STUDENTS,
      Key: { id: String(id) }
    })
  );
  return true;
}

async function getStudentsByClass(classNum) {
  const params = {
    TableName: TABLES.STUDENTS,
    IndexName: 'ClassIndex',
    KeyConditionExpression: '#cls = :c',
    ExpressionAttributeNames: { '#cls': 'class' },
    ExpressionAttributeValues: { ':c': parseInt(classNum, 10) }
  };
  const result = await dynamoDocClient.send(new QueryCommand(params));
  return (result.Items || []).sort((a, b) => {
    if (a.div !== b.div) return a.div.localeCompare(b.div);
    return a.name.localeCompare(b.name);
  });
}

// =========================================================================
// 3. TEACHER OPERATIONS (ExamHofis_Teachers)
// =========================================================================

async function getTeachers({ search, classFilter, subject } = {}) {
  const result = await dynamoDocClient.send(new ScanCommand({ TableName: TABLES.TEACHERS }));
  let items = result.Items || [];

  if (classFilter && classFilter !== 'all') {
    const classNum = parseInt(classFilter, 10);
    items = items.filter(t =>
      t.class === classNum ||
      (t.classes && t.classes.includes(classNum)) ||
      (t.assignments && t.assignments.some(a => a.class === classNum))
    );
  }

  if (subject && subject !== 'all') {
    const subLower = subject.trim().toLowerCase();
    items = items.filter(t =>
      (t.subject && t.subject.toLowerCase() === subLower) ||
      (t.subjects && t.subjects.some(s => s.toLowerCase() === subLower)) ||
      (t.assignments && t.assignments.some(a => a.subject && a.subject.toLowerCase() === subLower))
    );
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter(t =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.username && t.username.toLowerCase().includes(q))
    );
  }

  // Sort by class ASC, subject ASC, name ASC
  items.sort((a, b) => {
    if (a.class !== b.class) return a.class - b.class;
    if (a.subject !== b.subject) return (a.subject || '').localeCompare(b.subject || '');
    return a.name.localeCompare(b.name);
  });

  return items;
}

async function getTeacherById(id) {
  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: TABLES.TEACHERS,
      Key: { id: String(id) }
    })
  );
  return result.Item || null;
}

async function getTeacherByUserId(userId) {
  const params = {
    TableName: TABLES.TEACHERS,
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': String(userId) }
  };
  const result = await dynamoDocClient.send(new QueryCommand(params));
  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

async function createTeacher(data) {
  const id = data.id || uuidv4();
  const rawAssignments = Array.isArray(data.assignments) ? data.assignments : [
    { class: parseInt(data.class, 10), subject: (data.subject || '').trim() }
  ];
  const assignments = rawAssignments.map(a => ({
    class: parseInt(a.class, 10),
    subject: String(a.subject).trim()
  })).filter(a => !isNaN(a.class) && a.class >= 1 && a.class <= 10 && a.subject);

  const primaryClass = assignments.length > 0 ? assignments[0].class : parseInt(data.class, 10);
  const primarySubject = assignments.length > 0 ? assignments[0].subject : (data.subject || '').trim();
  const classes = [...new Set(assignments.map(a => a.class))];
  const subjects = [...new Set(assignments.map(a => a.subject))];

  const item = {
    id: String(id),
    user_id: String(data.user_id),
    name: data.name.trim(),
    class: primaryClass,
    subject: primarySubject,
    classes: classes,
    subjects: subjects,
    assignments: assignments,
    username: data.username ? data.username.trim().toLowerCase() : '',
    plain_password: data.plain_password || '',
    created_at: data.created_at || new Date().toISOString()
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: TABLES.TEACHERS,
      Item: item
    })
  );
  return item;
}

async function updateTeacher(id, updates) {
  const updateKeys = Object.keys(updates).filter(k => k !== 'id');
  if (updateKeys.length === 0) return await getTeacherById(id);

  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  const updateExpressions = [];

  updateKeys.forEach((key, idx) => {
    const attrName = `#attr${idx}`;
    const attrVal = `:val${idx}`;
    ExpressionAttributeNames[attrName] = key;
    ExpressionAttributeValues[attrVal] = updates[key];
    updateExpressions.push(`${attrName} = ${attrVal}`);
  });

  const params = {
    TableName: TABLES.TEACHERS,
    Key: { id: String(id) },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoDocClient.send(new UpdateCommand(params));
  return result.Attributes;
}

async function deleteTeacher(id) {
  await dynamoDocClient.send(
    new DeleteCommand({
      TableName: TABLES.TEACHERS,
      Key: { id: String(id) }
    })
  );
  return true;
}

async function getTeachersByClass(classNum) {
  const num = parseInt(classNum, 10);
  const result = await dynamoDocClient.send(new ScanCommand({ TableName: TABLES.TEACHERS }));
  const teachers = (result.Items || []).filter(t =>
    t.class === num ||
    (t.classes && t.classes.includes(num)) ||
    (t.assignments && t.assignments.some(a => a.class === num))
  );
  return teachers.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
}

// =========================================================================
// 4. STATS & ANALYTICS
// =========================================================================

async function getDashboardStats() {
  const [studentsRes, teachersRes] = await Promise.all([
    dynamoDocClient.send(new ScanCommand({ TableName: TABLES.STUDENTS })),
    dynamoDocClient.send(new ScanCommand({ TableName: TABLES.TEACHERS }))
  ]);

  const students = studentsRes.Items || [];
  const teachers = teachersRes.Items || [];

  // Class counts (1 to 10)
  const classMap = {};
  students.forEach(s => {
    classMap[s.class] = (classMap[s.class] || 0) + 1;
  });
  const classCounts = Object.keys(classMap)
    .map(c => ({ class: parseInt(c, 10), count: classMap[c] }))
    .sort((a, b) => a.class - b.class);

  // Subject counts
  const subjectMap = {};
  teachers.forEach(t => {
    subjectMap[t.subject] = (subjectMap[t.subject] || 0) + 1;
  });
  const subjectCounts = Object.keys(subjectMap)
    .map(s => ({ subject: s, count: subjectMap[s] }))
    .sort((a, b) => b.count - a.count);

  // Recent 5 students & teachers
  const recentStudents = [...students]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 5);

  const recentTeachers = [...teachers]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 5);

  return {
    totalStudents: students.length,
    totalTeachers: teachers.length,
    classCounts,
    subjectCounts,
    recentStudents,
    recentTeachers
  };
}

// =========================================================================
// 5. EXAM & MCQ OPERATIONS
// =========================================================================

// In-memory fallback cache if AWS table is not yet provisioned
let fallbackExams = [];
let fallbackSubmissions = [];

async function getExams({ classFilter, division, teacherId, status } = {}) {
  let items = [];
  try {
    const result = await dynamoDocClient.send(new ScanCommand({ TableName: TABLES.EXAMS }));
    items = result.Items || [];
  } catch (err) {
    // If DynamoDB table is not yet created, use fallback cache
    items = [...fallbackExams];
  }

  if (classFilter && classFilter !== 'all') {
    const c = parseInt(classFilter, 10);
    items = items.filter(e => e.class === c);
  }

  if (division && division !== 'All' && division !== 'all') {
    items = items.filter(e => e.division === 'All' || e.division === division);
  }

  if (teacherId) {
    items = items.filter(e => e.created_by_id === String(teacherId) || e.created_by === String(teacherId));
  }

  if (status && status !== 'all') {
    items = items.filter(e => e.status === status);
  }

  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
}

async function getExamById(id) {
  try {
    const result = await dynamoDocClient.send(
      new GetCommand({
        TableName: TABLES.EXAMS,
        Key: { id: String(id) }
      })
    );
    if (result.Item) return result.Item;
  } catch (err) {}
  return fallbackExams.find(e => String(e.id) === String(id)) || null;
}

async function createExam(data) {
  const id = data.id || uuidv4();
  const item = {
    id: String(id),
    title: data.title.trim(),
    subject: data.subject.trim(),
    class: parseInt(data.class, 10),
    division: data.division || 'All',
    duration_minutes: parseInt(data.duration_minutes || 30, 10),
    created_by: data.created_by || 'Faculty',
    created_by_id: String(data.created_by_id || ''),
    status: data.status || 'draft',
    scheduled_start: data.scheduled_start || null,
    scheduled_end: data.scheduled_end || null,
    schedules: Array.isArray(data.schedules) ? data.schedules : [],
    questions: data.questions || [],
    total_marks: parseInt(data.total_marks || (data.questions ? data.questions.length : 0), 10),
    total_questions: data.questions ? data.questions.length : 0,
    created_at: data.created_at || new Date().toISOString()
  };

  try {
    await dynamoDocClient.send(
      new PutCommand({
        TableName: TABLES.EXAMS,
        Item: item
      })
    );
  } catch (err) {
    fallbackExams.push(item);
  }

  // Also keep in fallback cache for instant sync
  const idx = fallbackExams.findIndex(e => e.id === item.id);
  if (idx >= 0) fallbackExams[idx] = item;
  else fallbackExams.push(item);

  return item;
}

async function updateExam(id, updates) {
  let existing = await getExamById(id);
  if (!existing) {
    existing = { id: String(id), title: 'Exam', class: 10, division: 'All' };
  }

  const updated = { ...existing, ...updates, id: String(id) };

  try {
    await dynamoDocClient.send(
      new PutCommand({
        TableName: TABLES.EXAMS,
        Item: updated
      })
    );
  } catch (err) {}

  const idx = fallbackExams.findIndex(e => String(e.id) === String(id));
  if (idx >= 0) fallbackExams[idx] = updated;
  else fallbackExams.push(updated);

  return updated;
}

async function deleteExam(id) {
  try {
    await dynamoDocClient.send(
      new DeleteCommand({
        TableName: TABLES.EXAMS,
        Key: { id: String(id) }
      })
    );
  } catch (err) {}
  fallbackExams = fallbackExams.filter(e => String(e.id) !== String(id));
  fallbackSubmissions = fallbackSubmissions.filter(s => String(s.exam_id) !== String(id));
  return true;
}

async function createExamSubmission(data) {
  const id = data.id || uuidv4();
  const item = {
    id: String(id),
    exam_id: String(data.exam_id),
    student_id: String(data.student_id),
    student_name: data.student_name,
    admission_no: data.admission_no,
    class: parseInt(data.class, 10),
    div: data.div,
    answers: data.answers || {},
    score: parseInt(data.score, 10) || 0,
    total_marks: parseInt(data.total_marks, 10) || 0,
    percentage: parseFloat(data.percentage) || 0.0,
    slot_label: data.slot_label || 'Slot 1',
    total_questions: parseInt(data.total_questions, 10) || 0,
    attended_count: parseInt(data.attended_count, 10) || 0,
    right_count: parseInt(data.right_count, 10) || 0,
    wrong_count: parseInt(data.wrong_count, 10) || 0,
    submitted_at: data.submitted_at || new Date().toISOString()
  };

  try {
    await dynamoDocClient.send(
      new PutCommand({
        TableName: TABLES.SUBMISSIONS,
        Item: item
      })
    );
  } catch (err) {}

  fallbackSubmissions.push(item);
  return item;
}

async function getExamSubmissions(examId) {
  let items = [];
  try {
    const result = await dynamoDocClient.send(new ScanCommand({ TableName: TABLES.SUBMISSIONS }));
    items = result.Items || [];
  } catch (err) {
    items = [...fallbackSubmissions];
  }

  return items
    .filter(s => String(s.exam_id) === String(examId))
    .sort((a, b) => b.score - a.score);
}

async function getStudentSubmissions(studentId) {
  let items = [];
  try {
    const result = await dynamoDocClient.send(new ScanCommand({ TableName: TABLES.SUBMISSIONS }));
    items = result.Items || [];
  } catch (err) {
    items = [...fallbackSubmissions];
  }

  return items.filter(s => String(s.student_id) === String(studentId));
}

module.exports = {
  // Users
  getUserById,
  getUserByUsername,
  createUser,
  updateUser,
  deleteUser,

  // Students
  getStudents,
  getStudentById,
  getStudentByUserId,
  getStudentByAdmissionNo,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsByClass,

  // Teachers
  getTeachers,
  getTeacherById,
  getTeacherByUserId,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeachersByClass,

  // Exams & Submissions
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  createExamSubmission,
  getExamSubmissions,
  getStudentSubmissions,

  // Stats
  getDashboardStats
};
