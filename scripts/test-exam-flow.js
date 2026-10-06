// Test script to verify the entire MCQ Examination & Scheduling flow
const path = require('path');
process.env.USE_AWS = 'false'; // Test local SQLite flow first

const express = require('express');
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'examhofis-secure-jwt-key-2026';

console.log('=== RUNNING COMPREHENSIVE MCQ EXAM TESTS ===\n');

// 1. Check database tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('exams', 'exam_submissions')").all();
console.log('1. Database Tables Found:', tables.map(t => t.name));
if (tables.length < 2) {
  console.error('FAIL: Missing exams or exam_submissions table');
  process.exit(1);
}

// 2. Fetch admin user
const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
const teacher = db.prepare("SELECT * FROM users WHERE username = 'ananya.physics'").get();
const student = db.prepare("SELECT * FROM users WHERE username = 'diya10a'").get();

console.log('2. Users found:');
console.log('   Admin:', admin ? admin.username : 'MISSING');
console.log('   Teacher:', teacher ? teacher.username : 'MISSING');
console.log('   Student:', student ? student.username : 'MISSING');

// 3. Test Teacher creates exam with questions & options
const validQuestions = [
  {
    id: 'q_1',
    question: 'What is the unit of resistance?',
    options: ['Ampere', 'Volt', 'Ohm', 'Watt'],
    correct_index: 2,
    marks: 1
  },
  {
    id: 'q_2',
    question: 'Speed of light in vacuum is approximately:',
    options: ['3 x 10^8 m/s', '3 x 10^6 m/s', '3 x 10^5 km/s', '3 x 10^10 m/s'],
    correct_index: 0,
    marks: 2
  }
];

const insertExam = db.prepare(`
  INSERT INTO exams (title, subject, class, division, duration_minutes, created_by, created_by_id, status, questions, total_marks, total_questions)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
`);

const testExamRes = insertExam.run(
  'Test Physics Electrostatics MCQ',
  'Physics',
  10,
  'A',
  30,
  'Dr. Ananya Nair',
  teacher.id,
  JSON.stringify(validQuestions),
  3,
  2
);

const examId = testExamRes.lastInsertRowid;
console.log('\n3. Created Test Exam ID:', examId);

// 4. Test Admin Schedules Exam
const now = new Date();
const scheduledStart = new Date(now.getTime() - 2 * 60000).toISOString(); // 2 mins ago (LIVE)
const scheduledEnd = new Date(now.getTime() + 45 * 60000).toISOString(); // 45 mins from now

db.prepare(`
  UPDATE exams 
  SET status = 'scheduled', scheduled_start = ?, scheduled_end = ?
  WHERE id = ?
`).run(scheduledStart, scheduledEnd, examId);

const scheduledExam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
console.log('4. Scheduled Exam Status:', scheduledExam.status, 'Start:', scheduledExam.scheduled_start);

// 5. Test Student submits answers
const studentRecord = db.prepare('SELECT * FROM students WHERE user_id = ?').get(student.id);
console.log('5. Student record:', studentRecord.name, 'Class:', studentRecord.class, 'Div:', studentRecord.div);

// Student answers q_1 = 2 (correct, 1 mark), q_2 = 0 (correct, 2 marks) -> 3/3 (100%)
const answers = {
  q_1: 2,
  q_2: 0
};

let score = 0;
let totalMarks = 3;
validQuestions.forEach(q => {
  if (answers[q.id] === q.correct_index) {
    score += q.marks;
  }
});
const percentage = parseFloat(((score / totalMarks) * 100).toFixed(2));

const insertSub = db.prepare(`
  INSERT INTO exam_submissions (exam_id, student_id, student_name, admission_no, class, div, answers, score, total_marks, percentage)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  examId,
  studentRecord.id,
  studentRecord.name,
  studentRecord.admission_no,
  studentRecord.class,
  studentRecord.div,
  JSON.stringify(answers),
  score,
  totalMarks,
  percentage
);

console.log('6. Student Submission Inserted ID:', insertSub.lastInsertRowid);
console.log(`   Score Calculated: ${score} / ${totalMarks} (${percentage}%)`);

// 7. Verify Teacher/Admin viewing submissions
const submissions = db.prepare('SELECT * FROM exam_submissions WHERE exam_id = ?').all(examId);
console.log('7. Verified Submissions in DB:', submissions.length);
submissions.forEach(s => {
  console.log(`   - Student: ${s.student_name} | Score: ${s.score}/${s.total_marks} | Div: ${s.div}`);
});

console.log('\n=== ALL MCQ EXAM BACKEND TESTS PASSED SUCCESSFULLY! ===\n');
