/**
 * YourGermanSchool (YGS) Unified API Adapter Layer
 * Connects Frontend UI seamlessly to Spring Boot REST Backend (http://localhost:8080/api/v1)
 * with automatic LocalStorage Fallback for static deployment environments.
 */

const YGS_API_BASE = 'http://localhost:8080/api/v1';

class YgsApiAdapter {
  constructor() {
    this.tokenKey = 'ygs_jwt_token';
  }

  getHeaders() {
    const token = localStorage.getItem(this.tokenKey);
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  // 1. Authenticate User (Student, Teacher, Admin)
  async login(emailInput, passwordInput) {
    const email = (emailInput || '').trim().toLowerCase();
    const password = (passwordInput || '').trim();

    try {
      const response = await fetch(`${YGS_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem(this.tokenKey, data.token);
        }
        return { success: true, user: data.user, role: data.role, token: data.token };
      }
    } catch (err) {
      console.warn('Backend REST API server unreachable. Falling back to local state authentication.');
    }

    // Fallback Local Auth: Super Admin
    if (email === 'admin@ygs.com' && password === 'admin123') {
      return { success: true, role: 'ADMIN', user: { fullName: 'Super Admin', email } };
    }

    // Fallback Local Auth: Faculty Teachers
    const teachers = JSON.parse(localStorage.getItem('ygs_teachers') || '[]');
    const teacherMatch = teachers.find(t => (t.email || '').trim().toLowerCase() === email && (t.password || '').trim() === password);
    if (teacherMatch) {
      if (teacherMatch.status === 'DEACTIVATED') {
        return { success: false, error: 'ACCOUNT_DEACTIVATED' };
      }
      return { success: true, role: 'TEACHER', user: teacherMatch };
    }

    // Fallback Local Auth: Students
    const students = JSON.parse(localStorage.getItem('ygs_students') || '[]');
    const studentMatch = students.find(s => (s.email || '').trim().toLowerCase() === email && (s.password || '').trim() === password);
    if (studentMatch) {
      if (studentMatch.status === 'DEACTIVATED') {
        return { success: false, error: 'ACCOUNT_DEACTIVATED' };
      }
      if (studentMatch.status === 'PENDING') {
        return { success: false, error: 'PENDING_APPROVAL' };
      }
      return { success: true, role: 'STUDENT', user: studentMatch };
    }

    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // 2. Fetch Students List
  async fetchStudents() {
    try {
      const res = await fetch(`${YGS_API_BASE}/admin/students`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch (e) {
      // Fallback
    }
    return JSON.parse(localStorage.getItem('ygs_students') || '[]');
  }

  // 3. Update Student Batch / Teacher / Password
  async updateStudent(studentId, batch, teacher, password) {
    try {
      const res = await fetch(`${YGS_API_BASE}/admin/students/${studentId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ batch, teacher, password })
      });
      if (res.ok) return true;
    } catch (e) {
      // Fallback
    }

    const students = JSON.parse(localStorage.getItem('ygs_students') || '[]');
    const idx = students.findIndex(s => s.id === studentId);
    if (idx !== -1) {
      students[idx].status = 'APPROVED';
      students[idx].batch = batch;
      students[idx].teacher = teacher;
      if (password) students[idx].password = password;
      localStorage.setItem('ygs_students', JSON.stringify(students));
      return true;
    }
    return false;
  }
}

const ygsApi = new YgsApiAdapter();
