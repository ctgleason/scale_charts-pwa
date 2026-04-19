function getChordRenderer() {
  const candidates = [
    window.svguitar,
    globalThis.svguitar,
    window.SVGuitar,
    globalThis.SVGuitar,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate.SVGuitarChord === 'function') {
      return candidate.SVGuitarChord;
    }
  }

  if (typeof window.SVGuitarChord === 'function') {
    return window.SVGuitarChord;
  }

  throw new Error('SVGuitar library failed to load.');
}

const APP_VERSION = 'v2026.04.18+progression-import-export';

// Stable key: never changes.  Migration lives in the envelope's schemaVersion field.
const PROGRESSION_STORAGE_KEY = 'scale-charts.progressions';
const PROGRESSION_SCHEMA_VERSION = 1;
// Legacy key used before versioned envelope. Data is migrated on first load.
const PROGRESSION_LEGACY_KEY = 'scale-charts.progressions.v1';
const CAGED_POSITIONS = ['C', 'A', 'G', 'E', 'D'];
const PREVIEW_LEAD_OPTIONS = ['none', 'eighth', 'quarter', 'half'];

function setDiagnostics(text, isError = false) {
  const node = document.getElementById('debug-status');
  if (!node) {
    return;
  }

  node.style.borderColor = isError ? '#7f1d1d' : '#374151';
  node.style.color = isError ? '#fecaca' : '#cbd5e1';
  node.textContent = text;
}

function ensureSvguitarScriptLoaded() {
  return new Promise((resolve, reject) => {
    try {
      getChordRenderer();
      resolve();
      return;
    } catch {
    }

    const existingScript = Array.from(document.scripts).find((script) =>
      script.src.includes('vendor/svguitar.umd.js')
    );

    if (existingScript) {
      existingScript.addEventListener('load', resolve, { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed loading existing svguitar script.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = './vendor/svguitar.umd.js';
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed loading ./vendor/svguitar.umd.js'));
    document.head.appendChild(script);
  });
}

function waitForChordRenderer({ timeoutMs = 4000, pollMs = 100 } = {}) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        resolve(getChordRenderer());
        return;
      } catch {
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('SVGuitar library failed to load within timeout.'));
        return;
      }

      setTimeout(check, pollMs);
    };

    check();
  });
}

const NATURAL_NOTE_TO_SEMITONE = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEGREE_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const DEGREE_TRIAD_QUALITIES = {
  major: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
  minor: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
};

function normalizeSemitone(value) {
  return ((value % 12) + 12) % 12;
}

function normalizeAccidental(value) {
  return value === '#' || value === 'b' ? value : '';
}

function parseNote(root, accidental = '') {
  const naturalSemitone = NATURAL_NOTE_TO_SEMITONE[root];

  if (typeof naturalSemitone !== 'number') {
    throw new Error(`Invalid root note: ${root}`);
  }

  const normalizedAccidental = normalizeAccidental(accidental);
  const accidentalOffset = normalizedAccidental === '#' ? 1 : normalizedAccidental === 'b' ? -1 : 0;
  const semitone = normalizeSemitone(naturalSemitone + accidentalOffset);
  const preferredNames = normalizedAccidental === 'b' ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;

  return {
    inputName: `${root}${normalizedAccidental}`,
    semitone,
    normalizedSharp: SHARP_NOTE_NAMES[semitone],
    normalizedFlat: FLAT_NOTE_NAMES[semitone],
    preferredName: preferredNames[semitone],
  };
}

const catalog = {
  voicings: [],
  overlays: [],
  scales: [],
};

const appState = {
  root: 'A',
  accidental: '',
  quality: 'major',
  caged: 'C',
  degree: 1,
  overlays: {},
  ui: {
    progressionPanelOpen: false,
  },
  progressions: [],
  selectedProgressionId: null,
  progressionDraft: null,
};

function createId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultProgressionStep(defaults = {}) {
  return {
    id: createId('step'),
    degree: 1,
    root: NATURAL_NOTE_TO_SEMITONE[defaults.root] !== undefined ? defaults.root : 'A',
    accidental: normalizeAccidental(defaults.accidental),
    quality: defaults.quality === 'minor' || defaults.quality === 'diminished' ? defaults.quality : 'major',
    useDiatonicChord: true,
    beats: 4,
    cagedArea: 'C',
  };
}

function createDefaultProgression() {
  const progression = {
    id: createId('prog'),
    name: 'New progression',
    keyRoot: 'A',
    keyAccidental: '',
    keyQuality: 'major',
    tempo: 100,
    countInBeats: 4,
    previewLead: 'none',
  };

  return {
    ...progression,
    steps: [
      createDefaultProgressionStep({
        root: progression.keyRoot,
        accidental: progression.keyAccidental,
        quality: progression.keyQuality,
      }),
    ],
  };
}

function sanitizeProgressionStep(step = {}) {
  return {
    id: typeof step.id === 'string' && step.id ? step.id : createId('step'),
    degree: Math.min(7, Math.max(1, Number(step.degree) || 1)),
    root: NATURAL_NOTE_TO_SEMITONE[step.root] !== undefined ? step.root : 'A',
    accidental: normalizeAccidental(step.accidental),
    quality: step.quality === 'minor' || step.quality === 'diminished' ? step.quality : 'major',
    useDiatonicChord: step.useDiatonicChord !== false,
    beats: Math.min(16, Math.max(1, Number(step.beats) || 4)),
    cagedArea: CAGED_POSITIONS.includes(step.cagedArea) ? step.cagedArea : 'C',
  };
}

function sanitizeProgression(progression = {}) {
  const steps = Array.isArray(progression.steps) && progression.steps.length > 0
    ? progression.steps.map((step) => sanitizeProgressionStep(step))
    : [createDefaultProgressionStep()];

  return {
    id: typeof progression.id === 'string' && progression.id ? progression.id : createId('prog'),
    name: typeof progression.name === 'string' && progression.name.trim() ? progression.name.trim() : 'Untitled progression',
    keyRoot: NATURAL_NOTE_TO_SEMITONE[progression.keyRoot] !== undefined ? progression.keyRoot : 'A',
    keyAccidental: normalizeAccidental(progression.keyAccidental),
    keyQuality: progression.keyQuality === 'minor' ? 'minor' : 'major',
    tempo: Math.min(240, Math.max(30, Number(progression.tempo) || 100)),
    countInBeats: Math.min(8, Math.max(0, Number(progression.countInBeats) || 0)),
    previewLead: PREVIEW_LEAD_OPTIONS.includes(progression.previewLead) ? progression.previewLead : 'none',
    steps,
  };
}

function cloneProgression(progression) {
  return JSON.parse(JSON.stringify(progression));
}

function getSelectedProgression() {
  return appState.progressions.find((progression) => progression.id === appState.selectedProgressionId) || null;
}

function saveProgressionsToStorage() {
  try {
    const envelope = buildProgressionEnvelope(appState.progressions);
    localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    console.warn('Failed to save progressions:', error);
  }
}

/**
 * Apply any model migrations needed when loading data saved by an older schema version.
 * Each migration is a function (progressions) => progressions.
 * Add new migrations to the array in ascending order as the schema evolves.
 */
const PROGRESSION_MIGRATIONS = [
  // Schema v1 → v1: no-op (first version; here as a template for future migrations)
  // Future example:
  // (progressions) => progressions.map((p) => ({ ...p, newField: p.newField ?? defaultValue })),
];

