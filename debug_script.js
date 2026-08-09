
'use strict';

// ── STATE ────────────────────────────────────────────────────────────
let _student   = null;
let _viewer    = null;   // logged-in user (teacher / admin)
let _isEditor  = false;  // teacher or admin can edit
let _calYear   = new Date().getFullYear();
let _calMonth  = new Date().getMonth(); // 0-indexed
let _attMap    = {};     // { 'YYYY-MM-DD': record }
let _offDays   = {};     // { 'YYYY-MM-DD': { date, markedBy } }
let _assignments = [];
let _exercises = [];
let _pickerDate = null;
let _myBatch    = null; // Global batch reference for timetable-aligned calendar
let _batchesList = [];  // Global active batches reference

// ── INIT ─────────────────────────────────────────────────────────────
async function init() {
  showPgLoader();

  // Safety net: Guarantee loader hides within 2000ms max under any network conditions
  const safetyTimeout = setTimeout(() => {
    hidePgLoader();
  }, 2000);

  try {
    // Auth check (checks both sessionStorage and localStorage)
    const role = sessionStorage.getItem('ygs_role') || localStorage.getItem('ygs_role');
    const viewerStr = sessionStorage.getItem('ygs_user') || localStorage.getItem('ygs_user');
    if (!role || !viewerStr) {
      hidePgLoader();
      clearTimeout(safetyTimeout);
      document.body.innerHTML = `<div class="not-auth">
        <h2>Access Denied</h2>
        <p>You must be logged in as a Teacher or Admin to view student profiles.</p>
        <a href="portal.html" class="back-home"><i class="fa-solid fa-arrow-left"></i> Go to Portal Login</a>
      </div>`;
      return;
    }
    _viewer   = JSON.parse(viewerStr);
    _isEditor = (role === 'TEACHER' || role === 'ADMIN');

    // Show/hide edit-only elements
    if (!_isEditor) {
      document.getElementById('offDayBtn').style.display = 'none';
    } else {
      document.getElementById('offDayBtn').style.display = '';
    }

    // Load student ID from URL search params, sessionStorage, or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    let studentId = urlParams.get('id') ||
                    sessionStorage.getItem('ygs_profileStudentId') ||
                    localStorage.getItem('ygs_profileStudentId');
    let allStudents = [];
    try { allStudents = JSON.parse(localStorage.getItem('ygs_students') || '[]'); } catch(_) {}

    if (!studentId) {
      if (_viewer && _viewer.role === 'STUDENT') {
        studentId = _viewer.id;
      } else if (allStudents.length > 0) {
        studentId = allStudents[0].id;
      } else {
        studentId = 'STU-001';
      }
      sessionStorage.setItem('ygs_profileStudentId', studentId);
    }

    // Synchronous resolution (0ms delay!)
    _student = loadStudentByIdSync(studentId, allStudents);

    // Render Header IMMEDIATELY (0ms delay!)
    renderHeader();

    // Load batch visual schedule
    if (_student && _student.batch) {
      let batches = [];
      try {
        batches = await Promise.race([
          ygsDB.getAllBatches(),
          new Promise(r => setTimeout(() => r([]), 600))
        ]);
      } catch(_) {
        batches = JSON.parse(localStorage.getItem('ygs_batches') || '[]');
      }
      _batchesList = batches;
      const myBatch = batches.find(b => b.batchNumber === _student.batch);
      if (myBatch) {
        _myBatch = myBatch; // Save globally
        document.getElementById('studentTimetableCard').style.display = 'block';
        document.getElementById('studentTimetableBox').innerHTML = renderVisualTimetableHTML(myBatch.scheduleData || myBatch.schedule, myBatch.timezone);
      } else {
        _myBatch = null;
        document.getElementById('studentTimetableCard').style.display = 'none';
      }
    } else {
      _myBatch = null;
      document.getElementById('studentTimetableCard').style.display = 'none';
    }

    // Load off days
    try { _offDays = JSON.parse(localStorage.getItem('ygs_off_days') || '{}'); } catch(_) { _offDays = {}; }

    // Load data in parallel
    await Promise.all([
      loadAttendance(),
      loadAssignments(),
      loadExercises()
    ]);

    // Render initial tab (preserving active tab across student switches)
    const savedTab = sessionStorage.getItem('ygs_activeTab') || 'attendance';
    switchTab(savedTab);
    updateKpiMini();
    updateBatchCarouselRoster();

  } catch(err) {
    console.error('[YGS Profile] Init error:', err);
  } finally {
    clearTimeout(safetyTimeout);
    hidePgLoader();
  }
}

function showNotFound(msg) {
  hidePgLoader();
  document.querySelector('.main').innerHTML = `<div class="not-auth">
    <h2><i class="fa-solid fa-user-xmark"></i> Not Found</h2>
    <p>${msg}</p>
    <a href="portal.html" class="back-home"><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</a>
  </div>`;
}

function loadStudentByIdSync(id, preloadedStudents = []) {
  let all = preloadedStudents;
  if (!all || !all.length) {
    try { all = JSON.parse(localStorage.getItem('ygs_students') || '[]'); } catch(_) {}
  }
  if (id) {
    const s = all.find(x => x.id === id);
    if (s) return s;
  }
  if (all.length > 0) return all[0];

  // Guaranteed fallback student record so page NEVER renders blank or stuck
  return {
    id: 'STU-001',
    fullName: 'Hargun Das',
    email: 'hargun@gmail.com',
    role: 'STUDENT',
    course: 'German A1 - Foundational',
    batch: 'YGS-A1-2026-01',
    teacher: 'Frau Schmidt',
    status: 'APPROVED',
    attendance: '100%',
    teacherRemark: 'Excellent progress'
  };
}

async function loadStudentById(id) {
  const localSync = loadStudentByIdSync(id);
  try {
    const cloudStudent = await Promise.race([
      ygsDB.getUserById(id),
      new Promise(r => setTimeout(() => r(null), 600))
    ]);
    if (cloudStudent) return cloudStudent;
  } catch(_) {}
  return localSync;
}

// ── HEADER ───────────────────────────────────────────────────────────
function renderHeader() {
  if (!_student) return;
  document.getElementById('spName').textContent = getCleanName(_student);
  document.getElementById('spEmail').textContent = _student.email || '';
  document.getElementById('spAvatar').textContent = getInitials(getCleanName(_student));
  document.getElementById('spCourseTag').textContent = _student.course || 'German Foundational';

  const tags = [
    { text: _student.batch || 'Unassigned Batch', cls: '' },
    { text: 'Teacher: ' + (_student.teacher || 'Not Assigned'), cls: 'navy' }
  ];

  document.getElementById('studentTags').innerHTML = tags.map(t =>
    `<span class="tag ${t.cls || ''}">${t.text}</span>`
  ).join('');

  if (_isEditor) {
    const switcherContainer = document.getElementById('studentSwitcherContainer');
    const switcherSelect = document.getElementById('studentSwitcherSelect');
    if (switcherContainer && switcherSelect) {
      switcherContainer.style.display = 'inline-flex';
      let students = [];
      try { students = JSON.parse(localStorage.getItem('ygs_students') || '[]'); } catch(_) {}
      const teacherCourse = _viewer.assignedCourse || '';
      const filtered = _viewer.role === 'ADMIN' ? students : students.filter(s => s.course === teacherCourse || s.teacher === _viewer.fullName);
      
      switcherSelect.innerHTML = (filtered.length ? filtered : [_student]).map(s => `
        <option value="${s.id}" ${s.id === _student.id ? 'selected' : ''}>${getCleanName(s)} (${s.batch || 'Unassigned'})</option>
      `).join('');
    }
  }
}

// ── BATCH CAROUSEL ROSTER NAVIGATOR ────────────────────────────────────
let _batchStudents = [];
let _currentBatchIdx = -1;

