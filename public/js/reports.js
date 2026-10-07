// =====================================================================
// Holy Family International School - Examination Reports & PDF Generator
// Handles Student Individual Report Cards & Consolidated Class Broadsheets
// =====================================================================

const Reports = {
  currentStudentReportData: null,
  currentClassReportData: null,

  // 1. Open and Populate Individual Student Report Card
  async openStudentReportCard(submission, exam) {
    try {
      let sub = submission;
      let ex = exam;

      // If passed an exam ID or submission ID, fetch required data
      if (typeof sub === 'string' || typeof sub === 'number') {
        const examId = ex ? (ex.id || ex) : null;
        if (examId) {
          const subs = await API.getExamSubmissions(examId);
          sub = subs.find(s => String(s.id) === String(submission) || String(s.student_id) === String(submission));
          if (!ex || typeof ex !== 'object') {
            ex = await API.getExam(examId);
            if (ex && ex.exam) ex = ex.exam;
          }
        }
      }

      if (!sub) {
        App.showToast('Could not load student submission data', 'error');
        return;
      }

      if (!ex && sub.exam_id) {
        const examResp = await API.getExam(sub.exam_id);
        ex = examResp.exam || examResp;
      }

      this.currentStudentReportData = { submission: sub, exam: ex };

      // Date
      const dateEl = document.getElementById('rep-generated-date');
      if (dateEl) {
        const d = sub.submitted_at ? new Date(sub.submitted_at) : new Date();
        dateEl.textContent = `Date: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }

      // Metadata
      const nameEl = document.getElementById('rep-student-name');
      const admEl = document.getElementById('rep-student-adm');
      const classDivEl = document.getElementById('rep-student-class-div');
      const slotEl = document.getElementById('rep-exam-slot');
      const titleEl = document.getElementById('rep-exam-title');
      const subjectEl = document.getElementById('rep-exam-subject');
      const submittedAtEl = document.getElementById('rep-submitted-at');
      const evalStatusEl = document.getElementById('rep-eval-status');

      if (nameEl) nameEl.textContent = sub.student_name || 'Student';
      if (admEl) admEl.textContent = sub.admission_no || '--';
      if (classDivEl) classDivEl.textContent = `Class ${sub.class || (ex ? ex.class : '')} - Division ${sub.div || (ex ? ex.division : 'A')}`;
      if (slotEl) slotEl.textContent = sub.slot_label || 'Slot 1';
      if (titleEl) titleEl.textContent = ex ? ex.title : 'Examination Paper';
      if (subjectEl) subjectEl.textContent = ex ? ex.subject : '--';
      if (submittedAtEl) submittedAtEl.textContent = formatDateTime(sub.submitted_at);
      if (evalStatusEl) evalStatusEl.textContent = 'VERIFIED & RECORDED';

      // Questions breakdown calculation
      const questions = (ex && Array.isArray(ex.questions)) ? ex.questions : [];
      const answers = sub.answers || {};

      let totalQ = sub.total_questions || questions.length || 0;
      let attended = sub.attended_count;
      let right = sub.right_count;
      let wrong = sub.wrong_count;
      let score = sub.score !== undefined ? sub.score : 0;
      let totalMarks = sub.total_marks || totalQ || 0;
      let pct = sub.percentage !== undefined ? sub.percentage : (totalMarks > 0 ? (score / totalMarks) * 100 : 0);

      // Fallback calculation if metrics were not stored in older records
      if (attended === undefined || attended === null) {
        attended = 0;
        right = 0;
        wrong = 0;
        questions.forEach((q, idx) => {
          const qKey = q.id || `q_${idx + 1}`;
          const sAns = answers[qKey];
          const hasAttended = sAns !== undefined && sAns !== null && (Array.isArray(sAns) ? sAns.length > 0 : String(sAns).trim() !== '');
          if (hasAttended) attended++;

          let targetCorrect = [];
          if (Array.isArray(q.correct_indices) && q.correct_indices.length > 0) {
            targetCorrect = q.correct_indices.map(v => parseInt(v, 10)).sort((a, b) => a - b);
          } else if (q.correct_index !== undefined && q.correct_index !== null) {
            targetCorrect = [parseInt(q.correct_index, 10)];
          }

          let studentSelected = [];
          if (Array.isArray(sAns)) {
            studentSelected = sAns.map(v => parseInt(v, 10)).sort((a, b) => a - b);
          } else if (sAns !== undefined && sAns !== null) {
            studentSelected = [parseInt(sAns, 10)];
          }

          if (
            targetCorrect.length > 0 &&
            targetCorrect.length === studentSelected.length &&
            targetCorrect.every((val, i) => val === studentSelected[i])
          ) {
            right++;
          } else if (hasAttended) {
            wrong++;
          }
        });
      }

      // Populate metrics
      const totalQEl = document.getElementById('rep-metric-total-q');
      const attendedEl = document.getElementById('rep-metric-attended');
      const rightEl = document.getElementById('rep-metric-right');
      const wrongEl = document.getElementById('rep-metric-wrong');
      const scoreEl = document.getElementById('rep-metric-score');
      const percentEl = document.getElementById('rep-metric-percent');
      const finalPctEl = document.getElementById('rep-final-percent');

      if (totalQEl) totalQEl.textContent = totalQ;
      if (attendedEl) attendedEl.textContent = attended;
      if (rightEl) rightEl.textContent = right;
      if (wrongEl) wrongEl.textContent = wrong;
      if (scoreEl) scoreEl.textContent = `${score} / ${totalMarks}`;
      if (percentEl) percentEl.textContent = `${pct}% Percentage`;
      if (finalPctEl) finalPctEl.textContent = `${pct}%`;

      // Status banner & Grade
      const banner = document.getElementById('rep-status-banner');
      const gradeBadge = document.getElementById('rep-grade-badge');
      const commentEl = document.getElementById('rep-grade-comment');

      const isPass = pct >= 40;
      let grade = 'Pass';
      let comment = 'Demonstrated satisfactory mastery of the curriculum topics.';

      if (pct >= 90) {
        grade = 'A+ (Outstanding)';
        comment = 'Outstanding academic excellence with near-flawless conceptual understanding.';
      } else if (pct >= 75) {
        grade = 'A (Distinction)';
        comment = 'Commendable performance demonstrating strong grasp of principles.';
      } else if (pct >= 60) {
        grade = 'B (First Class)';
        comment = 'Good performance. Keep practicing complex problem areas.';
      } else if (pct >= 40) {
        grade = 'C (Passed)';
        comment = 'Satisfactory pass. Regular revision is recommended.';
      } else {
        grade = 'Needs Improvement';
        comment = 'Score is below qualifying criteria. Remedial support recommended.';
      }

      if (banner) {
        banner.className = `report-status-banner ${isPass ? 'pass' : 'fail'}`;
      }
      if (gradeBadge) {
        gradeBadge.textContent = `GRADE: ${grade}`;
      }
      if (commentEl) {
        commentEl.textContent = comment;
      }

      // Itemized Question Evaluation Rows
      const tbody = document.getElementById('rep-itemized-tbody');
      if (tbody) {
        if (questions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: var(--text-muted);">Question details recorded. Score: ${score}/${totalMarks} (${pct}%)</td></tr>`;
        } else {
          tbody.innerHTML = questions.map((q, idx) => {
            const qKey = q.id || `q_${idx + 1}`;
            const sAns = answers[qKey];
            const hasAttended = sAns !== undefined && sAns !== null && (Array.isArray(sAns) ? sAns.length > 0 : String(sAns).trim() !== '');

            let targetCorrect = [];
            if (Array.isArray(q.correct_indices) && q.correct_indices.length > 0) {
              targetCorrect = q.correct_indices.map(v => parseInt(v, 10)).sort((a, b) => a - b);
            } else if (q.correct_index !== undefined && q.correct_index !== null) {
              targetCorrect = [parseInt(q.correct_index, 10)];
            }

            let studentSelected = [];
            if (Array.isArray(sAns)) {
              studentSelected = sAns.map(v => parseInt(v, 10)).sort((a, b) => a - b);
            } else if (sAns !== undefined && sAns !== null) {
              studentSelected = [parseInt(sAns, 10)];
            }

            const isCorrect = (
              targetCorrect.length > 0 &&
              targetCorrect.length === studentSelected.length &&
              targetCorrect.every((val, i) => val === studentSelected[i])
            );

            const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
            const options = q.options || [];

            // Format Student Answer Text
            let studentAnsText = '<span style="color:var(--text-muted); font-style:italic;">Skipped / Not Attempted</span>';
            if (hasAttended && studentSelected.length > 0) {
              studentAnsText = studentSelected.map(optIdx => {
                const optText = options[optIdx] || `Option ${letters[optIdx] || optIdx + 1}`;
                return `<strong>(${letters[optIdx] || optIdx + 1})</strong> ${optText}`;
              }).join(', ');
            }

            // Format Correct Answer Text
            const correctAnsText = targetCorrect.map(optIdx => {
              const optText = options[optIdx] || `Option ${letters[optIdx] || optIdx + 1}`;
              return `<strong>(${letters[optIdx] || optIdx + 1})</strong> ${optText}`;
            }).join(', ');

            // Status Pill
            let statusBadge = `<span class="pill-res skipped">⏸ Skipped</span>`;
            let marksAwarded = 0;
            if (isCorrect) {
              statusBadge = `<span class="pill-res correct">✓ Right</span>`;
              marksAwarded = q.marks || 1;
            } else if (hasAttended) {
              statusBadge = `<span class="pill-res wrong">✗ Wrong</span>`;
              marksAwarded = 0;
            }

            return `
              <tr>
                <td><strong>${idx + 1}</strong></td>
                <td>
                  <div style="font-weight: 600; line-height: 1.35; margin-bottom: 2px;">${q.question}</div>
                </td>
                <td>${studentAnsText}</td>
                <td style="color: #065f46;">${correctAnsText}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right; font-weight: 700;">${marksAwarded} / ${q.marks || 1}</td>
              </tr>
            `;
          }).join('');
        }
      }

      App.openModal('student-report-card-modal');
    } catch (err) {
      console.error('Error rendering student report card:', err);
      App.showToast('Failed to open report card: ' + err.message, 'error');
    }
  },

  // 2. Open Consolidated Class & Division Broadsheet Modal
  async openClassDivisionModal(initialClass = 10, initialDiv = 'All', initialExamId = null) {
    try {
      const classSelect = document.getElementById('class-rep-filter-class');
      const divSelect = document.getElementById('class-rep-filter-div');

      if (classSelect) classSelect.value = String(initialClass);
      if (divSelect) divSelect.value = String(initialDiv);

      await this.refreshExamOptionsForClass(initialClass, initialDiv, initialExamId);
      await this.loadClassDivisionReport();

      App.openModal('class-division-report-modal');
    } catch (err) {
      console.error('Failed to open class division broadsheet modal:', err);
      App.showToast('Could not open class report: ' + err.message, 'error');
    }
  },

  async onClassFilterChange() {
    const classNum = parseInt(document.getElementById('class-rep-filter-class')?.value, 10) || 10;
    const div = document.getElementById('class-rep-filter-div')?.value || 'All';
    await this.refreshExamOptionsForClass(classNum, div);
    await this.loadClassDivisionReport();
  },

  async refreshExamOptionsForClass(classNum, div, selectedExamId = null) {
    const examSelect = document.getElementById('class-rep-filter-exam');
    if (!examSelect) return;

    try {
      const exams = await API.getExams({ class: classNum });
      const filtered = exams.filter(e => e.class === classNum && (e.division === 'All' || div === 'All' || e.division === div));

      if (filtered.length === 0) {
        examSelect.innerHTML = `<option value="">No exams found for Class ${classNum}</option>`;
      } else {
        examSelect.innerHTML = filtered.map(e => `
          <option value="${e.id}" ${selectedExamId && String(e.id) === String(selectedExamId) ? 'selected' : ''}>
            ${e.title} (${e.subject})
          </option>
        `).join('');
      }
    } catch (err) {
      console.error('Error fetching exams for class report:', err);
    }
  },

  // 3. Load & Render Class Division Broadsheet
  async loadClassDivisionReport() {
    const classNum = parseInt(document.getElementById('class-rep-filter-class')?.value, 10) || 10;
    const div = document.getElementById('class-rep-filter-div')?.value || 'All';
    const examId = document.getElementById('class-rep-filter-exam')?.value || '';

    try {
      const data = await API.getClassDivisionReport({
        class: classNum,
        division: div,
        exam_id: examId
      });

      this.currentClassReportData = data;

      // Update Date & Meta
      const dateEl = document.getElementById('class-rep-date');
      const classInfoEl = document.getElementById('class-rep-class-info');
      const divInfoEl = document.getElementById('class-rep-div-info');
      const examInfoEl = document.getElementById('class-rep-exam-info');
      const subjectInfoEl = document.getElementById('class-rep-subject-info');

      if (dateEl) {
        dateEl.textContent = `Date: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      if (classInfoEl) classInfoEl.textContent = `Standard Class ${data.class}`;
      if (divInfoEl) divInfoEl.textContent = data.division === 'All' ? 'All Divisions (A, B, C, D, E)' : `Division ${data.division}`;
      if (examInfoEl) examInfoEl.textContent = data.exam ? data.exam.title : 'All Scheduled Tests';
      if (subjectInfoEl) subjectInfoEl.textContent = data.exam ? `${data.exam.subject} (${data.exam.total_marks || data.exam.total_questions || 10} Max Marks)` : '--';

      // Summary Stats Cards
      const sum = data.summary || {};
      const enrolledEl = document.getElementById('class-rep-stat-enrolled');
      const appearedEl = document.getElementById('class-rep-stat-appeared');
      const absentEl = document.getElementById('class-rep-stat-absent');
      const avgEl = document.getElementById('class-rep-stat-avg');
      const passRateEl = document.getElementById('class-rep-stat-passrate');
      const topperEl = document.getElementById('class-rep-stat-topper');
      const topperScoreEl = document.getElementById('class-rep-stat-topperscore');

      if (enrolledEl) enrolledEl.textContent = sum.total_enrolled || 0;
      if (appearedEl) appearedEl.textContent = sum.total_appeared || 0;
      if (absentEl) absentEl.textContent = sum.total_absent || 0;
      if (avgEl) avgEl.textContent = `${sum.average_percentage || 0}%`;
      if (passRateEl) passRateEl.textContent = `${sum.pass_rate || 0}%`;
      if (topperEl) topperEl.textContent = sum.highest_student || 'None';
      if (topperScoreEl) topperScoreEl.textContent = `Top Mark: ${sum.highest_score || 0} Marks`;

      // Broadsheet Table Rows
      const tbody = document.getElementById('class-rep-table-body');
      if (tbody) {
        const records = data.records || [];
        if (records.length === 0) {
          tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 28px; color: var(--text-muted);">No students enrolled in Class ${classNum} (Div ${div}).</td></tr>`;
        } else {
          tbody.innerHTML = records.map((r) => {
            const isAppeared = r.status === 'Appeared';
            let resPill = `<span class="pill-res skipped">ABSENT</span>`;
            if (isAppeared) {
              resPill = r.percentage >= 40 
                ? `<span class="pill-res correct">PASSED</span>`
                : `<span class="pill-res wrong">FAIL</span>`;
            }

            return `
              <tr>
                <td><strong>${r.rank}</strong></td>
                <td><span class="badge badge-adm">${r.admission_no}</span></td>
                <td>
                  <strong>${r.student_name}</strong>
                  <div style="font-size:0.72rem; color:var(--text-muted);">Class ${r.class}-${r.div}</div>
                </td>
                <td style="font-size: 0.76rem; color: #0891b2; font-weight: 700;">${r.slot_label || '--'}</td>
                <td style="text-align: center;">${r.total_questions || '--'}</td>
                <td style="text-align: center;">${r.attended_count || 0}</td>
                <td style="text-align: center; color: #10b981; font-weight: 700;">${r.right_count || 0}</td>
                <td style="text-align: center; color: #ef4444; font-weight: 700;">${r.wrong_count || 0}</td>
                <td style="text-align: right; font-weight: 800; color: var(--primary);">${isAppeared ? r.score : 0} / ${r.total_marks || 0}</td>
                <td style="text-align: right; font-weight: 700;">${isAppeared ? `${r.percentage}%` : '0%'}</td>
                <td style="text-align: center;">${resPill}</td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (err) {
      console.error('Error loading class broadsheet report:', err);
      App.showToast('Failed to load class broadsheet: ' + err.message, 'error');
    }
  },

  // 4. Clean Print Handler for PDF Generation
  printCurrentReport(printableAreaId) {
    const isBroadsheet = printableAreaId === 'class-report-printable-area';
    const orientation = isBroadsheet ? 'landscape' : 'portrait';
    const modeClass = isBroadsheet ? 'print-mode-class' : 'print-mode-student';

    // Remove any previous print styles or leftover iframes
    const oldIframe = document.getElementById('hfis-report-print-frame');
    if (oldIframe) oldIframe.remove();
    const existing = document.getElementById('dynamic-print-page-style');
    if (existing) existing.remove();

    // Inject dynamic @page rule for proper paper orientation
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-page-style';
    styleEl.innerHTML = `@page { size: A4 ${orientation}; margin: 8mm 10mm; }`;
    document.head.appendChild(styleEl);

    // Apply print mode class to document body
    document.body.classList.remove('print-mode-student', 'print-mode-class', 'printing-id-card');
    document.body.classList.add(modeClass);

    // Invoke browser print dialog
    window.print();

    // Clean up after print dialog finishes
    const cleanup = () => {
      document.body.classList.remove(modeClass);
      const s = document.getElementById('dynamic-print-page-style');
      if (s) s.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 2500);
  },

  // 5. Clean Print Handler for Student ID Badge
  printIdCard() {
    document.body.classList.remove('print-mode-student', 'print-mode-class');
    document.body.classList.add('printing-id-card');

    const existing = document.getElementById('dynamic-print-page-style');
    if (existing) existing.remove();
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-page-style';
    styleEl.innerHTML = `@page { size: auto; margin: 10mm; }`;
    document.head.appendChild(styleEl);

    window.print();

    const cleanup = () => {
      document.body.classList.remove('printing-id-card');
      const s = document.getElementById('dynamic-print-page-style');
      if (s) s.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 2500);
  }
};

window.Reports = Reports;