function migrateProgressions(progressions, fromVersion) {
  let migrated = progressions;
  for (let version = fromVersion; version < PROGRESSION_SCHEMA_VERSION; version += 1) {
    const migration = PROGRESSION_MIGRATIONS[version - 1];
    if (typeof migration === 'function') {
      migrated = migration(migrated);
    }
  }

  return migrated;
}

function loadProgressionsFromStorage() {
  try {
    // Check stable key first
    let raw = localStorage.getItem(PROGRESSION_STORAGE_KEY);
    let fromVersion = PROGRESSION_SCHEMA_VERSION;
    let rawProgressions = null;

    if (raw) {
      const parsed = JSON.parse(raw);
      // Versioned envelope (current format)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.progressions)) {
        fromVersion = Number(parsed.schemaVersion) || 1;
        rawProgressions = parsed.progressions;
      } else if (Array.isArray(parsed)) {
        // Old format: bare array stored under stable key (shouldn't normally happen)
        fromVersion = 1;
        rawProgressions = parsed;
      }
    } else {
      // Try legacy key (data saved before versioned envelope was added)
      const legacyRaw = localStorage.getItem(PROGRESSION_LEGACY_KEY);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) {
          fromVersion = 1;
          rawProgressions = legacyParsed;
          console.info('Migrated progressions from legacy storage key.');
        }
      }
    }

    if (rawProgressions) {
      const migrated = migrateProgressions(rawProgressions, fromVersion);
      const sanitized = migrated.map((progression) => sanitizeProgression(progression));
      appState.progressions = sanitized.length > 0 ? sanitized : [createDefaultProgression()];
    } else {
      appState.progressions = [createDefaultProgression()];
    }

    appState.selectedProgressionId = appState.progressions[0].id;
    appState.progressionDraft = cloneProgression(appState.progressions[0]);

    // Always write back with current envelope format (upgrades legacy data)
    saveProgressionsToStorage();

    // Clean up legacy key after successful migration
    try {
      localStorage.removeItem(PROGRESSION_LEGACY_KEY);
    } catch {}
  } catch (error) {
    console.warn('Failed to load progressions:', error);
    const fallback = createDefaultProgression();
    appState.progressions = [fallback];
    appState.selectedProgressionId = fallback.id;
    appState.progressionDraft = cloneProgression(fallback);
    saveProgressionsToStorage();
  }
}

function formatProgressionSummary(progression) {
  return `${progression.keyRoot}${progression.keyAccidental || ''} ${getQualityLabel(progression.keyQuality)} · ${progression.steps.length} step${progression.steps.length === 1 ? '' : 's'}`;
}

function setProgressionDraft(progression) {
  appState.progressionDraft = cloneProgression(sanitizeProgression(progression));
}

function selectProgression(progressionId) {
  const progression = appState.progressions.find((item) => item.id === progressionId);
  if (!progression) {
    return;
  }

  appState.selectedProgressionId = progression.id;
  setProgressionDraft(progression);
  renderProgressionPanel();
}

function updateProgressionDraftField(field, value) {
  if (!appState.progressionDraft) {
    return;
  }

  appState.progressionDraft[field] = value;
}

function updateProgressionStep(stepId, field, value) {
  if (!appState.progressionDraft) {
    return;
  }

  const step = appState.progressionDraft.steps.find((item) => item.id === stepId);
  if (!step) {
    return;
  }

  step[field] = value;
}

function addProgressionStep() {
  if (!appState.progressionDraft) {
    return;
  }

  appState.progressionDraft.steps.push(
    createDefaultProgressionStep({
      root: appState.progressionDraft.keyRoot,
      accidental: appState.progressionDraft.keyAccidental,
      quality: appState.progressionDraft.keyQuality,
    })
  );
  renderProgressionPanel();
}

function removeProgressionStep(stepId) {
  if (!appState.progressionDraft || appState.progressionDraft.steps.length <= 1) {
    return;
  }

  appState.progressionDraft.steps = appState.progressionDraft.steps.filter((step) => step.id !== stepId);
  renderProgressionPanel();
}

function createNewProgression() {
  const progression = createDefaultProgression();
  appState.progressions.unshift(progression);
  appState.selectedProgressionId = progression.id;
  setProgressionDraft(progression);
  saveProgressionsToStorage();
  renderProgressionPanel();
}

function saveProgressionDraft() {
  if (!appState.progressionDraft) {
    return;
  }

  const sanitized = sanitizeProgression(appState.progressionDraft);
  const existingIndex = appState.progressions.findIndex((progression) => progression.id === sanitized.id);

  if (existingIndex >= 0) {
    appState.progressions.splice(existingIndex, 1, sanitized);
  } else {
    appState.progressions.unshift(sanitized);
  }

  appState.selectedProgressionId = sanitized.id;
  setProgressionDraft(sanitized);
  saveProgressionsToStorage();
  renderProgressionPanel();
}

function deleteSelectedProgression() {
  if (appState.progressions.length <= 1 || !appState.selectedProgressionId) {
    return;
  }

  appState.progressions = appState.progressions.filter(
    (progression) => progression.id !== appState.selectedProgressionId
  );

  const next = appState.progressions[0] || createDefaultProgression();
  if (appState.progressions.length === 0) {
    appState.progressions = [next];
  }
  appState.selectedProgressionId = next.id;
  setProgressionDraft(next);
  saveProgressionsToStorage();
  renderProgressionPanel();
}

function buildProgressionEnvelope(progressions = appState.progressions) {
  return {
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    progressions,
  };
}

