// ExamHofis Admin Module
const Admin = {
  students: [],
  teachers: [],
  currentStudentView: 'table',
  currentTeacherView: 'table',

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
            <button class="btn btn-sm btn-secondary" onclick="Admin.viewIdCard(${s.id})">ID Card</button>
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
      tableBody.innerHTML = this.students.map(s => `
        <tr>
          <td>
            <div class="entity-cell">
              <img src="${s.photo_url || '/avatars/student1.svg'}" class="entity-avatar" alt="${s.name}">
              <div class="entity-info">
                <div class="name">${s.name}</div>
                <div class="sub">@${s.username}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-adm">${s.admission_no}</span></td>
          <td><span class="badge badge-class">Class ${s.class}</span></td>
          <td><span class="badge badge-div">Div ${s.div}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="Admin.viewCredentials('${s.username}', '${s.plain_password || '••••••••'}', '${s.name}')" title="View Credentials">
              🔑 Show
            </button>
          </td>
          <td>
            <div class="row-actions">
              <button class="action-btn" onclick="Admin.viewIdCard(${s.id})" title="Print / View ID Card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="11" y2="12"></line><circle cx="15" cy="12" r="1"></circle></svg>
              </button>
              <button class="action-btn" onclick="Admin.openEditStudentModal(${s.id})" title="Edit Student">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button class="action-btn delete" onclick="Admin.deleteStudent(${s.id}, '${s.name}')" title="Delete Student">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Render Cards
    if (cardsContainer) {
      cardsContainer.innerHTML = this.students.map(s => `
        <div class="profile-card">
          <img src="${s.photo_url || '/avatars/student1.svg'}" class="profile-card-avatar" alt="${s.name}">
          <div class="profile-card-name">${s.name}</div>
          <div class="profile-card-sub">@${s.username} • Adm: ${s.admission_no}</div>
          <div class="profile-card-badges">
            <span class="badge badge-class">Class ${s.class}</span>
            <span class="badge badge-div">Division ${s.div}</span>
          </div>
          <div class="profile-card-actions">
            <button class="btn btn-sm btn-secondary" onclick="Admin.viewIdCard(${s.id})">🆔 ID Card</button>
            <button class="btn btn-sm btn-secondary" onclick="Admin.openEditStudentModal(${s.id})">✏️ Edit</button>
            <button class="btn btn-sm btn-danger" onclick="Admin.deleteStudent(${s.id}, '${s.name}')">🗑️</button>
          </div>
        </div>
      `).join('');
    }
  },

  openAddStudentModal() {
    document.getElementById('student-modal-title').textContent = 'Add New Student';
    document.getElementById('student-form').reset();
    document.getElementById('student-id-field').value = '';
    document.getElementById('student-preview-img').src = '/avatars/student1.svg';
    
    // Auto-generate admission number suggestion
    const randomNum = Math.floor(100 + Math.random() * 900);
    document.getElementById('student-admission-no').value = `ADM-2026-${randomNum}`;
    
    // Default password suggestion
    document.getElementById('student-password').value = 'student123';
    
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
      document.getElementById('student-password').value = ''; // keep empty unless changing
      document.getElementById('student-password').placeholder = 'Leave blank to keep current password';
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
    if (confirm(`Are you sure you want to delete student "${name}"? This action cannot be undone.`)) {
      try {
        await API.deleteStudent(id);
        App.showToast(`Student "${name}" deleted`, 'success');
        this.loadStudents();
        this.loadDashboard();
      } catch (err) {
        App.showToast('Failed to delete student: ' + err.message, 'error');
      }
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
      tableBody.innerHTML = this.teachers.map(t => `
        <tr>
          <td>
            <div class="entity-cell">
              <div class="entity-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--secondary-light);color:var(--secondary);font-weight:700;">
                ${t.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
              </div>
              <div class="entity-info">
                <div class="name">${t.name}</div>
                <div class="sub">@${t.username}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-class">Class ${t.class}</span></td>
          <td><span class="badge badge-subject">${t.subject}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="Admin.viewCredentials('${t.username}', '${t.plain_password || '••••••••'}', '${t.name}')" title="View Credentials">
              🔑 Show
            </button>
          </td>
          <td>
            <div class="row-actions">
              <button class="action-btn" onclick="Admin.openEditTeacherModal(${t.id})" title="Edit Teacher">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button class="action-btn delete" onclick="Admin.deleteTeacher(${t.id}, '${t.name}')" title="Delete Teacher">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Render Cards
    if (cardsContainer) {
      cardsContainer.innerHTML = this.teachers.map(t => `
        <div class="profile-card">
          <div class="profile-card-avatar" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--secondary),var(--primary));color:#fff;font-size:1.6rem;font-weight:800;">
            ${t.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
          </div>
          <div class="profile-card-name">${t.name}</div>
          <div class="profile-card-sub">@${t.username}</div>
          <div class="profile-card-badges">
            <span class="badge badge-class">Class ${t.class}</span>
            <span class="badge badge-subject">${t.subject}</span>
          </div>
          <div class="profile-card-actions">
            <button class="btn btn-sm btn-secondary" onclick="Admin.openEditTeacherModal(${t.id})">✏️ Edit</button>
            <button class="btn btn-sm btn-danger" onclick="Admin.deleteTeacher(${t.id}, '${t.name}')">🗑️ Delete</button>
          </div>
        </div>
      `).join('');
    }
  },

  openAddTeacherModal() {
    document.getElementById('teacher-modal-title').textContent = 'Add New Teacher';
    document.getElementById('teacher-form').reset();
    document.getElementById('teacher-id-field').value = '';
    document.getElementById('teacher-password').value = 'teacher123';
    App.openModal('teacher-modal');
  },

  async openEditTeacherModal(id) {
    try {
      const teacher = await API.getTeacher(id);
      document.getElementById('teacher-modal-title').textContent = 'Edit Teacher';
      document.getElementById('teacher-id-field').value = teacher.id;
      document.getElementById('teacher-name').value = teacher.name;
      document.getElementById('teacher-class').value = teacher.class;
      document.getElementById('teacher-subject').value = teacher.subject;
      document.getElementById('teacher-username').value = teacher.username;
      document.getElementById('teacher-password').value = '';
      document.getElementById('teacher-password').placeholder = 'Leave blank to keep current password';

      App.openModal('teacher-modal');
    } catch (err) {
      App.showToast('Failed to load teacher: ' + err.message, 'error');
    }
  },

  async handleTeacherFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('teacher-id-field').value;
    const name = document.getElementById('teacher-name').value;
    const teacherClass = document.getElementById('teacher-class').value;
    const subject = document.getElementById('teacher-subject').value;
    const username = document.getElementById('teacher-username').value;
    const password = document.getElementById('teacher-password').value;

    const payload = {
      name,
      class: teacherClass,
      subject,
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
    if (confirm(`Are you sure you want to delete teacher "${name}"? This action cannot be undone.`)) {
      try {
        await API.deleteTeacher(id);
        App.showToast(`Teacher "${name}" deleted`, 'success');
        this.loadTeachers();
        this.loadDashboard();
      } catch (err) {
        App.showToast('Failed to delete teacher: ' + err.message, 'error');
      }
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