function updateBatchCarouselRoster() {
  if (!_student || !_isEditor) {
    const el = document.getElementById('batchCarouselNav');
    if (el) el.style.display = 'none';
    return;
  }

  let allStudents = [];
  try { allStudents = JSON.parse(localStorage.getItem('ygs_students') || '[]'); } catch(_) {}

  const batchNum = _student.batch || '';
  let filtered = [];

  if (batchNum) {
    filtered = allStudents.filter(s => s.batch === batchNum);
  }

  if (filtered.length <= 1) {
    const course = _student.course || '';
    filtered = allStudents.filter(s => s.course === course);
  }

  if (filtered.length <= 1) {
    filtered = allStudents;
  }

  // Ensure active student is present in list
  if (!filtered.some(s => s.id === _student.id)) {
    filtered.unshift(_student);
  }

  _batchStudents = filtered;
  _currentBatchIdx = filtered.findIndex(s => s.id === _student.id);

  const prevBtn = document.getElementById('carouselPrevBtn');
  const nextBtn = document.getElementById('carouselNextBtn');
  const sel = document.getElementById('carouselStudentSelect');
  const badge = document.getElementById('carouselPosBadge');
  const navContainer = document.getElementById('batchCarouselNav');

  if (navContainer && filtered.length > 1) {
    navContainer.style.display = 'block';

    if (prevBtn) {
      prevBtn.disabled = (_currentBatchIdx <= 0);
      prevBtn.style.opacity = (_currentBatchIdx <= 0) ? '0.4' : '1';
      prevBtn.style.cursor = (_currentBatchIdx <= 0) ? 'not-allowed' : 'pointer';
    }

    if (nextBtn) {
      nextBtn.disabled = (_currentBatchIdx >= filtered.length - 1);
      nextBtn.style.opacity = (_currentBatchIdx >= filtered.length - 1) ? '0.4' : '1';
      nextBtn.style.cursor = (_currentBatchIdx >= filtered.length - 1) ? 'not-allowed' : 'pointer';
    }

    if (sel) {
      sel.innerHTML = filtered.map(s => `
        <option value="${s.id}" ${s.id === _student.id ? 'selected' : ''}>
          ${getCleanName(s)} (${s.batch || 'Unassigned'})
        </option>
      `).join('');
    }

    if (badge) {
      badge.textContent = `Student ${_currentBatchIdx + 1} of ${filtered.length} (${batchNum || 'Roster'})`;
    }
  } else if (navContainer) {
    navContainer.style.display = 'none';
  }
}

function navigateBatchStudent(direction) {
  if (!_batchStudents.length || _currentBatchIdx < 0) return;
  const newIdx = _currentBatchIdx + direction;
  if (newIdx >= 0 && newIdx < _batchStudents.length) {
    switchActiveStudent(_batchStudents[newIdx].id);
  }
}

async function switchActiveStudent(newId) {
  if (!newId || (_student && newId === _student.id)) return;
  
  // Save active tab before switching student
  if (typeof _activeTab !== 'undefined' && _activeTab) {
    sessionStorage.setItem('ygs_activeTab', _activeTab);
  }

  sessionStorage.setItem('ygs_profileStudentId', newId);
  showPgLoader();
  await init();

  // Restore saved active tab
  const savedTab = sessionStorage.getItem('ygs_activeTab');
  if (savedTab) switchTab(savedTab);
}

function updateKpiMini() {
  const rateStr = calculateStudentAttendanceRate(_student, _batchesList, Object.values(_attMap), _offDays);
  const rateVal = parseInt(rateStr) || 0;

  const totalHW = _assignments.length;
  let submittedHW = 0, totObt = 0, totPoss = 0;
  _assignments.forEach(a => {
    const sub = ((a.submissions || {})[_student.id] || {});
    if (sub.status === 'Submitted') submittedHW++;
    if (sub.marksObtained !== undefined && sub.totalMarks) { totObt += +sub.marksObtained; totPoss += +sub.totalMarks; }
  });
  const avgMark = totPoss > 0 ? Math.round(totObt / totPoss * 100) : 0;

  // Compute total absences for absence limit system
  let totalAbsences = 0;
  Object.values(_attMap).forEach(rec => {
    if (rec.status === 'Absent') totalAbsences++;
  });

  const isPerformanceGood = avgMark >= 85;
  const allowedAbsenceLimit = isPerformanceGood ? 6 : 4;
  const isOverLimit = totalAbsences > allowedAbsenceLimit;

  document.getElementById('kpiMini').innerHTML = `
    <div class="kpi-mini-item">
      <div class="kmi-val" style="color:${rateVal>=75?'#86efac':'#fca5a5'};">${rateStr}</div>
      <div class="kmi-lbl">Attendance</div>
    </div>
    <div class="kpi-mini-item" title="Base limit: 4. Bonus +2 granted if Avg Marks >= 85%">
      <div class="kmi-val" style="color:${isOverLimit ? '#fca5a5' : isPerformanceGood ? '#93c5fd' : '#fcd34d'};">
        ${totalAbsences}/${allowedAbsenceLimit}
      </div>
      <div class="kmi-lbl">Absence Limit ${isPerformanceGood ? '(+2 Bonus)' : ''}</div>
    </div>
    <div class="kpi-mini-item">
      <div class="kmi-val">${submittedHW}/${totalHW}</div>
      <div class="kmi-lbl">HW Done</div>
    </div>
    <div class="kpi-mini-item">
      <div class="kmi-val" style="color:${avgMark>=75?'#86efac':avgMark>=50?'#fcd34d':'#fca5a5'};">${avgMark}%</div>
      <div class="kmi-lbl">Avg Marks</div>
    </div>
  `;
}