function exportProgressionsAsJson() {
  try {
    const envelope = buildProgressionEnvelope(appState.progressions);
    const payload = JSON.stringify(envelope, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `scale-charts-progressions-${dateStamp}.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.warn('Failed to export progressions:', error);
    window.alert('Could not export progressions.');
  }
}

function normalizeImportedProgressionsPayload(parsedPayload) {
  if (Array.isArray(parsedPayload)) {
    return {
      schemaVersion: 1,
      progressions: parsedPayload,
    };
  }

  if (
    parsedPayload &&
    typeof parsedPayload === 'object' &&
    !Array.isArray(parsedPayload) &&
    Array.isArray(parsedPayload.progressions)
  ) {
    return {
      schemaVersion: Number(parsedPayload.schemaVersion) || 1,
      progressions: parsedPayload.progressions,
    };
  }

  return null;
}

function importProgressionsFromJsonText(jsonText) {
  const parsed = JSON.parse(jsonText);
  const normalized = normalizeImportedProgressionsPayload(parsed);
  if (!normalized) {
    throw new Error('Invalid progression JSON format.');
  }

  const migrated = migrateProgressions(normalized.progressions, normalized.schemaVersion);
  const sanitized = migrated.map((progression) => sanitizeProgression(progression));
  if (sanitized.length === 0) {
    throw new Error('No valid progressions found in imported file.');
  }

  appState.progressions = sanitized;
  appState.selectedProgressionId = sanitized[0].id;
  setProgressionDraft(sanitized[0]);
  saveProgressionsToStorage();
  renderProgressionPanel();
}

async function importProgressionsFromFile(file) {
  if (!file) {
    return;
  }

  const text = await file.text();
  importProgressionsFromJsonText(text);
}

function buildDegreeOptionsMarkup(selectedValue) {
  return DEGREE_LABELS.map((label, index) => {
    const value = index + 1;
    return `<option value="${value}"${value === selectedValue ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

function buildCagedOptionsMarkup(selectedValue) {
  return CAGED_POSITIONS.map((position) =>
    `<option value="${position}"${position === selectedValue ? ' selected' : ''}>${position}</option>`
  ).join('');
}

function renderProgressionLibrary() {
  const container = document.getElementById('progression-list');
  if (!container) {
    return;
  }

  if (appState.progressions.length === 0) {
    container.innerHTML = '<p class="progression-list-empty">No saved progressions yet.</p>';
    return;
  }

  container.innerHTML = appState.progressions
    .map(
      (progression) => `
        <button type="button" class="progression-item${progression.id === appState.selectedProgressionId ? ' is-active' : ''}" data-progression-id="${progression.id}">
          <span class="progression-item-title">${progression.name}</span>
          <span class="progression-item-meta">${formatProgressionSummary(progression)}</span>
        </button>
      `
    )
    .join('');
}

function renderProgressionSteps() {
  const container = document.getElementById('progression-steps');
  const draft = appState.progressionDraft;
  if (!container || !draft) {
    return;
  }

  if (!Array.isArray(draft.steps) || draft.steps.length === 0) {
    container.innerHTML = '<p class="progression-steps-empty">Add at least one chord step.</p>';
    return;
  }

  container.innerHTML = draft.steps
    .map(
      (step, index) => `
        <article class="progression-step-card" data-step-id="${step.id}">
          <div class="panel-subheading-row">
            <h3>Step ${index + 1}</h3>
          </div>
          <div class="progression-step-grid">
            <label class="control-field">
              <span>Degree</span>
              <select data-step-field="degree">
                ${buildDegreeOptionsMarkup(step.degree)}
              </select>
            </label>

            <label class="control-field">
              <span>Root override</span>
              <select data-step-field="root">
                ${Object.keys(NATURAL_NOTE_TO_SEMITONE)
                  .map((note) => `<option value="${note}"${note === step.root ? ' selected' : ''}>${note}</option>`)
                  .join('')}
              </select>
            </label>

            <label class="control-field">
              <span>Accidental</span>
              <select data-step-field="accidental">
                <option value=""${step.accidental === '' ? ' selected' : ''}>Natural</option>
                <option value="#"${step.accidental === '#' ? ' selected' : ''}>Sharp (#)</option>
                <option value="b"${step.accidental === 'b' ? ' selected' : ''}>Flat (b)</option>
              </select>
            </label>

            <label class="control-field">
              <span>Quality override</span>
              <select data-step-field="quality">
                <option value="major"${step.quality === 'major' ? ' selected' : ''}>Major</option>
                <option value="minor"${step.quality === 'minor' ? ' selected' : ''}>Minor</option>
                <option value="diminished"${step.quality === 'diminished' ? ' selected' : ''}>Diminished</option>
              </select>
            </label>

            <label class="control-field">
              <span>Duration (beats)</span>
              <input data-step-field="beats" type="number" min="1" max="16" step="1" value="${step.beats}" />
            </label>

            <label class="control-field">
              <span>I-position area</span>
              <select data-step-field="cagedArea">
                ${buildCagedOptionsMarkup(step.cagedArea)}
              </select>
            </label>
          </div>
          <label class="step-toggle-row">
            <input data-step-field="useDiatonicChord" type="checkbox"${step.useDiatonicChord ? ' checked' : ''} />
            <span>Use diatonic chord from key</span>
          </label>
          <div class="step-card-actions">
            <button type="button" class="ghost-btn danger-btn" data-step-delete="${step.id}">Remove step</button>
          </div>
        </article>
      `
    )
    .join('');
}

function syncProgressionEditorFields() {
  const draft = appState.progressionDraft;
  if (!draft) {
    return;
  }

  const assignments = [
    ['progression-name', draft.name],
    ['progression-root-note', draft.keyRoot],
    ['progression-accidental', draft.keyAccidental],
    ['progression-quality', draft.keyQuality],
    ['progression-tempo', String(draft.tempo)],
    ['progression-count-in', String(draft.countInBeats)],
    ['progression-preview-lead', draft.previewLead],
  ];

  assignments.forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) {
      node.value = value;
    }
  });
}

function renderProgressionPanel() {
  renderProgressionLibrary();
  syncProgressionEditorFields();
  renderProgressionSteps();

  const deleteButton = document.getElementById('progression-delete');
  if (deleteButton) {
    deleteButton.disabled = appState.progressions.length <= 1;
  }
}

function setProgressionPanelOpen(isOpen) {
  appState.ui.progressionPanelOpen = Boolean(isOpen);
  const panel = document.getElementById('progression-panel');
  const toggle = document.getElementById('progression-menu-toggle');
  if (panel) {
    panel.hidden = !isOpen;
    panel.classList.toggle('is-hidden', !isOpen);
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
  }
}

function setupProgressionControls() {
  const toggle = document.getElementById('progression-menu-toggle');
  const closeButton = document.getElementById('progression-close');
  const exportButton = document.getElementById('progression-export');
  const importButton = document.getElementById('progression-import');
  const importFileInput = document.getElementById('progression-import-file');
  const newButton = document.getElementById('progression-new');
  const saveButton = document.getElementById('progression-save');
  const deleteButton = document.getElementById('progression-delete');
  const addStepButton = document.getElementById('progression-add-step');
  const listContainer = document.getElementById('progression-list');
  const stepsContainer = document.getElementById('progression-steps');

  const root = document.getElementById('progression-root-note');
  const accidental = document.getElementById('progression-accidental');
  const quality = document.getElementById('progression-quality');
  const name = document.getElementById('progression-name');
  const tempo = document.getElementById('progression-tempo');
  const countIn = document.getElementById('progression-count-in');
  const previewLead = document.getElementById('progression-preview-lead');

  if (
    !toggle ||
    !closeButton ||
    !exportButton ||
    !importButton ||
    !importFileInput ||
    !newButton ||
    !saveButton ||
    !deleteButton ||
    !addStepButton ||
    !listContainer ||
    !stepsContainer ||
    !root ||
    !accidental ||
    !quality ||
    !name ||
    !tempo ||
    !countIn ||
    !previewLead
  ) {
    return;
  }

  toggle.addEventListener('click', () => {
    setProgressionPanelOpen(!appState.ui.progressionPanelOpen);
  });

  closeButton.addEventListener('click', () => {
    setProgressionPanelOpen(false);
  });

  exportButton.addEventListener('click', () => {
    exportProgressionsAsJson();
  });

  importButton.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async () => {
    const [file] = importFileInput.files || [];
    if (!file) {
      return;
    }

    try {
      await importProgressionsFromFile(file);
    } catch (error) {
      console.warn('Failed to import progressions:', error);
      window.alert('Could not import progressions. Please select a valid exported JSON file.');
    } finally {
      importFileInput.value = '';
    }
  });

  newButton.addEventListener('click', () => {
    createNewProgression();
  });

  saveButton.addEventListener('click', () => {
    saveProgressionDraft();
  });

  deleteButton.addEventListener('click', () => {
    deleteSelectedProgression();
  });

  addStepButton.addEventListener('click', () => {
    addProgressionStep();
  });

  listContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-progression-id]');
    if (!button) {
      return;
    }

    selectProgression(button.dataset.progressionId);
  });

  const draftFieldBindings = [
    [name, 'name', (value) => value],
    [root, 'keyRoot', (value) => value],
    [accidental, 'keyAccidental', (value) => normalizeAccidental(value)],
    [quality, 'keyQuality', (value) => (value === 'minor' ? 'minor' : 'major')],
    [tempo, 'tempo', (value) => Math.min(240, Math.max(30, Number(value) || 100))],
    [countIn, 'countInBeats', (value) => Math.min(8, Math.max(0, Number(value) || 0))],
    [previewLead, 'previewLead', (value) => (PREVIEW_LEAD_OPTIONS.includes(value) ? value : 'none')],
  ];

  draftFieldBindings.forEach(([node, field, transform]) => {
    node.addEventListener('input', () => {
      updateProgressionDraftField(field, transform(node.value));
    });
    node.addEventListener('change', () => {
      updateProgressionDraftField(field, transform(node.value));
      renderProgressionPanel();
    });
  });

  stepsContainer.addEventListener('input', (event) => {
    const target = event.target;
    const card = target.closest('[data-step-id]');
    if (!card || !target.dataset.stepField) {
      return;
    }

    const { stepField } = target.dataset;
    const stepId = card.dataset.stepId;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const normalizedValue =
      stepField === 'degree' || stepField === 'beats'
        ? Number(value)
        : stepField === 'accidental'
          ? normalizeAccidental(value)
          : value;
    updateProgressionStep(stepId, stepField, normalizedValue);
  });

  stepsContainer.addEventListener('change', (event) => {
    const target = event.target;
    const card = target.closest('[data-step-id]');
    if (!card || !target.dataset.stepField) {
      return;
    }

    const { stepField } = target.dataset;
    const stepId = card.dataset.stepId;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const normalizedValue =
      stepField === 'degree' || stepField === 'beats'
        ? Number(value)
        : stepField === 'accidental'
          ? normalizeAccidental(value)
          : value;
    updateProgressionStep(stepId, stepField, normalizedValue);
    renderProgressionPanel();
  });

  stepsContainer.addEventListener('click', (event) => {
    const deleteStepButton = event.target.closest('[data-step-delete]');
    if (!deleteStepButton) {
      return;
    }

    removeProgressionStep(deleteStepButton.dataset.stepDelete);
  });

  setProgressionPanelOpen(appState.ui.progressionPanelOpen);
  renderProgressionPanel();
}

