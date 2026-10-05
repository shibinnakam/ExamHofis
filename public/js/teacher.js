// ExamHofis Teacher Portal Module
const TeacherPortal = {
  data: null,

  async init() {
    try {
      this.data = await API.getTeacherClassData();
      this.render();
    } catch (err) {
      console.error('Failed to load teacher portal data:', err);
      App.showToast('Failed to load your class roster: ' + err.message, 'error');
    }
  },

  render() {
    if (!this.data) return;

    const teacher = this.data.teacher;
    const students = this.data.students;
    const colleagues = this.data.colleagues;

    // Set Welcome Header
    const nameEl = document.getElementById('teacher-profile-name');
    const classEl = document.getElementById('teacher-assigned-class');
    const subjectEl = document.getElementById('teacher-assigned-subject');
    const countEl = document.getElementById('teacher-student-count');

    if (nameEl) nameEl.textContent = teacher.name;
    if (classEl) classEl.textContent = `Class ${teacher.class}`;
    if (subjectEl) subjectEl.textContent = teacher.subject;
    if (countEl) countEl.textContent = `${students.length} Students Enrolled`;

    // Render Class Student Roster
    const rosterBody = document.getElementById('teacher-roster-body');
    if (rosterBody) {
      if (students.length === 0) {
        rosterBody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:24px;">No students currently enrolled in Class ${teacher.class}.</td></tr>`;
      } else {
        rosterBody.innerHTML = students.map((s, idx) => `
          <tr>
            <td>${idx + 1}</td>
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
            <td><span class="badge badge-div">Division ${s.div}</span></td>
          </tr>
        `).join('');
      }
    }

    // Render Colleagues
    const colleaguesEl = document.getElementById('teacher-colleagues-list');
    if (colleaguesEl) {
      if (colleagues.length === 0) {
        colleaguesEl.innerHTML = '<p class="text-muted">No other teachers registered for this class.</p>';
      } else {
        colleaguesEl.innerHTML = colleagues.map(c => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
            <div>
              <div style="font-weight:700;">${c.name}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">Class ${c.class}</div>
            </div>
            <span class="badge badge-subject">${c.subject}</span>
          </div>
        `).join('');
      }
    }
  }
};