// ── DATA LOADERS ─────────────────────────────────────────────────────
function normalizeDateStr(dStr) {
  if (!dStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr; // already YYYY-MM-DD
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return dStr;
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

async function loadAttendance() {
  let records = [];
  try {
    records = await Promise.race([
      ygsDB.getAttendanceForStudent(_student.email),
      new Promise(r => setTimeout(() => r([]), 800))
    ]);
  } catch(_) {}
  if (!records.length) {
    const all = JSON.parse(localStorage.getItem('ygs_attendance') || '[]');
    records = all.filter(a =>
      (a.studentEmail || '').toLowerCase() === (_student.email || '').toLowerCase() ||
      a.studentId === _student.id
    );
  }
  _attMap = {};
  records.forEach(r => {
    if (r.date) {
      const norm = normalizeDateStr(r.date);
      _attMap[norm] = r;
    }
  });
}

async function loadAssignments() {
  let all = [];
  try {
    all = await Promise.race([ygsDB.getAllAssignments(), new Promise(r => setTimeout(() => r([]), 800))]);
  } catch(_) {}
  if (!all.length) all = JSON.parse(localStorage.getItem('ygs_assignments') || '[]');
  _assignments = _student.course ? all.filter(a => a.course === _student.course) : all;
}

async function loadExercises() {
  let all = [];
  try {
    all = await Promise.race([ygsDB.getAllExercises(), new Promise(r => setTimeout(() => r([]), 800))]);
  } catch(_) {}
  if (!all.length) all = JSON.parse(localStorage.getItem('ygs_exercises') || '[]');
  
  if (all.length === 0) {
    const seed = [];
    const levels = ['A1', 'A2', 'B1', 'B2'];
    levels.forEach(lvl => {
      const levelTitle = lvl === 'A1' ? 'German A1 - Foundational'
                      : lvl === 'A2' ? 'German A2 - Elementary'
                      : lvl === 'B1' ? 'German B1 - Intermediate'
                      : 'German B2 - Advanced Professional';
      for (let i = 1; i <= 10; i++) {
        seed.push({
          id: `EX-${lvl}-${i}`,
          title: `Exercise ${i}: German Level ${lvl} Core Workbook Worksheet`,
          level: lvl,
          courseName: levelTitle,
          classMilestone: i,
          createdAt: new Date().toISOString()
        });
      }
    });
    for (const ex of seed) {
      await ygsDB.saveExercise(ex).catch(() => {});
    }
    localStorage.setItem('ygs_exercises', JSON.stringify(seed));
    all = seed;
  }

  const code = (_student.course || '').includes('A1') ? 'A1'
             : (_student.course || '').includes('A2') ? 'A2'
             : (_student.course || '').includes('B1') ? 'B1'
             : (_student.course || '').includes('B2') ? 'B2'
             : 'A1';
  _exercises = all.filter(ex => ex.level === code);
}

function renderExercises() {
  const container = document.getElementById('exList');
  if (!_exercises.length) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--muted);">No exercises configured for this course.</div>';
    return;
  }

  const completedClassesCount = Object.values(_attMap).filter(a => a.status === 'Present' || a.status === 'Absent' || a.status === 'Late').length;

  container.innerHTML = _exercises.map(ex => {
    const isMilestonePassed = completedClassesCount >= ex.classMilestone;
    const isManuallyUnlocked = (_student.unlockedExercises || []).includes(ex.id);
    const isUnlocked = isMilestonePassed || isManuallyUnlocked;
    
    let badgeHtml = '';
    let btnHtml = '';
    
    if (isUnlocked) {
      badgeHtml = `<span class="badge badge-green" style="font-weight:700;"><i class="fa-solid fa-lock-open"></i> Unlocked</span>`;
      btnHtml = `<button onclick="window.open('https://www.learninggerman.com/exercises/${ex.id}', '_blank')" class="btn btn-navy" style="font-size:11px; padding:6px 12px; width:auto; border-radius:6px; cursor:pointer;"><i class="fa-solid fa-file-pdf"></i> Open Worksheet</button>`;
    } else {
      badgeHtml = `<span class="badge badge-red" style="font-weight:700; background:#fca5a5; color:#991b1b;"><i class="fa-solid fa-lock"></i> Locked</span>`;
      btnHtml = `<span style="font-size:11px; color:var(--muted); font-style:italic;">Requires class #${ex.classMilestone} completed (Current: ${completedClassesCount}/${ex.classMilestone})</span>`;
    }
    
    let teacherOverrideHtml = '';
    if (_isEditor) {
      teacherOverrideHtml = `
        <div style="margin-left:auto; display:flex; align-items:center; gap:6px;">
          <label style="font-size:11px; font-weight:700; cursor:pointer; color:var(--navy); display:inline-flex; align-items:center; gap:4px; margin:0;">
            <input type="checkbox" onchange="toggleExerciseManualUnlock('${ex.id}', this.checked)" ${isManuallyUnlocked ? 'checked' : ''}>
            Bypass Lock
          </label>
        </div>
      `;
    }
    
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:var(--bg-section); border:1px solid var(--border-subtle); padding:12px; border-radius:8px; opacity: ${isUnlocked ? '1' : '0.85'};">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-weight:700; font-size:13px; color:var(--navy-dark);">${ex.title}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${badgeHtml}
            <span style="font-size:11px; color:var(--muted);">Milestone: Class #${ex.classMilestone}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; margin-left:auto;">
          ${btnHtml}
          ${teacherOverrideHtml}
        </div>
      </div>
    `;
  }).join('');
}

async function toggleExerciseManualUnlock(exId, checked) {
  if (!_student.unlockedExercises) _student.unlockedExercises = [];
  if (checked) {
    if (!_student.unlockedExercises.includes(exId)) _student.unlockedExercises.push(exId);
  } else {
    _student.unlockedExercises = _student.unlockedExercises.filter(id => id !== exId);
  }
  
  try {
    await ygsDB.saveUser(_student);
    const students = JSON.parse(localStorage.getItem('ygs_students') || '[]');
    const idx = students.findIndex(s => s.id === _student.id);
    if (idx >= 0) {
      students[idx] = _student;
      localStorage.setItem('ygs_students', JSON.stringify(students));
    }
  } catch (err) {
    console.warn('Failed to toggle override:', err);
  }
  
  renderExercises();
}

let _activeTab = 'attendance';

function switchTab(tab) {
  _activeTab = tab;
  sessionStorage.setItem('ygs_activeTab', tab);
  ['attendance', 'homework', 'performance', 'exercises'].forEach(t => {
    const btn = document.getElementById('tab' + cap(t));
    const pnl = document.getElementById('panel' + cap(t));
    if (btn) btn.classList.toggle('active', t === tab);
    if (pnl) pnl.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'homework')    renderHomework();
  if (tab === 'performance') renderPerformance();
  if (tab === 'exercises')   renderExercises();
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ══════════════════════════════════════════════════════════════════════
//  ATTENDANCE CALENDAR
// ══════════════════════════════════════════════════════════════════════
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function dateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function isPastDate(date) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return d.getTime() < today.getTime();
}

function isTodayClassMissed(date) {
  const today = new Date();
  const d = new Date(date);
  if (d.getFullYear() !== today.getFullYear() || d.getMonth() !== today.getMonth() || d.getDate() !== today.getDate()) {
    return false;
  }
  if (!_myBatch) return false;
  let sched = _myBatch.scheduleData || _myBatch.schedule;
  if (typeof sched === 'string' && sched.startsWith('{')) {
    try { sched = JSON.parse(sched); } catch(_) {}
  }
  if (sched && sched.days) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowName = daysOfWeek[today.getDay()];
    const dConf = sched.days[dowName];
    if (dConf && dConf.isClass && dConf.time) {
      const timeParts = dConf.time.split(':');
      const schedHours = parseInt(timeParts[0]);
      const schedMins = parseInt(timeParts[1]);
      
      const schedTime = new Date();
      schedTime.setHours(schedHours, schedMins, 0, 0);
      
      // Missed class limit: 60 minutes after start time
      return (today.getTime() - schedTime.getTime()) / (1000 * 60) > 60;
    }
  }
  return false;
}

function calculateStudentAttendanceRate(student, batchesList, attendanceLogs, offDaysList) {
  if (!student.batch) return '100%';
  const batch = batchesList.find(b => b.batchNumber === student.batch);
  if (!batch) return '100%';
  
  const start = batch.createdAt ? new Date(batch.createdAt) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  start.setHours(0,0,0,0);
  const end = new Date();
  end.setHours(23,59,59,999);
  
  const attMap = {};
  attendanceLogs.forEach(l => {
    if (l.date) {
      const norm = normalizeDateStr(l.date);
      attMap[norm] = l;
    }
  });
  
  let totalClassDays = 0;
  let presentDays = 0;
  
  let sched = batch.scheduleData || batch.schedule;
  if (typeof sched === 'string' && sched.startsWith('{')) {
    try { sched = JSON.parse(sched); } catch(_) {}
  }
  
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Clone start date to loop
  let d = new Date(start.getTime());
  while (d <= end) {
    const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    
    let isClass = false;
    if (sched && sched.days) {
      const dowName = daysOfWeek[d.getDay()];
      const dConf = sched.days[dowName];
      isClass = dConf ? dConf.isClass : false;
    } else {
      const dow = d.getDay();
      isClass = dow !== 0 && dow !== 6;
    }
    
    if (isClass && (!offDaysList || !offDaysList[ds])) {
      const log = attMap[ds];
      if (log) {
        if (log.status === 'Present' || log.status === 'Late') {
          presentDays++;
          totalClassDays++;
        } else if (log.status === 'Absent') {
          totalClassDays++;
        }
      } else {
        const today = new Date();
        today.setHours(0,0,0,0);
        const curDate = new Date(d.getTime());
        curDate.setHours(0,0,0,0);
        
        const isPast = curDate.getTime() < today.getTime();
        let isMissedToday = false;
        
        if (curDate.getTime() === today.getTime()) {
          if (sched && sched.days) {
            const dowName = daysOfWeek[today.getDay()];
            const dConf = sched.days[dowName];
            if (dConf && dConf.isClass && dConf.time) {
              const timeParts = dConf.time.split(':');
              const schedHours = parseInt(timeParts[0]);
              const schedMins = parseInt(timeParts[1]);
              const schedTime = new Date();
              schedTime.setHours(schedHours, schedMins, 0, 0);
              isMissedToday = (new Date().getTime() - schedTime.getTime()) / (1000 * 60) > 60;
            }
          }
        }
        
        if (isPast || isMissedToday) {
          totalClassDays++; // Absences count in total
        }
      }
    }
    d.setDate(d.getDate() + 1);
  }
  
  if (totalClassDays === 0) return '100%';
  return Math.round((presentDays / totalClassDays) * 100) + '%';
}

function isBatchClassDayOnDate(date) {
  if (!_myBatch) {
    const dow = date.getDay();
    return dow !== 0 && dow !== 6; // Standard fallback (Mon-Fri are class days)
  }
  let sched = _myBatch.scheduleData || _myBatch.schedule;
  if (typeof sched === 'string' && sched.startsWith('{')) {
    try { sched = JSON.parse(sched); } catch(_) {}
  }
  if (sched && sched.days) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowName = daysOfWeek[date.getDay()];
    const dConf = sched.days[dowName];
    return dConf ? dConf.isClass : false;
  }
  // Text fallback parsing
  const dow = date.getDay();
  const schedStr = String(_myBatch.schedule || '').toLowerCase();
  const dayShorts = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const curShort = dayShorts[dow];
  if (schedStr.includes(curShort)) return true;
  if (schedStr.includes('mon - thu') && dow >= 1 && dow <= 4) return true;
  if (schedStr.includes('mon - fri') && dow >= 1 && dow <= 5) return true;
  return dow !== 0 && dow !== 6;
}

function getStatusClass(ds, date) {
  if (_offDays[ds]) return 'cal-offday';
  if (!isBatchClassDayOnDate(date)) return 'cal-weekend';
  const rec = _attMap[ds];
  if (rec) {
    switch(rec.status) {
      case 'Present': return 'cal-present';
      case 'Absent':  return 'cal-absent';
      case 'Late':    return 'cal-late';
      case 'Off Day': return 'cal-offday';
      default:        return 'cal-none';
    }
  }
  // Auto-absent for past class days or missed classes today
  if (isPastDate(date) || isTodayClassMissed(date)) {
    return 'cal-absent';
  }
  return 'cal-none';
}

function getStatusIcon(ds, date) {
  if (_offDays[ds]) return '⚫';
  if (!isBatchClassDayOnDate(date)) return '—';
  const rec = _attMap[ds];
  if (rec) {
    return { Present:'✓', Absent:'✗', Late:'⏰', 'Off Day':'⚫' }[rec.status] || '';
  }
  // Auto-absent status icon
  if (isPastDate(date) || isTodayClassMissed(date)) {
    return '✗';
  }
  return '';
}

function changeMonth(delta) {
  _calMonth += delta;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  renderCalendar();
}

function isDateWithinBatchBounds(date) {
  if (!_myBatch || !_myBatch.startDate || !_myBatch.endDate) return true;
  const start = new Date(_myBatch.startDate + 'T00:00:00');
  const end = new Date(_myBatch.endDate + 'T23:59:59');
  return date >= start && date <= end;
}

function renderCalendar() {
  const y = _calYear, m = _calMonth;
  document.getElementById('calMonthTitle').textContent = MONTHS[m] + ' ' + y;

  const firstDow  = new Date(y, m, 1).getDay();          // 0=Sun
  const startOff  = (firstDow + 6) % 7;                   // Mon-first offset
  const daysInMo  = new Date(y, m + 1, 0).getDate();

  let html = '';
  let cell = 0;
  for (let row = 0; row < 6; row++) {
    if (cell - startOff >= daysInMo && row >= 4) break;
    html += '<tr>';
    for (let col = 0; col < 7; col++) {
      const day = cell - startOff + 1;
      if (day < 1 || day > daysInMo) {
        html += '<td class="cal-cell cal-empty"><div class="cal-cell-inner"></div></td>';
      } else {
        const ds    = dateStr(y, m, day);
        const date  = new Date(y, m, day);
        const inBounds = isDateWithinBatchBounds(date);
        const cls   = getStatusClass(ds, date) + (inBounds ? '' : ' cal-disabled');
        const icon  = inBounds ? getStatusIcon(ds, date) : '';
        const editable = isBatchClassDayOnDate(date) && _isEditor && inBounds;
        
        const rec = _attMap[ds];
        let recordingHtml = '';
        if (rec && rec.recordingLink) {
          const isExpired = rec.recordingExpiry ? (new Date() > new Date(rec.recordingExpiry)) : false;
          if (!isExpired) {
            recordingHtml = `<div style="margin-top:2px;"><button onclick="event.stopPropagation(); window.open('${rec.recordingLink}', '_blank')" style="font-size:9px; background:#1d4ed8; color:#fff; border:none; padding:2px 4px; border-radius:4px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:2px;"><i class="fa-solid fa-video"></i> Watch</button></div>`;
          } else {
            recordingHtml = `<div style="margin-top:2px; font-size:8px; color:var(--muted); font-style:italic;">Expired</div>`;
          }
        }

        html += `<td class="cal-cell ${cls}" ${editable ? `onclick="openPicker('${ds}',event)"` : ''} ${!inBounds ? 'style="opacity:0.35; background:#f1f5f9; cursor:not-allowed;"' : ''}>
          <div class="cal-cell-inner">
            <span class="cal-num">${day}</span>
            <span class="cal-icon">${icon}</span>
            ${recordingHtml}
          </div>
        </td>`;
      }
      cell++;
    }
    html += '</tr>';
  }
  document.getElementById('calBody').innerHTML = html;
  calcStats(y, m, daysInMo);
}

function calcStats(y, m, daysInMo) {
  let total=0, present=0, absent=0, late=0, offday=0;
  for (let d = 1; d <= daysInMo; d++) {
    const ds   = dateStr(y, m, d);
    const date = new Date(y, m, d);
    if (!isBatchClassDayOnDate(date)) continue;
    if (_offDays[ds]) { offday++; continue; }
    total++;
    const rec = _attMap[ds];
    if (!rec) continue;
    if (rec.status === 'Present')  present++;
    else if (rec.status === 'Absent')  absent++;
    else if (rec.status === 'Late')  { late++; present++; }
    else if (rec.status === 'Off Day') { offday++; total--; }
  }
  const rate = total > 0 ? Math.round(present / total * 100) : 100;
  document.getElementById('st-total').textContent   = total;
  document.getElementById('st-present').textContent = present;
  document.getElementById('st-absent').textContent  = absent;
  document.getElementById('st-late').textContent    = late;
  document.getElementById('st-offday').textContent  = offday;
  const rateEl = document.getElementById('st-rate');
  rateEl.textContent = rate + '%';
  rateEl.style.color = rate >= 75 ? 'var(--green)' : rate >= 60 ? 'var(--yellow)' : 'var(--red)';
}

// ── STATUS PICKER ────────────────────────────────────────────────────
function openPicker(ds, event) {
  event.stopPropagation();
  _pickerDate = ds;
  const picker = document.getElementById('statusPicker');
  const rect   = event.currentTarget.getBoundingClientRect();
  picker.style.display = 'block';
  
  // Position picker near clicked cell, keeping it in viewport
  const pickerHeight = picker.offsetHeight || 240;
  const pickerWidth = picker.offsetWidth || 230;
  
  let top = rect.bottom + window.scrollY + 4;
  
  // Check if it overflows the bottom of the visible screen
  const viewportBottom = window.scrollY + window.innerHeight;
  if (top + pickerHeight > viewportBottom) {
    // Show above the cell instead
    top = rect.top + window.scrollY - pickerHeight - 4;
  }
  
  let left = rect.left + window.scrollX;
  if (left + pickerWidth > window.innerWidth) {
    left = window.innerWidth - pickerWidth - 20;
  }
  if (left < 0) left = 10;
  
  picker.style.top  = top + 'px';
  picker.style.left = left + 'px';
}
function closePicker() {
  document.getElementById('statusPicker').style.display = 'none';
  _pickerDate = null;
}

function openRecordingLinkModal() {
  if (!_pickerDate) return;
  const pickerDateBackup = _pickerDate;
  document.getElementById('statusPicker').style.display = 'none';
  _pickerDate = pickerDateBackup;
  
  const rec = _attMap[pickerDateBackup];
  document.getElementById('recModalUrl').value = (rec && rec.recordingLink) ? rec.recordingLink : '';
  document.getElementById('recModalExpiryDays').value = 5;
  document.getElementById('recordingLinkModal').style.display = 'flex';
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

async function submitRecordingLink(e) {
  e.preventDefault();
  if (!_pickerDate) { alert('No date selected.'); return; }
  const ds = _pickerDate;
  const url = document.getElementById('recModalUrl').value.trim();
  const days = parseInt(document.getElementById('recModalExpiryDays').value) || 5;
  
  const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  
  let rec = _attMap[ds];
  if (!rec) {
    rec = {
      id: 'ATT-' + Date.now(),
      studentId: _student.id,
      studentEmail: _student.email,
      date: ds,
      status: 'Off Day',
      markedBy: (_viewer ? _viewer.fullName : 'Teacher') || 'Teacher',
      at: new Date().toISOString()
    };
  }
  
  rec.recordingLink = url;
  rec.recordingExpiry = expiry;
  _attMap[ds] = rec;
  
  try {
    await ygsDB.saveAttendance(rec);
    const ls = JSON.parse(localStorage.getItem('ygs_attendance') || '[]');
    const idx = ls.findIndex(a => a.id === rec.id);
    if (idx >= 0) ls[idx] = rec; else ls.push(rec);
    localStorage.setItem('ygs_attendance', JSON.stringify(ls));
  } catch(err) {
    console.warn('Failed to save recording link:', err);
  }
  
  closeOverlay('recordingLinkModal');
  alert('Class recording link saved successfully!');
  renderCalendar();
}

async function setStatus(status) {
  if (!_pickerDate) return;
  const ds = _pickerDate;
  closePicker();

  if (status === 'clear') {
    // Remove attendance record
    const rec = _attMap[ds];
    if (rec) {
      try { await ygsDB.deleteAttendance(rec.id); } catch(_) {}
      const ls = JSON.parse(localStorage.getItem('ygs_attendance') || '[]');
      localStorage.setItem('ygs_attendance', JSON.stringify(ls.filter(a => a.id !== rec.id)));
      delete _attMap[ds];
    }
    // Also clear off day
    if (_offDays[ds]) {
      delete _offDays[ds];
      try { await ygsDB.deleteOffDay(ds); } catch(_) {}
    }
  } else if (status === 'Off Day') {
    // Mark as teacher off day — applies to all students
    const rec = { date: ds, markedBy: _viewer.email || 'teacher', at: new Date().toISOString() };
    _offDays[ds] = rec;
    try { await ygsDB.saveOffDay(ds, rec); } catch(_) {}
  } else {
    // Save attendance record with deterministic ID (upsert)
    const safeId = (_student.id || '').replace(/[^a-z0-9]/gi, '');
    const safeDt = ds.replace(/-/g, '');
    const rec = {
      id:           'ATT-' + safeId + '-' + safeDt,
      studentId:    _student.id,
      studentName:  _student.fullName || _student.name || '',
      studentEmail: _student.email,
      course:       _student.course || '',
      batch:        _student.batch  || '',
      date:         ds,
      time:         new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }),
      timestamp:    new Date(parseInt(ds.substr(0,4)), parseInt(ds.substr(5,2))-1, parseInt(ds.substr(8,2))).toISOString(),
      status:       status
    };
    try { await ygsDB.saveAttendance(rec); } catch(_) {}
    // Mirror to localStorage
    const ls = JSON.parse(localStorage.getItem('ygs_attendance') || '[]');
    const idx = ls.findIndex(a => a.id === rec.id);
    if (idx >= 0) ls[idx] = rec; else ls.push(rec);
    localStorage.setItem('ygs_attendance', JSON.stringify(ls));
    _attMap[ds] = rec;
  }

  renderCalendar();
  updateKpiMini();
}

async function markOffDayPrompt() {
  const today = new Date();
  const def   = dateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const ds    = prompt('Enter date to mark as Teacher Off Day (YYYY-MM-DD):', def);
  if (!ds || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
    if (ds !== null) alert('Invalid date. Use format YYYY-MM-DD');
    return;
  }
  
  const targetDate = new Date(ds + 'T00:00:00');
  if (!isDateWithinBatchBounds(targetDate)) {
    alert('Error: You cannot mark an off-day outside the active batch timeline (' + (_myBatch.startDate || 'N/A') + ' to ' + (_myBatch.endDate || 'N/A') + ').');
    return;
  }

  const rec = { date: ds, markedBy: _viewer.email || 'teacher', at: new Date().toISOString() };
  _offDays[ds] = rec;
  try { await ygsDB.saveOffDay(ds, rec); } catch(_) {}
  renderCalendar();
  updateKpiMini();
  alert('Teacher Off Day marked for ' + ds + '. This day will appear as ⚫ on all students\' calendars.');
}

// Close picker on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('statusPicker').contains(e.target)) closePicker();
});

// ══════════════════════════════════════════════════════════════════════
//  HOMEWORK & MARKS
// ══════════════════════════════════════════════════════════════════════
function calcGrade(obtained, total) {
  if (obtained === '' || obtained === undefined || obtained === null || !total) return 'N/A';
  const pct = (+obtained / +total) * 100;
  if (pct >= 95) return 'A+';
  if (pct >= 85) return 'A';
  if (pct >= 75) return 'B+';
  if (pct >= 65) return 'B';
  if (pct >= 55) return 'C';
  return 'F';
}
function gradeColor(g) {
  if (g === 'A+' || g === 'A') return '#15803d';
  if (g === 'B+' || g === 'B') return '#1d4ed8';
  if (g === 'C')                return '#d97706';
  if (g === 'F')                return '#dc2626';
  return 'var(--muted)';
}

function renderHomework() {
  const list = document.getElementById('hwList');
  const sumEl = document.getElementById('hwSummary');
  if (!_assignments.length) {
    sumEl.innerHTML = '';
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);"><i class="fa-solid fa-inbox fa-2x"></i><p style="margin-top:10px;font-weight:600;">No homework assigned for this course yet.</p></div>`;
    return;
  }

  let submitted=0, totObt=0, totPoss=0;
  let cardsHtml = '';

  _assignments.forEach(a => {
    const sub      = ((a.submissions || {})[_student.id] || {});
    const isSub    = sub.status === 'Submitted';
    if (isSub) submitted++;
    const obtained = sub.marksObtained !== undefined ? sub.marksObtained : '';
    const total    = sub.totalMarks    || a.totalMarks || 100;
    const grade    = calcGrade(obtained, total);
    const remarks  = sub.remarks || a.teacherRemarks || '';
    if (obtained !== '' && total) { totObt += +obtained; totPoss += +total; }

    const statusBadge = isSub
      ? `<span class="badge badge-green"><i class="fa-solid fa-check"></i> Submitted</span>`
      : `<span class="badge badge-red"><i class="fa-solid fa-xmark"></i> Missing</span>`;

    const gradeDisp = obtained !== '' ? `<div style="font-size:26px;font-weight:800;color:${gradeColor(grade)};margin-top:4px;">${grade}</div>` : '';

    const marksSection = _isEditor ? `
      <div class="marks-form">
        <div class="marks-form-row">
          <div class="fg-sm">
            <label>Marks</label>
            <input type="number" min="0" max="${total}" id="mo_${a.id}" value="${obtained}" placeholder="0"
              style="width:70px;" oninput="liveGrade('${a.id}',${total})">
          </div>
          <div class="fg-sm">
            <label>Out of</label>
            <input type="number" min="1" id="mt_${a.id}" value="${total}" style="width:70px;">
          </div>
          <div class="fg-sm">
            <label>Grade</label>
            <div class="grade-pill" id="gp_${a.id}" style="color:${gradeColor(grade)};">${grade}</div>
          </div>
          <div class="fg-sm" style="flex:1;min-width:200px;">
            <label>Teacher Remarks</label>
            <input type="text" id="rem_${a.id}" value="${escHtml(remarks)}" placeholder="Add feedback…" style="width:100%;">
          </div>
          <button class="save-marks-btn" id="smb_${a.id}" onclick="saveMarks('${a.id}')">
            <i class="fa-solid fa-floppy-disk"></i> Save
          </button>
        </div>
      </div>` : `
      <div class="hw-view-marks">
        <span><strong>Marks:</strong> ${obtained !== '' ? obtained + ' / ' + total : 'Not graded yet'}</span>
        <span><strong>Grade:</strong> <strong style="color:${gradeColor(grade)};">${grade}</strong></span>
        <span><strong>Remarks:</strong> ${remarks || 'No remarks yet'}</span>
      </div>`;

    cardsHtml += `
    <div class="hw-card ${isSub ? 'submitted' : 'missing'}">
      <div class="hw-header">
        <div>
          <div class="hw-title">${escHtml(a.title)}</div>
          <div class="hw-meta">
            <span><i class="fa-solid fa-calendar"></i> Due: <strong>${formatDateTime(a.dueDate) || '—'}</strong></span>
            <span><i class="fa-solid fa-book"></i> ${a.course || ''}</span>
            ${a.attachment ? `
              <span style="margin-left:10px;">
                <button onclick="downloadOrViewAttachment('${a.id}', 'teacher')" class="btn btn-outline" style="font-size:10px; padding:2px 6px; width:auto; border-radius:4px; line-height:1; background:#f8fafc;"><i class="fa-solid fa-paperclip" style="color:var(--gold);"></i> 📄 Teacher Doc: ${escHtml(a.attachment.name)}</button>
              </span>
            ` : ''}
            ${sub && sub.attachment ? `
              <span style="margin-left:10px;">
                <button onclick="downloadOrViewAttachment('${a.id}', 'student', '${_student.id}')" class="btn btn-outline" style="font-size:10px; padding:2px 6px; width:auto; border-radius:4px; line-height:1; background:#f0fdf4; border-color:#86efac; color:#15803d;"><i class="fa-solid fa-file-arrow-up"></i> 📤 Student Solution: ${escHtml(sub.attachment.name)}</button>
              </span>
            ` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          ${statusBadge}${gradeDisp}
        </div>
      </div>
      ${a.description ? `<div class="hw-desc">${escHtml(a.description)}</div>` : ''}
      ${marksSection}
    </div>`;
  });

  const missing = _assignments.length - submitted;
  const avg = totPoss > 0 ? Math.round(totObt / totPoss * 100) : 0;

  sumEl.innerHTML = `
    <div class="hw-sum-item"><div class="hw-sum-val">${_assignments.length}</div><div class="hw-sum-lbl">Total</div></div>
    <div class="hw-sum-item"><div class="hw-sum-val" style="color:var(--green);">${submitted}</div><div class="hw-sum-lbl">Submitted</div></div>
    <div class="hw-sum-item"><div class="hw-sum-val" style="color:var(--red);">${missing}</div><div class="hw-sum-lbl">Missing</div></div>
    <div class="hw-sum-item"><div class="hw-sum-val" style="color:var(--blue);">${avg}%</div><div class="hw-sum-lbl">Avg Score</div></div>
  `;
  list.innerHTML = cardsHtml;
}

function liveGrade(hwId, defaultTotal) {
  const obt   = document.getElementById('mo_' + hwId);
  const tot   = document.getElementById('mt_' + hwId);
  const pill  = document.getElementById('gp_' + hwId);
  if (!obt || !pill) return;
  const g = calcGrade(obt.value, (tot ? tot.value : null) || defaultTotal);
  pill.textContent = g;
  pill.style.color = gradeColor(g);
}

async function saveMarks(hwId) {
  const btn = document.getElementById('smb_' + hwId);
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-sm"></span> Saving…';
  btn.disabled = true;

  const obtained = document.getElementById('mo_' + hwId).value;
  const total    = document.getElementById('mt_' + hwId).value;
  const remarks  = document.getElementById('rem_' + hwId).value;
  const grade    = calcGrade(obtained, total);

  const assignment = _assignments.find(a => a.id === hwId);
  if (assignment) {
    if (!assignment.submissions) assignment.submissions = {};
    assignment.submissions[_student.id] = {
      status: 'Submitted', marksObtained: +obtained,
      totalMarks: +total, grade, remarks, savedAt: new Date().toISOString()
    };
    try { await ygsDB.saveAssignment(assignment); } catch(_) {}
    // Mirror to localStorage
    const ls  = JSON.parse(localStorage.getItem('ygs_assignments') || '[]');
    const idx = ls.findIndex(a => a.id === hwId);
    if (idx >= 0) ls[idx] = assignment; else ls.push(assignment);
    localStorage.setItem('ygs_assignments', JSON.stringify(ls));
  }

  await new Promise(r => setTimeout(r, 300));
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
  btn.style.background = 'var(--green)';
  setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; btn.style.background = ''; }, 1800);
  updateKpiMini();
}

