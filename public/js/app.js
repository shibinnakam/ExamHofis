// ExamHofis Main Application Controller
const App = {
  activeTab: 'dashboard',

  async init() {
    this.setupEventListeners();
    this.setupTheme();
    this.checkAwsStatus();

    // Check user session
    await Auth.init();
    
    // Always show Holy Family International School Homepage first as requested
    this.showHomePage();
  },

  async checkAwsStatus() {
    try {
      const data = await API.getAwsStatus();
      const badge = document.getElementById('aws-cloud-badge');
      const text = document.getElementById('aws-status-text');
      if (badge && text && data) {
        if (data.useAws) {
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
          badge.style.color = '#10b981';
          badge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
          text.textContent = `AWS Active (${data.region})`;
          badge.title = `AWS Cognito + DynamoDB (${data.region}) Active`;
        } else {
          badge.style.background = 'rgba(255, 153, 0, 0.12)';
          badge.style.color = '#ff9900';
          badge.style.borderColor = 'rgba(255, 153, 0, 0.35)';
          text.textContent = 'AWS Ready';
          badge.title = 'AWS Architecture Configured & Ready (Local Fallback Active)';
        }
      }
    } catch (e) {
      console.warn('Could not query AWS status:', e);
    }
  },

  showHomePage() {
    const homeView = document.getElementById('view-homepage');
    const portalView = document.getElementById('view-portal');
    if (homeView) homeView.style.display = 'block';
    if (portalView) portalView.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    Auth.updateHomeNavButton();
  },

  showPortal() {
    const homeView = document.getElementById('view-homepage');
    const portalView = document.getElementById('view-portal');
    if (homeView) homeView.style.display = 'none';
    if (portalView) portalView.style.display = 'flex';
    if (Auth.currentUser) {
      this.switchPortalView(Auth.currentUser.role);
    }
  },

  setupEventListeners() {
    // Navigation Links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = link.dataset.tab;
        if (target) {
          e.preventDefault();
          this.switchTab(target);
          
          // Close mobile sidebar if open
          document.querySelector('.sidebar')?.classList.remove('mobile-open');
        }
      });
    });

    // Mobile Sidebar Toggle
    document.getElementById('mobile-menu-toggle')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('mobile-open');
    });

    // Theme Toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Student Filters & Search
    document.getElementById('student-filter-class')?.addEventListener('change', () => Admin.loadStudents());
    document.getElementById('student-filter-div')?.addEventListener('change', () => Admin.loadStudents());
    let studentSearchTimeout = null;
    document.getElementById('student-search-input')?.addEventListener('input', () => {
      clearTimeout(studentSearchTimeout);
      studentSearchTimeout = setTimeout(() => Admin.loadStudents(), 300);
    });

    // Teacher Filters & Search
    document.getElementById('teacher-filter-class')?.addEventListener('change', () => Admin.loadTeachers());
    document.getElementById('teacher-filter-subject')?.addEventListener('change', () => Admin.loadTeachers());
    let teacherSearchTimeout = null;
    document.getElementById('teacher-search-input')?.addEventListener('input', () => {
      clearTimeout(teacherSearchTimeout);
      teacherSearchTimeout = setTimeout(() => Admin.loadTeachers(), 300);
    });

    // Student Form & Photo Preview
    const studentForm = document.getElementById('student-form');
    if (studentForm) {
      studentForm.addEventListener('submit', (e) => Admin.handleStudentFormSubmit(e));
    }

    const photoInput = document.getElementById('student-photo-input');
    const photoPreview = document.getElementById('student-preview-img');
    if (photoInput && photoPreview) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            photoPreview.src = re.target.result;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Auto-suggest student username
    const studentNameInput = document.getElementById('student-name');
    const studentUsernameInput = document.getElementById('student-username');
    if (studentNameInput && studentUsernameInput) {
      studentNameInput.addEventListener('input', () => {
        // Only suggest if field is empty or user is adding new
        if (!document.getElementById('student-id-field').value && !studentUsernameInput.value) {
          const clean = studentNameInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (clean) {
            const classVal = document.getElementById('student-class')?.value || '10';
            const divVal = document.getElementById('student-div')?.value || 'a';
            studentUsernameInput.value = `${clean}${classVal}${divVal.toLowerCase()}`;
          }
        }
      });
    }

    // Auto-suggest teacher username
    const teacherNameInput = document.getElementById('teacher-name');
    const teacherUsernameInput = document.getElementById('teacher-username');
    if (teacherNameInput && teacherUsernameInput) {
      teacherNameInput.addEventListener('input', () => {
        if (!document.getElementById('teacher-id-field').value && !teacherUsernameInput.value) {
          const clean = teacherNameInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');
          const subj = (document.getElementById('teacher-subject')?.value || 'faculty').toLowerCase().slice(0, 4);
          if (clean) teacherUsernameInput.value = `${clean}.${subj}`;
        }
      });
    }

    // Teacher Form
    const teacherForm = document.getElementById('teacher-form');
    if (teacherForm) {
      teacherForm.addEventListener('submit', (e) => Admin.handleTeacherFormSubmit(e));
    }

    // Login Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;
        try {
          await Auth.login(u, p);
        } catch (err) {}
      });
    }

    // Modal backdrop click to close
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });

    // ESC key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(modal => {
          modal.classList.remove('open');
        });
      }
    });
  },

  switchPortalView(role) {
    if (role === 'admin') {
      this.switchTab('dashboard');
    } else if (role === 'teacher') {
      this.switchTab('teacher-portal');
      TeacherPortal.init();
    } else if (role === 'student') {
      this.switchTab('student-portal');
      StudentPortal.init();
    }
  },

  switchTab(tabId) {
    // Strict Role isolation guard:
    // - Admin only views Admin tabs (dashboard, students, teachers, exams)
    // - Teacher only views Teacher tabs (teacher-portal, teacher-exams)
    // - Student only views Student tabs (student-portal, student-exams)
    if (Auth.currentUser) {
      const role = Auth.currentUser.role;
      const adminTabs = ['dashboard', 'students', 'teachers', 'exams'];
      const teacherTabs = ['teacher-portal', 'teacher-exams'];
      const studentTabs = ['student-portal', 'student-exams'];

      if (role === 'admin' && !adminTabs.includes(tabId)) {
        tabId = 'dashboard';
      } else if (role === 'teacher' && !teacherTabs.includes(tabId)) {
        tabId = 'teacher-portal';
      } else if (role === 'student' && !studentTabs.includes(tabId)) {
        tabId = 'student-portal';
      }
    }

    this.activeTab = tabId;

    // Update nav links active state
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.tab === tabId);
    });

    // Hide all tab sections
    document.querySelectorAll('.tab-content').forEach(section => {
      section.style.display = 'none';
    });

    // Show active tab
    const activeSection = document.getElementById(`tab-${tabId}`);
    if (activeSection) {
      activeSection.style.display = 'block';
    }

    // Update Topbar Title
    const titleEl = document.getElementById('top-page-title');
    const subEl = document.getElementById('top-page-desc');

    if (tabId === 'dashboard') {
      if (titleEl) titleEl.textContent = 'Admin Overview & Metrics';
      if (subEl) subEl.textContent = 'Real-time school enrollment & faculty statistics';
      Admin.loadDashboard();
    } else if (tabId === 'students') {
      if (titleEl) titleEl.textContent = 'Student Management';
      if (subEl) subEl.textContent = 'Enroll students with photos, admission numbers, class & division';
      Admin.loadStudents();
    } else if (tabId === 'teachers') {
      if (titleEl) titleEl.textContent = 'Teacher Management';
      if (subEl) subEl.textContent = 'Manage teachers, assigned classes (1-10) and subjects';
      Admin.loadTeachers();
    } else if (tabId === 'exams') {
      if (titleEl) titleEl.textContent = 'Exam Scheduling & Management';
      if (subEl) subEl.textContent = 'Set official date & time windows to open exams for enrolled students';
      AdminExams.init();
    } else if (tabId === 'teacher-portal') {
      if (titleEl) titleEl.textContent = 'Teacher Classroom Hub';
      if (subEl) subEl.textContent = 'Class student roster and subject information';
      TeacherPortal.init();
    } else if (tabId === 'teacher-exams') {
      if (titleEl) titleEl.textContent = 'MCQ Question Papers & Exams';
      if (subEl) subEl.textContent = 'Author and save multiple choice exams for Classes 1 to 10';
      TeacherExams.init();
    } else if (tabId === 'student-portal') {
      if (titleEl) titleEl.textContent = 'Student Portal & ID';
      if (subEl) subEl.textContent = 'Personal digital ID badge and assigned teachers';
      StudentPortal.init();
    } else if (tabId === 'student-exams') {
      if (titleEl) titleEl.textContent = 'Online Examinations Hall';
      if (subEl) subEl.textContent = 'Scheduled computer-based assessments for your class & division';
      StudentExams.init();
    }
  },

  toggleViewMode(type, mode) {
    if (type === 'students') {
      Admin.currentStudentView = mode;
      document.getElementById('students-view-table-btn')?.classList.toggle('active', mode === 'table');
      document.getElementById('students-view-cards-btn')?.classList.toggle('active', mode === 'cards');
      document.getElementById('students-table-container').style.display = mode === 'table' ? 'block' : 'none';
      document.getElementById('students-cards-container').style.display = mode === 'cards' ? 'grid' : 'none';
    } else if (type === 'teachers') {
      Admin.currentTeacherView = mode;
      document.getElementById('teachers-view-table-btn')?.classList.toggle('active', mode === 'table');
      document.getElementById('teachers-view-cards-btn')?.classList.toggle('active', mode === 'cards');
      document.getElementById('teachers-table-container').style.display = mode === 'table' ? 'block' : 'none';
      document.getElementById('teachers-cards-container').style.display = mode === 'cards' ? 'grid' : 'none';
    }
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  },

  generateRandomPassword(targetInputId) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
    let pass = '';
    for (let i = 0; i < 9; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const input = document.getElementById(targetInputId);
    if (input) {
      input.value = pass;
      input.type = 'text'; // momentarily show it so admin sees it
      const parent = input.parentElement;
      if (parent) {
        const eyeOpen = parent.querySelector('.eye-open-icon');
        const eyeClosed = parent.querySelector('.eye-closed-icon');
        if (eyeOpen && eyeClosed) {
          eyeOpen.style.display = 'none';
          eyeClosed.style.display = 'block';
        }
      }
      this.showToast('Generated secure random password: ' + pass, 'info');
    }
  },

  togglePasswordVisibility(targetInputId, btn) {
    const input = document.getElementById(targetInputId);
    if (!input) return;
    const eyeOpen = btn.querySelector('.eye-open-icon');
    const eyeClosed = btn.querySelector('.eye-closed-icon');

    if (input.type === 'password') {
      input.type = 'text';
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
        btn.setAttribute('title', 'Hide password');
      } else {
        btn.textContent = '🙈 Hide';
      }
    } else {
      input.type = 'password';
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
        btn.setAttribute('title', 'Show password');
      } else {
        btn.textContent = '👁️ Show';
      }
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div style="font-weight:700; flex:1;">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  setupTheme() {
    const saved = localStorage.getItem('examhofis_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    this.updateThemeIcon(saved);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('examhofis_theme', next);
    this.updateThemeIcon(next);
  },

  updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    }
  },

  // Demo Login Quick Helper
  quickLogin(role) {
    if (role === 'admin') {
      document.getElementById('login-username').value = 'admin';
      document.getElementById('login-password').value = 'admin123';
    } else if (role === 'teacher') {
      document.getElementById('login-username').value = 'ananya.physics';
      document.getElementById('login-password').value = 'teacher123';
    } else if (role === 'student') {
      document.getElementById('login-username').value = 'aarav10a';
      document.getElementById('login-password').value = 'student123';
    }
    document.getElementById('login-submit-btn')?.click();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
