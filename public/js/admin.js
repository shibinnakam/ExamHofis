// ExamHofis Admin Module
const Admin = {
  students: [],
  teachers: [],
  currentStudentView: 'table',
  currentTeacherView: 'table',

  escapeStr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  },

  async loadDashboard() {
    try {
      const stats = await API.getStats();
      document.getElementById('stat-total-students').textContent = stats.totalStudents;
      document.getElementById('stat-total-teachers').textContent = stats.totalTeachers;

      // Render Class Distribution Pills
      const classDistEl = document.getElementById('dashboard-class-dist');
      if (classDistEl) {
        if (!stats.classCounts || stats.classCounts.length === 0) {
          classDistEl.innerHTML = '<p class="text-muted">No student enrollment data yet.</p>';
        } else {
          classDistEl.innerHTML = stats.classCounts.map(c => `
            <div class="stat-card" style="padding: 16px; margin: 0;">
              <div>
                <span class="badge badge-class">Class ${c.class}</span>
                <h3 style="font-size: 1.5rem; margin-top: 6px;">${c.count}</h3>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Enrolled Students</span>
              </div>
            </div>
          `).join('');
        }
      }

      // Render Subject Distribution
      const subjDistEl = document.getElementById('dashboard-subject-dist');
      if (subjDistEl) {
        if (!stats.subjectCounts || stats.subjectCounts.length === 0) {
          subjDistEl.innerHTML = '<p class="text-muted">No teacher faculty assigned yet.</p>';
        } else {
          subjDistEl.innerHTML = stats.subjectCounts.map(s => `
            <div class="stat-card" style="padding: 16px; margin: 0;">
              <div>
                <span class="badge badge-subject">${s.subject}</span>
                <h3 style="font-size: 1.5rem; margin-top: 6px;">${s.count}</h3>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Faculty Members</span>
              </div>
            </div>
          `).join('');
        }
      }

      // Render Recent Students
      const recentStudentsEl = document.getElementById('dashboard-recent-students');
      if (recentStudentsEl) {
        recentStudentsEl.innerHTML = stats.recentStudents.map(s => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
            <div class="entity-cell">
              <img src="${s.photo_url || '/avatars/student1.svg'}" class="entity-avatar" alt="${s.name}">
              <div class="entity-info">
                <div class="name">${s.name}</div>
                <div class="sub">Class ${s.class}-${s.div} • ${s.admission_no}</div>
              </div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="Admin.viewIdCard('${s.id}')">ID Card</button>
          </div>
        `).join('');
      }

      // Render Recent Teachers
      const recentTeachersEl = document.getElementById('dashboard-recent-teachers');
      if (recentTeachersEl) {
        recentTeachersEl.innerHTML = stats.recentTeachers.map(t => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
            <div class="entity-cell">
              <div class="entity-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--secondary-light);color:var(--secondary);font-weight:700;">
                ${t.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
              </div>
              <div class="entity-info">
                <div class="name">${t.name}</div>
                <div class="sub">Class ${t.class} • ${t.subject}</div>
              </div>
            </div>
            <span class="badge badge-subject">${t.subject}</span>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  },

  // =================================================================
  // STUDENT MANAGEMENT
  // =================================================================
  async loadStudents() {
    const classFilter = document.getElementById('student-filter-class')?.value || 'all';
    const divFilter = document.getElementById('student-filter-div')?.value || 'all';
    const search = document.getElementById('student-search-input')?.value || '';

    try {
      this.students = await API.getStudents({
        class: classFilter,
        div: divFilter,
        search: search
      });
      this.renderStudents();
    } catch (err) {
      App.showToast('Failed to load students: ' + err.message, 'error');
    }
  },

  renderStudents() {
    const tableBody = document.getElementById('students-table-body');
    const cardsContainer = document.getElementById('students-cards-container');
    const countEl = document.getElementById('students-count-badge');

    if (countEl) countEl.textContent = `${this.students.length} Students`;

    if (this.students.length === 0) {
      const emptyHtml = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <h4>No Students Found</h4>
          <p>No student records match the selected filters or search terms.</p>
        </div>
      `;
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="7">${emptyHtml}</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
      return;
    }

    // Render Table Rows
    if (tableBody) {
      tableBody.innerHTML = this.students.map(s => {
        const safeName = Admin.escapeStr(s.name);
        const safeUser = Admin.escapeStr(s.username);
        const safePass = Admin.escapeStr(s.plain_password || '••••••••');
        return `
        <tr style="cursor: pointer;" onclick="if (!event.target.closest('button')) Admin.openEditStudentModal('${s.id}')" title="Click to edit or delete">
          <td>
            <div class="entity-cell">
              <img src="${s.photo_url || '/avatars/student1.svg'}" class="entity-avatar" alt="${safeName}">
              <div class="entity-info">
                <div class="name">${safeName}</div>
                <div class="sub">@${safeUser}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-adm">${s.admission_no}</span></td>
          <td><span class="badge badge-class">Class ${s.class}</span></td>
          <td><span class="badge badge-div">Div ${s.div}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary action-btn-premium" onclick="event.stopPropagation(); Admin.viewCredentials('${safeUser}', '${safePass}', '${safeName}')" title="View Credentials">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3L22 7l-3-3"></path></svg>
              <span>Show</span>
            </button>
          </td>
          <td>
            <div class="row-actions">
              <button class="action-btn" onclick="event.stopPropagation(); Admin.viewIdCard('${s.id}')" title="Print / View ID Card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="11" y2="12"></line><circle cx="15" cy="12" r="1"></circle></svg>
              </button>
              <button class="action-btn" onclick="event.stopPropagation(); Admin.openEditStudentModal('${s.id}')" title="Edit Student">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button class="action-btn delete" onclick="event.stopPropagation(); Admin.deleteStudent('${s.id}', '${safeName}')" title="Delete Student Permanently">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Render Cards
    if (cardsContainer) {
      cardsContainer.innerHTML = this.students.map(s => {
        const safeName = Admin.escapeStr(s.name);
        return `
        <div class="profile-card" style="cursor: pointer;" onclick="if (!event.target.closest('button')) Admin.openEditStudentModal('${s.id}')" title="Click to edit or delete">
          <img src="${s.photo_url || '/avatars/student1.svg'}" class="profile-card-avatar" alt="${safeName}">
          <div class="profile-card-name">${safeName}</div>
          <div class="profile-card-sub">@${s.username} • Adm: ${s.admission_no}</div>
          <div class="profile-card-badges">
            <span class="badge badge-class">Class ${s.class}</span>
            <span class="badge badge-div">Division ${s.div}</span>
          </div>
          <div class="profile-card-actions">
            <button class="btn btn-sm btn-secondary action-btn-premium" onclick="event.stopPropagation(); Admin.viewIdCard('${s.id}')" title="View ID Card">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="11" y2="12"></line><circle cx="15" cy="12" r="1"></circle></svg>
              <span>ID Card</span>
            </button>
            <button class="btn btn-sm btn-secondary action-btn-premium" onclick="event.stopPropagation(); Admin.openEditStudentModal('${s.id}')" title="Edit Student">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Edit</span>
            </button>
            <button class="btn btn-sm btn-danger action-btn-premium" onclick="event.stopPropagation(); Admin.deleteStudent('${s.id}', '${safeName}')" title="Permanently Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>`;
      }).join('');
    }
  },

  openAddStudentModal() {
    document.getElementById('student-modal-title').textContent = 'Add New Student';
    const form = document.getElementById('student-form');
    if (form) form.reset();
    document.getElementById('student-id-field').value = '';
    document.getElementById('student-preview-img').src = '/avatars/student1.svg';
    
    // Auto-generate admission number suggestion
    const randomNum = Math.floor(100 + Math.random() * 900);
    document.getElementById('student-admission-no').value = `ADM-2026-${randomNum}`;
    
    // Default password suggestion
    const passInput = document.getElementById('student-password');
    if (passInput) {
      passInput.value = 'student123';
      passInput.type = 'password';
      passInput.placeholder = 'Password';
      const eyeBtn = passInput.parentElement?.querySelector('.icon-only');
      if (eyeBtn) {
        const eyeOpen = eyeBtn.querySelector('.eye-open-icon');
        const eyeClosed = eyeBtn.querySelector('.eye-closed-icon');
        if (eyeOpen && eyeClosed) {
          eyeOpen.style.display = 'block';
          eyeClosed.style.display = 'none';
          eyeBtn.setAttribute('title', 'Show password');
        }
      }
    }
    
    App.openModal('student-modal');
  },

  async openEditStudentModal(id) {
    try {
      const student = await API.getStudent(id);
      document.getElementById('student-modal-title').textContent = 'Edit Student';
      document.getElementById('student-id-field').value = student.id;
      document.getElementById('student-name').value = student.name;
      document.getElementById('student-class').value = student.class;
      document.getElementById('student-div').value = student.div;
      document.getElementById('student-admission-no').value = student.admission_no;
      document.getElementById('student-username').value = student.username;
      const passInput = document.getElementById('student-password');
      if (passInput) {
        passInput.value = ''; // keep empty unless changing
        passInput.type = 'password';
        passInput.placeholder = 'Leave blank to keep current';
        const eyeBtn = passInput.parentElement?.querySelector('.icon-only');
        if (eyeBtn) {
          const eyeOpen = eyeBtn.querySelector('.eye-open-icon');
          const eyeClosed = eyeBtn.querySelector('.eye-closed-icon');
          if (eyeOpen && eyeClosed) {
            eyeOpen.style.display = 'block';
            eyeClosed.style.display = 'none';
          }
        }
      }
      document.getElementById('student-preview-img').src = student.photo_url || '/avatars/student1.svg';

      App.openModal('student-modal');
    } catch (err) {
      App.showToast('Failed to load student details: ' + err.message, 'error');
    }
  },

  async handleStudentFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('student-id-field').value;
    const form = document.getElementById('student-form');
    const formData = new FormData(form);

    try {
      if (id) {
        await API.updateStudent(id, formData);
        App.showToast('Student updated successfully!', 'success');
      } else {
        await API.createStudent(formData);
        App.showToast('Student added successfully!', 'success');
      }
      App.closeModal('student-modal');
      this.loadStudents();
      this.loadDashboard();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async deleteStudent(id, name) {
    const confirmed = confirm(
      `⚠️ PERMANENT DATABASE DELETION\n\n` +
      `Are you sure you want to PERMANENTLY delete student "${name}"?\n\n` +
      `• Removes student profile from database\n` +
      `• Removes login credentials from Cognito/Users\n` +
      `• Deletes digital student ID card\n\n` +
      `This action CANNOT be undone.`
    );
    if (!confirmed) return;

    try {
      App.showToast(`Deleting student "${name}"...`, 'info');
      await API.deleteStudent(id);
      App.showToast(`✅ Student "${name}" permanently deleted from database`, 'success');
      await this.loadStudents();
      await this.loadDashboard();
    } catch (err) {
      console.error('Delete student error:', err);
      App.showToast('Failed to delete student: ' + err.message, 'error');
    }
  },

  async viewIdCard(studentId) {
    try {
      const student = await API.getStudent(studentId);
      document.getElementById('idcard-name').textContent = student.name;
      document.getElementById('idcard-class').textContent = `Class ${student.class} - ${student.div}`;
      document.getElementById('idcard-adm').textContent = student.admission_no;
      document.getElementById('idcard-user').textContent = student.username;
      document.getElementById('idcard-photo').src = student.photo_url || '/avatars/student1.svg';
      document.getElementById('idcard-barcode').textContent = `*${student.admission_no}*`;
      App.openModal('idcard-modal');
    } catch (err) {
      App.showToast('Failed to load ID card: ' + err.message, 'error');
    }
  },

  // =================================================================
  // TEACHER MANAGEMENT
  // =================================================================
  async loadTeachers() {
    const classFilter = document.getElementById('teacher-filter-class')?.value || 'all';
    const subjectFilter = document.getElementById('teacher-filter-subject')?.value || 'all';
    const search = document.getElementById('teacher-search-input')?.value || '';

    try {
      this.teachers = await API.getTeachers({
        class: classFilter,
        subject: subjectFilter,
        search: search
      });
      this.renderTeachers();
    } catch (err) {
      App.showToast('Failed to load teachers: ' + err.message, 'error');
    }
  },

  renderTeachers() {
    const tableBody = document.getElementById('teachers-table-body');
    const cardsContainer = document.getElementById('teachers-cards-container');
    const countEl = document.getElementById('teachers-count-badge');

    if (countEl) countEl.textContent = `${this.teachers.length} Teachers`;

    if (this.teachers.length === 0) {
      const emptyHtml = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <h4>No Teachers Found</h4>
          <p>No faculty members match the selected filters or search terms.</p>
        </div>
      `;
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
      return;
    }

    // Render Table Rows
    if (tableBody) {
      tableBody.innerHTML = this.teachers.map(t => {
        const safeName = Admin.escapeStr(t.name);
        const safeUser = Admin.escapeStr(t.username);
        const safePass = Admin.escapeStr(t.plain_password || '••••••••');

        let assignments = [];
        if (Array.isArray(t.assignments)) {
          assignments = t.assignments;
        } else if (typeof t.assignments === 'string') {
          try { assignments = JSON.parse(t.assignments); } catch (e) {}
        }
        if (!assignments || assignments.length === 0) {
          assignments = [{ class: t.class, subject: t.subject }];
        }

        const uniqueClasses = [...new Set(assignments.map(a => a.class))].sort((a,b)=>a-b);
        const classBadges = uniqueClasses.map(c => `<span class="badge badge-class">Class ${c}</span>`).join(' ');

        const assignmentBadges = assignments.map(a => 
          `<span class="badge badge-subject" title="Class ${a.class}: ${a.subject}">${a.subject} (Cl ${a.class})</span>`
        ).join(' ');

        return `
        <tr style="cursor: pointer;" onclick="if (!event.target.closest('button')) Admin.openEditTeacherModal('${t.id}')" title="Click to edit or delete">
          <td>
            <div class="entity-cell">
              <div class="entity-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--secondary-light);color:var(--secondary);font-weight:700;">
                ${t.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
              </div>
              <div class="entity-info">
                <div class="name">${safeName}</div>
                <div class="sub">@${safeUser}</div>
              </div>
            </div>
          </td>
          <td><div class="badges-wrap">${classBadges}</div></td>
          <td><div class="badges-wrap">${assignmentBadges}</div></td>
          <td>
            <button class="btn btn-sm btn-secondary action-btn-premium" onclick="event.stopPropagation(); Admin.viewCredentials('${safeUser}', '${safePass}', '${safeName}')" title="View Credentials">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3L22 7l-3-3"></path></svg>
              <span>Show</span>
            </button>
          </td>
          <td>
            <div class="row-actions">
              <button class="action-btn" onclick="event.stopPropagation(); Admin.openEditTeacherModal('${t.id}')" title="Edit Teacher">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button class="action-btn delete" onclick="event.stopPropagation(); Admin.deleteTeacher('${t.id}', '${safeName}')" title="Delete Teacher Permanently">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Render Cards
    if (cardsContainer) {
      cardsContainer.innerHTML = this.teachers.map(t => {
        const safeName = Admin.escapeStr(t.name);
        let assignments = [];
        if (Array.isArray(t.assignments)) {
          assignments = t.assignments;
        } else if (typeof t.assignments === 'string') {
          try { assignments = JSON.parse(t.assignments); } catch (e) {}
        }
        if (!assignments || assignments.length === 0) {
          assignments = [{ class: t.class, subject: t.subject }];
        }

        const assignmentBadges = assignments.map(a => 
          `<span class="badge badge-subject">Class ${a.class} • ${a.subject}</span>`
        ).join(' ');

        return `
        <div class="profile-card" style="cursor: pointer;" onclick="if (!event.target.closest('button')) Admin.openEditTeacherModal('${t.id}')" title="Click to edit or delete">
          <div class="profile-card-avatar" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--secondary),var(--primary));color:#fff;font-size:1.6rem;font-weight:800;">
            ${t.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
          </div>
          <div class="profile-card-name">${safeName}</div>
          <div class="profile-card-sub">@${t.username}</div>
          <div class="profile-card-badges badges-wrap">
            ${assignmentBadges}
          </div>
          <div class="profile-card-actions">
            <button class="btn btn-sm btn-secondary action-btn-premium" onclick="event.stopPropagation(); Admin.openEditTeacherModal('${t.id}')" title="Edit Teacher">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Edit</span>
            </button>
            <button class="btn btn-sm btn-danger action-btn-premium" onclick="event.stopPropagation(); Admin.deleteTeacher('${t.id}', '${safeName}')" title="Permanently Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>`;
      }).join('');
    }
  },

  addTeacherAssignmentRow(selectedClass = 10, selectedSubject = 'Physics') {
    const container = document.getElementById('teacher-assignments-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'assignment-row';

    const subjects = ['English', 'Malayalam', 'Chemistry', 'Physics', 'Biology', 'Science', 'Maths'];
    const classOptions = Array.from({ length: 10 }, (_, i) => {
      const c = i + 1;
      return `<option value="${c}" ${c === Number(selectedClass) ? 'selected' : ''}>Class ${c}</option>`;
    }).join('');

    const subjectOptions = subjects.map(s => {
      return `<option value="${s}" ${s === selectedSubject ? 'selected' : ''}>${s}</option>`;
    }).join('');

    row.innerHTML = `
      <div class="assignment-field">
        <label class="assignment-sublabel">Class (1 - 10)</label>
        <select class="custom-select assignment-class-select" required>
          ${classOptions}
        </select>
      </div>
      <div class="assignment-field">
        <label class="assignment-sublabel">Subject</label>
        <select class="custom-select assignment-subject-select" required>
          ${subjectOptions}
        </select>
      </div>
      <button type="button" class="btn-remove-assignment" title="Remove assignment" onclick="Admin.removeTeacherAssignmentRow(this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;

    container.appendChild(row);
    this.updateRemoveAssignmentButtons();
  },

  removeTeacherAssignmentRow(btn) {
    const container = document.getElementById('teacher-assignments-container');
    if (!container) return;
    const rows = container.querySelectorAll('.assignment-row');
    if (rows.length > 1) {
      btn.closest('.assignment-row').remove();
    }
    this.updateRemoveAssignmentButtons();
  },

  updateRemoveAssignmentButtons() {
    const container = document.getElementById('teacher-assignments-container');
    if (!container) return;
    const rows = container.querySelectorAll('.assignment-row');
    rows.forEach(r => {
      const btn = r.querySelector('.btn-remove-assignment');
      if (btn) {
        btn.disabled = rows.length <= 1;
        btn.style.visibility = rows.length <= 1 ? 'hidden' : 'visible';
      }
    });
  },

  openAddTeacherModal() {
    document.getElementById('teacher-modal-title').textContent = 'Add New Teacher';
    const form = document.getElementById('teacher-form');
    if (form) form.reset();
    document.getElementById('teacher-id-field').value = '';

    // Clear and initialize with 1 assignment row
    const container = document.getElementById('teacher-assignments-container');
    if (container) container.innerHTML = '';
    this.addTeacherAssignmentRow(10, 'Physics');

    const passInput = document.getElementById('teacher-password');
    if (passInput) {
      passInput.value = 'teacher123';
      passInput.type = 'password';
      passInput.placeholder = 'Password';
      const eyeBtn = passInput.parentElement?.querySelector('.icon-only');
      if (eyeBtn) {
        const eyeOpen = eyeBtn.querySelector('.eye-open-icon');
        const eyeClosed = eyeBtn.querySelector('.eye-closed-icon');
        if (eyeOpen && eyeClosed) {
          eyeOpen.style.display = 'block';
          eyeClosed.style.display = 'none';
          eyeBtn.setAttribute('title', 'Show password');
        }
      }
    }
    App.openModal('teacher-modal');
  },

  async openEditTeacherModal(id) {
    try {
      const teacher = await API.getTeacher(id);
      document.getElementById('teacher-modal-title').textContent = 'Edit Teacher';
      document.getElementById('teacher-id-field').value = teacher.id;
      document.getElementById('teacher-name').value = teacher.name;
      document.getElementById('teacher-username').value = teacher.username;

      // Populate dynamic assignments
      const container = document.getElementById('teacher-assignments-container');
      if (container) container.innerHTML = '';

      let assignments = [];
      if (Array.isArray(teacher.assignments)) {
        assignments = teacher.assignments;
      } else if (typeof teacher.assignments === 'string') {
        try { assignments = JSON.parse(teacher.assignments); } catch (e) {}
      }
      if (!assignments || assignments.length === 0) {
        assignments = [{ class: teacher.class || 10, subject: teacher.subject || 'Physics' }];
      }

      assignments.forEach(a => {
        this.addTeacherAssignmentRow(a.class, a.subject);
      });

      const passInput = document.getElementById('teacher-password');
      if (passInput) {
        passInput.value = '';
        passInput.type = 'password';
        passInput.placeholder = 'Leave blank to keep current';
        const eyeBtn = passInput.parentElement?.querySelector('.icon-only');
        if (eyeBtn) {
          const eyeOpen = eyeBtn.querySelector('.eye-open-icon');
          const eyeClosed = eyeBtn.querySelector('.eye-closed-icon');
          if (eyeOpen && eyeClosed) {
            eyeOpen.style.display = 'block';
            eyeClosed.style.display = 'none';
          }
        }
      }

      App.openModal('teacher-modal');
    } catch (err) {
      App.showToast('Failed to load teacher: ' + err.message, 'error');
    }
  },

  async handleTeacherFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('teacher-id-field').value;
    const name = document.getElementById('teacher-name').value;
    const username = document.getElementById('teacher-username').value;
    const password = document.getElementById('teacher-password').value;

    const rows = document.querySelectorAll('#teacher-assignments-container .assignment-row');
    const assignments = [];
    rows.forEach(r => {
      const cls = parseInt(r.querySelector('.assignment-class-select').value, 10);
      const sub = r.querySelector('.assignment-subject-select').value;
      if (cls && sub) {
        assignments.push({ class: cls, subject: sub });
      }
    });

    if (assignments.length === 0) {
      App.showToast('Please specify at least one class and subject assignment.', 'error');
      return;
    }

    const primaryClass = assignments[0].class;
    const primarySubject = assignments[0].subject;

    // Update hidden fields for any dependent components
    const classHidden = document.getElementById('teacher-class');
    const subjectHidden = document.getElementById('teacher-subject');
    if (classHidden) classHidden.value = primaryClass;
    if (subjectHidden) subjectHidden.value = primarySubject;

    const payload = {
      name,
      class: primaryClass,
      subject: primarySubject,
      assignments,
      username,
      password
    };

    try {
      if (id) {
        await API.updateTeacher(id, payload);
        App.showToast('Teacher updated successfully!', 'success');
      } else {
        await API.createTeacher(payload);
        App.showToast('Teacher added successfully!', 'success');
      }
      App.closeModal('teacher-modal');
      this.loadTeachers();
      this.loadDashboard();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async deleteTeacher(id, name) {
    const confirmed = confirm(
      `⚠️ PERMANENT DATABASE DELETION\n\n` +
      `Are you sure you want to PERMANENTLY delete teacher "${name}"?\n\n` +
      `• Removes faculty profile from database\n` +
      `• Removes class assignments and subjects\n` +
      `• Deletes login credentials from Cognito/Users\n\n` +
      `This action CANNOT be undone.`
    );
    if (!confirmed) return;

    try {
      App.showToast(`Deleting teacher "${name}"...`, 'info');
      await API.deleteTeacher(id);
      App.showToast(`✅ Teacher "${name}" permanently deleted from database`, 'success');
      await this.loadTeachers();
      await this.loadDashboard();
    } catch (err) {
      console.error('Delete teacher error:', err);
      App.showToast('Failed to delete teacher: ' + err.message, 'error');
    }
  },

  // Credentials dialog helper
  viewCredentials(username, password, name) {
    document.getElementById('cred-modal-name').textContent = name;
    document.getElementById('cred-modal-username').textContent = username;
    document.getElementById('cred-modal-password').textContent = password;
    App.openModal('credentials-modal');
  }
};

window.Admin = Admin;
