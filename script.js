// ======= State =======
const state = {
  config: { days: 6, periods: 5, maxDeptPerDay: 3 },
  faculties: [], // {id,name,code,isDept}
  classes: [],   // {id,course,year,section,maxDeptSubjects}
  subjects: [],  // {id,classId,name,hours,type,facultyId,labBlockAuto|null,labBlockResolved}
  timetables: {}, // classId -> 2D [day][period] = {subjectId, facultyId}
  clashes: new Set() // Stores string identifiers for clashes: "FACULTYID-DAY-PERIOD"
};

// ======= Helpers =======
const el = (q) => document.querySelector(q);
const uid = () => Math.random().toString(36).slice(2, 9);

function classLabel(c) { return `${c.course}-${c.year}${c.course==='UG' ? ' Year' : ''} ${c.section}`; }
function facultyLabel(f) { return `${f.name} (${f.code})${f.isDept ? '' : ' • External'}`; }
function byId(list, id) { return list.find(x => x.id === id); }

// ======= Init selects from state =======
function refreshFacultySelect() {
  const sel = el('#subFaculty');
  sel.innerHTML = '';
  state.faculties.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = facultyLabel(f);
    sel.appendChild(opt);
  });
}
function refreshClassSelect() {
  const sel = el('#subClass');
  sel.innerHTML = '';
  state.classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = classLabel(c);
    sel.appendChild(opt);
  });
}

function updateYearSelect() {
  const course = el('#course').value;
  const yearSel = el('#year');
  yearSel.innerHTML = '';
  
  if (course === 'UG') {
    yearSel.innerHTML = `
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
    `;
  } else if (course === 'PG') {
    yearSel.innerHTML = `
      <option value="1">1</option>
      <option value="2">2</option>
    `;
  }
}

// ======= Render lists =======
function renderFacultyList() {
  const box = el('#facultyList');
  box.innerHTML = '';
  state.faculties.forEach(f => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <span><strong>${f.name}</strong> <span class="tag ${f.isDept?'badgeDept':'badgeExt'}">${f.isDept?'Dept':'External'}</span> <span class="tag">${f.code}</span></span>
      <button data-id="${f.id}" class="delFac secondary">Delete</button>
    `;
    box.appendChild(div);
  });
  box.querySelectorAll('.delFac').forEach(btn => btn.onclick = () => {
    const id = btn.getAttribute('data-id');
    // prevent delete if used
    const used = state.subjects.some(s => s.facultyId === id);
    if (used) return alert('This faculty is assigned to a subject. Remove that subject first.');
    state.faculties = state.faculties.filter(f => f.id !== id);
    renderFacultyList(); refreshFacultySelect();
  });
}

function renderClassList() {
  const box = el('#classList');
  box.innerHTML = '';
  state.classes.forEach(c => {
    const div = document.createElement('div');
    div.className = 'card';
    const capNote = (c.course==='UG' && (c.year===1 || c.year===2)) ? `<span class="tag">Max Dept Subjects: ${c.maxDeptSubjects}</span>` : '';
    div.innerHTML = `
      <span><strong>${classLabel(c)}</strong> ${capNote}</span>
      <button data-id="${c.id}" class="delClass secondary">Delete</button>
    `;
    box.appendChild(div);
  });
  box.querySelectorAll('.delClass').forEach(btn => btn.onclick = () => {
    const id = btn.getAttribute('data-id');
    const used = state.subjects.some(s => s.classId === id);
    if (used) return alert('This class has subjects. Remove those subjects first.');
    delete state.timetables[id];
    state.classes = state.classes.filter(c => c.id !== id);
    renderClassList(); refreshClassSelect(); renderSubjectList(); renderTables();
  });
}

function renderSubjectList() {
  const box = el('#subjectList');
  box.innerHTML = '';
  // group by class
  state.classes.forEach(c => {
    const subs = state.subjects.filter(s => s.classId === c.id);
    if (subs.length === 0) return;
    const wrap = document.createElement('div');
    wrap.className = 'card';
    const listHTML = subs.map(s => {
      const f = byId(state.faculties, s.facultyId);
      const labBadge = s.type === 'lab' ? `<span class="tag badgeLab">Lab ${s.labBlockResolved||'Auto'}</span>` : '';
      return `<div>
        <strong>${s.name}</strong> <span class="tag">${s.hours}h</span> ${labBadge}
        <div style="font-size:12px;color:#6b7280;">Faculty: ${f?facultyLabel(f):'—'}</div>
      </div>
      <button class="secondary delSub" data-id="${s.id}">Delete</button>`;
    }).join('<hr style="border:none;border-top:1px solid #eee;margin:8px 0;">');

    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;width:100%;">
        <div>
          <div style="font-weight:700;margin-bottom:6px;">${classLabel(c)}</div>
          <div class="list">${listHTML}</div>
        </div>
      </div>
    `;
    box.appendChild(wrap);
  });

  box.querySelectorAll('.delSub').forEach(btn => btn.onclick = () => {
    const id = btn.getAttribute('data-id');
    state.subjects = state.subjects.filter(s => s.id !== id);
    renderSubjectList();
  });
}

