/**
 * YourGermanSchool (YGS) — Database Engine
 * Primary: Firebase Cloud Firestore | Fallback: IndexedDB / localStorage
 * Optimized: Stale-While-Revalidate (SWR) caching with real-time events.
 */

const DB_NAME    = 'YGS_INSTITUTE_DB';
const DB_VERSION = 4;

class YGSDatabase {
  constructor() {
    this._dbReady = false;
    this.db       = null;
    this.firestore = null;
    this.ready    = this._init();
  }

  // ── Database Initialization ──
  async _init() {
    await this._loadFirebaseSDKs();

    if (window.firebase) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp({
            projectId: "mydemo-961d6",
            authDomain: "mydemo-961d6.firebaseapp.com"
          });
        }
        this.firestore = firebase.firestore();
        console.log('[YGS] Cloud Firestore initialized successfully.');
      } catch (err) {
        console.warn('[YGS] Cloud Firestore initialization failed:', err);
      }
    }

    await this._initIndexedDB();
    await this._seedDefaults().catch(() => {});

    if (this.firestore) {
      this._syncLocalToCloud().catch(err => console.warn('[YGS] Cloud sync error:', err));
    }
  }

  _loadFirebaseSDKs() {
    return new Promise((resolve) => {
      if (window.firebase) {
        resolve();
        return;
      }
      
      const s1 = document.createElement('script');
      s1.src = 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js';
      s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js';
        s2.onload = () => resolve();
        s2.onerror = () => resolve();
        document.head.appendChild(s2);
      };
      s1.onerror = () => resolve();
      document.head.appendChild(s1);
    });
  }

  _initIndexedDB() {
    return new Promise((resolve) => {
      const giveUp = setTimeout(() => {
        console.warn('[YGS] IndexedDB connection timed out — using localStorage fallback.');
        resolve(null);
      }, 1000);

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onblocked = () => {
          clearTimeout(giveUp);
          console.warn('[YGS] IndexedDB blocked — using localStorage fallback.');
          resolve(null);
        };

        req.onerror = () => {
          clearTimeout(giveUp);
          console.warn('[YGS] IndexedDB opening error — using localStorage fallback.');
          resolve(null);
        };

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('users')) {
            const s = db.createObjectStore('users', { keyPath: 'id' });
            s.createIndex('email',  'email',  { unique: true });
            s.createIndex('role',   'role',   { unique: false });
            s.createIndex('status', 'status', { unique: false });
          }
          if (!db.objectStoreNames.contains('batches'))     db.createObjectStore('batches',     { keyPath: 'id' });
          if (!db.objectStoreNames.contains('assignments')) db.createObjectStore('assignments', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('courses')) {
            const cs = db.createObjectStore('courses', { keyPath: 'id' });
            cs.createIndex('code', 'code', { unique: true });
          }
          if (!db.objectStoreNames.contains('attendance')) {
            const att = db.createObjectStore('attendance', { keyPath: 'id' });
            att.createIndex('studentId', 'studentId', { unique: false });
            att.createIndex('studentEmail', 'studentEmail', { unique: false });
            att.createIndex('date', 'date', { unique: false });
            att.createIndex('batch', 'batch', { unique: false });
          }
          if (!db.objectStoreNames.contains('polls'))       db.createObjectStore('polls',       { keyPath: 'id' });
          if (!db.objectStoreNames.contains('exercises'))   db.createObjectStore('exercises',   { keyPath: 'id' });
          if (!db.objectStoreNames.contains('leaves'))      db.createObjectStore('leaves',      { keyPath: 'id' });
        };

        req.onsuccess = (e) => {
          clearTimeout(giveUp);
          this.db       = e.target.result;
          this._dbReady = true;
          resolve(this.db);
        };
      } catch (err) {
        clearTimeout(giveUp);
        console.warn('[YGS] IndexedDB upgrade error:', err);
        resolve(null);
      }
    });
  }

  // ── Seed defaults ──
  async _seedDefaults() {
    const admin = await this.getUserByEmail('admin@ygs.com');
    if (!admin) {
      await this.saveUser({
        id: 'USR-ADMIN-001', fullName: 'Super Admin', email: 'admin@ygs.com',
        password: 'admin123', role: 'ADMIN', status: 'APPROVED',
        createdAt: new Date().toISOString()
      });
    }

    const courses = await this.getAllCourses();
    if (!courses || courses.length === 0) {
      const defaults = [
        { id: 'CRS-A1', code: 'A1', title: 'German A1 - Foundational',         fee: 'PKR 25,000' },
        { id: 'CRS-A2', code: 'A2', title: 'German A2 - Elementary',            fee: 'PKR 30,000' },
        { id: 'CRS-B1', code: 'B1', title: 'German B1 - Intermediate',          fee: 'PKR 35,000' },
        { id: 'CRS-B2', code: 'B2', title: 'German B2 - Advanced Professional', fee: 'PKR 40,000' },
        { id: 'CRS-C1', code: 'C1', title: 'German C1 - Native Mastery',        fee: 'PKR 50,000' },
      ];
      for (const c of defaults) await this.saveCourse(c).catch(() => {});
    }

    const teachers = await this.getAllTeachers();
    if (!teachers || teachers.length === 0) {
      const defaultTeachers = [
        {
          id: 'TCH-001', fullName: 'Frau Schmidt', email: 'schmidt@ygs.com',
          password: 'teacher123', role: 'TEACHER', assignedCourse: 'German A1 - Foundational',
          qualification: 'M.A. German Linguistics', specialization: 'A1-A2 Foundational',
          assignedBatches: ['YGS-A1-2026-01'], status: 'ACTIVE FACULTY',
          createdAt: new Date().toISOString()
        },
        {
          id: 'TCH-002', fullName: 'Herr Müller', email: 'muller@ygs.com',
          password: 'teacher123', role: 'TEACHER', assignedCourse: 'German A2 - Elementary',
          qualification: 'Ph.D. German Literature', specialization: 'A2-B1 Grammar',
          assignedBatches: ['YGS-A2-2026-01'], status: 'ACTIVE FACULTY',
          createdAt: new Date().toISOString()
        }
      ];
      for (const t of defaultTeachers) await this.saveUser(t).catch(() => {});
    }

    const batches = await this.getAllBatches();
    if (!batches || batches.length === 0) {
      const defaultBatches = [
        {
          id: 'BCH-A1-01', batchNumber: 'YGS-A1-2026-01', course: 'German A1 - Foundational',
          teacher: 'Frau Schmidt', schedule: 'Mon, Wed, Fri (19:00 Europe/Berlin)',
          scheduleData: { Monday: '19:00', Wednesday: '19:00', Friday: '19:00' },
          timezone: 'Europe/Berlin', startDate: '2026-08-01', endDate: '2026-10-01',
          meetLink: 'https://meet.google.com/ygs-a1-live', lateLimit: 10,
          createdAt: new Date().toISOString()
        },
        {
          id: 'BCH-A2-01', batchNumber: 'YGS-A2-2026-01', course: 'German A2 - Elementary',
          teacher: 'Herr Müller', schedule: 'Tue, Thu, Sat (18:00 Europe/Berlin)',
          scheduleData: { Tuesday: '18:00', Thursday: '18:00', Saturday: '18:00' },
          timezone: 'Europe/Berlin', startDate: '2026-08-01', endDate: '2026-10-01',
          meetLink: 'https://meet.google.com/ygs-a2-live', lateLimit: 10,
          createdAt: new Date().toISOString()
        }
      ];
      for (const b of defaultBatches) await this.saveBatch(b).catch(() => {});
    }

    const students = await this.getAllStudents();
    if (!students || students.length === 0) {
      const defaultStudents = [
        {
          id: 'STU-001', fullName: 'Hargun Das', email: 'hargun@gmail.com',
          password: 'student123', role: 'STUDENT', phone: '+92 300 1234567',
          course: 'German A1 - Foundational', batch: 'YGS-A1-2026-01', teacher: 'Frau Schmidt',
          schedule: 'Mon, Wed, Fri (19:00 Europe/Berlin)', meetLink: 'https://meet.google.com/ygs-a1-live',
          status: 'APPROVED', attendance: '100%', teacherRemark: 'Excellent progress',
          createdAt: new Date().toISOString()
        },
        {
          id: 'STU-002', fullName: 'Attiya Khan', email: 'attiya@gmail.com',
          password: 'student123', role: 'STUDENT', phone: '+92 301 9876543',
          course: 'German A2 - Elementary', batch: '', teacher: '',
          schedule: '', meetLink: '', paymentProof: 'fee_receipt.pdf',
          status: 'PENDING', attendance: '100%', teacherRemark: '',
          createdAt: new Date().toISOString()
        }
      ];
      for (const s of defaultStudents) await this.saveUser(s).catch(() => {});
    }
  }

  // ── SWR Caching Core Helper ──
  async _swr(lsKey, storeName, queryFn, eventType) {
    let localData = this._lsGet(lsKey);
    
    if (this.firestore) {
      const fetchPromise = queryFn().then(freshList => {
        if (freshList && Array.isArray(freshList)) {
          // Merge local cache items with cloud items so newly created local records are never erased before cloud sync finishes
          const itemMap = {};
          localData.forEach(item => { if (item && item.id) itemMap[item.id] = item; });
          freshList.forEach(item => { if (item && item.id) itemMap[item.id] = item; });
          const merged = Object.values(itemMap);

          const cacheStr = JSON.stringify(localData);
          const freshStr = JSON.stringify(merged);
          if (cacheStr !== freshStr) {
            this._lsSet(lsKey, merged);
            if (this._dbReady && this.db) {
              try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const obj = tx.objectStore(storeName);
                merged.forEach(item => obj.put(item));
              } catch (_) {}
            }
            window.dispatchEvent(new CustomEvent('ygs-data-updated', {
              detail: { type: eventType, data: merged }
            }));
          }
          return merged;
        }
        return localData;
      }).catch(err => {
        console.warn(`[YGS] SWR refresh failed for ${lsKey}:`, err);
        return localData;
      });

      // If local cache is empty (new session / browser tab), wait up to 2500ms for cloud data on initial render
      if (!localData || localData.length === 0) {
        try {
          const fresh = await Promise.race([
            fetchPromise,
            new Promise(r => setTimeout(() => r(null), 2500))
          ]);
          if (fresh && fresh.length > 0) {
            localData = fresh;
          }
        } catch(_) {}
      }
    }
    return localData;
  }

  // ── Bidirectional sync loop ──
  async _syncLocalToCloud() {
    if (!this.firestore) return;
    try {
      const cloudCoursesSnapshot = await this.firestore.collection('courses').get();
      if (cloudCoursesSnapshot.empty) {
        const localCourses = await this.getAllCourses();
        for (const c of localCourses) {
          await this.firestore.collection('courses').doc(c.id).set(c);
        }
      } else {
        const list = [];
        cloudCoursesSnapshot.forEach(doc => list.push(doc.data()));
        this._lsSet('ygs_courses', list);
      }

      const cloudOffDaysSnapshot = await this.firestore.collection('off_days').get();
      const localOffDays = JSON.parse(localStorage.getItem('ygs_off_days') || '{}');
      cloudOffDaysSnapshot.forEach(doc => {
        localOffDays[doc.id] = doc.data();
      });
      localStorage.setItem('ygs_off_days', JSON.stringify(localOffDays));
      for (const ds in localOffDays) {
        await this.firestore.collection('off_days').doc(ds).set(localOffDays[ds]);
      }
    } catch(err) {
      console.warn('[YGS] Background cloud sync skipped:', err);
    }
  }

  // ── localStorage utilities ──
  _lsGet(key)        { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  _lsSet(key, data)  { try { localStorage.setItem(key, JSON.stringify(data)); } catch {} }

  _lsGetItem(key, id) {
    return this._lsGet(key).find(x => x.id === id) || null;
  }
  _lsUpsert(key, item) {
    const list = this._lsGet(key);
    const idx  = list.findIndex(x => x.id === item.id);
    if (idx >= 0) list[idx] = item; else list.push(item);
    this._lsSet(key, list);
  }
  _lsDelete(key, id) {
    const list = this._lsGet(key).filter(x => x.id !== id);
    this._lsSet(key, list);
  }

  // ── IndexedDB transaction helpers ──
  _tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      try {
        const tx  = this.db.transaction(store, mode);
        const obj = tx.objectStore(store);
        const req = fn(obj);
        tx.oncomplete = () => resolve(req ? req.result : true);
        tx.onerror    = (e) => reject(e.target.error);
      } catch (err) { reject(err); }
    });
  }

  _getAll(store) {
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  _getByIndex(store, indexName, value) {
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(store, 'readonly');
        const req = tx.objectStore(store).index(indexName).get(value);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  _getAllByIndex(store, indexName, value) {
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(store, 'readonly');
        const req = tx.objectStore(store).index(indexName).getAll(value);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  _cloudSync(promise) {
    if (!promise) return Promise.resolve();
    return Promise.race([
      promise.catch(err => console.warn('[YGS] Cloud sync error:', err)),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }

  // ──────────────────────────────────────────
  //  USER OPERATIONS
  // ──────────────────────────────────────────
  async saveUser(userData) {
    if (!userData.id) userData.id = 'USR-' + Date.now();
    userData.email = (userData.email || '').trim().toLowerCase();

    // Local
    const lsKey = userData.role === 'TEACHER' ? 'ygs_teachers'
                : userData.role === 'STUDENT'  ? 'ygs_students'
                : 'ygs_admins';
    this._lsUpsert(lsKey, userData);
    if (this._dbReady && this.db) {
      try { await this._tx('users', 'readwrite', s => s.put(userData)); } catch {}
    }

    // Cloud Firestore (1500ms max timeout so UI never hangs)
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('users').doc(userData.id).set(userData, { merge: true }));
    }
    return userData;
  }

  async getUserById(id) {
    // Cloud
    if (this.firestore) {
      try {
        const doc = await this._cloudSync(this.firestore.collection('users').doc(id).get());
        if (doc && doc.exists) return doc.data();
      } catch (err) {
        console.warn('[YGS] Cloud getUserById error:', err);
      }
    }

    // Local
    if (this._dbReady && this.db) {
      try {
        const result = await new Promise((resolve) => {
          const tx  = this.db.transaction('users', 'readonly');
          const req = tx.objectStore('users').get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror   = () => resolve(null);
        });
        if (result) return result;
      } catch {}
    }
    const all = [
      ...this._lsGet('ygs_students'),
      ...this._lsGet('ygs_teachers'),
      ...this._lsGet('ygs_admins'),
    ];
    return all.find(x => x.id === id) || null;
  }

  async getUserByEmail(email) {
    const clean = (email || '').trim().toLowerCase();
    
    // Cloud
    if (this.firestore) {
      try {
        const snapshot = await this._cloudSync(this.firestore.collection('users').where('email', '==', clean).limit(1).get());
        if (snapshot && !snapshot.empty) return snapshot.docs[0].data();
      } catch (err) {
        console.warn('[YGS] Cloud getUserByEmail error:', err);
      }
    }

    // Local
    if (this._dbReady && this.db) {
      try {
        const result = await this._getByIndex('users', 'email', clean);
        if (result) return result;
      } catch {}
    }
    const all = [
      ...this._lsGet('ygs_students'),
      ...this._lsGet('ygs_teachers'),
      ...this._lsGet('ygs_admins'),
    ];
    return all.find(x => (x.email || '').trim().toLowerCase() === clean) || null;
  }

  async getAllUsersByRole(role) {
    const lsKey = role === 'TEACHER' ? 'ygs_teachers'
                : role === 'STUDENT'  ? 'ygs_students'
                : 'ygs_admins';

    return this._swr(
      lsKey, 
      'users', 
      () => this.firestore.collection('users').where('role', '==', role).get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }), 
      role.toLowerCase() + 's'
    );
  }

  async getAllStudents() { return this.getAllUsersByRole('STUDENT'); }
  async getAllTeachers() { return this.getAllUsersByRole('TEACHER'); }

  async deleteUser(id) {
    // Local
    ['ygs_students','ygs_teachers','ygs_admins'].forEach(k => this._lsDelete(k, id));
    if (this._dbReady && this.db) {
      try { await this._tx('users', 'readwrite', s => s.delete(id)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('users').doc(id).delete());
    }
  }

  async authenticateUser(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass  = (password || '').trim();
    const user = await this.getUserByEmail(cleanEmail);
    if (!user)                         return { success: false, error: 'NOT_FOUND' };
    if ((user.password||'').trim() !== cleanPass) return { success: false, error: 'WRONG_PASSWORD' };
    if (user.status === 'DEACTIVATED') return { success: false, error: 'DEACTIVATED' };
    if (user.status === 'PENDING')     return { success: false, error: 'PENDING' };
    return { success: true, user };
  }

  // ──────────────────────────────────────────
  //  BATCH / CLASS OPERATIONS
  // ──────────────────────────────────────────
  async getAllBatches() {
    return this._swr(
      'ygs_batches',
      'batches',
      () => this.firestore.collection('batches').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'batches'
    );
  }

  async saveBatch(batchData) {
    if (!batchData.id) batchData.id = 'BCH-' + Date.now();
    
    // Local
    this._lsUpsert('ygs_batches', batchData);
    if (this._dbReady && this.db) {
      try { await this._tx('batches', 'readwrite', s => s.put(batchData)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('batches').doc(batchData.id).set(batchData, { merge: true }));
    }
    return batchData;
  }

  async deleteBatch(id) {
    // Local
    this._lsDelete('ygs_batches', id);
    if (this._dbReady && this.db) {
      try { await this._tx('batches', 'readwrite', s => s.delete(id)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('batches').doc(id).delete());
    }
  }

  // ──────────────────────────────────────────
  //  ASSIGNMENT / HOMEWORK OPERATIONS
  // ──────────────────────────────────────────
  async getAllAssignments() {
    return this._swr(
      'ygs_assignments',
      'assignments',
      () => this.firestore.collection('assignments').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'assignments'
    );
  }

  async getAssignmentById(id) {
    // Cloud
    if (this.firestore) {
      try {
        const doc = await this._cloudSync(this.firestore.collection('assignments').doc(id).get());
        if (doc && doc.exists) return doc.data();
      } catch (err) {
        console.warn('[YGS] Cloud getAssignmentById error:', err);
      }
    }

    // Local
    if (this._dbReady && this.db) {
      try {
        const result = await new Promise((resolve) => {
          const tx  = this.db.transaction('assignments', 'readonly');
          const req = tx.objectStore('assignments').get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror   = () => resolve(null);
        });
        if (result) return result;
      } catch {}
    }
    return this._lsGetItem('ygs_assignments', id);
  }

  async saveAssignment(data) {
    if (!data.id) data.id = 'HW-' + Date.now();
    
    // Local
    this._lsUpsert('ygs_assignments', data);
    if (this._dbReady && this.db) {
      try { await this._tx('assignments', 'readwrite', s => s.put(data)); } catch {}
    }

    // Cloud (1500ms max timeout so large Base64 files never block UI)
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('assignments').doc(data.id).set(data, { merge: true }));
    }
    return data;
  }

  async deleteAssignment(id) {
    // Local
    this._lsDelete('ygs_assignments', id);
    if (this._dbReady && this.db) {
      try { await this._tx('assignments', 'readwrite', s => s.delete(id)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('assignments').doc(id).delete());
    }
  }

  // ──────────────────────────────────────────
  //  COURSE OPERATIONS
  // ──────────────────────────────────────────
  async getAllCourses() {
    // Local
    return this._swr(
      'ygs_courses',
      'courses',
      () => this.firestore.collection('courses').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'courses'
    );
  }

  async saveCourse(courseData) {
    if (!courseData.id) courseData.id = 'CRS-' + Date.now();
    
    // Local
    this._lsUpsert('ygs_courses', courseData);
    if (this._dbReady && this.db) {
      try { await this._tx('courses', 'readwrite', s => s.put(courseData)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('courses').doc(courseData.id).set(courseData, { merge: true }));
    }
    return courseData;
  }

  // ──────────────────────────────────────────
  //  ATTENDANCE OPERATIONS
  // ──────────────────────────────────────────
  async saveAttendance(rec) {
    if (!rec.id) rec.id = 'ATT-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // Local
    this._lsUpsert('ygs_attendance', rec);
    if (this._dbReady && this.db) {
      try { await this._tx('attendance', 'readwrite', s => s.put(rec)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('attendance').doc(rec.id).set(rec, { merge: true }));
    }
    return rec;
  }

  async getAllAttendance() {
    return this._swr(
      'ygs_attendance',
      'attendance',
      () => this.firestore.collection('attendance').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'attendance'
    );
  }

  async getAttendanceForStudent(studentEmailOrId) {
    const all = await this.getAllAttendance();
    const clean = (studentEmailOrId || '').trim().toLowerCase();
    return all.filter(a => (a.studentId === studentEmailOrId) || ((a.studentEmail || '').trim().toLowerCase() === clean));
  }

  async deleteAttendance(id) {
    // Local
    this._lsDelete('ygs_attendance', id);
    if (this._dbReady && this.db) {
      try { await this._tx('attendance', 'readwrite', s => s.delete(id)); } catch {}
    }

    // Cloud
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('attendance').doc(id).delete());
    }
  }

  // ──────────────────────────────────────────
  //  OFF DAYS OPERATIONS (CLOUD SYNCHRONIZED)
  // ──────────────────────────────────────────
  async saveOffDay(ds, record) {
    const local = JSON.parse(localStorage.getItem('ygs_off_days') || '{}');
    local[ds] = record;
    localStorage.setItem('ygs_off_days', JSON.stringify(local));

    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('off_days').doc(ds).set(record));
    }
  }

  async deleteOffDay(ds) {
    const local = JSON.parse(localStorage.getItem('ygs_off_days') || '{}');
    delete local[ds];
    localStorage.setItem('ygs_off_days', JSON.stringify(local));

    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('off_days').doc(ds).delete());
    }
  }

  // ──────────────────────────────────────────
  //  TIMETABLE VOTING POLLS (Requirement #1.2)
  // ──────────────────────────────────────────
  async getAllPolls() {
    return this._swr(
      'ygs_polls',
      'polls',
      () => this.firestore.collection('polls').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'polls'
    );
  }

  async savePoll(poll) {
    if (!poll.id) poll.id = 'POL-' + Date.now();
    this._lsUpsert('ygs_polls', poll);
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('polls').doc(poll.id).set(poll, { merge: true }));
    }
    return poll;
  }

  async deletePoll(id) {
    this._lsDelete('ygs_polls', id);
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('polls').doc(id).delete());
    }
  }

  // ──────────────────────────────────────────
  //  STUDY EXERCISES (Requirement #2.2)
  // ──────────────────────────────────────────
  async getAllExercises() {
    return this._swr(
      'ygs_exercises',
      'exercises',
      () => this.firestore.collection('exercises').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'exercises'
    );
  }

  async saveExercise(ex) {
    if (!ex.id) ex.id = 'EX-' + Date.now();
    this._lsUpsert('ygs_exercises', ex);
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('exercises').doc(ex.id).set(ex, { merge: true }));
    }
    return ex;
  }

  // ──────────────────────────────────────────
  //  LEAVE REQUESTS (Requirement #3.1)
  // ──────────────────────────────────────────
  async getAllLeaves() {
    return this._swr(
      'ygs_leaves',
      'leaves',
      () => this.firestore.collection('leaves').get().then(snapshot => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        return list;
      }),
      'leaves'
    );
  }

  async saveLeave(leave) {
    if (!leave.id) leave.id = 'LV-' + Date.now();
    this._lsUpsert('ygs_leaves', leave);
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('leaves').doc(leave.id).set(leave, { merge: true }));
    }
    return leave;
  }

  async deleteLeave(id) {
    this._lsDelete('ygs_leaves', id);
    if (this.firestore) {
      await this._cloudSync(this.firestore.collection('leaves').doc(id).delete());
    }
  }
}

// Global singleton
const ygsDB = new YGSDatabase();
window.ygsDB = ygsDB;
