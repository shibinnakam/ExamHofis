// Test script to verify the 4-schedule limit and multi-slot scheduling functionality via HTTP API
const db = require('../database');
const jwt = require('jsonwebtoken');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'examhofis-secure-jwt-key-2026';

console.log('=== RUNNING MULTI-SCHEDULE (MAX 4) TESTS ===\n');

// 1. Verify schedules column exists in database
const examCols = db.prepare("PRAGMA table_info(exams)").all();
const hasSchedulesCol = examCols.some(c => c.name === 'schedules');
console.log('1. Exams table has `schedules` column:', hasSchedulesCol);
if (!hasSchedulesCol) {
  console.error('FAIL: schedules column missing in exams table');
  process.exit(1);
}

// 2. Fetch admin
const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
if (!admin) {
  console.error('FAIL: admin user not found');
  process.exit(1);
}

// Generate Admin JWT
const adminToken = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, name: 'Admin' }, JWT_SECRET, { expiresIn: '1h' });

// Create a test exam for scheduling
const insertExam = db.prepare(`
  INSERT INTO exams (title, subject, class, division, duration_minutes, created_by, created_by_id, status, schedules, questions, total_marks, total_questions)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', '[]', ?, ?, ?)
`);

const testExam = insertExam.run(
  'Test Multiple Schedules (Max 4) Exam',
  'Physics',
  10,
  'All',
  40,
  'Admin',
  admin.id,
  JSON.stringify([
    { id: 'q_1', question: 'Test Question 1', options: ['A', 'B', 'C', 'D'], correct_index: 0, marks: 1 }
  ]),
  1,
  1
);

const examId = testExam.lastInsertRowid;
console.log('2. Created draft exam ID:', examId);

// Test scheduling with 4 slots (Allowed max)
const now = new Date();
const fourSlots = [
  {
    id: 'sched_1',
    label: 'Slot 1 (Morning)',
    start: new Date(now.getTime() - 10 * 60000).toISOString(),
    end: new Date(now.getTime() + 30 * 60000).toISOString(),
    duration_minutes: 40
  },
  {
    id: 'sched_2',
    label: 'Slot 2 (Mid-Day)',
    start: new Date(now.getTime() + 60 * 60000).toISOString(),
    end: new Date(now.getTime() + 100 * 60000).toISOString(),
    duration_minutes: 40
  },
  {
    id: 'sched_3',
    label: 'Slot 3 (Afternoon)',
    start: new Date(now.getTime() + 120 * 60000).toISOString(),
    end: new Date(now.getTime() + 160 * 60000).toISOString(),
    duration_minutes: 40
  },
  {
    id: 'sched_4',
    label: 'Slot 4 (Evening)',
    start: new Date(now.getTime() + 180 * 60000).toISOString(),
    end: new Date(now.getTime() + 220 * 60000).toISOString(),
    duration_minutes: 40
  }
];

// Start ephemeral server to test HTTP API endpoints
const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Server listening on temporary port ${port}`);

  async function apiPost(path, body) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function apiGet(path) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  try {
    // 3. Test HTTP POST /api/exams/:id/schedule with 4 valid slots (Max allowed)
    const successRes = await apiPost(`/api/exams/${examId}/schedule`, { schedules: fourSlots });
    console.log('3. POST schedule with 4 slots status:', successRes.status, 'Message:', successRes.data.message);
    if (successRes.status !== 200 || !successRes.data.success) {
      console.error('FAIL: Expected 200 OK for 4 schedules');
      process.exit(1);
    }
    if (successRes.data.exam.schedules.length !== 4) {
      console.error('FAIL: Expected 4 schedules returned');
      process.exit(1);
    }

    // 4. Test HTTP POST /api/exams/:id/schedule with 5 slots (Exceeds max allowed 4)
    const fiveSlots = [
      ...fourSlots,
      {
        id: 'sched_5',
        label: 'Slot 5 (Excess)',
        start: new Date(now.getTime() + 240 * 60000).toISOString(),
        end: new Date(now.getTime() + 280 * 60000).toISOString(),
        duration_minutes: 40
      }
    ];

    const failRes = await apiPost(`/api/exams/${examId}/schedule`, { schedules: fiveSlots });
    console.log('4. POST schedule with 5 slots status:', failRes.status, 'Error:', failRes.data.error);
    if (failRes.status !== 400 || !failRes.data.error.includes('Maximum 4 schedules allowed')) {
      console.error('FAIL: Expected 400 rejection for 5 schedules');
      process.exit(1);
    }

    // 5. Verify GET /api/exams/:id returns the 4 schedules
    const getRes = await apiGet(`/api/exams/${examId}`);
    console.log('5. GET exam details schedules count:', getRes.data.exam.schedules.length);
    if (getRes.data.exam.schedules.length !== 4) {
      console.error('FAIL: Expected 4 schedules in GET response');
      process.exit(1);
    }

    console.log('\n=== ALL MULTI-SCHEDULE (MAX 4) TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});