// ======= Timetable generation (frontend draft) =======
function clearTables() {
  state.timetables = {};
  renderTables();
}

function generateAll() {
  // pull config
  state.config.days = Number(el('#daysPerCycle').value || 6);
  state.config.periods = Number(el('#periodsPerDay').value || 5);
  state.config.maxDeptPerDay = Number(el('#maxPerDayDept').value || 3);

  // Validate fixed faculty per subject & class caps
  const errs = [];

  state.classes.forEach(c => {
    // For UG1 & UG2, cap dept subjects count
    if (c.course === 'UG' && (c.year === 1 || c.year === 2)) {
      const deptSubsCount = state.subjects.filter(s => s.classId===c.id)
        .filter(s => {
          const f = byId(state.faculties, s.facultyId);
          return f && f.isDept;
        }).length;
      if (deptSubsCount > c.maxDeptSubjects) {
        errs.push(`${classLabel(c)} has ${deptSubsCount} dept subjects, exceeds cap ${c.maxDeptSubjects}`);
      }
    }
    // Resolve lab block sizes by year rule
    state.subjects.filter(s => s.classId===c.id && s.type==='lab').forEach(s => {
      if ((c.course === 'UG' && (c.year === 1 || c.year === 2)) || (c.course === 'PG' && c.year === 1)) {
        // UG1/UG2/PG1: 2 or 3 allowed; auto means 2
        s.labBlockResolved = s.labBlockAuto === 'auto' ? 2 : Number(s.labBlockAuto);
        if (![2,3].includes(s.labBlockResolved)) s.labBlockResolved = 2;
      } else if ((c.course === 'UG' && c.year === 3) || (c.course === 'PG' && c.year === 2)) {
        // UG3/PG2: full-day lab (5)
        s.labBlockResolved = 5;
      }
    });
  });

  if (errs.length) {
    alert('Fix these before generation:\n\n' + errs.join('\n'));
    return;
  }

  // Faculty daily load map across ALL classes to avoid cross-class clash + >3/day
  // load[facultyId][day] = count
  const load = {};

  // Occupancy index to avoid double-booking faculty across classes same slot
  // occ[day][period] -> Set of facultyIds
  const occ = Array.from({length: state.config.days}, () =>
    Array.from({length: state.config.periods}, () => new Set())
  );

  // Build for each class
  state.classes.forEach(c => {
    const grid = Array.from({length: state.config.days}, () =>
      Array.from({length: state.config.periods}, () => null)
    );

    // Expand requirements: each subject contributes N sessions (= periods)
    const subs = state.subjects.filter(s => s.classId === c.id);
    const units = [];
    subs.forEach(s => {
      const f = byId(state.faculties, s.facultyId);
      if (!f) return;
      
      let sessions = 0;
      let block = 1;
      let isLab = false;
      
      if (s.type === 'lab') {
          isLab = true;
          block = Number(s.labBlockResolved || 2);
          sessions = Math.floor(s.hours / block);
      } else {
          // New logic for theory subjects based on total hours
          if (s.hours === 60) {
              sessions = 4; // 4 periods per week
          } else if (s.hours === 90) {
              sessions = 6; // 6 periods per week
          } else {
              sessions = s.hours; // Default to hours if not 60 or 90
          }
      }

      for (let i=0;i<sessions;i++) {
        units.push({ kind: s.type, size: isLab ? block : 1, subjectId: s.id, facultyId: f.id });
      }
      
      if (isLab) {
        const leftover = s.hours % block;
        if (leftover > 0) units.push({ kind:'theory', size:1, subjectId:s.id, facultyId:f.id, leftover:true });
      }
    });

    // Simple fairness: shuffle units
    for (let i=units.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [units[i],units[j]] = [units[j],units[i]];
    }

    // Place units greedily with constraints
    const tryPlaceTheory = (u) => {
      for (let d=0; d<state.config.days; d++) {
        // init load map
        load[u.facultyId] = load[u.facultyId] || {};
        load[u.facultyId][d] = load[u.facultyId][d] || 0;

        for (let p=0; p<state.config.periods; p++) {
          if (grid[d][p] !== null) continue;
          // faculty clash at slot?
          if (occ[d][p].has(u.facultyId)) continue;
          // max per-day cap for dept faculty only
          const isDept = byId(state.faculties, u.facultyId)?.isDept;
          if (isDept && load[u.facultyId][d] >= state.config.maxDeptPerDay) continue;

          // Avoid immediate consecutive same subject for nicer spread
          const prev = p>0 ? grid[d][p-1] : null;
          if (prev && prev.subjectId === u.subjectId) continue;

          grid[d][p] = { subjectId: u.subjectId, facultyId: u.facultyId, size:1 };
          occ[d][p].add(u.facultyId);
          load[u.facultyId][d]++;
          return true;
        }
      }
      return false;
    };

    const tryPlaceLab = (u) => {
      for (let d=0; d<state.config.days; d++) {
        load[u.facultyId] = load[u.facultyId] || {};
        load[u.facultyId][d] = load[u.facultyId][d] || 0;

        for (let p=0; p<=state.config.periods - u.size; p++) {
          // all contiguous slots empty?
          let ok = true;
          for (let k=0; k<u.size; k++) {
            if (grid[d][p+k] !== null) { ok=false; break; }
            if (occ[d][p+k].has(u.facultyId)) { ok=false; break; }
          }
          if (!ok) continue;

          // Dept cap: placing a lab block counts all periods against the faculty’s day cap
          const isDept = byId(state.faculties, u.facultyId)?.isDept;
          if (isDept && (load[u.facultyId][d] + u.size) > state.config.maxDeptPerDay) {
            continue;
          }

          // place the block
          for (let k=0; k<u.size; k++) {
            grid[d][p+k] = { subjectId: u.subjectId, facultyId: u.facultyId, size:u.size, part:k+1 };
            occ[d][p+k].add(u.facultyId);
          }
          if (isDept) load[u.facultyId][d] += u.size;
          return true;
        }
      }
      return false;
    };

    // First place lab blocks (harder), then theory units
    const labs = units.filter(u => u.kind==='lab').sort((a,b)=>b.size-a.size);
    const theory = units.filter(u => u.kind==='theory');

    let failed = false;
    for (const u of labs) if (!tryPlaceLab(u)) { failed = true; break; }
    if (!failed) for (const u of theory) if (!tryPlaceTheory(u)) { failed = true; break; }

    if (failed) {
      alert(`Could not fully place all sessions for ${classLabel(c)} with current constraints. Try reducing hours or lab sizes.`);
    }

    state.timetables[c.id] = grid;
  });
  
  // After generation, check for faculty clashes across all timetables
  checkAllFacultyClashes();
  renderTables();
}

