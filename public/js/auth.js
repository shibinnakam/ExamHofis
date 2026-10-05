// Holy Family International School (HFIS) Authentication Manager
const Auth = {
  currentUser: null,

  async init() {
    const token = API.getToken();
    if (!token) {
      this.updateHomeNavButton();
      return null;
    }

    try {
      const data = await API.getCurrentUser();
      this.currentUser = data.user;
      this.updateUserUI();
      this.updateHomeNavButton();
      return this.currentUser;
    } catch (err) {
      console.warn('Session expired or invalid token:', err);
      this.logout(false);
      return null;
    }
  },

  async login(username, password) {
    try {
      const data = await API.login(username, password);
      API.setToken(data.token);
      this.currentUser = data.user;
      this.updateUserUI();
      this.updateHomeNavButton();
      this.hideLoginModal();
      App.showToast(`Welcome back to HFIS, ${this.currentUser.username}!`, 'success');
      App.showPortal();
      App.switchPortalView(this.currentUser.role);
      return data;
    } catch (err) {
      App.showToast(err.message, 'error');
      throw err;
    }
  },

  logout(notify = true) {
    API.setToken(null);
    this.currentUser = null;
    this.updateUserUI();
    this.updateHomeNavButton();
    this.hideLoginModal();
    App.showHomePage();
    if (notify) {
      App.showToast('You have been logged out of HFIS Portal', 'info');
    }
  },

  updateHomeNavButton() {
    const navBtn = document.getElementById('home-navbar-login-btn');
    if (!navBtn) return;

    if (this.currentUser) {
      const role = this.currentUser.role;
      const roleIcon = role === 'admin' ? '👑' : role === 'teacher' ? '👨‍🏫' : '🎓';
      navBtn.innerHTML = `${roleIcon} Open ${role.toUpperCase()} Portal`;
      navBtn.onclick = () => {
        App.showPortal();
        App.switchPortalView(this.currentUser.role);
      };
    } else {
      navBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
        Portal Login
      `;
      navBtn.onclick = () => this.showLoginModal();
    }
  },

  updateUserUI() {
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const roleBadgeEl = document.getElementById('top-role-badge');
    const navAdmin = document.querySelectorAll('.nav-role-admin');
    const navTeacher = document.querySelectorAll('.nav-role-teacher');
    const navStudent = document.querySelectorAll('.nav-role-student');

    if (this.currentUser) {
      const role = this.currentUser.role;
      let displayName = this.currentUser.username;
      let avatarUrl = '/avatars/student1.svg';

      if (this.currentUser.profile && this.currentUser.profile.name) {
        displayName = this.currentUser.profile.name;
      }
      if (this.currentUser.profile && this.currentUser.profile.photo_url) {
        avatarUrl = this.currentUser.profile.photo_url;
      } else if (role === 'admin') {
        avatarUrl = '/logo.svg';
      }

      if (nameEl) nameEl.textContent = displayName;
      if (roleEl) roleEl.textContent = role.toUpperCase();
      if (avatarEl) avatarEl.src = avatarUrl;
      if (roleBadgeEl) roleBadgeEl.textContent = `${role === 'admin' ? '👑 Admin' : role === 'teacher' ? '👨‍🏫 Teacher' : '🎓 Student'}`;

      // Navigation visibility according to role
      navAdmin.forEach(el => el.style.display = role === 'admin' ? 'flex' : 'none');
      navTeacher.forEach(el => el.style.display = role === 'teacher' ? 'flex' : 'none');
      navStudent.forEach(el => el.style.display = role === 'student' ? 'flex' : 'none');
    } else {
      if (nameEl) nameEl.textContent = 'Guest';
      if (roleEl) roleEl.textContent = 'NOT LOGGED IN';
    }
  },

  showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.style.display = 'flex';
  },

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.style.display = 'none';
  }
};
