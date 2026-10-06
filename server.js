require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID: uuidv4 } = require('crypto');

// AWS Services & Config
const cognitoService = require('./services/cognitoService');
const dynamoService = require('./services/dynamoService');
const { isAwsConfigured, REGION, COGNITO, TABLES } = require('./config/aws-config');

// SQLite fallback
let db;
try {
  db = require('./database');
} catch (e) {
  console.log('[Database] SQLite not loaded (running in pure serverless mode)');
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'examhofis-super-secret-key-2026';

// Check if AWS mode is explicitly requested or configured
const USE_AWS = process.env.USE_AWS === 'true' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || isAwsConfigured();

console.log(`[ExamHofis] Backend Mode: ${USE_AWS ? '⚡ AWS COGNITO + DYNAMODB (Cloud)' : '📁 LOCAL SQLITE FALLBACK'}`);

// Ensure uploads directory exists (use /tmp in Lambda environments)
const uploadDir = process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
}

// Multer storage for student photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `student-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WEBP, GIF, and SVG images are allowed!'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
const VALID_SUBJECTS = ['English', 'Malayalam', 'Chemistry', 'Physics', 'Biology', 'Science', 'Maths'];
const VALID_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // If AWS Cognito token is used, decode and verify claims
    const decoded = jwt.decode(token);
    if (!decoded) {
      return res.status(403).json({ error: 'Invalid or malformed token' });
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return res.status(403).json({ error: 'Token has expired' });
    }

    // If local JWT (has secret signature)
    if (!decoded['cognito:groups'] && !decoded['custom:role'] && !USE_AWS) {
      try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        return next();
      } catch (e) {}
    }

    // Cognito claim mapping
    const groups = decoded['cognito:groups'] || [];
    const role = groups[0] || decoded['custom:role'] || decoded.role || 'student';
    const username = decoded['cognito:username'] || decoded.username;
    const id = decoded.sub || decoded.id;

    req.user = {
      id,
      sub: decoded.sub,
      username,
      role,
      groups
    };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

// -------------------------------------------------------------
// AWS Status API Endpoint
// -------------------------------------------------------------
app.get('/api/aws/status', (req, res) => {
  res.json({
    activeMode: USE_AWS ? 'AWS Cloud (Cognito + DynamoDB + Lambda)' : 'Local SQLite Fallback',
    useAws: USE_AWS,
    region: REGION,
    cognitoUserPoolId: COGNITO.USER_POOL_ID || 'Not set',
    cognitoClientId: COGNITO.CLIENT_ID || 'Not set',
    tables: TABLES
  });
});