function parseSelectedNote(state = appState) {
  return parseNote(state.root, state.accidental);
}

function getQualityLabel(quality) {
  if (quality === 'minor') {
    return 'Minor';
  }

  if (quality === 'diminished') {
    return 'Diminished';
  }

  return 'Major';
}

function getChordSymbol() {
  const note = parseSelectedNote();
  const qualitySuffix = appState.quality === 'minor' ? 'm' : '';
  return `${note.preferredName}${qualitySuffix}`;
}

function getDegreeIndex() {
  const parsed = Number(appState.degree);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(6, Math.max(0, Math.trunc(parsed) - 1));
}

function getDegreeLabelByIndex(index) {
  return DEGREE_LABELS[index] || 'I';
}

function getNoteNameBySemitone(semitone, accidentalPreference = '') {
  const names = accidentalPreference === 'b' ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;
  return names[normalizeSemitone(semitone)];
}

const EMBEDDED_DIMINISHED_VOICINGS = [
  {
    id: 'fallback-voicing-diminished-c',
    label: 'Diminished Triad',
    type: 'voicing',
    quality: 'diminished',
    caged: 'C',
    referenceRoot: 'C',
    relativeFrets: ['x', 3, 4, 5, 4, 'x'],
  },
  {
    id: 'fallback-voicing-diminished-a',
    label: 'Diminished Triad',
    type: 'voicing',
    quality: 'diminished',
    caged: 'A',
    referenceRoot: 'A',
    relativeFrets: ['x', 0, 1, 2, 1, 'x'],
  },
  {
    id: 'fallback-voicing-diminished-g',
    label: 'Diminished Triad',
    type: 'voicing',
    quality: 'diminished',
    caged: 'G',
    referenceRoot: 'G',
    relativeFrets: [3, 1, 'x', 3, 2, 3],
  },
  {
    id: 'fallback-voicing-diminished-e',
    label: 'Diminished Triad',
    type: 'voicing',
    quality: 'diminished',
    caged: 'E',
    referenceRoot: 'E',
    relativeFrets: [0, 1, 2, 0, 'x', 3],
  },
  {
    id: 'fallback-voicing-diminished-d',
    label: 'Diminished Triad',
    type: 'voicing',
    quality: 'diminished',
    caged: 'D',
    referenceRoot: 'D',
    relativeFrets: ['x', 'x', 0, 1, 3, 1],
  },
];

function getVoicingCandidatesByQuality(quality) {
  const matches = catalog.voicings.filter((voicing) => voicing.quality === quality);
  if (matches.length > 0) {
    return matches;
  }

  if (quality === 'diminished') {
    return EMBEDDED_DIMINISHED_VOICINGS;
  }

  return [];
}

function getDegreeSelection() {
  const keyNote = parseSelectedNote();
  const degreeIndex = getDegreeIndex();
  const degreeLabel = getDegreeLabelByIndex(degreeIndex);
  const scaleIntervals = getScaleIntervalsForQuality(appState.quality);
  const degreeQualities = DEGREE_TRIAD_QUALITIES[appState.quality] || DEGREE_TRIAD_QUALITIES.major;
  const targetInterval = scaleIntervals[degreeIndex] ?? 0;
  const targetRootSemitone = normalizeSemitone(keyNote.semitone + targetInterval);
  const targetQuality = degreeQualities[degreeIndex] || 'major';
  const targetRootName = getNoteNameBySemitone(targetRootSemitone, appState.accidental);
  const targetSymbol = `${targetRootName}${
    targetQuality === 'minor' ? 'm' : targetQuality === 'diminished' ? 'dim' : ''
  }`;

  return {
    keyRootSemitone: keyNote.semitone,
    keyQuality: appState.quality,
    keySymbol: getChordSymbol(),
    degreeIndex,
    degreeLabel,
    isTonic: degreeIndex === 0,
    targetRootSemitone,
    targetQuality,
    targetSymbol,
  };
}

function resolveVoicingForSelection(selection) {
  const basePattern = findVoicingByState(appState.quality, appState.caged);
  if (!basePattern) {
    throw new Error('No base voicing template found for current selection.');
  }

  const baseTransposed = transposeVoicing(basePattern, selection.keyRootSemitone);
  if (selection.isTonic) {
    const tonicTransposed = transposeVoicing(basePattern, selection.targetRootSemitone);
    return {
      pattern: basePattern,
      transposed: tonicTransposed,
      caged: basePattern.caged,
      anchorPosition: baseTransposed.position,
    };
  }

  const candidatePatterns = getVoicingCandidatesByQuality(selection.targetQuality);
  if (candidatePatterns.length === 0) {
    throw new Error(`No ${selection.targetQuality} voicing templates available.`);
  }

  const hasOpenAnchor = baseTransposed.position === 1;

  let best = null;

  for (const pattern of candidatePatterns) {
    const transposed = transposeVoicing(pattern, selection.targetRootSemitone);
    const distance = Math.abs(transposed.position - baseTransposed.position);
    const usesOpenPosition = transposed.position === 1;
    const openPenalty = !hasOpenAnchor && usesOpenPosition ? 1 : 0;
    const sameCagedPenalty = pattern.caged === appState.caged ? 0 : 1;

    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && openPenalty < best.openPenalty) ||
      (distance === best.distance &&
        openPenalty === best.openPenalty &&
        sameCagedPenalty < best.sameCagedPenalty) ||
      (distance === best.distance &&
        openPenalty === best.openPenalty &&
        sameCagedPenalty === best.sameCagedPenalty &&
        transposed.position < best.transposed.position)
    ) {
      best = {
        pattern,
        transposed,
        caged: pattern.caged,
        distance,
        openPenalty,
        sameCagedPenalty,
      };
    }
  }

  return {
    pattern: best.pattern,
    transposed: best.transposed,
    caged: best.caged,
    anchorPosition: baseTransposed.position,
  };
}

