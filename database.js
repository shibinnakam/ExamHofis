const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'examhofis.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      plain_password TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class INTEGER NOT NULL CHECK(class BETWEEN 1 AND 10),
      div TEXT NOT NULL,
      admission_no TEXT UNIQUE NOT NULL COLLATE NOCASE,
      photo_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class INTEGER NOT NULL CHECK(class BETWEEN 1 AND 10),
      subject TEXT NOT NULL CHECK(subject IN ('English', 'Malayalam', 'Chemistry', 'Physics', 'Biology', 'Science', 'Maths')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);
    CREATE INDEX IF NOT EXISTS idx_students_adm ON students(admission_no);
    CREATE INDEX IF NOT EXISTS idx_teachers_class ON teachers(class);
    CREATE INDEX IF NOT EXISTS idx_teachers_subject ON teachers(subject);

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      class INTEGER NOT NULL CHECK(class BETWEEN 1 AND 10),
      division TEXT NOT NULL DEFAULT 'All',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      created_by TEXT NOT NULL,
      created_by_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_start DATETIME,
      scheduled_end DATETIME,
      questions TEXT NOT NULL,
      total_marks INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      admission_no TEXT NOT NULL,
      class INTEGER NOT NULL,
      div TEXT NOT NULL,
      answers TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      total_marks INTEGER NOT NULL DEFAULT 0,
      percentage REAL NOT NULL DEFAULT 0.0,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class);
    CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
    CREATE INDEX IF NOT EXISTS idx_submissions_exam ON exam_submissions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_student ON exam_submissions(student_id);
  `);

  try {
    db.exec(`ALTER TABLE teachers ADD COLUMN assignments TEXT;`);
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Seed default admin if none exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', hash, 'admin123', 'admin');
    console.log('[Database] Default admin created: username=admin, password=admin123');

    // Seed sample teachers
    const sampleTeachers = [
      { name: 'Dr. Ananya Nair', class: 10, subject: 'Physics', username: 'ananya.physics', pass: 'teacher123' },
      { name: 'Prof. Rahul Varma', class: 9, subject: 'Maths', username: 'rahul.maths', pass: 'teacher123' },
      { name: 'Mrs. Meera Kurian', class: 10, subject: 'Malayalam', username: 'meera.malayalam', pass: 'teacher123' },
      { name: 'Mr. David Thomas', class: 8, subject: 'English', username: 'david.english', pass: 'teacher123' },
      { name: 'Ms. Sangeetha K.', class: 10, subject: 'Chemistry', username: 'sangeetha.chem', pass: 'teacher123' },
      { name: 'Mr. Gopal Menon', class: 7, subject: 'Biology', username: 'gopal.bio', pass: 'teacher123' },
      { name: 'Mrs. Reshma Joseph', class: 6, subject: 'Science', username: 'reshma.science', pass: 'teacher123' },
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role)
      VALUES (?, ?, ?, ?)
    `);
    const insertTeacher = db.prepare(`
      INSERT INTO teachers (user_id, name, class, subject)
      VALUES (?, ?, ?, ?)
    `);

    for (const t of sampleTeachers) {
      const tHash = bcrypt.hashSync(t.pass, salt);
      const res = insertUser.run(t.username, tHash, t.pass, 'teacher');
      insertTeacher.run(res.lastInsertRowid, t.name, t.class, t.subject);
    }
    console.log(`[Database] Seeded ${sampleTeachers.length} sample teachers`);

    // Seed sample students
    const sampleStudents = [
      { name: 'Aarav Krishnan', class: 10, div: 'A', adm: 'ADM-2026-001', username: 'aarav10a', pass: 'student123', photo: '/avatars/student1.svg' },
      { name: 'Diya Pillai', class: 10, div: 'A', adm: 'ADM-2026-002', username: 'diya10a', pass: 'student123', photo: '/avatars/student2.svg' },
      { name: 'Farhan Mohammed', class: 10, div: 'B', adm: 'ADM-2026-003', username: 'farhan10b', pass: 'student123', photo: '/avatars/student3.svg' },
      { name: 'Kavya S.', class: 9, div: 'A', adm: 'ADM-2026-004', username: 'kavya9a', pass: 'student123', photo: '/avatars/student4.svg' },
      { name: 'Rohan Nambiar', class: 8, div: 'C', adm: 'ADM-2026-005', username: 'rohan8c', pass: 'student123', photo: '/avatars/student5.svg' },
      { name: 'Hannah Elsa', class: 7, div: 'B', adm: 'ADM-2026-006', username: 'hannah7b', pass: 'student123', photo: '/avatars/student6.svg' },
      { name: 'Siddharth Menon', class: 10, div: 'A', adm: 'ADM-2026-007', username: 'siddharth10a', pass: 'student123', photo: '/avatars/student7.svg' },
    ];

    const insertStudent = db.prepare(`
      INSERT INTO students (user_id, name, class, div, admission_no, photo_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const s of sampleStudents) {
      const sHash = bcrypt.hashSync(s.pass, salt);
      const res = insertUser.run(s.username, sHash, s.pass, 'student');
      insertStudent.run(res.lastInsertRowid, s.name, s.class, s.div, s.adm, s.photo);
    }
    console.log(`[Database] Seeded ${sampleStudents.length} sample students`);
  }

  // Seed sample exam if none exists
  const examExists = db.prepare('SELECT id FROM exams LIMIT 1').get();
  if (!examExists) {
    const sampleQuestions = [
      {
        id: 'q_1',
        question: 'What is the SI unit of force in classical physics?',
        options: ['Joule', 'Newton', 'Watt', 'Pascal'],
        correct_index: 1,
        marks: 1
      },
      {
        id: 'q_2',
        question: 'The rate of change of momentum of a body is directly proportional to:',
        options: ['Applied Force', 'Velocity', 'Kinetic Energy', 'Inertia'],
        correct_index: 0,
        marks: 1
      },
      {
        id: 'q_3',
        question: 'Which optical lens is prescribed to correct myopia (short-sightedness)?',
        options: ['Convex lens', 'Concave lens', 'Cylindrical lens', 'Bifocal lens'],
        correct_index: 1,
        marks: 1
      }
    ];

    const now = new Date();
    const scheduledStart = new Date(now.getTime() - 5 * 60000).toISOString();
    const scheduledEnd = new Date(now.getTime() + 45 * 60000).toISOString();

    db.prepare(`
      INSERT INTO exams (title, subject, class, division, duration_minutes, created_by, created_by_id, status, scheduled_start, scheduled_end, questions, total_marks, total_questions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Class 10 Physics Assessment - Mechanics & Optics',
      'Physics',
      10,
      'All',
      45,
      'Dr. Ananya Nair',
      '1',
      'scheduled',
      scheduledStart,
      scheduledEnd,
      JSON.stringify(sampleQuestions),
      3,
      3
    );
    console.log('[Database] Seeded sample live MCQ exam for Class 10 Physics');
  }
}

initDatabase();

module.exports = db;
