# ExamHofis - School & Examination Management Platform

A modern, full-stack school management and administrative platform featuring role-based portals for **Admin**, **Teachers**, and **Students**.

---

## 🌟 Key Features

### 👑 1. Admin Portal
- **Dashboard & Analytics**:
  - Real-time statistics: Total enrolled students, active teachers, faculty distribution.
  - Class enrollment breakdowns (Classes 1 through 10).
  - Subject faculty specialization charts.
  - Recent registrations and quick action shortcuts.
- **Student Management**:
  - **Add Students** with:
    - Full Name
    - **Class**: Dropdown selection from **Class 1 to Class 10**
    - **Division (Div)**: Dropdown selection (A, B, C, D, E)
    - **Admission Number**: Unique admission ID (with auto-generation option)
    - **Photo**: File upload with circular live preview (supports PNG, JPG, WEBP, SVG)
    - **Username & Password**: Admin-defined credentials with random password generator and show/hide toggle
  - **Search & Filters**: Filter by Class (1-10), Division (A-E), or search by student name/admission number/username.
  - **View Modes**: Switch between responsive **Table View** and **Cards Grid View**.
  - **Student ID Card**: Printable digital identity card with student photo, barcode graphic, and school crest.
  - **Edit & Delete**: Full CRUD controls with database cascading and photo asset cleanup.
  - **Credential Viewer**: 1-click modal to display student login username & password.
- **Teacher Management**:
  - **Add Teachers** with:
    - Teacher Full Name
    - **Class**: Dropdown selection from **Class 1 to Class 10**
    - **Subject**: Dropdown strictly featuring:
      - **English**
      - **Malayalam**
      - **Chemistry**
      - **Physics**
      - **Biology**
      - **Science**
      - **Maths**
    - **Username & Password**: Admin-defined credentials with password generator helper
  - **Search & Filters**: Filter by Class (1-10), Subject dropdown, or search by teacher name/username.
  - **View Modes**: Table View and Cards Grid View.
  - **Edit & Delete**: Full CRUD controls with confirmation dialogs.

---

### 👨‍🏫 2. Teacher Portal
- Log in with teacher credentials.
- Classroom Hub showing:
  - Assigned class and subject specialization.
  - Complete roster of students enrolled in the teacher's assigned class with photos, admission numbers, and divisions.
  - Colleague faculty members teaching in the same class.

---

### 🎓 3. Student Portal
- Log in with student credentials.
- Personal Digital Identity Card (with 1-click Print / Save as PDF).
- List of subject faculty assigned to the student's class (English, Malayalam, Chemistry, Physics, Biology, Science, Maths).
- Division classmates roster.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node v24.16.0)

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Platform
```bash
npm start
```
The server will start on: **`http://localhost:3000`**

---

## 🔑 Pre-Configured Demo Accounts

| Role | Username | Password | Details |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Full access to manage students, teachers, and system metrics |
| **Teacher** | `ananya.physics` | `teacher123` | Class 10 Physics Faculty |
| **Teacher** | `rahul.maths` | `teacher123` | Class 9 Maths Faculty |
| **Teacher** | `meera.malayalam` | `teacher123` | Class 10 Malayalam Faculty |
| **Student** | `aarav10a` | `student123` | Class 10-A, Adm: ADM-2026-001 |
| **Student** | `diya10a` | `student123` | Class 10-A, Adm: ADM-2026-002 |

> *Tip: You can use the quick 1-click demo buttons on the top navigation bar or the login screen to switch between roles instantly!*

---

## 📁 Project Structure

```
d:/ExamHofis/
├── server.js              # Express server with REST APIs, authentication & file upload
├── database.js            # SQLite database with better-sqlite3, schema & seed records
├── uploads/               # Uploaded student photos directory
├── public/                # Frontend Single Page Application
│   ├── index.html         # Main UI layout (Admin, Teacher, Student portals, modals)
│   ├── css/
│   │   ├── style.css      # Core design system (glassmorphism, responsive tables, cards)
│   │   └── id-card.css    # Printable Student Identity Card styling
│   ├── js/
│   │   ├── api.js         # REST API client
│   │   ├── auth.js        # Auth state & session controller
│   │   ├── admin.js       # Student & Teacher CRUD operations, stats, modals
│   │   ├── teacher.js     # Teacher classroom hub logic
│   │   ├── student.js     # Student profile & faculty logic
│   │   └── app.js         # Navigation, theme, toasts, password generator
│   ├── avatars/           # Default student avatars
│   └── logo.svg           # Platform emblem & crest
└── package.json
```