function getSelectionLabel(selection = null, resolvedVoicing = null) {
  if (!selection) {
    return `${getChordSymbol()} (${getDegreeLabelByIndex(0)}) · ${appState.caged} voicing`;
  }

  const caged = resolvedVoicing?.caged || appState.caged;
  return `${selection.targetSymbol} (${selection.degreeLabel}) · ${caged} voicing`;
}

function updateSelectionTitle(label = getSelectionLabel()) {
  const title = document.getElementById('selection-title');
  if (title) {
    title.textContent = label;
  }
}

function updateVersionLabel() {
  const node = document.getElementById('app-version');
  if (!node) {
    return;
  }

  node.textContent = `Version ${APP_VERSION}`;
}

async function loadTemplates() {
  const cachebust = `?v=${APP_VERSION}`;
  const registryResponse = await fetch(`./data/templates/registry.json${cachebust}`);
  if (!registryResponse.ok) {
    throw new Error('Failed to load template registry.');
  }

  const registry = await registryResponse.json();
  const templateFiles = Array.isArray(registry.templateFiles) ? registry.templateFiles : [];

  catalog.voicings = [];
  catalog.overlays = [];
  catalog.scales = [];

  const responses = await Promise.all(
    templateFiles.map(async (path) => {
      const response = await fetch(`${path}${cachebust}`);
      if (!response.ok) {
        throw new Error(`Failed to load template file: ${path}`);
      }
      return response.json();
    })
  );

  for (const payload of responses) {
    if (Array.isArray(payload.patterns)) {
      for (const pattern of payload.patterns) {
        if (pattern.type === 'voicing') {
          catalog.voicings.push(pattern);
        } else if (pattern.type === 'scale') {
          catalog.scales.push(pattern);
        }
      }
    }

    if (Array.isArray(payload.overlays)) {
      for (const overlay of payload.overlays) {
        catalog.overlays.push(overlay);
      }
    }
  }
}

function findVoicingByState(quality, caged) {
  return (
    catalog.voicings.find((voicing) => voicing.quality === quality && voicing.caged === caged) || null
  );
}

function findActiveVoicing() {
  return findVoicingByState(appState.quality, appState.caged);
}