// ======= Drag & Drop handlers =======
let draggedItem = null;
let dragSourceCell = null;
let dragSourceClassId = null;

function dragStart(e) {
  draggedItem = this.cloneNode(true);
  dragSourceCell = this;
  dragSourceClassId = this.getAttribute('data-class-id');
  
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.getAttribute('data-subject-id'));
  
  // To get a nice drag image
  e.dataTransfer.setDragImage(this, 0, 0);
  this.classList.add('dragging');
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function dragEnter(e) {
  e.preventDefault();
  if (this !== dragSourceCell) {
    this.classList.add('drag-over');
  }
}

function dragLeave(e) {
  this.classList.remove('drag-over');
}

function dragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function drop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');

  const targetClassId = this.getAttribute('data-class-id');
  
  if (dragSourceCell === this) {
    return;
  }

  const sourceDay = parseInt(dragSourceCell.getAttribute('data-day'));
  const sourcePeriod = parseInt(dragSourceCell.getAttribute('data-period'));
  const targetDay = parseInt(this.getAttribute('data-day'));
  const targetPeriod = parseInt(this.getAttribute('data-period'));

  const sourceSlot = state.timetables[dragSourceClassId]?.[sourceDay]?.[sourcePeriod] || null;
  const targetSlot = state.timetables[targetClassId]?.[targetDay]?.[targetPeriod] || null;

  // NEW LOGIC: Check for faculty clash before swapping
  const sourceFacultyId = sourceSlot?.facultyId;
  const targetFacultyId = targetSlot?.facultyId;

  // Check if the source faculty is already assigned at the target slot's time
  if (sourceFacultyId && isFacultyAlreadyAssigned(sourceFacultyId, targetDay, targetPeriod, dragSourceClassId)) {
    alert(`Cannot move subject. Faculty is already assigned to another class at Day ${targetDay + 1}, Period ${targetPeriod + 1}.`);
    return;
  }
  
  // Check if the target faculty is already assigned at the source slot's time
  if (targetFacultyId && isFacultyAlreadyAssigned(targetFacultyId, sourceDay, sourcePeriod, targetClassId)) {
    alert(`Cannot move subject. The faculty for this slot is already assigned to another class at Day ${sourceDay + 1}, Period ${sourcePeriod + 1}.`);
    return;
  }

  // Swap the subjects in the state
  if (state.timetables[dragSourceClassId] && state.timetables[targetClassId]) {
    state.timetables[dragSourceClassId][sourceDay][sourcePeriod] = targetSlot;
    state.timetables[targetClassId][targetDay][targetPeriod] = sourceSlot;
  }
  
  checkAllFacultyClashes();
  renderTables();
}

