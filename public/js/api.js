// ExamHofis API Client
const API = {
  getToken() {
    return localStorage.getItem('examhofis_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('examhofis_token', token);
    } else {
      localStorage.removeItem('examhofis_token');
    }
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    const baseUrl = window.API_BASE_URL || '';
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, config);
      const contentType = response.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}: ${text.slice(0, 120)}`);
        }
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Expected JSON response but server returned non-JSON data (${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || 'Server error occurred');
      }

      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth
  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  getCurrentUser() {
    return this.request('/api/auth/me');
  },

  // Metadata
  getMetadata() {
    return this.request('/api/meta');
  },

  // Admin Stats
  getStats() {
    return this.request('/api/stats');
  },

  // Students
  getStudents(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/students${query ? '?' + query : ''}`);
  },

  getStudent(id) {
    return this.request(`/api/students/${id}`);
  },

  createStudent(formData) {
    return this.request('/api/students', {
      method: 'POST',
      body: formData
    });
  },

  updateStudent(id, formData) {
    return this.request(`/api/students/${id}`, {
      method: 'PUT',
      body: formData
    });
  },

  deleteStudent(id) {
    return this.request(`/api/students/${id}`, {
      method: 'DELETE'
    });
  },

  // Teachers
  getTeachers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/teachers${query ? '?' + query : ''}`);
  },

  getTeacher(id) {
    return this.request(`/api/teachers/${id}`);
  },

  createTeacher(data) {
    return this.request('/api/teachers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateTeacher(id, data) {
    return this.request(`/api/teachers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteTeacher(id) {
    return this.request(`/api/teachers/${id}`, {
      method: 'DELETE'
    });
  },

  // Portals
  getTeacherClassData() {
    return this.request('/api/teacher/my-class');
  },

  getStudentProfileData() {
    return this.request('/api/student/my-profile');
  },

  // Examinations & MCQs
  getExams(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/exams${query ? '?' + query : ''}`);
  },

  getExam(id) {
    return this.request(`/api/exams/${id}`);
  },

  createExam(data) {
    return this.request('/api/exams', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  scheduleExam(id, data) {
    return this.request(`/api/exams/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  submitExam(id, answers, slotLabel = 'Slot 1') {
    return this.request(`/api/exams/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers, slot_label: slotLabel })
    });
  },

  getExamSubmissions(id) {
    return this.request(`/api/exams/${id}/submissions`);
  },

  getClassDivisionReport(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/reports/class-division${query ? '?' + query : ''}`);
  },

  deleteExam(id) {
    return this.request(`/api/exams/${id}`, {
      method: 'DELETE'
    });
  },

  // AWS Infrastructure Status
  getAwsStatus() {
    return this.request('/api/aws/status');
  }
};

window.API = API;