// ══════════════════════════════════════════════════════════════════════
//  PERFORMANCE
// ══════════════════════════════════════════════════════════════════════
function renderPerformance() {
  const panel = document.getElementById('panelPerformance');

  // Compute attendance
  const attRecs  = Object.values(_attMap);
  const attTotal = attRecs.filter(r => r.status !== 'Off Day').length;
  const attPres  = attRecs.filter(r => r.status === 'Present' || r.status === 'Late').length;
  const attPct   = attTotal > 0 ? Math.round(attPres / attTotal * 100) : 100;

  // Compute homework
  const hwTotal  = _assignments.length;
  let hwSub=0, totObt=0, totPoss=0;
  _assignments.forEach(a => {
    const sub = ((a.submissions || {})[_student.id] || {});
    if (sub.status === 'Submitted') hwSub++;
    if (sub.marksObtained !== undefined && sub.totalMarks) { totObt += +sub.marksObtained; totPoss += +sub.totalMarks; }
  });
  const hwPct   = hwTotal > 0 ? Math.round(hwSub / hwTotal * 100) : 0;
  const avgMark = totPoss > 0 ? Math.round(totObt / totPoss * 100) : 0;

  // Overall composite
  const composite = Math.round(attPct * 0.4 + hwPct * 0.3 + avgMark * 0.3);
  const overallG  = calcGrade(composite, 100);

  // Areas & recommendations
  const areas=[], recs=[];
  if (attPct < 75)  { areas.push('Low attendance (' + attPct + '%) — minimum 75% required'); recs.push('Must attend all upcoming classes consistently'); }
  if (hwPct < 60)   { areas.push('Incomplete homework (' + hwSub + '/' + hwTotal + ' submitted)'); recs.push('Submit all pending assignments immediately'); }
  if (avgMark < 60) { areas.push('Below-average marks (' + avgMark + '% average)'); recs.push('Schedule extra practice and review sessions'); }
  if (!areas.length){ areas.push('No major concerns — performing well overall'); recs.push('Maintain this excellent progress!'); }

  const attColor  = attPct >= 75  ? 'var(--green)' : 'var(--red)';
  const hwColor   = hwPct  >= 60  ? 'var(--green)' : 'var(--yellow)';
  const markColor = avgMark>= 60  ? 'var(--green)' : 'var(--blue)';

  // Build monthly chart data (last 6 months attendance %)
  const chartRows = buildMonthlyChart();

  // Absence Limit & Bonus calculation (Requirement #3.2)
  const absencesCount = attRecs.filter(r => r.status === 'Absent').length;
  const maxAbsencesAllowed = avgMark >= 85 ? 6 : 4;
  const remainingAbsences = Math.max(0, maxAbsencesAllowed - absencesCount);
  const absencePct = Math.min(100, Math.round((absencesCount / maxAbsencesAllowed) * 100));
  const absenceColor = absencesCount > maxAbsencesAllowed ? 'var(--red)' : absencesCount >= maxAbsencesAllowed - 1 ? 'var(--yellow)' : 'var(--green)';

  panel.innerHTML = `
    <!-- KPI Cards -->
    <div class="perf-kpi-grid">
      <div class="perf-kpi" style="border-top:4px solid ${attColor};">
        <div class="perf-kpi-val" style="color:${attColor};">${attPct}%</div>
        <div class="perf-kpi-lbl">Attendance Rate</div>
        <div class="perf-bar-bg"><div class="perf-bar-fill" style="width:${attPct}%;background:${attColor};"></div></div>
      </div>
      <div class="perf-kpi" style="border-top:4px solid ${hwColor};">
        <div class="perf-kpi-val" style="color:${hwColor};">${hwPct}%</div>
        <div class="perf-kpi-lbl">HW Completion</div>
        <div class="perf-bar-bg"><div class="perf-bar-fill" style="width:${hwPct}%;background:${hwColor};"></div></div>
      </div>
      <div class="perf-kpi" style="border-top:4px solid ${markColor};">
        <div class="perf-kpi-val" style="color:${markColor};">${avgMark}%</div>
        <div class="perf-kpi-lbl">Average Marks</div>
        <div class="perf-bar-bg"><div class="perf-bar-fill" style="width:${avgMark}%;background:${markColor};"></div></div>
      </div>
      <div class="perf-kpi" style="border-top:4px solid ${gradeColor(overallG)};">
        <div class="perf-kpi-val" style="color:${gradeColor(overallG)};font-size:40px;">${overallG}</div>
        <div class="perf-kpi-lbl">Overall Grade</div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;">${composite}% composite score</div>
      </div>
    </div>

    <!-- ABSENCE LIMIT & BONUS REWARD CARD -->
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:18px; margin-bottom:20px; box-shadow:0 2px 4px rgba(0,0,0,0.03);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
        <div>
          <h4 style="font-size:15px; font-weight:700; color:var(--navy); margin:0; display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-triangle-exclamation" style="color:${absenceColor};"></i> 
            Absence Limit Tracker
            ${avgMark >= 85 ? '<span class="badge badge-green" style="font-size:10px; padding:2px 6px;">🎁 +2 Bonus Limit Unlocked (GPA >= 85%)</span>' : ''}
          </h4>
          <div style="font-size:12px; color:var(--muted); margin-top:3px;">
            Absence Limit: <strong>${absencesCount} / ${maxAbsencesAllowed}</strong> (Remaining: <strong style="color:${absenceColor};">${remainingAbsences}</strong>)
          </div>
        </div>
        <div style="font-size:13px; font-weight:800; color:${absenceColor};">
          ${absencesCount > maxAbsencesAllowed ? '⚠️ LIMIT EXCEEDED - WARNING ISSUED' : `${remainingAbsences} Absences Allowed`}
        </div>
      </div>
      <div class="perf-bar-bg" style="height:10px; border-radius:5px; background:#e2e8f0; overflow:hidden;">
        <div class="perf-bar-fill" style="width:${absencePct}%; background:${absenceColor}; height:100%; transition:width 0.3s ease;"></div>
      </div>
      ${absencesCount > maxAbsencesAllowed ? `
        <div style="margin-top:10px; background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:700;">
          <i class="fa-solid fa-circle-exclamation"></i> Warning: Student has exceeded the maximum absence threshold. Please contact academic advisors.
        </div>
      ` : ''}
    </div>

    <!-- Monthly Attendance Chart -->
    <div class="card monthly-chart">
      <div class="card-head" style="margin-bottom:10px;">
        <div class="card-title"><i class="fa-solid fa-chart-bar" style="color:var(--gold);"></i> Monthly Attendance Overview</div>
      </div>
      ${chartRows.length ? chartRows.map(r => `
        <div class="chart-row">
          <div class="chart-lbl">${r.label}</div>
          <div class="chart-track">
            <div class="chart-bar" style="width:${r.pct}%;background:${r.pct>=75?'var(--green)':r.pct>=50?'var(--yellow)':'var(--red)'};">
              ${r.pct > 10 ? r.pct + '%' : ''}
            </div>
          </div>
          <div class="chart-pct">${r.pct}%</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px;">No attendance data yet. Records will appear once attendance is marked.</div>'}
    </div>

    <!-- Areas & Recommendations -->
    <div class="perf-two-col">
      <div class="perf-list-card">
        <h4><i class="fa-solid fa-triangle-exclamation" style="color:var(--yellow);"></i> Areas Needing Attention</h4>
        <ul>${areas.map(a => `<li><i class="fa-solid fa-circle-dot" style="color:var(--red);font-size:10px;"></i> ${a}</li>`).join('')}</ul>
      </div>
      <div class="perf-list-card">
        <h4><i class="fa-solid fa-lightbulb" style="color:var(--gold);"></i> Recommended Actions</h4>
        <ul>${recs.map(r => `<li><i class="fa-solid fa-arrow-right" style="color:var(--green);font-size:10px;"></i> ${r}</li>`).join('')}</ul>
      </div>
    </div>

    <!-- Teacher Remarks -->
    <div class="card">
      <div class="card-head">
        <div class="card-title"><i class="fa-solid fa-comment-dots" style="color:var(--gold);"></i> Teacher's Overall Remarks</div>
      </div>
      ${_isEditor ? `
        <textarea class="remarks-ta" id="perfRemarks" rows="4" placeholder="Enter overall performance remarks, progress notes, and recommendations for this student…">${escHtml(_student.teacherRemark || '')}</textarea>
        <button class="save-remarks-btn" onclick="savePerformanceRemarks()">
          <i class="fa-solid fa-floppy-disk"></i> Save Remarks
        </button>` : `
        <p style="font-size:13px;color:var(--text);line-height:1.7;background:var(--bg2);padding:14px;border-radius:6px;">
          ${_student.teacherRemark ? escHtml(_student.teacherRemark) : '<em style="color:var(--muted);">No remarks added by teacher yet.</em>'}
        </p>`}
    </div>
  `;
}

function buildMonthlyChart() {
  const now = new Date();
  const rows = [];
  for (let i = 5; i >= 0; i--) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const realDate = new Date(y, m, 1);
    const ry = realDate.getFullYear();
    const rm = realDate.getMonth();
    const daysInM = new Date(ry, rm + 1, 0).getDate();
    let total=0, present=0;
    for (let d = 1; d <= daysInM; d++) {
      const ds   = dateStr(ry, rm, d);
      const dow  = new Date(ry, rm, d).getDay();
      if (isWeekend(dow) || _offDays[ds]) continue;
      total++;
      const rec = _attMap[ds];
      if (rec && (rec.status === 'Present' || rec.status === 'Late')) present++;
    }
    if (total > 0) {
      rows.push({ label: MONTHS[rm].substr(0,3) + ' ' + ry, pct: Math.round(present / total * 100) });
    }
  }
  return rows;
}

async function savePerformanceRemarks() {
  const btn = document.querySelector('.save-remarks-btn');
  if (!btn) return;
  btn.innerHTML = '<span class="spinner-sm"></span> Saving…';
  btn.disabled = true;
  const remarks = document.getElementById('perfRemarks').value;
  _student.teacherRemark = remarks;
  try { await ygsDB.saveUser(_student); } catch(_) {}
  // Mirror
  const ls  = JSON.parse(localStorage.getItem('ygs_students') || '[]');
  const idx = ls.findIndex(s => s.id === _student.id);
  if (idx >= 0) { ls[idx].teacherRemark = remarks; localStorage.setItem('ygs_students', JSON.stringify(ls)); }
  await new Promise(r => setTimeout(r, 300));
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
  btn.style.background = 'var(--green)';
  btn.style.color = '#fff';
  setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Remarks'; btn.disabled = false; btn.style.background = ''; btn.style.color = ''; }, 1800);
}

// ── UTILITIES ─────────────────────────────────────────────────────────
function getCleanName(user) {
  if (!user) return 'Student';
  let name = (user.fullName || user.name || '').trim();
  if (!name || /^[\d\s\+\-\(\)]+$/.test(name) || name.includes('@')) {
    const email = (user.email || '').trim().toLowerCase();
    if (email.includes('hargun'))  return 'Hargun';
    if (email.includes('attiya'))  return 'Attiya';
    if (email) return email.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    return 'Student';
  }
  return name;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hidePgLoader() { document.getElementById('pgLoader').style.display = 'none'; }

function formatTime12h(t) {
  if (!t) return '';
  const parts = t.split(':');
  let h = parseInt(parts[0]);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function convertTimeWithTimezones(timeStr, fromTz, toTz) {
  if (!timeStr) return '';
  if (!fromTz) fromTz = 'Asia/Karachi';
  if (!toTz) toTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';
  if (fromTz === toTz) return '';
  try {
    const getOffset = (tz, dVal) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
      }).formatToParts(dVal);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      if (!tzPart) return 0;
      const val = tzPart.value;
      if (val === 'GMT' || val === 'UTC') return 0;
      const match = val.match(/GMT([+-])(\d+)(?::(\d+))?/);
      if (!match) return 0;
      const sign = match[1] === '+' ? 1 : -1;
      const h = parseInt(match[2]);
      const m = parseInt(match[3] || '0');
      return sign * (h * 60 + m);
    };
    const date = new Date();
    const fromOffset = getOffset(fromTz, date);
    const toOffset = getOffset(toTz, date);
    const diffMinutes = toOffset - fromOffset;
    const [h, m] = timeStr.split(':').map(Number);
    let targetMinutes = h * 60 + m + diffMinutes;
    targetMinutes = (targetMinutes + 24 * 60) % (24 * 60);
    const finalH = String(Math.floor(targetMinutes / 60)).padStart(2, '0');
    const finalM = String(targetMinutes % 60).padStart(2, '0');
    return `${finalH}:${finalM}`;
  } catch(_) { return ''; }
}

function renderVisualTimetableHTML(sched, batchTimezone) {
  if (!sched) return '<span style="font-size:12px;color:var(--muted);">No schedule configured</span>';
  let obj = sched;
  if (typeof sched === 'string') {
    try { obj = JSON.parse(sched); } catch(_) {
      return `
        <div style="font-size:12px; color:var(--navy); font-weight:600; margin-top:2px;">
          <i class="fa-solid fa-clock"></i> ${sched}
        </div>
      `;
    }
  }
  if (!obj || !obj.days) return '<span style="font-size:12px;color:var(--muted);">No schedule configured</span>';
  
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let html = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; width:100%;">`;
  
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';
  const bTz = batchTimezone || 'Asia/Karachi';
  const fromLabel = bTz === 'Asia/Karachi' ? 'PKT' : bTz === 'Europe/Berlin' ? 'CET' : 'UTC';
  const toLabel = viewerTz === 'Asia/Karachi' ? 'PKT' : viewerTz === 'Europe/Berlin' ? 'CET' : 'Local';

  dayOrder.forEach(day => {
    const d = obj.days[day] || { isClass: false, time: '' };
    const dayShort = day.substr(0, 3);
    if (d.isClass) {
      const converted = convertTimeWithTimezones(d.time, bTz, viewerTz);
      const timeDisp = converted 
        ? `<span style="font-size:9px;color:var(--muted);opacity:0.85;">${formatTime12h(d.time)} (${fromLabel})</span><br><span style="font-size:10px;font-weight:800;color:var(--navy);">${formatTime12h(converted)} (${toLabel})</span>`
        : `${formatTime12h(d.time)} (${fromLabel})`;
      html += `
        <div style="flex:1; min-width:85px; text-align:center; padding:6px 4px; border-radius:6px; background:#dcfce7; border:1px solid #86efac; color:#15803d; box-shadow:0 1px 2px rgba(0,0,0,0.05); line-height:1.25;">
          <div style="font-size:10px; font-weight:800; text-transform:uppercase;">${dayShort}</div>
          <div style="margin-top:2px; white-space:nowrap;">${timeDisp}</div>
        </div>
      `;
    } else {
      html += `
        <div style="flex:1; min-width:85px; text-align:center; padding:6px 4px; border-radius:6px; background:var(--bg2); border:1px solid var(--border); color:var(--muted); opacity:0.8;">
          <div style="font-size:10px; font-weight:800; text-transform:uppercase;">${dayShort}</div>
          <div style="font-size:10px; font-weight:600; margin-top:2px;">Off</div>
        </div>
      `;
    }
  });
  
  html += `</div>`;
  return html;
}

