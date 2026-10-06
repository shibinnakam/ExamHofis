// ExamHofis Student Portal Module
const StudentPortal = {
  data: null,

  async init() {
    try {
      this.data = await API.getStudentProfileData();
      this.render();
    } catch (err) {
      console.error('Failed to load student portal data:', err);
      App.showToast('Failed to load your student profile: ' + err.message, 'error');
    }
  },

  render() {
    if (!this.data) return;

    const student = this.data.student;
    const teachers = this.data.teachers;
    const classmates = this.data.classmates;

    // Set Welcome Header
    const nameEl = document.getElementById('student-profile-name');
    const classEl = document.getElementById('student-profile-class');
    const admEl = document.getElementById('student-profile-adm');
    const avatarEl = document.getElementById('student-profile-avatar');

    if (nameEl) nameEl.textContent = student.name;
    if (classEl) classEl.textContent = `Class ${student.class} - Division ${student.div}`;
    if (admEl) admEl.textContent = `Admission No: ${student.admission_no}`;
    if (avatarEl) avatarEl.src = student.photo_url || '/avatars/student1.svg';

    // Populate the Student Portal ID Card
    document.getElementById('portal-idcard-name').textContent = student.name;
    document.getElementById('portal-idcard-class').textContent = `Class ${student.class} - ${student.div}`;
    document.getElementById('portal-idcard-adm').textContent = student.admission_no;
    document.getElementById('portal-idcard-user').textContent = student.username;
    document.getElementById('portal-idcard-photo').src = student.photo_url || '/avatars/student1.svg';
    document.getElementById('portal-idcard-barcode').textContent = `*${student.admission_no}*`;

    // Render Subject Teachers List
    const teachersListEl = document.getElementById('student-teachers-list');
    if (teachersListEl) {
      if (teachers.length === 0) {
        teachersListEl.innerHTML = '<p class="text-muted">No teachers assigned to your class yet.</p>';
      } else {
        teachersListEl.innerHTML = teachers.map(t => `
          <div class="stat-card" style="padding: 16px; margin: 0;">
            <div>
              <span class="badge badge-subject">${t.subject}</span>
              <h4 style="font-size: 1.1rem; margin-top: 8px;">${t.name}</h4>
              <span style="font-size: 0.78rem; color: var(--text-muted);">Faculty - Class ${t.class}</span>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Classmates List
    const classmatesListEl = document.getElementById('student-classmates-list');
    if (classmatesListEl) {
      if (classmates.length === 0) {
        classmatesListEl.innerHTML = '<p class="text-muted">No other classmates registered in this division.</p>';
      } else {
        classmatesListEl.innerHTML = classmates.map(c => `
          <div style="display:flex; align-items:center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-color);">
            <img src="${c.photo_url || '/avatars/student1.svg'}" class="entity-avatar" style="width:34px; height:34px;" alt="${c.name}">
            <div style="font-size:0.88rem; font-weight:600;">${c.name}</div>
          </div>
        `).join('');
      }
    }
  }
};

window.StudentPortal = StudentPortal;