// -------------------------------------------------------------
// Metadata API
// -------------------------------------------------------------
app.get('/api/meta', (req, res) => {
  res.json({
    classes: VALID_CLASSES,
    subjects: VALID_SUBJECTS,
    divisions: ['A', 'B', 'C', 'D', 'E']
  });
});

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim();

    // --- AWS COGNITO & DYNAMODB FLOW ---
    if (USE_AWS) {
      try {
        const auth = await cognitoService.loginUser(cleanUsername, password);
        const userRec = await dynamoService.getUserByUsername(cleanUsername);

        let profile = null;
        const userId = userRec ? userRec.id : auth.user.id;

        if (auth.user.role === 'student') {
          profile = await dynamoService.getStudentByUserId(userId);
        } else if (auth.user.role === 'teacher') {
          profile = await dynamoService.getTeacherByUserId(userId);
        }

        return res.json({
          success: true,
          token: auth.idToken || auth.accessToken,
          accessToken: auth.accessToken,
          idToken: auth.idToken,
          user: {
            id: userId,
            username: auth.user.username,
            role: auth.user.role,
            profile
          }
        });
      } catch (cogErr) {
        return res.status(401).json({ error: cogErr.message || 'Invalid username or password' });
      }
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const user = db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`).get(cleanUsername);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    let profile = null;
    if (user.role === 'student') {
      profile = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
    } else if (user.role === 'teacher') {
      profile = db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(user.id);
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      const userRec = await dynamoService.getUserByUsername(req.user.username);
      const userId = userRec ? userRec.id : req.user.id;

      let profile = null;
      if (req.user.role === 'student') {
        profile = await dynamoService.getStudentByUserId(userId);
      } else if (req.user.role === 'teacher') {
        profile = await dynamoService.getTeacherByUserId(userId);
      }

      return res.json({
        user: {
          id: userId,
          username: req.user.username,
          role: req.user.role,
          created_at: userRec?.created_at,
          profile
        }
      });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile = null;
    if (user.role === 'student') {
      profile = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
    } else if (user.role === 'teacher') {
      profile = db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(user.id);
    }

    res.json({ user: { ...user, profile } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Admin Dashboard Stats
// -------------------------------------------------------------
app.get('/api/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      const stats = await dynamoService.getDashboardStats();
      return res.json(stats);
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
    const totalTeachers = db.prepare('SELECT COUNT(*) as count FROM teachers').get().count;

    const classCounts = db.prepare(`
      SELECT class, COUNT(*) as count FROM students GROUP BY class ORDER BY class ASC
    `).all();

    const subjectCounts = db.prepare(`
      SELECT subject, COUNT(*) as count FROM teachers GROUP BY subject ORDER BY count DESC
    `).all();

    const recentStudents = db.prepare(`
      SELECT s.*, u.username 
      FROM students s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.id DESC LIMIT 5
    `).all();

    const recentTeachers = db.prepare(`
      SELECT t.*, u.username 
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.id DESC LIMIT 5
    `).all();

    res.json({
      totalStudents,
      totalTeachers,
      classCounts,
      subjectCounts,
      recentStudents,
      recentTeachers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Student Management (Admin)
// -------------------------------------------------------------
app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const { search, class: classFilter, div } = req.query;

    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      const students = await dynamoService.getStudents({ search, classFilter, div });
      return res.json(students);
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    let query = `
      SELECT s.id, s.name, s.class, s.div, s.admission_no, s.photo_url, s.created_at,
             u.id as user_id, u.username, u.plain_password
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (classFilter && classFilter !== 'all') {
      query += ` AND s.class = ?`;
      params.push(parseInt(classFilter, 10));
    }

    if (div && div !== 'all') {
      query += ` AND UPPER(s.div) = ?`;
      params.push(div.trim().toUpperCase());
    }

    if (search) {
      query += ` AND (s.name LIKE ? OR s.admission_no LIKE ? OR u.username LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY s.class ASC, s.div ASC, s.name ASC`;
    const students = db.prepare(query).all(...params);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      const student = await dynamoService.getStudentById(req.params.id);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      return res.json(student);
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const student = db.prepare(`
      SELECT s.*, u.username, u.plain_password
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', authenticateToken, requireRole(['admin']), upload.single('photo'), async (req, res) => {
  const { name, class: studentClass, div, admission_no, username, password } = req.body;

  try {
    if (!name || !name.trim()) throw new Error('Student name is required');
    const classNum = parseInt(studentClass, 10);
    if (isNaN(classNum) || classNum < 1 || classNum > 10) {
      throw new Error('Class must be between 1 and 10');
    }
    if (!div || !div.trim()) throw new Error('Division is required');
    if (!admission_no || !admission_no.trim()) throw new Error('Admission number is required');
    if (!username || !username.trim()) throw new Error('Username is required');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

    const cleanUsername = username.trim().toLowerCase();
    const cleanAdmission = admission_no.trim().toUpperCase();
    const cleanDiv = div.trim().toUpperCase();

    let photoUrl = '';
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    } else {
      const randomAvatar = Math.floor(Math.random() * 7) + 1;
      photoUrl = `/avatars/student${randomAvatar}.svg`;
    }

    // --- AWS COGNITO & DYNAMODB FLOW ---
    if (USE_AWS) {
      const admExist = await dynamoService.getStudentByAdmissionNo(cleanAdmission);
      if (admExist) throw new Error(`Admission number "${cleanAdmission}" is already registered`);

      // 1. Create User in Cognito
      const cogUser = await cognitoService.adminCreateUser({
        username: cleanUsername,
        password,
        role: 'student',
        name: name.trim()
      });
      const userId = cogUser.sub || uuidv4();

      // 2. Create User in DynamoDB
      await dynamoService.createUser({
        id: userId,
        username: cleanUsername,
        role: 'student',
        name: name.trim(),
        plain_password: password
      });

      // 3. Create Student in DynamoDB
      const newStudent = await dynamoService.createStudent({
        id: uuidv4(),
        user_id: userId,
        name: name.trim(),
        class: classNum,
        div: cleanDiv,
        admission_no: cleanAdmission,
        photo_url: photoUrl,
        username: cleanUsername,
        plain_password: password
      });

      return res.status(201).json({ success: true, message: 'Student created successfully in AWS', student: newStudent });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const transaction = db.transaction(() => {
      const userExist = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
      if (userExist) throw new Error(`Username "${cleanUsername}" is already taken`);

      const admExist = db.prepare('SELECT id FROM students WHERE admission_no = ? COLLATE NOCASE').get(cleanAdmission);
      if (admExist) throw new Error(`Admission number "${cleanAdmission}" is already registered`);

      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      const userRes = db.prepare(`
        INSERT INTO users (username, password_hash, plain_password, role)
        VALUES (?, ?, ?, 'student')
      `).run(cleanUsername, hash, password);

      const studentRes = db.prepare(`
        INSERT INTO students (user_id, name, class, div, admission_no, photo_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userRes.lastInsertRowid, name.trim(), classNum, cleanDiv, cleanAdmission, photoUrl);

      return {
        id: studentRes.lastInsertRowid,
        user_id: userRes.lastInsertRowid,
        name: name.trim(),
        class: classNum,
        div: cleanDiv,
        admission_no: cleanAdmission,
        photo_url: photoUrl,
        username: cleanUsername,
        plain_password: password
      };
    });

    const newStudent = transaction();
    res.status(201).json({ success: true, message: 'Student created successfully', student: newStudent });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/students/:id', authenticateToken, requireRole(['admin']), upload.single('photo'), async (req, res) => {
  const studentId = req.params.id;
  const { name, class: studentClass, div, admission_no, username, password } = req.body;

  try {
    // --- AWS DYNAMODB & COGNITO FLOW ---
    if (USE_AWS) {
      const existing = await dynamoService.getStudentById(studentId);
      if (!existing) throw new Error('Student not found');

      const updates = {};
      if (name) updates.name = name.trim();
      if (studentClass) updates.class = parseInt(studentClass, 10);
      if (div) updates.div = div.trim().toUpperCase();
      if (admission_no) updates.admission_no = admission_no.trim().toUpperCase();

      if (req.file) {
        updates.photo_url = `/uploads/${req.file.filename}`;
      }

      if (password && password.trim().length >= 4) {
        await cognitoService.adminSetUserPassword(existing.username, password.trim());
        updates.plain_password = password.trim();
        await dynamoService.updateUser(existing.user_id, { plain_password: password.trim() });
      }

      const updated = await dynamoService.updateStudent(studentId, updates);
      return res.json({ success: true, message: 'Student updated successfully', student: updated });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const transaction = db.transaction(() => {
      const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
      if (!existing) throw new Error('Student not found');

      if (!name || !name.trim()) throw new Error('Student name is required');
      const classNum = parseInt(studentClass, 10);
      if (isNaN(classNum) || classNum < 1 || classNum > 10) throw new Error('Class must be between 1 and 10');
      if (!div || !div.trim()) throw new Error('Division is required');
      if (!admission_no || !admission_no.trim()) throw new Error('Admission number is required');
      if (!username || !username.trim()) throw new Error('Username is required');

      const cleanUsername = username.trim().toLowerCase();
      const cleanAdmission = admission_no.trim();
      const cleanDiv = div.trim().toUpperCase();

      const userExist = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(cleanUsername, existing.user_id);
      if (userExist) throw new Error(`Username "${cleanUsername}" is already taken by another account`);

      const admExist = db.prepare('SELECT id FROM students WHERE admission_no = ? COLLATE NOCASE AND id != ?').get(cleanAdmission, studentId);
      if (admExist) throw new Error(`Admission number "${cleanAdmission}" is already used by another student`);

      let photoUrl = existing.photo_url;
      if (req.file) {
        photoUrl = `/uploads/${req.file.filename}`;
      }

      if (password && password.trim().length >= 4) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password.trim(), salt);
        db.prepare(`UPDATE users SET username = ?, password_hash = ?, plain_password = ? WHERE id = ?`).run(cleanUsername, hash, password.trim(), existing.user_id);
      } else {
        db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(cleanUsername, existing.user_id);
      }

      db.prepare(`UPDATE students SET name = ?, class = ?, div = ?, admission_no = ?, photo_url = ? WHERE id = ?`).run(name.trim(), classNum, cleanDiv, cleanAdmission, photoUrl, studentId);

      return {
        id: studentId,
        name: name.trim(),
        class: classNum,
        div: cleanDiv,
        admission_no: cleanAdmission,
        photo_url: photoUrl,
        username: cleanUsername
      };
    });

    const updated = transaction();
    res.json({ success: true, message: 'Student updated successfully', student: updated });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/students/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // --- AWS DYNAMODB & COGNITO FLOW ---
    if (USE_AWS) {
      const student = await dynamoService.getStudentById(req.params.id);
      if (!student) return res.status(404).json({ error: 'Student record not found in database' });

      // Permanently delete from DynamoDB Students table
      await dynamoService.deleteStudent(student.id);

      // Permanently delete from DynamoDB Users table
      if (student.user_id) {
        try { await dynamoService.deleteUser(student.user_id); } catch (e) {
          console.warn('[DynamoDB] Error deleting user record:', e.message);
        }
      }

      // Permanently delete from Cognito User Pool
      if (student.username) {
        try { await cognitoService.adminDeleteUser(student.username); } catch (e) {
          console.warn('[Cognito] User not found or already deleted:', e.message);
        }
      }

      return res.json({ success: true, message: `Student ${student.name} permanently deleted from database` });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found in database' });
    }

    db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
    if (student.user_id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
    }
    res.json({ success: true, message: `Student ${student.name} permanently deleted from database` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Teacher Management (Admin)
// -------------------------------------------------------------
app.get('/api/teachers', authenticateToken, async (req, res) => {
  try {
    const { search, class: classFilter, subject } = req.query;

    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      const teachers = await dynamoService.getTeachers({ search, classFilter, subject });
      return res.json(teachers);
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    let query = `
      SELECT t.id, t.name, t.class, t.subject, t.assignments, t.created_at,
             u.id as user_id, u.username, u.plain_password
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (classFilter && classFilter !== 'all') {
      const clsNum = parseInt(classFilter, 10);
      query += ` AND (t.class = ? OR t.assignments LIKE ?)`;
      params.push(clsNum, `%"class":${clsNum}%`);
    }

    if (subject && subject !== 'all') {
      const subLower = subject.trim().toLowerCase();
      query += ` AND (LOWER(t.subject) = ? OR LOWER(t.assignments) LIKE ?)`;
      params.push(subLower, `%"subject":"${subLower}"%`);
    }

    if (search) {
      query += ` AND (t.name LIKE ? OR u.username LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ` ORDER BY t.class ASC, t.subject ASC, t.name ASC`;
    const teachers = db.prepare(query).all(...params);
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teachers/:id', authenticateToken, async (req, res) => {
  try {
    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      const teacher = await dynamoService.getTeacherById(req.params.id);
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      return res.json(teacher);
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const teacher = db.prepare(`
      SELECT t.*, u.username, u.plain_password
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teachers', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, class: teacherClass, subject, assignments: reqAssignments, username, password } = req.body;

  try {
    if (!name || !name.trim()) throw new Error('Teacher name is required');
    if (!username || !username.trim()) throw new Error('Username is required');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

    let assignments = [];
    if (Array.isArray(reqAssignments)) {
      assignments = reqAssignments;
    } else if (typeof reqAssignments === 'string') {
      try { assignments = JSON.parse(reqAssignments); } catch (e) {}
    }

    if (assignments && assignments.length > 0) {
      assignments = assignments.map(a => ({
        class: parseInt(a.class, 10),
        subject: String(a.subject).trim()
      })).filter(a => !isNaN(a.class) && a.class >= 1 && a.class <= 10 && VALID_SUBJECTS.includes(a.subject));
    }

    if (!assignments || assignments.length === 0) {
      const classNum = parseInt(teacherClass, 10);
      if (isNaN(classNum) || classNum < 1 || classNum > 10) throw new Error('Class must be between 1 and 10');
      if (!subject || !VALID_SUBJECTS.includes(subject)) {
        throw new Error(`Subject must be one of: ${VALID_SUBJECTS.join(', ')}`);
      }
      assignments = [{ class: classNum, subject: subject.trim() }];
    }

    const primaryClass = assignments[0].class;
    const primarySubject = assignments[0].subject;
    const classes = [...new Set(assignments.map(a => a.class))];
    const subjects = [...new Set(assignments.map(a => a.subject))];
    const cleanUsername = username.trim().toLowerCase();

    // --- AWS COGNITO & DYNAMODB FLOW ---
    if (USE_AWS) {
      const existingUser = await dynamoService.getUserByUsername(cleanUsername);
      if (existingUser) throw new Error(`Username "${cleanUsername}" is already taken`);

      const cogUser = await cognitoService.adminCreateUser({
        username: cleanUsername,
        password,
        role: 'teacher',
        name: name.trim()
      });
      const userId = cogUser.sub || uuidv4();

      await dynamoService.createUser({
        id: userId,
        username: cleanUsername,
        role: 'teacher',
        name: name.trim(),
        plain_password: password
      });

      const newTeacher = await dynamoService.createTeacher({
        id: uuidv4(),
        user_id: userId,
        name: name.trim(),
        class: primaryClass,
        subject: primarySubject,
        classes: classes,
        subjects: subjects,
        assignments: assignments,
        username: cleanUsername,
        plain_password: password
      });

      return res.status(201).json({ success: true, message: 'Teacher added successfully in AWS', teacher: newTeacher });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const transaction = db.transaction(() => {
      const userExist = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
      if (userExist) throw new Error(`Username "${cleanUsername}" is already taken`);

      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      const userRes = db.prepare(`
        INSERT INTO users (username, password_hash, plain_password, role)
        VALUES (?, ?, ?, 'teacher')
      `).run(cleanUsername, hash, password);

      const teacherRes = db.prepare(`
        INSERT INTO teachers (user_id, name, class, subject, assignments)
        VALUES (?, ?, ?, ?, ?)
      `).run(userRes.lastInsertRowid, name.trim(), primaryClass, primarySubject, JSON.stringify(assignments));

      return {
        id: teacherRes.lastInsertRowid,
        user_id: userRes.lastInsertRowid,
        name: name.trim(),
        class: primaryClass,
        subject: primarySubject,
        classes: classes,
        subjects: subjects,
        assignments: assignments,
        username: cleanUsername,
        plain_password: password
      };
    });

    const newTeacher = transaction();
    res.status(201).json({ success: true, message: 'Teacher added successfully', teacher: newTeacher });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/teachers/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const teacherId = req.params.id;
  const { name, class: teacherClass, subject, assignments: reqAssignments, password } = req.body;

  try {
    let assignments = null;
    if (Array.isArray(reqAssignments)) {
      assignments = reqAssignments;
    } else if (typeof reqAssignments === 'string') {
      try { assignments = JSON.parse(reqAssignments); } catch (e) {}
    }

    if (assignments && assignments.length > 0) {
      assignments = assignments.map(a => ({
        class: parseInt(a.class, 10),
        subject: String(a.subject).trim()
      })).filter(a => !isNaN(a.class) && a.class >= 1 && a.class <= 10 && VALID_SUBJECTS.includes(a.subject));
    }

    // --- AWS DYNAMODB & COGNITO FLOW ---
    if (USE_AWS) {
      const existing = await dynamoService.getTeacherById(teacherId);
      if (!existing) throw new Error('Teacher not found');

      const updates = {};
      if (name) updates.name = name.trim();
      if (assignments && assignments.length > 0) {
        updates.assignments = assignments;
        updates.classes = [...new Set(assignments.map(a => a.class))];
        updates.subjects = [...new Set(assignments.map(a => a.subject))];
        updates.class = assignments[0].class;
        updates.subject = assignments[0].subject;
      } else {
        if (teacherClass) updates.class = parseInt(teacherClass, 10);
        if (subject) {
          if (!VALID_SUBJECTS.includes(subject)) throw new Error(`Subject must be one of: ${VALID_SUBJECTS.join(', ')}`);
          updates.subject = subject;
        }
      }

      if (password && password.trim().length >= 4) {
        await cognitoService.adminSetUserPassword(existing.username, password.trim());
        updates.plain_password = password.trim();
        await dynamoService.updateUser(existing.user_id, { plain_password: password.trim() });
      }

      const updated = await dynamoService.updateTeacher(teacherId, updates);
      return res.json({ success: true, message: 'Teacher updated successfully', teacher: updated });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const transaction = db.transaction(() => {
      const existing = db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacherId);
      if (!existing) throw new Error('Teacher not found');

      if (!name || !name.trim()) throw new Error('Teacher name is required');

      let primaryClass = existing.class;
      let primarySubject = existing.subject;
      let assignmentsJson = existing.assignments;

      if (assignments && assignments.length > 0) {
        primaryClass = assignments[0].class;
        primarySubject = assignments[0].subject;
        assignmentsJson = JSON.stringify(assignments);
      } else {
        if (teacherClass) {
          primaryClass = parseInt(teacherClass, 10);
          if (isNaN(primaryClass) || primaryClass < 1 || primaryClass > 10) throw new Error('Class must be between 1 and 10');
        }
        if (subject) {
          if (!VALID_SUBJECTS.includes(subject)) throw new Error(`Subject must be one of: ${VALID_SUBJECTS.join(', ')}`);
          primarySubject = subject;
        }
      }

      if (password && password.trim().length >= 4) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password.trim(), salt);
        db.prepare(`UPDATE users SET password_hash = ?, plain_password = ? WHERE id = ?`).run(hash, password.trim(), existing.user_id);
      }

      db.prepare(`UPDATE teachers SET name = ?, class = ?, subject = ?, assignments = ? WHERE id = ?`).run(name.trim(), primaryClass, primarySubject, assignmentsJson, teacherId);

      return {
        id: teacherId,
        name: name.trim(),
        class: primaryClass,
        subject: primarySubject,
        assignments: assignments || (existing.assignments ? JSON.parse(existing.assignments) : [{ class: primaryClass, subject: primarySubject }]),
        username: req.body.username || existing.username
      };
    });

    const updated = transaction();
    res.json({ success: true, message: 'Teacher updated successfully', teacher: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/teachers/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // --- AWS DYNAMODB & COGNITO FLOW ---
    if (USE_AWS) {
      const teacher = await dynamoService.getTeacherById(req.params.id);
      if (!teacher) return res.status(404).json({ error: 'Teacher record not found in database' });

      // Permanently delete from DynamoDB Teachers table
      await dynamoService.deleteTeacher(teacher.id);

      // Permanently delete from DynamoDB Users table
      if (teacher.user_id) {
        try { await dynamoService.deleteUser(teacher.user_id); } catch (e) {
          console.warn('[DynamoDB] Error deleting user record:', e.message);
        }
      }

      // Permanently delete from Cognito User Pool
      if (teacher.username) {
        try { await cognitoService.adminDeleteUser(teacher.username); } catch (e) {
          console.warn('[Cognito] User not found or already deleted:', e.message);
        }
      }

      return res.json({ success: true, message: `Teacher ${teacher.name} permanently deleted from database` });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher record not found in database' });
    }

    db.prepare('DELETE FROM teachers WHERE id = ?').run(teacher.id);
    if (teacher.user_id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(teacher.user_id);
    }
    res.json({ success: true, message: `Teacher ${teacher.name} permanently deleted from database` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Teacher Portal Specific Endpoint
// -------------------------------------------------------------
app.get('/api/teacher/my-class', authenticateToken, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      let teacher;
      if (req.user.role === 'admin') {
        const teachers = await dynamoService.getTeachers();
        teacher = teachers[0] || { id: 'admin-preview', name: 'Dr. Ananya Nair (Admin Preview)', class: 10, subject: 'Physics' };
      } else {
        teacher = await dynamoService.getTeacherByUserId(req.user.id);
      }
      if (!teacher) return res.status(404).json({ error: 'Teacher record not found' });

      const students = await dynamoService.getStudentsByClass(teacher.class);
      const allTeachers = await dynamoService.getTeachersByClass(teacher.class);
      const colleagues = allTeachers.filter(t => t.id !== teacher.id);

      return res.json({
        teacher,
        students,
        colleagues,
        totalClassStudents: students.length
      });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    let teacher;
    if (req.user.role === 'admin') {
      teacher = db.prepare('SELECT * FROM teachers LIMIT 1').get() || { id: 1, name: 'Admin Faculty Preview', class: 10, subject: 'Physics' };
    } else {
      teacher = db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(req.user.id);
    }
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher record not found' });
    }

    const students = db.prepare(`
      SELECT s.id, s.name, s.class, s.div, s.admission_no, s.photo_url, u.username
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.class = ?
      ORDER BY s.div ASC, s.name ASC
    `).all(teacher.class);

    const colleagues = db.prepare(`
      SELECT name, subject, class FROM teachers WHERE class = ? AND id != ?
    `).all(teacher.class, teacher.id);

    res.json({
      teacher,
      students,
      colleagues,
      totalClassStudents: students.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Student Portal Specific Endpoint
// -------------------------------------------------------------
app.get('/api/student/my-profile', authenticateToken, requireRole(['student', 'admin']), async (req, res) => {
  try {
    // --- AWS DYNAMODB FLOW ---
    if (USE_AWS) {
      let student;
      if (req.user.role === 'admin') {
        const students = await dynamoService.getStudents();
        student = students[0] || { id: 'admin-preview', name: 'Diya Pillai (Admin Preview)', class: 10, div: 'A', admission_no: 'ADM-1001', username: 'diya10a' };
      } else {
        student = await dynamoService.getStudentByUserId(req.user.id);
      }
      if (!student) return res.status(404).json({ error: 'Student record not found' });

      const teachers = await dynamoService.getTeachersByClass(student.class);
      const allStudents = await dynamoService.getStudentsByClass(student.class);
      const classmates = allStudents.filter(s => s.div === student.div && s.id !== student.id);

      return res.json({
        student,
        teachers,
        classmates
      });
    }

    // --- LOCAL SQLITE FLOW ---
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    let student;
    if (req.user.role === 'admin') {
      student = db.prepare(`
        SELECT s.*, u.username 
        FROM students s
        JOIN users u ON s.user_id = u.id
        LIMIT 1
      `).get() || { id: 1, name: 'Admin Preview Student', class: 10, div: 'A', admission_no: 'ADM-1001', username: 'admin' };
    } else {
      student = db.prepare(`
        SELECT s.*, u.username 
        FROM students s
        JOIN users u ON s.user_id = u.id
        WHERE s.user_id = ?
      `).get(req.user.id);
    }

    if (!student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const teachers = db.prepare(`
      SELECT t.id, t.name, t.subject, t.class, t.assignments
      FROM teachers t
      WHERE t.class = ? OR t.assignments LIKE ?
      ORDER BY t.subject ASC
    `).all(student.class, `%"class":${student.class}%`);

    const classmates = db.prepare(`
      SELECT s.name, s.div, s.photo_url
      FROM students s
      WHERE s.class = ? AND s.div = ? AND s.id != ?
      ORDER BY s.name ASC
    `).all(student.class, student.div, student.id);

    res.json({
      student,
      teachers,
      classmates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MCQ EXAM & SCHEDULING MANAGEMENT ENDPOINTS
// =============================================================

// 1. GET /api/exams - List exams according to role and filters
app.get('/api/exams', authenticateToken, async (req, res) => {
  const user = req.user;
  const { class: classFilter, division, status } = req.query;

  try {
    if (USE_AWS) {
      let exams = await dynamoService.getExams({ classFilter, division, status });
      if (user.role === 'student') {
        const student = await dynamoService.getStudentByUserId(user.id);
        if (student) {
          const sId = student.id;
          const subs = await dynamoService.getStudentSubmissions(sId);
          const subMap = {};
          subs.forEach(s => { subMap[String(s.exam_id)] = s; });

          exams = exams.filter(e => 
            e.class === student.class && 
            (e.division === 'All' || e.division === student.div) &&
            e.status !== 'draft'
          ).map(e => ({
            ...e,
            submitted: !!subMap[String(e.id)],
            submission: subMap[String(e.id)] || null
          }));
        }
      }
      return res.json(exams);
    }

    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    let query = `SELECT * FROM exams WHERE 1=1`;
    const params = [];
    let currentStudent = null;

    if (user.role === 'student') {
      currentStudent = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
      if (currentStudent) {
        query += ` AND class = ? AND (division = 'All' OR division = ?) AND status != 'draft'`;
        params.push(currentStudent.class, currentStudent.div);
      }
    } else {
      if (classFilter && classFilter !== 'all') {
        query += ` AND class = ?`;
        params.push(parseInt(classFilter, 10));
      }
      if (division && division !== 'All' && division !== 'all') {
        query += ` AND (division = 'All' OR division = ?)`;
        params.push(division);
      }
      if (status && status !== 'all') {
        query += ` AND status = ?`;
        params.push(status);
      }
    }

    query += ` ORDER BY created_at DESC`;
    let exams = db.prepare(query).all(...params).map(e => ({
      ...e,
      questions: JSON.parse(e.questions || '[]')
    }));

    if (user.role === 'student' && currentStudent) {
      const submissions = db.prepare('SELECT * FROM exam_submissions WHERE student_id = ?').all(currentStudent.id);
      const subMap = {};
      submissions.forEach(s => { subMap[String(s.exam_id)] = s; });

      exams = exams.map(e => ({
        ...e,
        submitted: !!subMap[String(e.id)],
        submission: subMap[String(e.id)] || null
      }));
    }

    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/exams - Teacher creates a new exam with MCQs
app.post('/api/exams', authenticateToken, requireRole(['teacher', 'admin']), async (req, res) => {
  const { title, subject, class: examClass, division, duration_minutes, questions } = req.body;

  try {
    if (!title || !title.trim()) throw new Error('Exam title is required');
    if (!subject || !subject.trim()) throw new Error('Subject is required');
    const classNum = parseInt(examClass, 10);
    if (isNaN(classNum) || classNum < 1 || classNum > 10) throw new Error('Class must be between 1 and 10');
    const div = division || 'All';
    const duration = parseInt(duration_minutes, 10) || 30;

    if (!Array.isArray(questions)) throw new Error('Questions must be an array');
    if (questions.length < 1) throw new Error('Exam must have at least 1 question');
    if (questions.length > 150) throw new Error('Exam can have maximum 150 questions');

    // Validate each question
    const sanitizedQuestions = questions.map((q, idx) => {
      if (!q.question || !q.question.trim()) throw new Error(`Question ${idx + 1} text is required`);
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(`Question ${idx + 1} must have at least 2 options`);
      }
      const cleanOptions = q.options.map(opt => String(opt || '').trim());
      if (cleanOptions.some(opt => !opt)) {
        throw new Error(`Question ${idx + 1} has blank options. All options must have text`);
      }
      const correctIdx = parseInt(q.correct_index, 10);
      if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= cleanOptions.length) {
        throw new Error(`Question ${idx + 1} must designate a valid correct option`);
      }
      return {
        id: q.id || `q_${idx + 1}`,
        question: q.question.trim(),
        options: cleanOptions,
        correct_index: correctIdx,
        marks: parseInt(q.marks, 10) || 1
      };
    });

    const totalMarks = sanitizedQuestions.reduce((acc, q) => acc + (q.marks || 1), 0);

    const examData = {
      title: title.trim(),
      subject: subject.trim(),
      class: classNum,
      division: div,
      duration_minutes: duration,
      created_by: req.user.name || req.user.username || 'Faculty',
      created_by_id: String(req.user.id),
      status: 'draft',
      questions: sanitizedQuestions,
      total_marks: totalMarks,
      total_questions: sanitizedQuestions.length,
      created_at: new Date().toISOString()
    };

    if (USE_AWS) {
      const created = await dynamoService.createExam(examData);
      return res.status(201).json({ success: true, message: 'Exam created successfully', exam: created });
    }

    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const insert = db.prepare(`
      INSERT INTO exams (title, subject, class, division, duration_minutes, created_by, created_by_id, status, questions, total_marks, total_questions)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      examData.title,
      examData.subject,
      examData.class,
      examData.division,
      examData.duration_minutes,
      examData.created_by,
      examData.created_by_id,
      JSON.stringify(sanitizedQuestions),
      totalMarks,
      sanitizedQuestions.length
    );

    const newExam = { id: insert.lastInsertRowid, ...examData };
    res.status(201).json({ success: true, message: 'Exam created successfully', exam: newExam });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. GET /api/exams/:id - View exam details
app.get('/api/exams/:id', authenticateToken, async (req, res) => {
  const examId = req.params.id;
  const user = req.user;

  try {
    let exam;
    if (USE_AWS) {
      exam = await dynamoService.getExamById(examId);
    } else {
      if (!db) return res.status(500).json({ error: 'Database not initialized' });
      exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
      if (exam && typeof exam.questions === 'string') {
        exam.questions = JSON.parse(exam.questions);
      }
    }

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Check student submission
    let studentSubmission = null;
    if (user.role === 'student') {
      let student = null;
      if (USE_AWS) {
        student = await dynamoService.getStudentByUserId(user.id);
        const sId = student ? student.id : user.id;
        const subs = await dynamoService.getStudentSubmissions(sId);
        studentSubmission = subs.find(s => String(s.exam_id) === String(examId)) || null;
      } else {
        student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
        const sId = student ? student.id : user.id;
        studentSubmission = db.prepare('SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?').get(examId, sId);
        if (studentSubmission && typeof studentSubmission.answers === 'string') {
          studentSubmission.answers = JSON.parse(studentSubmission.answers);
        }
      }

      // If student hasn't submitted and is taking exam, mask correct_index to prevent inspecting answers!
      if (!studentSubmission && Array.isArray(exam.questions)) {
        exam = {
          ...exam,
          questions: exam.questions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            marks: q.marks
          }))
        };
      }
    }

    res.json({ exam, studentSubmission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/exams/:id/schedule - Admin schedules exam date and time
app.post('/api/exams/:id/schedule', authenticateToken, requireRole(['admin']), async (req, res) => {
  const examId = req.params.id;
  const { scheduled_start, scheduled_end, duration_minutes } = req.body;

  try {
    if (!scheduled_start) throw new Error('Scheduled start date and time is required');

    const startDate = new Date(scheduled_start);
    if (isNaN(startDate.getTime())) throw new Error('Invalid start date/time');

    let endDate;
    if (scheduled_end) {
      endDate = new Date(scheduled_end);
    } else {
      const duration = parseInt(duration_minutes, 10) || 45;
      endDate = new Date(startDate.getTime() + duration * 60000);
    }

    const updates = {
      status: 'scheduled',
      scheduled_start: startDate.toISOString(),
      scheduled_end: endDate.toISOString(),
      ...(duration_minutes ? { duration_minutes: parseInt(duration_minutes, 10) } : {})
    };

    if (USE_AWS) {
      const updated = await dynamoService.updateExam(examId, updates);
      return res.json({ success: true, message: 'Exam scheduled successfully in AWS', exam: updated });
    }

    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    db.prepare(`
      UPDATE exams 
      SET status = 'scheduled', scheduled_start = ?, scheduled_end = ?
      WHERE id = ?
    `).run(updates.scheduled_start, updates.scheduled_end, examId);

    const updatedExam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    if (updatedExam) updatedExam.questions = JSON.parse(updatedExam.questions || '[]');

    res.json({ success: true, message: 'Exam scheduled successfully', exam: updatedExam });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. POST /api/exams/:id/submit - Student submits MCQ answers
app.post('/api/exams/:id/submit', authenticateToken, requireRole(['student', 'admin']), async (req, res) => {
  const examId = req.params.id;
  const user = req.user;
  const { answers } = req.body;

  try {
    let exam;
    if (USE_AWS) {
      exam = await dynamoService.getExamById(examId);
    } else {
      if (!db) return res.status(500).json({ error: 'Database not initialized' });
      exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
      if (exam && typeof exam.questions === 'string') {
        exam.questions = JSON.parse(exam.questions);
      }
    }

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Fetch student info
    let student;
    if (USE_AWS) {
      student = await dynamoService.getStudentByUserId(user.id);
    } else {
      student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
    }
    if (!student && user.role === 'admin') {
      student = { id: 'admin-preview', name: 'Admin Preview Student', admission_no: 'ADM-PREVIEW', class: exam.class, div: 'A' };
    }
    if (!student) return res.status(404).json({ error: 'Student record not found' });

    // Calculate score
    const questions = exam.questions || [];
    let score = 0;
    let totalMarks = 0;

    questions.forEach((q, idx) => {
      const qKey = q.id || `q_${idx + 1}`;
      const qMarks = q.marks || 1;
      totalMarks += qMarks;

      const studentAns = answers ? answers[qKey] : undefined;
      if (studentAns !== undefined && parseInt(studentAns, 10) === parseInt(q.correct_index, 10)) {
        score += qMarks;
      }
    });

    const percentage = totalMarks > 0 ? parseFloat(((score / totalMarks) * 100).toFixed(2)) : 0;

    const submissionData = {
      exam_id: String(examId),
      student_id: String(student.id),
      student_name: student.name,
      admission_no: student.admission_no,
      class: student.class,
      div: student.div,
      answers: answers || {},
      score,
      total_marks: totalMarks,
      percentage,
      submitted_at: new Date().toISOString()
    };

    if (USE_AWS) {
      const created = await dynamoService.createExamSubmission(submissionData);
      return res.status(201).json({ success: true, message: 'Exam submitted successfully', submission: created });
    }

    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const insert = db.prepare(`
      INSERT INTO exam_submissions (exam_id, student_id, student_name, admission_no, class, div, answers, score, total_marks, percentage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      examId,
      student.id,
      student.name,
      student.admission_no,
      student.class,
      student.div,
      JSON.stringify(answers || {}),
      score,
      totalMarks,
      percentage
    );

    const submission = { id: insert.lastInsertRowid, ...submissionData };
    res.status(201).json({ success: true, message: 'Exam submitted successfully', submission });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. GET /api/exams/:id/submissions - View all submissions for an exam
app.get('/api/exams/:id/submissions', authenticateToken, requireRole(['teacher', 'admin']), async (req, res) => {
  const examId = req.params.id;
  try {
    if (USE_AWS) {
      const subs = await dynamoService.getExamSubmissions(examId);
      return res.json(subs);
    }

    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const subs = db.prepare(`
      SELECT * FROM exam_submissions 
      WHERE exam_id = ? 
      ORDER BY score DESC, submitted_at ASC
    `).all(examId).map(s => ({
      ...s,
      answers: JSON.parse(s.answers || '{}')
    }));

    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. DELETE /api/exams/:id - Delete an exam
app.delete('/api/exams/:id', authenticateToken, requireRole(['teacher', 'admin']), async (req, res) => {
  const examId = req.params.id;
  try {
    if (USE_AWS) {
      await dynamoService.deleteExam(examId);
      return res.json({ success: true, message: 'Exam deleted successfully' });
    }

    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
    db.prepare('DELETE FROM exam_submissions WHERE exam_id = ?').run(examId);
    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SPA Catch-All Route (Compatible with Express 5)
// -------------------------------------------------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`  ExamHofis Management Server Running!`);
    console.log(`  Local URL: http://localhost:${PORT}`);
    console.log(`  AWS Mode: ${USE_AWS ? 'ENABLED (Cognito + DynamoDB)' : 'DISABLED (Using SQLite)'}`);
    console.log(`  Admin Login: username=admin | password=admin123`);
    console.log(`===============================================`);
  });
}

module.exports = app;