function formatDateTime(val) {
  if (!val) return 'N/A';
  if (!val.includes('T')) return val; // Legacy text format support
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  } catch(_) {
    return val;
  }
}

function downloadOrViewAttachment(hwId, type = 'teacher', studentId = null) {
  const a = _assignments.find(x => x.id === hwId);
  if (!a) { alert('Assignment not found.'); return; }
  
  let file = null;
  let fileSource = 'Teacher';
  if (type === 'teacher') {
    file = a.attachment;
    fileSource = 'Teacher';
  } else if (type === 'student' && studentId) {
    const sub = (a.submissions || {})[studentId];
    if (sub && sub.attachment) {
      file = sub.attachment;
      fileSource = 'Student';
    }
  }

  if (!file || !file.data) {
    alert('Attachment not found.');
    return;
  }

  const fileData = file.data;
  const fileName = file.name || 'document';
  const isImage = fileData.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
  const isPdf   = fileData.startsWith('data:application/pdf') || /\.pdf$/i.test(fileName);

  let viewer = document.getElementById('imageViewerModal');
  if (!viewer) {
    const div = document.createElement('div');
    div.id = 'imageViewerModal';
    div.className = 'overlay';
    div.style.zIndex = '99999';
    div.style.display = 'none';
    div.style.position = 'fixed';
    div.style.top = '0'; div.style.left = '0'; div.style.width = '100vw'; div.style.height = '100vh';
    div.style.background = 'rgba(15,23,42,0.85)'; div.style.alignItems = 'center'; div.style.justifyContent = 'center';
    div.innerHTML = `
      <div class="modal" style="background:#fff; border-radius:12px; padding:20px; width:92%; max-width:900px; max-height:92vh; display:flex; flex-direction:column; align-items:center; box-shadow:0 12px 36px rgba(0,0,0,0.3);">
        <div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
          <div>
            <h4 id="ivTitle" style="margin:0; font-family:'Outfit',sans-serif; color:#0f172a; font-size:16px; font-weight:800;">Attachment Preview</h4>
            <span id="ivBadge" style="font-size:10px; padding:2px 8px; border-radius:12px; background:#fef3c7; color:#92400e; font-weight:800; display:inline-block; margin-top:2px;">Source</span>
          </div>
          <button onclick="document.getElementById('imageViewerModal').style.display='none'" class="btn btn-outline" style="width:auto; padding:5px 12px; font-size:12px; cursor:pointer; font-weight:700;">✕ Close</button>
        </div>
        
        <div id="ivBody" style="flex:1; width:100%; display:flex; justify-content:center; align-items:center; overflow:auto; padding:6px 0;">
          <!-- Image or PDF or Document Iframe -->
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; justify-content:flex-end; width:100%; border-top:1px solid #e2e8f0; padding-top:10px;">
          <a id="ivDownloadLink" class="btn btn-navy" style="width:auto; text-decoration:none; padding:7px 18px; border-radius:6px; color:#fff; background:#0f172a; font-weight:700; font-size:12px;"><i class="fa-solid fa-download"></i> Download Local Copy</a>
          <button onclick="document.getElementById('imageViewerModal').style.display='none'" class="btn btn-outline" style="width:auto; padding:7px 18px; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer; font-size:12px; font-weight:700;">Close Preview</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    viewer = div;
  }

  document.getElementById('ivTitle').textContent = fileName;
  document.getElementById('ivBadge').textContent = fileSource === 'Teacher' ? '📄 Uploaded by Teacher (Instructor Assignment)' : `📤 Uploaded by Student (${getCleanName(_student)} Solution)`;

  const bodyEl = document.getElementById('ivBody');
  if (isImage) {
    bodyEl.innerHTML = `<img src="${fileData}" style="max-width:100%; max-height:70vh; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.15); object-fit:contain;">`;
  } else if (isPdf) {
    bodyEl.innerHTML = `<iframe src="${fileData}" style="width:100%; height:72vh; border:none; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.15);"></iframe>`;
  } else {
    bodyEl.innerHTML = `<iframe src="${fileData}" style="width:100%; height:68vh; border:1px solid #cbd5e1; border-radius:8px; background:#fff;"></iframe>`;
  }

  const link = document.getElementById('ivDownloadLink');
  link.href = fileData;
  link.download = fileName;

  viewer.style.display = 'flex';
}

// ── BOOT ──────────────────────────────────────────────────────────────
init();