// Check if a faculty member is assigned to any other class at a specific day/period
function isFacultyAlreadyAssigned(facultyId, day, period, classIdToExclude) {
  for (const c of state.classes) {
    if (c.id === classIdToExclude) continue; // Exclude the current class
    const slot = state.timetables[c.id]?.[day]?.[period];
    if (slot && slot.facultyId === facultyId) {
      return true;
    }
  }
  return false;
}

// Populate the state.clashes set with all existing faculty conflicts
function checkAllFacultyClashes() {
  state.clashes.clear();
  const facultyOccupancy = {}; // { facultyId: { day: { period: [classId, classId, ...]} } }
  
  state.classes.forEach(c => {
    const grid = state.timetables[c.id];
    if (!grid) return;
    grid.forEach((day, d) => {
      day.forEach((slot, p) => {
        if (slot && slot.facultyId) {
          const fid = slot.facultyId;
          const key = `${fid}-${d}-${p}`;
          if (facultyOccupancy[key]) {
             // Clash detected! Add both the existing and the new entry to the set
             state.clashes.add(facultyOccupancy[key]);
             state.clashes.add(`${c.id}-${d}-${p}`);
          } else {
             // First time this faculty is scheduled at this time slot
             facultyOccupancy[key] = `${c.id}-${d}-${p}`;
          }
        }
      });
    });
  });
}


