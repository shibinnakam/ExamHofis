// =====================================================================
// Holy Family International School - MCQ Examinations & Scheduling Hub
// Modules: TeacherExams, AdminExams, StudentExams
// =====================================================================

// Helper to format ISO datetime to local string
function formatDateTime(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatTimeRemaining(ms) {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Helper to convert ISO string or Date to HTML datetime-local format
function toLocalDatetimeInputValue(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date(Date.now() + 2 * 60000);
  if (isNaN(d.getTime())) return '';
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Helper to extract and normalize up to 4 schedules from exam object
function getNormalizedSchedules(exam) {
  if (!exam) return [];
  if (Array.isArray(exam.schedules) && exam.schedules.length > 0) {
    return exam.schedules.slice(0, 4);
  }
  if (typeof exam.schedules === 'string') {
    try {
      const parsed = JSON.parse(exam.schedules);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4);
    } catch (e) {}
  }
  if (exam.scheduled_start) {
    return [{
      id: 'sched_1',
      label: 'Slot 1',
      start: exam.scheduled_start,
      end: exam.scheduled_end,
      duration_minutes: exam.duration_minutes || 45
    }];
  }
  return [];
}

// =====================================================================
// 1. TEACHER MCQ EXAMS MANAGER
// =====================================================================
const TeacherExams = {
  exams: [],
  currentQuestions: [],

  async init() {
    this.setupListeners();
    await this.loadExams();
  },

  setupListeners() {
    const searchInput = document.getElementById('teacher-exam-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.filterAndRender());
    }
  },

  async loadExams() {
    try {
      this.exams = await API.getExams();
      this.filterAndRender();
    } catch (err) {
      console.error('Failed to load teacher exams:', err);
      App.showToast('Could not load exams: ' + err.message, 'error');
    }
  },

  filterAndRender() {
    const search = (document.getElementById('teacher-exam-search')?.value || '').toLowerCase().trim();
    let filtered = [...this.exams];

    if (search) {
      filtered = filtered.filter(e => 
        (e.title && e.title.toLowerCase().includes(search)) ||
        (e.subject && e.subject.toLowerCase().includes(search))
      );
    }

    const badge = document.getElementById('teacher-exams-count-badge');
    if (badge) badge.textContent = `${filtered.length} Exam${filtered.length === 1 ? '' : 's'} Created`;

    const container = document.getElementById('teacher-exams-container');
    if (!container) return;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 20px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">📝</div>
          <h4>No Examination Papers Created Yet</h4>
          <p>Click the button below to author your first MCQ examination paper (1 to 150 questions).</p>
          <button class="btn btn-primary" style="margin-top: 16px;" onclick="TeacherExams.openCreateExamModal()">
            + Create New MCQ Exam
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(e => {
      const schedules = getNormalizedSchedules(e);
      const isDraft = e.status === 'draft' || schedules.length === 0;
      const isScheduled = e.status === 'scheduled' && schedules.length > 0;
      const now = Date.now();

      const activeSlot = schedules.find(s => {
        const sTime = new Date(s.start).getTime();
        const eTime = new Date(s.end).getTime();
        return now >= sTime && now <= eTime;
      });
      const isLive = isScheduled && !!activeSlot;

      let statusBadge = `<span class="exam-status-badge exam-status-draft">Draft (Unscheduled)</span>`;
      if (isLive) {
        statusBadge = `<span class="exam-status-badge exam-status-live">🟢 Live Now</span>`;
      } else if (isScheduled) {
        statusBadge = `<span class="exam-status-badge exam-status-scheduled">Scheduled (${schedules.length}/4 Slots)</span>`;
      }

      const qCount = e.total_questions || (e.questions ? e.questions.length : 0);
      const marksCount = e.total_marks || qCount;

      return `
        <div class="exam-item-card">
          <div>
            <div class="exam-card-header">
              <h3 class="exam-card-title">${e.title}</h3>
              ${statusBadge}
            </div>

            <div class="exam-card-meta">
              <span class="badge badge-class">Class ${e.class}</span>
              <span class="badge badge-div">Div ${e.division || 'All'}</span>
              <span class="badge badge-subject">${e.subject}</span>
            </div>

            <div class="exam-card-details">
              <div class="detail-item">
                <span class="detail-label">Questions:</span>
                <span class="detail-value">${qCount} MCQs (${marksCount} Marks)</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Duration:</span>
                <span class="detail-value">${e.duration_minutes || 30} Minutes</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Schedules:</span>
                <span class="detail-value" style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">
                  ${schedules.length > 0 ? `${schedules.length} / 4 Configured` : 'Awaiting Admin'}
                </span>
              </div>
              ${schedules.length > 0 ? `
                <div style="background: rgba(0,0,0,0.03); border-radius: var(--radius-sm); padding: 6px 8px; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
                  ${schedules.map((s, idx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.74rem;">
                      <strong>${s.label || `Slot ${idx+1}`}:</strong>
                      <span>${formatDateTime(s.start)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <div class="exam-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="TeacherExams.viewSubmissions('${e.id}')">
              📊 Submissions
            </button>
            <button class="btn btn-danger btn-sm" onclick="TeacherExams.deleteExam('${e.id}')" title="Delete Exam">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  openCreateExamModal() {
    // Reset inputs
    const titleInput = document.getElementById('exam-title-input');
    const classSelect = document.getElementById('exam-class-input');
    const divSelect = document.getElementById('exam-div-input');
    const subjectSelect = document.getElementById('exam-subject-input');
    const durationInput = document.getElementById('exam-duration-input');

    if (titleInput) titleInput.value = '';
    if (durationInput) durationInput.value = '30';
    if (divSelect) divSelect.value = 'All';

    // Prefill with teacher's assigned class & subject if available
    if (TeacherPortal.data && TeacherPortal.data.teacher) {
      const t = TeacherPortal.data.teacher;
      if (classSelect && t.class) classSelect.value = String(t.class);
      if (subjectSelect && t.subject) {
        // match case
        for (let i = 0; i < subjectSelect.options.length; i++) {
          if (subjectSelect.options[i].value.toLowerCase() === t.subject.toLowerCase()) {
            subjectSelect.selectedIndex = i;
            break;
          }
        }
      }
    }

    // Default to 1 empty question
    this.currentQuestions = [{
      id: 'q_1',
      question: '',
      options: ['', '', '', ''],
      correct_indices: [0],
      correct_index: 0,
      marks: 1
    }];

    this.renderQuestionsBuilder();
    App.openModal('exam-create-modal');
  },

  addQuestion() {
    if (this.currentQuestions.length >= 150) {
      App.showToast('Maximum limit of 150 questions per exam paper reached', 'error');
      return;
    }

    const nextId = `q_${this.currentQuestions.length + 1}`;
    this.currentQuestions.push({
      id: nextId,
      question: '',
      options: ['', '', '', ''],
      correct_indices: [0],
      correct_index: 0,
      marks: 1
    });

    this.renderQuestionsBuilder();

    // Scroll to new question card
    setTimeout(() => {
      const listEl = document.getElementById('exam-questions-builder-list');
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    }, 50);
  },

  removeQuestion(idx) {
    if (this.currentQuestions.length <= 1) {
      App.showToast('Exam must contain at least 1 question', 'error');
      return;
    }
    this.currentQuestions.splice(idx, 1);
    this.renderQuestionsBuilder();
  },

  loadSampleQuestions() {
    const subject = document.getElementById('exam-subject-input')?.value || 'Physics';
    const cls = document.getElementById('exam-class-input')?.value || '10';

    this.currentQuestions = [
      {
        id: 'q_1',
        question: `What is the SI unit of electric current in standard physics?`,
        options: ['Volt', 'Ampere', 'Ohm', 'Coulomb'],
        correct_indices: [1],
        correct_index: 1,
        marks: 1
      },
      {
        id: 'q_2',
        question: `Which of the following are primary states of matter? (Multiple correct options)`,
        options: ['Solid', 'Liquid', 'Energy', 'Gas'],
        correct_indices: [0, 1, 3],
        correct_index: 0,
        marks: 2
      },
      {
        id: 'q_3',
        question: `What phenomenon is responsible for the twinkling of stars observed from the Earth's surface?`,
        options: ['Atmospheric Refraction', 'Total Internal Reflection', 'Light Dispersion', 'Light Diffraction'],
        correct_indices: [0],
        correct_index: 0,
        marks: 1
      }
    ];

    const titleInput = document.getElementById('exam-title-input');
    if (titleInput && !titleInput.value) {
      titleInput.value = `Class ${cls} ${subject} Foundation MCQ Exam`;
    }

    this.renderQuestionsBuilder();
    App.showToast('Loaded 3 sample questions (including multi-choice) for quick testing!', 'success');
  },

  renderQuestionsBuilder() {
    const countEl = document.getElementById('exam-builder-count');
    if (countEl) countEl.textContent = `${this.currentQuestions.length} Questions / 150 Max`;

    const listEl = document.getElementById('exam-questions-builder-list');
    if (!listEl) return;

    listEl.innerHTML = this.currentQuestions.map((q, qIdx) => {
      const letters = ['A', 'B', 'C', 'D'];
      const correctList = Array.isArray(q.correct_indices)
        ? q.correct_indices
        : (q.correct_index !== undefined ? [q.correct_index] : [0]);
      const isMulti = correctList.length > 1;

      return `
        <div class="question-builder-card" id="q-card-${qIdx}">
          <div class="question-builder-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="question-num-pill">Question #${qIdx + 1}</span>
              <span class="badge ${isMulti ? 'badge-subject' : 'badge-adm'}" style="font-size: 0.72rem;">
                ${isMulti ? `Multiple Correct (${correctList.map(i => letters[i]).join(', ')})` : `Single Choice (${letters[correctList[0]] || 'A'})`}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display:flex; align-items:center; gap:4px;">
                Marks:
                <input type="number" min="1" max="10" value="${q.marks || 1}" 
                  style="width: 50px; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-main);"
                  onchange="TeacherExams.updateQuestionMarks(${qIdx}, this.value)">
              </label>
              ${this.currentQuestions.length > 1 ? `
                <button type="button" class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="TeacherExams.removeQuestion(${qIdx})" title="Remove Question">
                  ✕ Remove
                </button>
              ` : ''}
            </div>
          </div>

          <div class="question-input-wrap">
            <textarea class="form-input" rows="2" placeholder="Enter question statement..." required
              style="resize: vertical; min-height: 54px;"
              oninput="TeacherExams.updateQuestionText(${qIdx}, this.value)">${q.question || ''}</textarea>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">
              Options & Correct Answers: (Check one or more boxes to designate correct options)
            </span>
            <span style="font-size: 0.72rem; color: var(--primary); font-weight: 600;">
              💡 Select multiple checkboxes if this question has multiple answers
            </span>
          </div>

          <div class="options-builder-grid">
            ${letters.map((letter, optIdx) => {
              const isCorrect = correctList.includes(optIdx);
              return `
              <div class="option-builder-item ${isCorrect ? 'correct-selected' : ''}">
                <span class="option-letter-tag">${letter}</span>
                <input type="text" class="form-input" placeholder="Option ${letter} text..." required
                  value="${(q.options && q.options[optIdx]) || ''}"
                  style="flex: 1; padding: 6px 10px;"
                  oninput="TeacherExams.updateOptionText(${qIdx}, ${optIdx}, this.value)">
                <label class="option-check-label" title="Toggle Option ${letter} as a correct answer">
                  <input type="checkbox" name="correct_opt_${qIdx}_${optIdx}" value="${optIdx}" 
                    ${isCorrect ? 'checked' : ''}
                    onchange="TeacherExams.toggleCorrectOption(${qIdx}, ${optIdx})">
                  <span class="option-correct-text">${isCorrect ? '✓ Correct' : 'Correct'}</span>
                </label>
              </div>
            `}).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  updateQuestionText(qIdx, val) {
    if (this.currentQuestions[qIdx]) {
      this.currentQuestions[qIdx].question = val;
    }
  },

  updateQuestionMarks(qIdx, val) {
    if (this.currentQuestions[qIdx]) {
      this.currentQuestions[qIdx].marks = parseInt(val, 10) || 1;
    }
  },

  updateOptionText(qIdx, optIdx, val) {
    if (this.currentQuestions[qIdx]) {
      if (!this.currentQuestions[qIdx].options) this.currentQuestions[qIdx].options = ['', '', '', ''];
      this.currentQuestions[qIdx].options[optIdx] = val;
    }
  },

  toggleCorrectOption(qIdx, optIdx) {
    const q = this.currentQuestions[qIdx];
    if (!q) return;

    if (!Array.isArray(q.correct_indices)) {
      q.correct_indices = q.correct_index !== undefined ? [q.correct_index] : [0];
    }

    const pos = q.correct_indices.indexOf(optIdx);
    if (pos >= 0) {
      if (q.correct_indices.length > 1) {
        q.correct_indices.splice(pos, 1);
      } else {
        App.showToast('At least one option must remain marked as correct', 'warning');
      }
    } else {
      q.correct_indices.push(optIdx);
      q.correct_indices.sort((a, b) => a - b);
    }

    q.correct_index = q.correct_indices[0];
    this.renderQuestionsBuilder();
  },

  setCorrectOption(qIdx, optIdx) {
    this.toggleCorrectOption(qIdx, optIdx);
  },

  async handleSaveExam(e) {
    e.preventDefault();

    const title = document.getElementById('exam-title-input')?.value.trim();
    const subject = document.getElementById('exam-subject-input')?.value;
    const examClass = parseInt(document.getElementById('exam-class-input')?.value, 10);
    const division = document.getElementById('exam-div-input')?.value;
    const duration_minutes = parseInt(document.getElementById('exam-duration-input')?.value, 10) || 30;

    if (!title) {
      App.showToast('Please enter an exam title', 'error');
      return;
    }

    if (this.currentQuestions.length < 1) {
      App.showToast('Exam paper must contain at least 1 question', 'error');
      return;
    }

    if (this.currentQuestions.length > 150) {
      App.showToast('Exam paper can contain at most 150 questions', 'error');
      return;
    }

    // Validate each question
    for (let i = 0; i < this.currentQuestions.length; i++) {
      const q = this.currentQuestions[i];
      if (!q.question || !q.question.trim()) {
        App.showToast(`Question #${i + 1} text is empty`, 'error');
        document.getElementById(`q-card-${i}`)?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      for (let j = 0; j < 4; j++) {
        if (!q.options[j] || !q.options[j].trim()) {
          App.showToast(`Question #${i + 1} Option ${['A', 'B', 'C', 'D'][j]} is empty`, 'error');
          document.getElementById(`q-card-${i}`)?.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      }
      const corrects = Array.isArray(q.correct_indices) ? q.correct_indices : [q.correct_index];
      if (!corrects || corrects.length === 0) {
        App.showToast(`Question #${i + 1} must designate at least one correct answer`, 'error');
        return;
      }
      q.correct_indices = corrects;
      q.correct_index = corrects[0];
    }

    const payload = {
      title,
      subject,
      class: examClass,
      division,
      duration_minutes,
      questions: this.currentQuestions
    };

    const submitBtn = document.getElementById('btn-save-exam-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving Exam...';
    }

    try {
      await API.createExam(payload);
      App.showToast('MCQ Exam saved as Draft! Admin can now schedule its date & time.', 'success');
      App.closeModal('exam-create-modal');
      await this.loadExams();
    } catch (err) {
      App.showToast('Failed to save exam: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          Save Exam Paper (Draft)
        `;
      }
    }
  },

  async viewSubmissions(examId) {
    try {
      const exam = this.exams.find(e => String(e.id) === String(examId));
      const submissions = await API.getExamSubmissions(examId);

      const titleEl = document.getElementById('submissions-modal-title');
      const subtitleEl = document.getElementById('submissions-modal-subtitle');
      const bodyEl = document.getElementById('submissions-modal-table-body');

      if (titleEl && exam) titleEl.textContent = `${exam.title} - Results`;
      if (subtitleEl && exam) {
        subtitleEl.textContent = `Target: Class ${exam.class} (Div ${exam.division}) • Total Submissions: ${submissions.length}`;
      }

      if (bodyEl) {
        if (submissions.length === 0) {
          bodyEl.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 28px;">No students have submitted this exam yet.</td></tr>`;
        } else {
          bodyEl.innerHTML = submissions.map((s, idx) => `
            <tr>
              <td><strong>#${idx + 1}</strong></td>
              <td>${s.student_name}</td>
              <td><span class="badge badge-adm">${s.admission_no}</span></td>
              <td>Class ${s.class} - ${s.div}</td>
              <td><strong style="color:var(--primary); font-size:1.05rem;">${s.score}</strong> / ${s.total_marks}</td>
              <td><span class="badge ${s.percentage >= 60 ? 'badge-subject' : 'badge-adm'}">${s.percentage}%</span></td>
              <td style="font-size:0.78rem; color:var(--text-muted);">${formatDateTime(s.submitted_at)}</td>
            </tr>
          `).join('');
        }
      }

      App.openModal('exam-submissions-modal');
    } catch (err) {
      App.showToast('Failed to load submissions: ' + err.message, 'error');
    }
  },

  async deleteExam(examId) {
    if (!confirm('Are you sure you want to delete this exam and its student submissions?')) return;
    try {
      await API.deleteExam(examId);
      App.showToast('Exam deleted successfully', 'success');
      await this.loadExams();
    } catch (err) {
      App.showToast('Failed to delete exam: ' + err.message, 'error');
    }
  }
};

// =====================================================================
// 2. ADMIN EXAMS & SCHEDULING CONTROLLER
// =====================================================================
const AdminExams = {
  exams: [],

  async init() {
    this.setupListeners();
    await this.loadExams();
  },

  setupListeners() {
    document.getElementById('admin-exam-search')?.addEventListener('input', () => this.filterAndRender());
    document.getElementById('admin-exam-filter-class')?.addEventListener('change', () => this.loadExams());
    document.getElementById('admin-exam-filter-status')?.addEventListener('change', () => this.loadExams());
  },

  async loadExams() {
    const classFilter = document.getElementById('admin-exam-filter-class')?.value || 'all';
    const statusFilter = document.getElementById('admin-exam-filter-status')?.value || 'all';

    try {
      this.exams = await API.getExams({ class: classFilter, status: statusFilter });
      this.filterAndRender();
    } catch (err) {
      console.error('Failed to load admin exams:', err);
      App.showToast('Could not load exams: ' + err.message, 'error');
    }
  },

  currentModalSchedules: [],

  filterAndRender() {
    const search = (document.getElementById('admin-exam-search')?.value || '').toLowerCase().trim();
    let filtered = [...this.exams];

    if (search) {
      filtered = filtered.filter(e => 
        (e.title && e.title.toLowerCase().includes(search)) ||
        (e.subject && e.subject.toLowerCase().includes(search))
      );
    }

    const badge = document.getElementById('admin-exams-count-badge');
    if (badge) badge.textContent = `${filtered.length} Exams`;

    const container = document.getElementById('admin-exams-container');
    if (!container) return;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 20px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">📅</div>
          <h4>No Examinations Found</h4>
          <p>Exams created by teachers will appear here ready to be scheduled with a date & time.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(e => {
      const schedules = getNormalizedSchedules(e);
      const isDraft = e.status === 'draft' || schedules.length === 0;
      const isScheduled = e.status === 'scheduled' && schedules.length > 0;
      const now = Date.now();

      const activeSlot = schedules.find(s => {
        const sTime = new Date(s.start).getTime();
        const eTime = new Date(s.end).getTime();
        return now >= sTime && now <= eTime;
      });
      const isLive = isScheduled && !!activeSlot;

      let statusBadge = `<span class="exam-status-badge exam-status-draft">Draft</span>`;
      if (isLive) {
        statusBadge = `<span class="exam-status-badge exam-status-live">🟢 Live Now</span>`;
      } else if (isScheduled) {
        statusBadge = `<span class="exam-status-badge exam-status-scheduled">Scheduled (${schedules.length}/4)</span>`;
      }

      const qCount = e.total_questions || (e.questions ? e.questions.length : 0);

      return `
        <div class="exam-item-card">
          <div>
            <div class="exam-card-header">
              <h3 class="exam-card-title">${e.title}</h3>
              ${statusBadge}
            </div>

            <div class="exam-card-meta">
              <span class="badge badge-class">Class ${e.class}</span>
              <span class="badge badge-div">Div ${e.division || 'All'}</span>
              <span class="badge badge-subject">${e.subject}</span>
            </div>

            <div class="exam-card-details">
              <div class="detail-item">
                <span class="detail-label">Questions:</span>
                <span class="detail-value">${qCount} Questions (${e.total_marks || qCount} Marks)</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Faculty Author:</span>
                <span class="detail-value">${e.created_by || 'Teacher'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Schedules Configured:</span>
                <span class="detail-value" style="font-weight:700; color:var(--primary);">${schedules.length} / 4 Slots Max</span>
              </div>
              ${schedules.length > 0 ? `
                <div style="background: rgba(0,0,0,0.03); border-radius: var(--radius-sm); padding: 8px; margin-top: 4px; display: flex; flex-direction: column; gap: 5px;">
                  ${schedules.map((s, idx) => {
                    const sStart = new Date(s.start).getTime();
                    const sEnd = new Date(s.end).getTime();
                    const slotLive = now >= sStart && now <= sEnd;
                    const slotPast = now > sEnd;
                    const pillColor = slotLive ? '#10b981' : (slotPast ? 'var(--text-muted)' : '#0891b2');
                    const pillText = slotLive ? '🟢 Live' : (slotPast ? '⏳ Ended' : '⏰ Upcoming');
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; border-bottom:1px solid rgba(0,0,0,0.04); padding-bottom:3px;">
                        <div>
                          <strong style="color:var(--text-main);">${s.label || `Slot ${idx+1}`}:</strong>
                          <span style="font-size:0.73rem; color:var(--text-muted); margin-left:3px;">${formatDateTime(s.start)}</span>
                        </div>
                        <span style="color:${pillColor}; font-weight:700; font-size:0.7rem;">${pillText}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : `
                <div class="detail-item">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value" style="color:var(--text-muted);">Awaiting admin schedule (0/4)</span>
                </div>
              `}
            </div>
          </div>

          <div class="exam-card-actions">
            <button class="btn btn-primary btn-sm" onclick="AdminExams.openScheduleModal('${e.id}')">
              📅 ${isScheduled ? `Manage Schedules (${schedules.length}/4)` : 'Schedule Exam (Max 4)'}
            </button>
            <button class="btn btn-secondary btn-sm" onclick="AdminExams.viewSubmissions('${e.id}')">
              📊 Submissions
            </button>
            <button class="btn btn-danger btn-sm" onclick="AdminExams.deleteExam('${e.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  openScheduleModal(examId) {
    const exam = this.exams.find(e => String(e.id) === String(examId));
    if (!exam) return;

    document.getElementById('schedule-exam-id').value = exam.id;
    document.getElementById('schedule-modal-exam-title').textContent = exam.title;
    document.getElementById('schedule-modal-class').textContent = `Class ${exam.class}`;
    document.getElementById('schedule-modal-div').textContent = `Division ${exam.division || 'All'}`;
    document.getElementById('schedule-modal-subject').textContent = exam.subject;

    const existingSchedules = getNormalizedSchedules(exam);
    if (existingSchedules.length > 0) {
      this.currentModalSchedules = existingSchedules.slice(0, 4).map((s, idx) => ({
        id: s.id || `sched_${idx + 1}`,
        label: s.label || `Slot ${idx + 1}`,
        startLocal: toLocalDatetimeInputValue(s.start),
        duration_minutes: s.duration_minutes || exam.duration_minutes || 45
      }));
    } else {
      const defaultStart = new Date(Date.now() + 5 * 60000);
      this.currentModalSchedules = [
        {
          id: 'sched_1',
          label: 'Slot 1 (Morning Batch)',
          startLocal: toLocalDatetimeInputValue(defaultStart),
          duration_minutes: exam.duration_minutes || 45
        }
      ];
    }

    this.renderModalSlots();
    App.openModal('exam-schedule-modal');
  },

  renderModalSlots() {
    const container = document.getElementById('schedule-slots-container');
    const countEl = document.getElementById('schedule-slot-count');
    const remainingEl = document.getElementById('schedule-slots-remaining');
    const addBtn = document.getElementById('btn-add-schedule-slot');

    const count = this.currentModalSchedules.length;
    if (countEl) countEl.textContent = count;
    if (remainingEl) remainingEl.textContent = Math.max(0, 4 - count);

    if (addBtn) {
      if (count >= 4) {
        addBtn.disabled = true;
        addBtn.style.opacity = '0.6';
        addBtn.style.cursor = 'not-allowed';
        addBtn.innerHTML = '<span>🔒 Max 4 Schedules Reached</span>';
      } else {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
        addBtn.style.cursor = 'pointer';
        addBtn.innerHTML = `<span>➕ Add Schedule Slot (${4 - count} left)</span>`;
      }
    }

    if (!container) return;

    const now = Date.now();

    container.innerHTML = this.currentModalSchedules.map((slot, idx) => {
      const dur = parseInt(slot.duration_minutes, 10) || 45;
      let calculatedEnd = '--';
      let statusPill = '';

      if (slot.startLocal) {
        const sDate = new Date(slot.startLocal);
        if (!isNaN(sDate.getTime())) {
          const eDate = new Date(sDate.getTime() + dur * 60000);
          calculatedEnd = formatDateTime(eDate.toISOString());

          if (now >= sDate.getTime() && now <= eDate.getTime()) {
            statusPill = '<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700;">🟢 Live Now</span>';
          } else if (now < sDate.getTime()) {
            statusPill = '<span class="badge" style="background:rgba(6,182,212,0.15); color:#0891b2; font-weight:700;">⏰ Upcoming</span>';
          } else {
            statusPill = '<span class="badge" style="background:rgba(239,68,68,0.12); color:#ef4444; font-weight:700;">⏳ Past</span>';
          }
        }
      }

      return `
        <div class="schedule-slot-card" data-slot-idx="${idx}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: var(--primary); color: white; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800;">
                ${idx + 1}
              </span>
              <input type="text" class="form-input slot-input-label" value="${slot.label || `Slot ${idx + 1}`}" placeholder="Slot Name (e.g. Slot ${idx + 1} / Morning Batch)" style="font-size: 0.88rem; font-weight: 700; padding: 4px 10px; width: 230px; height: 32px;" required oninput="AdminExams.syncSlotData(${idx})">
            </div>
            <div>
              ${count > 1 ? `
                <button type="button" class="btn btn-sm" onclick="AdminExams.removeScheduleSlot(${idx})" title="Remove this schedule slot" style="padding: 4px 10px; font-size: 0.78rem; color: var(--danger); background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2);">
                  🗑️ Remove
                </button>
              ` : `
                <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: 600;">(At least 1 slot required)</span>
              `}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 140px; gap: 12px;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.8rem; margin-bottom: 4px;">Start Date & Time <span class="req">*</span></label>
              <input type="datetime-local" class="form-input slot-input-start" value="${slot.startLocal || ''}" required onchange="AdminExams.syncSlotData(${idx})">
            </div>
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.8rem; margin-bottom: 4px;">Duration (Mins) <span class="req">*</span></label>
              <input type="number" class="form-input slot-input-duration" min="5" max="360" value="${slot.duration_minutes || 45}" required oninput="AdminExams.syncSlotData(${idx})">
            </div>
          </div>

          <div style="margin-top: 10px; font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 6px;">
            <span>Calculated End: <strong class="slot-end-preview" style="color: var(--text-main);">${calculatedEnd}</strong></span>
            <div>${statusPill}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  syncSlotData(idx) {
    const card = document.querySelector(`.schedule-slot-card[data-slot-idx="${idx}"]`);
    if (!card) return;

    const labelInput = card.querySelector('.slot-input-label');
    const startInput = card.querySelector('.slot-input-start');
    const durInput = card.querySelector('.slot-input-duration');
    const endPreview = card.querySelector('.slot-end-preview');

    if (this.currentModalSchedules[idx]) {
      this.currentModalSchedules[idx].label = labelInput ? labelInput.value.trim() : `Slot ${idx + 1}`;
      this.currentModalSchedules[idx].startLocal = startInput ? startInput.value : '';
      const dur = durInput ? parseInt(durInput.value, 10) || 45 : 45;
      this.currentModalSchedules[idx].duration_minutes = dur;

      if (startInput && startInput.value && endPreview) {
        const sDate = new Date(startInput.value);
        if (!isNaN(sDate.getTime())) {
          const eDate = new Date(sDate.getTime() + dur * 60000);
          endPreview.textContent = formatDateTime(eDate.toISOString());
        } else {
          endPreview.textContent = '--';
        }
      }
    }
  },

  addScheduleSlot() {
    if (this.currentModalSchedules.length >= 4) {
      App.showToast('Maximum 4 schedules allowed per examination', 'warning');
      return;
    }

    const prevSlot = this.currentModalSchedules[this.currentModalSchedules.length - 1];
    let nextStart = new Date(Date.now() + 60 * 60000); // 1 hr from now
    if (prevSlot && prevSlot.startLocal) {
      const prevDate = new Date(prevSlot.startLocal);
      if (!isNaN(prevDate.getTime())) {
        nextStart = new Date(prevDate.getTime() + (prevSlot.duration_minutes || 45) * 60000 + 30 * 60000);
      }
    }

    const newIdx = this.currentModalSchedules.length + 1;
    this.currentModalSchedules.push({
      id: `sched_${newIdx}_${Date.now()}`,
      label: `Slot ${newIdx}`,
      startLocal: toLocalDatetimeInputValue(nextStart),
      duration_minutes: prevSlot ? prevSlot.duration_minutes : 45
    });

    this.renderModalSlots();
    App.showToast(`Schedule Slot ${newIdx} added (${4 - this.currentModalSchedules.length} slots remaining)`, 'info');
  },

  removeScheduleSlot(idx) {
    if (this.currentModalSchedules.length <= 1) {
      App.showToast('An examination must have at least 1 schedule slot', 'warning');
      return;
    }

    this.currentModalSchedules.splice(idx, 1);
    this.renderModalSlots();
    App.showToast('Schedule slot removed', 'info');
  },

  async handleScheduleSubmit(e) {
    e.preventDefault();

    const examId = document.getElementById('schedule-exam-id')?.value;
    if (!examId) return;

    if (!Array.isArray(this.currentModalSchedules) || this.currentModalSchedules.length === 0) {
      App.showToast('At least 1 schedule slot is required', 'error');
      return;
    }

    if (this.currentModalSchedules.length > 4) {
      App.showToast('Maximum 4 schedules allowed per examination', 'error');
      return;
    }

    // Sync latest inputs from DOM
    this.currentModalSchedules.forEach((_, idx) => this.syncSlotData(idx));

    // Validate slots
    const schedulesPayload = [];
    for (let i = 0; i < this.currentModalSchedules.length; i++) {
      const slot = this.currentModalSchedules[i];
      if (!slot.startLocal) {
        App.showToast(`Please select start date & time for ${slot.label || `Slot ${i + 1}`}`, 'error');
        return;
      }
      const sDate = new Date(slot.startLocal);
      if (isNaN(sDate.getTime())) {
        App.showToast(`Invalid start date & time for ${slot.label || `Slot ${i + 1}`}`, 'error');
        return;
      }
      const dur = parseInt(slot.duration_minutes, 10) || 45;
      if (dur < 5) {
        App.showToast(`Duration must be at least 5 minutes for ${slot.label || `Slot ${i + 1}`}`, 'error');
        return;
      }
      const eDate = new Date(sDate.getTime() + dur * 60000);

      schedulesPayload.push({
        id: slot.id || `sched_${i + 1}`,
        label: slot.label || `Slot ${i + 1}`,
        start: sDate.toISOString(),
        end: eDate.toISOString(),
        duration_minutes: dur
      });
    }

    const submitBtn = document.getElementById('btn-schedule-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publishing Schedules...';
    }

    try {
      await API.scheduleExam(examId, { schedules: schedulesPayload });

      App.showToast(`Exam successfully scheduled with ${schedulesPayload.length} slot(s)!`, 'success');
      App.closeModal('exam-schedule-modal');
      await this.loadExams();
    } catch (err) {
      App.showToast('Failed to schedule exam: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Publish & Save Schedules
        `;
      }
    }
  },

  async viewSubmissions(examId) {
    try {
      const exam = this.exams.find(e => String(e.id) === String(examId));
      const submissions = await API.getExamSubmissions(examId);

      const titleEl = document.getElementById('submissions-modal-title');
      const subtitleEl = document.getElementById('submissions-modal-subtitle');
      const bodyEl = document.getElementById('submissions-modal-table-body');

      if (titleEl && exam) titleEl.textContent = `${exam.title} - Score Report`;
      if (subtitleEl && exam) {
        subtitleEl.textContent = `Class ${exam.class} (Div ${exam.division}) • Total Submissions: ${submissions.length}`;
      }

      if (bodyEl) {
        if (submissions.length === 0) {
          bodyEl.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 28px;">No submissions received yet.</td></tr>`;
        } else {
          bodyEl.innerHTML = submissions.map((s, idx) => `
            <tr>
              <td><strong>#${idx + 1}</strong></td>
              <td>${s.student_name}</td>
              <td><span class="badge badge-adm">${s.admission_no}</span></td>
              <td>Class ${s.class} - ${s.div}</td>
              <td><strong style="color:var(--primary); font-size:1.05rem;">${s.score}</strong> / ${s.total_marks}</td>
              <td><span class="badge ${s.percentage >= 60 ? 'badge-subject' : 'badge-adm'}">${s.percentage}%</span></td>
              <td style="font-size:0.78rem; color:var(--text-muted);">${formatDateTime(s.submitted_at)}</td>
            </tr>
          `).join('');
        }
      }

      App.openModal('exam-submissions-modal');
    } catch (err) {
      App.showToast('Failed to load submissions: ' + err.message, 'error');
    }
  },

  async deleteExam(examId) {
    if (!confirm('Are you sure you want to delete this exam?')) return;
    try {
      await API.deleteExam(examId);
      App.showToast('Exam deleted', 'success');
      await this.loadExams();
    } catch (err) {
      App.showToast('Failed to delete exam: ' + err.message, 'error');
    }
  }
};

// =====================================================================
// 3. STUDENT ONLINE EXAMINATIONS CONTROLLER
// =====================================================================
const StudentExams = {
  exams: [],
  activeExam: null,
  currentQuestionIdx: 0,
  answers: {},
  timerInterval: null,
  timeRemainingSecs: 0,
  liveTicker: null,

  async init() {
    await this.loadExams();

    // Start background ticker to refresh countdown timers on list view every 5 seconds
    if (this.liveTicker) clearInterval(this.liveTicker);
    this.liveTicker = setInterval(() => {
      if (App.activeTab === 'student-exams') {
        this.renderExamsList();
      }
    }, 5000);
  },

  async loadExams() {
    try {
      this.exams = await API.getExams();
      this.renderExamsList();
    } catch (err) {
      console.error('Failed to load student exams:', err);
      App.showToast('Could not load exams: ' + err.message, 'error');
    }
  },

  renderExamsList() {
    const container = document.getElementById('student-exams-container');
    if (!container) return;

    if (this.exams.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 20px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">🎓</div>
          <h4>No Active Examinations Scheduled</h4>
          <p>When your teachers publish an examination and administration schedules the date & time, it will automatically appear here.</p>
        </div>
      `;
      return;
    }

    const now = Date.now();

    container.innerHTML = this.exams.map(e => {
      const schedules = getNormalizedSchedules(e);
      const isScheduled = e.status === 'scheduled' && schedules.length > 0;
      const isSubmitted = e.submitted;

      // Check which slot (if any) is currently live
      const activeSlot = schedules.find(s => {
        const sTime = new Date(s.start).getTime();
        const eTime = new Date(s.end).getTime();
        return now >= sTime && now <= eTime;
      });

      // Find upcoming slots
      const upcomingSlots = schedules
        .filter(s => now < new Date(s.start).getTime())
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const nextSlot = upcomingSlots[0] || null;
      const allEnded = schedules.length > 0 && !activeSlot && upcomingSlots.length === 0;

      const isLive = isScheduled && !isSubmitted && !!activeSlot;
      const isUpcoming = isScheduled && !isSubmitted && !activeSlot && !!nextSlot;
      const isEnded = isScheduled && !isSubmitted && allEnded;

      let cardBanner = '';
      let statusBadge = '';
      let actionBtn = '';

      if (isSubmitted) {
        statusBadge = `<span class="exam-status-badge exam-status-completed">✅ Completed</span>`;
        actionBtn = `
          <button class="btn btn-secondary btn-sm" onclick="StudentExams.viewScoreCard('${e.id}')">
            📄 View Result & Score Card
          </button>
        `;
      } else if (isLive) {
        statusBadge = `<span class="exam-status-badge exam-status-live">🟢 Exam Portal Open</span>`;
        const activeEndTime = new Date(activeSlot.end).getTime();
        cardBanner = `
          <div style="background: rgba(16, 185, 129, 0.12); color: #10b981; font-weight: 700; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 12px; display:flex; align-items:center; gap:6px;">
            <span>🟢</span> <strong>EXAM PORTAL OPEN NOW! (${activeSlot.label || 'Active Session'})</strong> &bull; Closes in ${formatTimeRemaining(activeEndTime - now)}
          </div>
        `;
        actionBtn = `
          <button class="btn btn-primary" style="background:#10b981; border-color:#10b981; font-weight:800; padding:10px 18px;" onclick="StudentExams.startExam('${e.id}')">
            🚀 Start Examination Now
          </button>
        `;
      } else if (isUpcoming) {
        statusBadge = `<span class="exam-status-badge exam-status-scheduled">⏰ Upcoming (${schedules.length} Slots)</span>`;
        const timeToStart = new Date(nextSlot.start).getTime() - now;
        cardBanner = `
          <div style="background: var(--bg-subtle); color: var(--text-muted); font-size: 0.82rem; padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 12px;">
            ⏳ Next Session (${nextSlot.label || 'Slot'}): Opens in <strong>${formatTimeRemaining(timeToStart)}</strong>
          </div>
        `;
        actionBtn = `
          <button class="btn btn-secondary btn-sm" disabled style="opacity: 0.6; cursor: not-allowed;" title="Portal opens at scheduled start time">
            🔒 Next Session: ${formatDateTime(nextSlot.start)}
          </button>
        `;
      } else if (isEnded) {
        statusBadge = `<span class="exam-status-badge exam-status-ended">⏳ Closed</span>`;
        actionBtn = `
          <span style="font-size: 0.82rem; color: var(--danger); font-weight: 700;">All Schedules Closed (Missed)</span>
        `;
      } else {
        statusBadge = `<span class="exam-status-badge exam-status-draft">Pending Schedule</span>`;
        actionBtn = `
          <span style="font-size: 0.82rem; color: var(--text-muted);">Admin will schedule start time</span>
        `;
      }

      const qCount = e.total_questions || (e.questions ? e.questions.length : 0);

      return `
        <div class="exam-item-card" style="${isLive ? 'border-color: #10b981; box-shadow: 0 0 16px rgba(16, 185, 129, 0.2);' : ''}">
          <div>
            ${cardBanner}
            <div class="exam-card-header">
              <h3 class="exam-card-title">${e.title}</h3>
              ${statusBadge}
            </div>

            <div class="exam-card-meta">
              <span class="badge badge-subject">${e.subject}</span>
              <span class="badge badge-class">Class ${e.class} - ${e.division || 'All'}</span>
              <span class="badge badge-adm">${qCount} MCQs</span>
            </div>

            <div class="exam-card-details">
              <div class="detail-item">
                <span class="detail-label">Duration:</span>
                <span class="detail-value">${e.duration_minutes || 30} Minutes</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Available Sessions:</span>
                <span class="detail-value" style="font-weight:700; color:var(--primary);">${schedules.length} / 4 Slots Configured</span>
              </div>
              ${schedules.length > 0 ? `
                <div style="background: rgba(0,0,0,0.03); border-radius: var(--radius-sm); padding: 8px; margin-top: 4px; display: flex; flex-direction: column; gap: 5px;">
                  ${schedules.map((s, idx) => {
                    const sStart = new Date(s.start).getTime();
                    const sEnd = new Date(s.end).getTime();
                    const isSlotLive = now >= sStart && now <= sEnd;
                    const isSlotPast = now > sEnd;
                    const pillColor = isSlotLive ? '#10b981' : (isSlotPast ? 'var(--text-muted)' : '#0891b2');
                    const pillText = isSlotLive ? '🟢 Open Now' : (isSlotPast ? 'Closed' : 'Upcoming');
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
                        <div>
                          <strong style="color:var(--text-main);">${s.label || `Slot ${idx + 1}`}:</strong>
                          <span style="font-size:0.73rem; color:var(--text-muted); margin-left:4px;">${formatDateTime(s.start)}</span>
                        </div>
                        <span style="color:${pillColor}; font-weight:700; font-size:0.7rem;">${pillText}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : `
                <div class="detail-item">
                  <span class="detail-label">Schedule:</span>
                  <span class="detail-value" style="color:var(--text-muted);">Waiting for Admin</span>
                </div>
              `}
              ${isSubmitted && e.submission ? `
                <div class="detail-item" style="border-top: 1px solid var(--border-color); padding-top: 6px; margin-top: 4px;">
                  <span class="detail-label">Your Score:</span>
                  <span class="detail-value" style="color:var(--primary); font-size:1.05rem;">
                    ${e.submission.score} / ${e.submission.total_marks} (${e.submission.percentage}%)
                  </span>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="exam-card-actions" style="margin-top: 14px;">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  },

  async startExam(examId) {
    try {
      const data = await API.getExam(examId);
      const exam = data.exam;

      if (!exam) {
        App.showToast('Exam could not be found', 'error');
        return;
      }

      if (data.studentSubmission) {
        this.showScoreCardModal(data.studentSubmission, exam);
        return;
      }

      const schedules = getNormalizedSchedules(exam);
      if (exam.status !== 'scheduled' || schedules.length === 0) {
        App.showToast('This exam has not been scheduled yet', 'error');
        return;
      }

      const now = Date.now();
      const activeSlot = schedules.find(s => {
        const sTime = new Date(s.start).getTime();
        const eTime = new Date(s.end).getTime();
        return now >= sTime && now <= eTime;
      });

      if (!activeSlot) {
        const upcomingSlots = schedules
          .filter(s => now < new Date(s.start).getTime())
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        if (upcomingSlots.length > 0) {
          App.showToast(`Portal opens for ${upcomingSlots[0].label || 'the next session'} at ${formatDateTime(upcomingSlots[0].start)}`, 'error');
        } else {
          App.showToast('All scheduled windows for this exam have already closed', 'error');
        }
        return;
      }

      const activeEndTime = new Date(activeSlot.end).getTime();
      this.activeExam = exam;
      this.activeSlot = activeSlot;
      this.currentQuestionIdx = 0;
      this.answers = {};

      // Time remaining in seconds based on active slot's end time
      this.timeRemainingSecs = Math.max(0, Math.floor((activeEndTime - now) / 1000));

      // Populate Header
      const titleEl = document.getElementById('taker-exam-title');
      const subjectEl = document.getElementById('taker-exam-subject');
      const classEl = document.getElementById('taker-exam-class');

      if (titleEl) titleEl.textContent = exam.title;
      if (subjectEl) subjectEl.textContent = exam.subject;
      if (classEl) classEl.textContent = `Class ${exam.class} - ${exam.division || 'All'} • ${activeSlot.label || 'Active Session'}`;

      // Start countdown timer
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.updateTimerDisplay();
      this.timerInterval = setInterval(() => {
        this.timeRemainingSecs--;
        this.updateTimerDisplay();
        if (this.timeRemainingSecs <= 0) {
          clearInterval(this.timerInterval);
          App.showToast('Time is up! Submitting your examination answers automatically...', 'info');
          this.submitExam(true);
        }
      }, 1000);

      // Render Question & Palette
      this.renderCurrentQuestion();
      this.renderPalette();

      // Show Fullscreen taker
      const takerEl = document.getElementById('student-exam-taker');
      if (takerEl) takerEl.style.display = 'flex';
    } catch (err) {
      App.showToast('Failed to launch exam: ' + err.message, 'error');
    }
  },

  updateTimerDisplay() {
    const textEl = document.getElementById('taker-timer-text');
    const containerEl = document.getElementById('taker-timer-container');
    if (!textEl) return;

    const mins = Math.floor(this.timeRemainingSecs / 60);
    const secs = this.timeRemainingSecs % 60;
    textEl.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (containerEl) {
      if (this.timeRemainingSecs < 300) {
        containerEl.classList.add('exam-timer-urgent');
      } else {
        containerEl.classList.remove('exam-timer-urgent');
      }
    }
  },

  renderCurrentQuestion() {
    if (!this.activeExam || !this.activeExam.questions) return;
    const questions = this.activeExam.questions;
    const total = questions.length;
    const q = questions[this.currentQuestionIdx];
    if (!q) return;

    // Header badges
    const qBadge = document.getElementById('taker-question-badge');
    const marksBadge = document.getElementById('taker-marks-badge');
    const qStatement = document.getElementById('taker-question-text');
    const navProgress = document.getElementById('taker-nav-progress');

    const correctList = Array.isArray(q.correct_indices)
      ? q.correct_indices
      : (q.correct_index !== undefined ? [q.correct_index] : [0]);
    const isMulti = correctList.length > 1;

    if (qBadge) qBadge.textContent = `Question ${this.currentQuestionIdx + 1} of ${total}`;
    if (marksBadge) {
      marksBadge.textContent = `${q.marks || 1} Mark${(q.marks || 1) > 1 ? 's' : ''} • ${isMulti ? 'Multiple Choices (Select all correct)' : 'Single Choice'}`;
    }
    if (qStatement) qStatement.textContent = q.question;
    if (navProgress) navProgress.textContent = `Question ${this.currentQuestionIdx + 1} of ${total}`;

    // Options list
    const optionsContainer = document.getElementById('taker-options-list');
    if (optionsContainer) {
      const letters = ['A', 'B', 'C', 'D'];
      const qKey = q.id || `q_${this.currentQuestionIdx + 1}`;
      const rawAns = this.answers[qKey];
      const selectedList = Array.isArray(rawAns)
        ? rawAns
        : (rawAns !== undefined ? [rawAns] : []);

      optionsContainer.innerHTML = (q.options || []).map((optText, optIdx) => {
        const isSelected = selectedList.includes(optIdx);
        return `
          <div class="student-option-card ${isSelected ? 'selected' : ''}" 
            onclick="StudentExams.selectOption('${qKey}', ${optIdx}, ${isMulti})"
            style="${isSelected ? 'border-color:var(--primary); background:rgba(79,70,229,0.08);' : ''}">
            <div class="student-option-circle" style="${isSelected ? 'background:var(--primary); color:#fff;' : ''}">
              ${isSelected ? (isMulti ? '✓' : letters[optIdx]) : letters[optIdx]}
            </div>
            <div class="student-option-text" style="${isSelected ? 'font-weight:700; color:var(--text-main);' : ''}">${optText}</div>
          </div>
        `;
      }).join('');
    }

    // Prev / Next button states
    const prevBtn = document.getElementById('taker-btn-prev');
    const nextBtn = document.getElementById('taker-btn-next');

    if (prevBtn) prevBtn.disabled = this.currentQuestionIdx === 0;
    if (nextBtn) {
      if (this.currentQuestionIdx === total - 1) {
        nextBtn.textContent = 'Review & Submit →';
        nextBtn.onclick = () => StudentExams.confirmSubmitExam();
      } else {
        nextBtn.textContent = 'Next Question →';
        nextBtn.onclick = () => StudentExams.navigateQuestion(1);
      }
    }

    this.renderPalette();
  },

  selectOption(qKey, optIdx, isMulti = false) {
    if (isMulti) {
      let current = [];
      if (Array.isArray(this.answers[qKey])) {
        current = [...this.answers[qKey]];
      } else if (this.answers[qKey] !== undefined) {
        current = [this.answers[qKey]];
      }

      const idx = current.indexOf(optIdx);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(optIdx);
        current.sort((a, b) => a - b);
      }

      if (current.length === 0) {
        delete this.answers[qKey];
      } else {
        this.answers[qKey] = current;
      }
    } else {
      this.answers[qKey] = optIdx;
    }
    this.renderCurrentQuestion();
  },

  navigateQuestion(delta) {
    if (!this.activeExam || !this.activeExam.questions) return;
    const total = this.activeExam.questions.length;
    const newIdx = this.currentQuestionIdx + delta;
    if (newIdx >= 0 && newIdx < total) {
      this.currentQuestionIdx = newIdx;
      this.renderCurrentQuestion();
    }
  },

  jumpToQuestion(idx) {
    if (!this.activeExam || !this.activeExam.questions) return;
    if (idx >= 0 && idx < this.activeExam.questions.length) {
      this.currentQuestionIdx = idx;
      this.renderCurrentQuestion();
    }
  },

  renderPalette() {
    if (!this.activeExam || !this.activeExam.questions) return;
    const questions = this.activeExam.questions;
    const total = questions.length;
    const paletteGrid = document.getElementById('taker-palette-grid');
    if (!paletteGrid) return;

    let answeredCount = 0;

    paletteGrid.innerHTML = questions.map((q, idx) => {
      const qKey = q.id || `q_${idx + 1}`;
      const ansVal = this.answers[qKey];
      const isAnswered = ansVal !== undefined && (!Array.isArray(ansVal) || ansVal.length > 0);
      const isActive = idx === this.currentQuestionIdx;

      if (isAnswered) answeredCount++;

      return `
        <button type="button" class="palette-btn ${isAnswered ? 'answered' : ''} ${isActive ? 'active' : ''}"
          onclick="StudentExams.jumpToQuestion(${idx})" title="Jump to Question ${idx + 1}">
          ${idx + 1}
        </button>
      `;
    }).join('');

    const summaryEl = document.getElementById('taker-summary-answered');
    if (summaryEl) summaryEl.textContent = `${answeredCount} of ${total} Questions Answered`;
  },

  confirmSubmitExam() {
    if (!this.activeExam) return;
    const total = this.activeExam.questions.length;
    const answeredCount = Object.keys(this.answers).filter(k => {
      const v = this.answers[k];
      return v !== undefined && (!Array.isArray(v) || v.length > 0);
    }).length;

    let msg = `You have answered ${answeredCount} of ${total} questions.`;
    if (answeredCount < total) {
      msg += `\n\nWarning: ${total - answeredCount} question(s) are still unanswered!`;
    }
    msg += `\n\nAre you sure you want to finish and submit your exam?`;

    if (confirm(msg)) {
      this.submitExam(false);
    }
  },

  async submitExam(isAutoSubmit = false) {
    if (!this.activeExam) return;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    try {
      const result = await API.submitExam(this.activeExam.id, this.answers);
      const submission = result.submission;

      // Close fullscreen exam interface
      const takerEl = document.getElementById('student-exam-taker');
      if (takerEl) takerEl.style.display = 'none';

      App.showToast(isAutoSubmit ? 'Time expired: Exam submitted automatically' : 'Exam submitted successfully!', 'success');
      this.showScoreCardModal(submission, this.activeExam);
      await this.loadExams();
    } catch (err) {
      App.showToast('Submission error: ' + err.message, 'error');
    }
  },

  async viewScoreCard(examId) {
    try {
      const data = await API.getExam(examId);
      if (data && data.studentSubmission) {
        this.showScoreCardModal(data.studentSubmission, data.exam);
      } else {
        App.showToast('No submission found for this exam', 'error');
      }
    } catch (err) {
      App.showToast('Could not load score card: ' + err.message, 'error');
    }
  },

  showScoreCardModal(submission, exam) {
    const scoreVal = document.getElementById('score-card-score');
    const scoreTotal = document.getElementById('score-card-total');
    const titleEl = document.getElementById('score-card-title');
    const classBadge = document.getElementById('score-card-class-badge');
    const percentEl = document.getElementById('score-card-percent');
    const statusEl = document.getElementById('score-card-status');
    const feedbackEl = document.getElementById('score-card-feedback');

    if (scoreVal) scoreVal.textContent = submission.score;
    if (scoreTotal) scoreTotal.textContent = `/ ${submission.total_marks} Marks`;
    if (titleEl && exam) titleEl.textContent = exam.title;
    if (classBadge) classBadge.textContent = `Class ${submission.class} - Division ${submission.div}`;
    if (percentEl) percentEl.textContent = `${submission.percentage}%`;
    if (statusEl) {
      if (submission.percentage >= 80) {
        statusEl.textContent = 'EXCELLENT';
        statusEl.style.color = '#10b981';
      } else if (submission.percentage >= 50) {
        statusEl.textContent = 'PASSED';
        statusEl.style.color = 'var(--primary)';
      } else {
        statusEl.textContent = 'NEEDS REVIEW';
        statusEl.style.color = 'var(--danger)';
      }
    }
    if (feedbackEl) {
      feedbackEl.textContent = `Official evaluation recorded at ${formatDateTime(submission.submitted_at)}. Great work!`;
    }

    App.openModal('exam-score-modal');
  }
};

window.TeacherExams = TeacherExams;
window.AdminExams = AdminExams;
window.StudentExams = StudentExams;