function populateOverlayToggles() {
  const container = document.getElementById('overlay-options');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  for (const overlay of catalog.overlays) {
    const isEnabled = Boolean(overlay.defaultEnabled);
    appState.overlays[overlay.id] = isEnabled;

    const label = document.createElement('label');
    label.className = `overlay-toggle${isEnabled ? ' is-active' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isEnabled;
    checkbox.dataset.overlayId = overlay.id;

    const text = document.createElement('span');
    text.textContent = overlay.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);

    checkbox.addEventListener('change', () => {
      // Mutual exclusion: only one pentatonic mode (key vs. chord) can be active
      if (checkbox.checked) {
        if (overlay.id === 'overlay-pentatonic') {
          appState.overlays['overlay-chord-pentatonic'] = false;
          const chordPentToggle = container.querySelector('input[data-overlay-id="overlay-chord-pentatonic"]');
          if (chordPentToggle) {
            chordPentToggle.checked = false;
            chordPentToggle.parentElement.classList.remove('is-active');
          }
        } else if (overlay.id === 'overlay-chord-pentatonic') {
          appState.overlays['overlay-pentatonic'] = false;
          const keyPentToggle = container.querySelector('input[data-overlay-id="overlay-pentatonic"]');
          if (keyPentToggle) {
            keyPentToggle.checked = false;
            keyPentToggle.parentElement.classList.remove('is-active');
          }
        }
      }
      appState.overlays[overlay.id] = checkbox.checked;
      label.classList.toggle('is-active', checkbox.checked);
      renderCharts();
    });
  }
}

function transposeVoicing(pattern, targetSemitone, title = getSelectionLabel()) {
  const reference = parseNote(pattern.referenceRoot || 'C');
  const offset = normalizeSemitone(targetSemitone - reference.semitone);

  const absoluteFrets = (pattern.relativeFrets || []).map((fret) => {
    if (fret === 'x') {
      return 'x';
    }

    const absolute = Number(fret) + offset;
    if (absolute < 0) {
      return 'x';
    }

    return absolute;
  });

  const fretted = absoluteFrets.filter((fret) => typeof fret === 'number' && fret > 0);
  const hasOpenString = absoluteFrets.some((fret) => fret === 0);
  const position = hasOpenString ? 1 : fretted.length > 0 ? Math.min(...fretted) : 1;

  const fingers = absoluteFrets.map((fret, index) => {
    const stringIndex = 6 - index;

    if (fret === 'x') {
      return [stringIndex, 'x'];
    }

    if (fret === 0) {
      return [stringIndex, 0];
    }

    const displayFret = fret - position + 1;
    return [stringIndex, displayFret];
  });

  const displayedFretted = fingers
    .map((entry) => entry[1])
    .filter((fret) => typeof fret === 'number' && fret > 0);
  const frets = Math.max(5, displayedFretted.length > 0 ? Math.max(...displayedFretted) : 5);

  return {
    title,
    position,
    frets,
    absoluteFrets,
    fingers,
    barres: Array.isArray(pattern.barres) ? pattern.barres : [],
  };
}

function getOverlayById(id) {
  return catalog.overlays.find((overlay) => overlay.id === id) || null;
}

function getScaleIntervalsForQuality(quality) {
  const match = catalog.scales.find((pattern) => pattern.quality === quality);
  if (match && Array.isArray(match.intervals) && match.intervals.length > 0) {
    return match.intervals;
  }

  return quality === 'minor'
    ? [0, 2, 3, 5, 7, 8, 10]
    : [0, 2, 4, 5, 7, 9, 11];
}

function getPentatonicIntervalsForQuality(quality) {
  return quality === 'minor' ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
}

function buildDegreeLabelMap(scaleIntervals) {
  const labelMap = new Map();
  scaleIntervals.forEach((interval, index) => {
    labelMap.set(normalizeSemitone(interval), String(index + 1));
  });
  return labelMap;
}

function buildTriadLabelMap(quality) {
  const intervals =
    quality === 'minor' ? [0, 3, 7] : quality === 'diminished' ? [0, 3, 6] : [0, 4, 7];
  const labels = ['1', '3', '5'];
  const labelMap = new Map();

  intervals.forEach((interval, index) => {
    labelMap.set(interval, labels[index]);
  });

  return labelMap;
}

function buildChordPentatonicLabelMap(quality) {
  const scaleIntervals = getScaleIntervalsForQuality(quality);
  const intervals = getPentatonicIntervalsForQuality(quality);
  const scaleLabelMap = buildDegreeLabelMap(scaleIntervals);
  const labelMap = new Map();

  intervals.forEach((interval) => {
    labelMap.set(interval, scaleLabelMap.get(normalizeSemitone(interval)) || '');
  });

  return labelMap;
}

function getOpenStringSemitoneByTemplateIndex(index) {
  const lowToHighOpen = [4, 9, 2, 7, 11, 4];
  return lowToHighOpen[index];
}

function buildRenderedFingers(pattern, transposed, renderContext) {
  const {
    keyRootSemitone,
    keyQuality,
    displayedChordRootSemitone,
    displayedChordQuality,
    useDisplayedChordDegreeLabels,
    diagramPosition,
    diagramFrets,
  } = renderContext;
  const baseFingers = [];
  for (let index = 0; index < transposed.absoluteFrets.length; index += 1) {
    const absoluteFret = transposed.absoluteFrets[index];
    const stringIndex = 6 - index;

    if (absoluteFret === 'x') {
      baseFingers.push([stringIndex, 'x']);
      continue;
    }

    if (absoluteFret === 0) {
      baseFingers.push([stringIndex, 0]);
      continue;
    }

    const displayFret = absoluteFret - diagramPosition + 1;
    if (displayFret < 1 || displayFret > diagramFrets) {
      continue;
    }

    baseFingers.push([stringIndex, displayFret]);
  }

  const chordOverlay = getOverlayById('overlay-chord-tones');
  const pentOverlay = getOverlayById('overlay-pentatonic');
  const chordPentOverlay = getOverlayById('overlay-chord-pentatonic');
  const scaleOverlay = getOverlayById('overlay-diatonic');

  const showChord = appState.overlays['overlay-chord-tones'] !== false;
  const showKeyPent = appState.overlays['overlay-pentatonic'] === true;
  const showChordPent =
    appState.overlays['overlay-chord-pentatonic'] === true && displayedChordQuality !== 'diminished';
  const showScale = appState.overlays['overlay-diatonic'] === true;

  const scaleIntervals = getScaleIntervalsForQuality(keyQuality);
  const keyPentIntervals = getPentatonicIntervalsForQuality(keyQuality);
  const chordPentIntervals = getPentatonicIntervalsForQuality(displayedChordQuality);

  const scaleSet = new Set(scaleIntervals.map((interval) => normalizeSemitone(interval)));
  const keyPentSet = new Set(keyPentIntervals.map((interval) => normalizeSemitone(interval)));
  const chordPentSet = new Set(chordPentIntervals.map((interval) => normalizeSemitone(interval)));
  const keyDegreeLabels = buildDegreeLabelMap(scaleIntervals);
  const chordDegreeLabels = buildTriadLabelMap(displayedChordQuality);
  const chordPentLabels = buildChordPentatonicLabelMap(displayedChordQuality);
  const voicingPositionSet = new Set();

  for (let stringTemplateIndex = 0; stringTemplateIndex < transposed.absoluteFrets.length; stringTemplateIndex += 1) {
    const absoluteFret = transposed.absoluteFrets[stringTemplateIndex];
    if (typeof absoluteFret !== 'number') {
      continue;
    }

    const displayFret = absoluteFret - diagramPosition + 1;
    if (displayFret < 1 || displayFret > diagramFrets) {
      continue;
    }

    const stringIndex = 6 - stringTemplateIndex;
    voicingPositionSet.add(`${stringIndex}:${displayFret}`);
  }

  const markerMap = new Map();
  const preFretMarkerMap = new Map();

  const addMarker = (
    stringIndex,
    displayFret,
    intervalFromRoot,
    color,
    priority,
    {
      text = keyDegreeLabels.get(intervalFromRoot) || '',
      textColor = color,
      fillColor = color,
      strokeColor,
      strokeWidth,
    } = {}
  ) => {
    const key = `${stringIndex}:${displayFret}`;
    const current = markerMap.get(key);
    if (current && current.priority <= priority) {
      return;
    }

    markerMap.set(key, {
      stringIndex,
      displayFret,
      priority,
      color,
      fillColor,
      strokeColor,
      strokeWidth,
      text,
      textColor,
    });
  };

  const addPreFretMarker = (
    stringIndex,
    priority,
    { text = '', textColor = '#111111', fillColor = '#ffffff', strokeColor = '#111111', strokeWidth = 2 } = {}
  ) => {
    const current = preFretMarkerMap.get(stringIndex);
    if (current && current.priority <= priority) {
      return;
    }

    preFretMarkerMap.set(stringIndex, {
      stringIndex,
      priority,
      text,
      textColor,
      fillColor,
      strokeColor,
      strokeWidth,
    });
  };

  for (let stringTemplateIndex = 0; stringTemplateIndex < 6; stringTemplateIndex += 1) {
    const openSemitone = getOpenStringSemitoneByTemplateIndex(stringTemplateIndex);
    const stringIndex = 6 - stringTemplateIndex;

    const openIntervalFromKeyRoot = normalizeSemitone(openSemitone - keyRootSemitone);
    const openIntervalFromDisplayedChordRoot = normalizeSemitone(
      openSemitone - displayedChordRootSemitone
    );
    const voicingOpenKey = `${stringIndex}:0`;
    const isVoicingOpen = transposed.absoluteFrets[stringTemplateIndex] === 0;
    const allowOpenOverlay = isVoicingOpen || diagramPosition === 1;
    const isOpenKeyPent = keyPentSet.has(openIntervalFromKeyRoot);
    const isOpenChordPent = chordPentSet.has(openIntervalFromDisplayedChordRoot);
    const isOpenScale = scaleSet.has(openIntervalFromKeyRoot);

    const openChordText = useDisplayedChordDegreeLabels
      ? chordDegreeLabels.get(openIntervalFromDisplayedChordRoot) || ''
      : keyDegreeLabels.get(openIntervalFromKeyRoot) || '';
    const hasOpenChordLabel = openChordText !== '';

    if (showChord && isVoicingOpen && chordOverlay && hasOpenChordLabel) {
      addMarker(stringIndex, 0, openIntervalFromKeyRoot, chordOverlay.color, 1, {
        text: openChordText,
        textColor: useDisplayedChordDegreeLabels ? chordOverlay.color : '#ffffff',
        fillColor: useDisplayedChordDegreeLabels ? '#ffffff' : chordOverlay.color,
        strokeColor: '#000000',
        strokeWidth: 2,
      });
    } else if (allowOpenOverlay && showChordPent && isOpenChordPent && chordPentOverlay) {
      addMarker(stringIndex, 0, openIntervalFromDisplayedChordRoot, chordPentOverlay.color, 2, {
        text: chordPentLabels.get(openIntervalFromDisplayedChordRoot) || '',
        textColor: '#ffffff',
      });
    } else if (allowOpenOverlay && showKeyPent && isOpenKeyPent && pentOverlay) {
      addMarker(stringIndex, 0, openIntervalFromKeyRoot, pentOverlay.color, 2, {
        textColor: '#ffffff',
      });
    } else if (allowOpenOverlay && showScale && isOpenScale && !(showKeyPent && isOpenKeyPent) && !(showChordPent && isOpenChordPent) && scaleOverlay) {
      addMarker(stringIndex, 0, openIntervalFromKeyRoot, scaleOverlay.color, 3, {
        textColor: '#ffffff',
      });
    }

    const stringFret = transposed.absoluteFrets[stringTemplateIndex];
    const isOpenString = stringFret === 0;
    const canShowPreFret = diagramPosition > 1 && !isOpenString;
    if (canShowPreFret) {
      const preFretAbsolute = diagramPosition - 1;
      const preFretSemitone = normalizeSemitone(openSemitone + preFretAbsolute);
      const preIntervalFromKeyRoot = normalizeSemitone(preFretSemitone - keyRootSemitone);
      const preIntervalFromDisplayedChordRoot = normalizeSemitone(
        preFretSemitone - displayedChordRootSemitone
      );

      const isPreChord = showChord && typeof stringFret === 'number' && stringFret === preFretAbsolute;
      const isPreKeyPent = keyPentSet.has(preIntervalFromKeyRoot);
      const isPreChordPent = chordPentSet.has(preIntervalFromDisplayedChordRoot);
      const isPreScale = scaleSet.has(preIntervalFromKeyRoot);

      const preChordText = useDisplayedChordDegreeLabels
        ? chordDegreeLabels.get(preIntervalFromDisplayedChordRoot) || ''
        : keyDegreeLabels.get(preIntervalFromKeyRoot) || '';
      const hasPreChordLabel = preChordText !== '';

      if (isPreChord && chordOverlay && hasPreChordLabel) {
        addPreFretMarker(stringIndex, 1, {
          text: preChordText,
          textColor: useDisplayedChordDegreeLabels ? chordOverlay.color : '#ffffff',
          fillColor: useDisplayedChordDegreeLabels ? '#ffffff' : chordOverlay.color,
          strokeColor: '#000000',
          strokeWidth: 2,
        });
      } else if (showChordPent && isPreChordPent && chordPentOverlay) {
        addPreFretMarker(stringIndex, 2, {
          text: chordPentLabels.get(preIntervalFromDisplayedChordRoot) || '',
          textColor: '#ffffff',
          fillColor: chordPentOverlay.color,
          strokeColor: chordPentOverlay.color,
          strokeWidth: 2,
        });
      } else if (showKeyPent && isPreKeyPent && pentOverlay) {
        addPreFretMarker(stringIndex, 2, {
          text: keyDegreeLabels.get(preIntervalFromKeyRoot) || '',
          textColor: '#ffffff',
          fillColor: pentOverlay.color,
          strokeColor: pentOverlay.color,
          strokeWidth: 2,
        });
      } else if (showScale && isPreScale && !(showKeyPent && isPreKeyPent) && !(showChordPent && isPreChordPent) && scaleOverlay) {
        addPreFretMarker(stringIndex, 3, {
          text: keyDegreeLabels.get(preIntervalFromKeyRoot) || '',
          textColor: '#ffffff',
          fillColor: scaleOverlay.color,
          strokeColor: scaleOverlay.color,
          strokeWidth: 2,
        });
      }
    }

    for (let displayFret = 1; displayFret <= diagramFrets; displayFret += 1) {
      const displayedAbsoluteFret = diagramPosition + displayFret - 1;
      const overlayAbsoluteFret = diagramPosition + displayFret - 1;

      const displayedNoteSemitone = normalizeSemitone(openSemitone + displayedAbsoluteFret);
      const overlayNoteSemitone = normalizeSemitone(openSemitone + overlayAbsoluteFret);

      const intervalFromKeyRoot = normalizeSemitone(overlayNoteSemitone - keyRootSemitone);
      const intervalFromDisplayedChordRoot = normalizeSemitone(
        displayedNoteSemitone - displayedChordRootSemitone
      );

      const positionKey = `${stringIndex}:${displayFret}`;
      const isVoicingPosition = voicingPositionSet.has(positionKey);
      const isKeyPent = keyPentSet.has(intervalFromKeyRoot);
      const isChordPent = chordPentSet.has(intervalFromDisplayedChordRoot);
      const isScale = scaleSet.has(intervalFromKeyRoot);

      const chordText = useDisplayedChordDegreeLabels
        ? chordDegreeLabels.get(intervalFromDisplayedChordRoot) || ''
        : keyDegreeLabels.get(intervalFromKeyRoot) || '';
      const hasChordLabel = chordText !== '';

      if (showChord && isVoicingPosition && chordOverlay && hasChordLabel) {
        addMarker(stringIndex, displayFret, intervalFromKeyRoot, chordOverlay.color, 1, {
          text: chordText,
          textColor: useDisplayedChordDegreeLabels ? chordOverlay.color : '#ffffff',
          fillColor: useDisplayedChordDegreeLabels ? '#ffffff' : chordOverlay.color,
          strokeColor: '#000000',
          strokeWidth: 2,
        });
        continue;
      }

      if (showChordPent && isChordPent && chordPentOverlay) {
        addMarker(stringIndex, displayFret, intervalFromDisplayedChordRoot, chordPentOverlay.color, 2, {
          text: chordPentLabels.get(intervalFromDisplayedChordRoot) || '',
          textColor: '#ffffff',
        });
        continue;
      }

      if (showKeyPent && isKeyPent && pentOverlay) {
        addMarker(stringIndex, displayFret, intervalFromKeyRoot, pentOverlay.color, 2, {
          textColor: '#ffffff',
        });
        continue;
      }

      if (showScale && isScale && !(showKeyPent && isKeyPent) && !(showChordPent && isChordPent) && scaleOverlay) {
        addMarker(stringIndex, displayFret, intervalFromKeyRoot, scaleOverlay.color, 3, {
          textColor: '#ffffff',
        });
      }
    }
  }

  if (markerMap.size === 0 && preFretMarkerMap.size === 0) {
    return baseFingers;
  }

  const openAndMute = baseFingers
    .map((finger) => {
      if (finger[1] !== 0) {
        return finger;
      }

      const stringIndex = finger[0];
      const marker = markerMap.get(`${stringIndex}:0`);
      if (!marker) {
        return finger;
      }

      return [
        stringIndex,
        0,
        {
          text: marker.text,
          textColor: marker.textColor,
          strokeColor: marker.strokeColor || marker.color,
          strokeWidth: marker.strokeWidth,
          topRowFillColor: marker.fillColor,
          topRowTextColor: marker.textColor,
          topRowStrokeColor: marker.strokeColor || marker.color,
          topRowStrokeWidth: marker.strokeWidth,
        },
      ];
    })
    .filter((finger) => finger[1] === 'x' || finger[1] === 0);

  const topRowByString = new Map(openAndMute.map((finger) => [finger[0], finger]));

  Array.from(markerMap.values())
    .filter((marker) => marker.displayFret === 0 && marker.text)
    .forEach((marker) => {
      topRowByString.set(marker.stringIndex, [
        marker.stringIndex,
        0,
        {
          text: marker.text,
          textColor: marker.textColor,
          strokeColor: marker.strokeColor || marker.color,
          strokeWidth: marker.strokeWidth,
          topRowFillColor: marker.fillColor,
          topRowTextColor: marker.textColor,
          topRowStrokeColor: marker.strokeColor || marker.color,
          topRowStrokeWidth: marker.strokeWidth,
        },
      ]);
    });

  preFretMarkerMap.forEach((marker, stringIndex) => {
    if (!marker.text) {
      return;
    }

    topRowByString.set(stringIndex, [
      stringIndex,
      0,
      {
        text: marker.text,
        textColor: marker.textColor,
        strokeColor: marker.strokeColor,
        strokeWidth: marker.strokeWidth,
        topRowFillColor: marker.fillColor,
        topRowTextColor: marker.textColor,
        topRowStrokeColor: marker.strokeColor,
        topRowStrokeWidth: marker.strokeWidth,
      },
    ]);
  });

  const topRowFingers = Array.from(topRowByString.values()).sort((a, b) => a[0] - b[0]);
  const markerFingers = Array.from(markerMap.values())
    .filter((marker) => marker.displayFret > 0)
    .sort((a, b) => a.stringIndex - b.stringIndex || a.displayFret - b.displayFret)
    .map((marker) => [
      marker.stringIndex,
      marker.displayFret,
      {
        text: marker.text,
        color: marker.fillColor,
        textColor: marker.textColor,
        strokeColor: marker.strokeColor,
        strokeWidth: marker.strokeWidth,
      },
    ]);

  return [...topRowFingers, ...markerFingers];
}

function applyTopRowFilledMarkerStyles(chartElement, fingers) {
  if (!chartElement) {
    return;
  }

  const svg = chartElement.querySelector('svg');
  if (!svg) {
    return;
  }

  for (const finger of fingers) {
    if (!Array.isArray(finger) || finger[1] !== 0) {
      continue;
    }

    const options = finger[2];
    if (!options || !options.topRowFillColor) {
      continue;
    }

    const stringIndex = Number(finger[0]);
    const classIndex = 6 - stringIndex;
    const openCircle = svg.querySelector(`.open-string-${classIndex}`);
    if (openCircle) {
      openCircle.setAttribute('fill', options.topRowFillColor);
      if (options.topRowStrokeColor) {
        openCircle.setAttribute('stroke', options.topRowStrokeColor);
      }
      if (typeof options.topRowStrokeWidth === 'number') {
        openCircle.setAttribute('stroke-width', String(options.topRowStrokeWidth));
      }
    }

    const textNode = svg.querySelector(`.string-text-${classIndex}`);
    if (textNode && options.topRowTextColor) {
      textNode.setAttribute('fill', options.topRowTextColor);

      const textValue = options.text || textNode.textContent || '';
      if (textValue) {
        textNode.setAttribute('opacity', '0');

        const overlayText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        overlayText.setAttribute('x', textNode.getAttribute('x') || '0');
        overlayText.setAttribute('y', textNode.getAttribute('y') || '0');
        overlayText.setAttribute('text-anchor', 'middle');
        overlayText.setAttribute('dominant-baseline', 'middle');
        overlayText.setAttribute('font-family', textNode.getAttribute('font-family') || 'Verdana, sans-serif');
        overlayText.setAttribute('font-size', textNode.getAttribute('font-size') || '24');
        overlayText.setAttribute('fill', options.topRowTextColor);
        overlayText.setAttribute('class', `top-row-marker-text top-row-marker-text-${classIndex}`);
        overlayText.textContent = textValue;
        svg.appendChild(overlayText);
      }
    }
  }
}

function renderChordFromTemplate(SVGuitarChord) {
  const selection = getDegreeSelection();
  const resolvedVoicing = resolveVoicingForSelection(selection);
  const selectionLabel = getSelectionLabel(selection, resolvedVoicing);
  const transposed = transposeVoicing(
    resolvedVoicing.pattern,
    selection.targetRootSemitone,
    selectionLabel
  );
  const diagramPosition = resolvedVoicing.anchorPosition;
  const displayedFrettedInFrame = transposed.absoluteFrets
    .filter((fret) => typeof fret === 'number' && fret > 0)
    .map((fret) => fret - diagramPosition + 1)
    .filter((fret) => fret >= 1);
  const diagramFrets = Math.max(
    5,
    displayedFrettedInFrame.length > 0 ? Math.max(...displayedFrettedInFrame) : 5
  );

  const fingers = buildRenderedFingers(resolvedVoicing.pattern, transposed, {
    keyRootSemitone: selection.keyRootSemitone,
    keyQuality: selection.keyQuality,
    displayedChordRootSemitone: selection.targetRootSemitone,
    displayedChordQuality: selection.targetQuality,
    useDisplayedChordDegreeLabels: !selection.isTonic,
    diagramPosition,
    diagramFrets,
  });

  const chart = new SVGuitarChord('#main-chart');

  chart
    .configure({
      style: 'normal',
      strings: 6,
      frets: diagramFrets,
      position: diagramPosition,
      fixedDiagramPosition: true,
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
    })
    .chord({
      title: '',
      fingers,
      barres: transposed.barres,
    })
    .draw();

  const chartContainer = document.getElementById('main-chart');
  applyTopRowFilledMarkerStyles(chartContainer, fingers);

  return {
    selectionLabel,
    renderedChordSymbol: selection.targetSymbol,
    renderedDegreeLabel: selection.degreeLabel,
  };
}

async function renderCharts() {
  const previousScrollY = window.scrollY;

  try {
    await ensureSvguitarScriptLoaded();
    const SVGuitarChord = await waitForChordRenderer();

    const chartContainer = document.getElementById('main-chart');
    if (!chartContainer) {
      throw new Error('Chart container not found in DOM.');
    }

    chartContainer.innerHTML = '';

    const renderResult = renderChordFromTemplate(SVGuitarChord);
    updateSelectionTitle(renderResult.selectionLabel);

    const svgCount = document.querySelectorAll('.chart svg').length;
    setDiagnostics(
      `Version: ${APP_VERSION}\nSVGuitar loaded: yes\nRendered SVG nodes: ${svgCount}\nKey: ${getChordSymbol()}\nDisplayed chord: ${renderResult.renderedDegreeLabel} (${renderResult.renderedChordSymbol})`,
      svgCount === 0
    );

    if (svgCount === 0) {
      throw new Error('Render completed but no SVG nodes were produced.');
    }
  } catch (error) {
    console.error('Render error:', error);
    setDiagnostics(
      `Render error: ${error?.message || String(error)}\nwindow.svguitar: ${!!window.svguitar}`,
      true
    );
  } finally {
    window.scrollTo({ top: previousScrollY });
  }
}

function setupControls() {
  const root = document.getElementById('root-note');
  const accidental = document.getElementById('accidental');
  const quality = document.getElementById('quality');
  const cagedButtons = document.getElementById('caged-buttons');
  const degreeButtons = document.getElementById('degree-buttons');

  if (!root || !accidental || !quality || !cagedButtons || !degreeButtons) {
    return;
  }

  root.value = appState.root;
  accidental.value = appState.accidental;
  quality.value = appState.quality;

  root.addEventListener('change', () => {
    appState.root = root.value;
    updateSelectionTitle();
    renderCharts();
  });

  accidental.addEventListener('change', () => {
    appState.accidental = normalizeAccidental(accidental.value);
    updateSelectionTitle();
    renderCharts();
  });

  quality.addEventListener('change', () => {
    appState.quality = quality.value;
    updateSelectionTitle();
    renderCharts();
  });

  cagedButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-voicing]');
    if (!button) {
      return;
    }

    appState.caged = button.dataset.voicing;

    Array.from(cagedButtons.querySelectorAll('button[data-voicing]')).forEach((node) => {
      node.classList.toggle('is-active', node === button);
    });

    updateSelectionTitle();
    renderCharts();
  });

  degreeButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-degree]');
    if (!button) {
      return;
    }

    appState.degree = Number(button.dataset.degree) || 1;

    Array.from(degreeButtons.querySelectorAll('button[data-degree]')).forEach((node) => {
      node.classList.toggle('is-active', node === button);
    });

    updateSelectionTitle();
    renderCharts();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  // When a new SW takes control, reload so the page runs the latest assets.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  (async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      // Immediately check for an updated SW rather than waiting for next visit.
      await registration.update();
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  })();
}

async function boot() {
  await loadTemplates();
  loadProgressionsFromStorage();
  setupControls();
  setupProgressionControls();
  updateVersionLabel();
  populateOverlayToggles();
  updateSelectionTitle();
  await renderCharts();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      console.error('Boot failed:', error);
      setDiagnostics(`Boot error: ${error?.message || String(error)}`, true);
    });
  });
} else {
  boot().catch((error) => {
    console.error('Boot failed:', error);
    setDiagnostics(`Boot error: ${error?.message || String(error)}`, true);
  });
}

registerServiceWorker();