// ======= Render tables =======
function renderTables() {
  const host = el('#tables');
  host.innerHTML = '';
  const days = state.config.days, periods = state.config.periods;

  state.classes.forEach(c => {
    const grid = state.timetables[c.id];
    const wrap = document.createElement('div');
    wrap.className = 'tableBlock';
    const title = document.createElement('h3');
    title.textContent = classLabel(c);
    wrap.appendChild(title);

    const table = document.createElement('table');
    table.className = 'grid';

    // header
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.innerHTML = `<th>Day</th>` + Array.from({length: periods}, (_,i)=>`<th>Period ${i+1}</th>`).join('');
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let d=0; d<days; d++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>Day ${d+1}</td>`;
      for (let p=0; p<periods; p++) {
        const cell = document.createElement('td');
        cell.setAttribute('data-day', d);
        cell.setAttribute('data-period', p);
        cell.setAttribute('data-class-id', c.id);

        const slot = grid?.[d]?.[p] || null;
        if (!slot) {
          cell.textContent = '—';
          cell.classList.add('empty');
          cell.setAttribute('data-subject-id', '');
          cell.setAttribute('draggable', false);
        } else {
          const subj = byId(state.subjects, slot.subjectId);
          const fac = byId(state.faculties, slot.facultyId);
          const labBadge = (subj?.type==='lab') ? `<span class="tag badgeLab">Lab${slot.size?` ${slot.part}/${slot.size}`:''}</span>` : '';
          cell.innerHTML = `<div><strong>${subj?.name || '—'}</strong> ${labBadge}</div>
                            <div style="font-size:12px;color:#6b7280;">${fac ? facultyLabel(fac) : ''}</div>`;
          
          cell.setAttribute('data-subject-id', slot.subjectId);
          cell.setAttribute('draggable', true);

          // Check for faculty clash
          const clashKey = `${c.id}-${d}-${p}`;
          if (state.clashes.has(clashKey)) {
              cell.classList.add('badgeWarn');
          }
        }
        
        // Add event listeners for drag and drop
        cell.addEventListener('dragstart', dragStart);
        cell.addEventListener('dragover', dragOver);
        cell.addEventListener('dragenter', dragEnter);
        cell.addEventListener('dragleave', dragLeave);
        cell.addEventListener('drop', drop);
        cell.addEventListener('dragend', dragEnd);

        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
  });
}

// ======= Events =======
el('#facultyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = el('#facName').value.trim();
  const code = el('#facCode').value.trim().toUpperCase();
  const isDept = el('#facIsDept').checked;
  if (!name || !code) return;

  state.faculties.push({ id: uid(), name, code, isDept });
  el('#facName').value = ''; el('#facCode').value = '';
  renderFacultyList(); refreshFacultySelect();
});

el('#classForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const course = el('#course').value;
  const year = Number(el('#year').value);
  const section = el('#section').value;
  const maxDeptSubjects = Number(el('#maxDeptSubjects').value||3);

  // Check for duplicate class
  const isDuplicate = state.classes.some(c => c.course === course && c.year === year && c.section === section);
  if (isDuplicate) {
    alert(`The class ${course}-${year}${course === 'UG' ? ' Year' : ''} ${section} already exists.`);
    return;
  }

  state.classes.push({ id: uid(), course, year, section, maxDeptSubjects });
  renderClassList(); refreshClassSelect(); renderSubjectList();
});

el('#subjectForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const classId = el('#subClass').value;
  const name = el('#subName').value.trim();
  const hours = Number(el('#subHours').value);
  const type = el('#subType').value;
  const facultyId = el('#subFaculty').value;
  const labAuto = el('#labBlock').value; // 'auto' | 2 | 3 | 5

  if (!classId || !name || !facultyId) return;

  // enforce fixed faculty per subject (front-end: we simply store it once; no splitting)
  state.subjects.push({
    id: uid(), classId, name, hours, type, facultyId,
    labBlockAuto: labAuto==='auto' ? 'auto' : String(labAuto),
    labBlockResolved: null
  });

  el('#subName').value = '';
  renderSubjectList();
});

// Change lab block options visibility depending on type
el('#subType').addEventListener('change', () => {
  const v = el('#subType').value;
  el('#labBlock').disabled = (v !== 'lab') ? true : false;
  if (v !== 'lab') el('#labBlock').value = 'auto';
});
el('#subType').dispatchEvent(new Event('change'));

el('#generateBtn').addEventListener('click', generateAll);
el('#clearBtn').addEventListener('click', () => { clearTables(); });

// Listen for changes on the course selection to update years
el('#course').addEventListener('change', updateYearSelect);

// ======= Boot =======
(function boot() {
  // Seed a couple of faculties/classes for quick testing (you can remove)
  state.faculties = [
    {id: uid(), name:'Prof. Senthildevi', code:'KAS', isDept:true},
    {id: uid(), name:'Prof. Asma Begam', code:'AB', isDept:true},
    {id: uid(), name:'Prof. Sathyapriya', code:'MS', isDept:true},
    {id: uid(), name:'Prof. Prabahari', code:'RP', isDept:true},
    {id: uid(), name:'Prof. Narendirakumar', code:'VKN', isDept:true},
    {id: uid(), name:'Prof. Prabhu', code:'GP', isDept:true},
    {id: uid(), name:'Prof. Prakash', code:'NP', isDept:true},
    {id: uid(), name:'Prof. Anna Poorani', code:'AP', isDept:true},
    {id: uid(), name:'Prof. Harini', code:'MH', isDept:true},
    {id: uid(), name:'Prof. Rupitha', code:'TR', isDept:true},
    {id: uid(), name:'Prof. Saranya', code:'DS', isDept:true},
  ];
  renderFacultyList(); refreshFacultySelect();

  state.classes = [
    {id: uid(), course:'UG', year:1, section:'B', maxDeptSubjects:3},
    {id: uid(), course:'UG', year:2, section:'A', maxDeptSubjects:3},
    {id: uid(), course:'UG', year:3, section:'A', maxDeptSubjects:99},
    {id: uid(), course:'PG', year:1, section:'A', maxDeptSubjects:99},
    {id: uid(), course:'PG', year:2, section:'A', maxDeptSubjects:99}
  ];
  renderClassList(); refreshClassSelect();

  updateYearSelect(); // Initial call to set up the year select
  renderSubjectList();
  renderTables();
})();
