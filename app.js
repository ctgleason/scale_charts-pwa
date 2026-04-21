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

const APP_VERSION = 'v2026.04.21+diatonic-7th-9th';

// Stable key: never changes.  Migration lives in the envelope's schemaVersion field.
const PROGRESSION_STORAGE_KEY = 'scale-charts.progressions';
const PROGRESSION_SCHEMA_VERSION = 1;
// Legacy key used before versioned envelope. Data is migrated on first load.
const PROGRESSION_LEGACY_KEY = 'scale-charts.progressions.v1';
const DEFAULT_PROGRESSION_PACK_PATH = './data/common-progressions-pack.json';
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
const CHORD_EXTENSION_OPTIONS = ['triad', 'seventh', 'ninth'];
const NINTH_VOICING_FALLBACKS = {
  major9: {
    C: ['A', 'E'],
    G: ['E', 'A'],
    D: ['E', 'A'],
  },
  minor9: {
    C: ['A', 'E'],
    G: ['E', 'A'],
    D: ['E', 'A'],
  },
  dominant9: {
    C: ['A', 'G', 'E'],
    D: ['A', 'G', 'E'],
  },
  'half-diminished9': {
    C: ['A', 'D', 'E'],
    G: ['E', 'A', 'D'],
  },
};
const DEGREE_TRIAD_QUALITIES = {
  major: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
  minor: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
  dorian: ['minor', 'minor', 'major', 'major', 'minor', 'diminished', 'major'],
  mixolydian: ['major', 'minor', 'diminished', 'major', 'minor', 'minor', 'major'],
};
const DEGREE_SEVENTH_QUALITIES = {
  major: ['major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'half-diminished7'],
  minor: ['minor7', 'half-diminished7', 'major7', 'minor7', 'minor7', 'major7', 'dominant7'],
  dorian: ['minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'half-diminished7', 'major7'],
  mixolydian: ['dominant7', 'minor7', 'half-diminished7', 'major7', 'minor7', 'minor7', 'major7'],
};
const CHORD_QUALITY_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  'half-diminished7': [0, 3, 6, 10],
  major9: [0, 4, 7, 11, 2],
  minor9: [0, 3, 7, 10, 2],
  dominant9: [0, 4, 7, 10, 2],
  'half-diminished9': [0, 3, 6, 10, 2],
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
  extension: 'triad',
  caged: 'C',
  degree: 1,
  overlays: {},
  ui: {
    progressionPanelOpen: false,
  },
  progressions: [],
  selectedProgressionId: null,
  progressionKeyQuality: null,
  progressionDraft: null,
  transport: {
    status: 'stopped',
    activeProgressionId: null,
    currentStepIndex: -1,
    currentBeatInStep: 0,
    countInRemaining: 0,
    timerId: null,
    previewAnimationFrameId: null,
  },
  selectionContext: {
    source: 'manual',
    progressionId: null,
    stepId: null,
    stepIndex: null,
    beats: null,
  },
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
    extension: CHORD_EXTENSION_OPTIONS.includes(defaults.extension) ? defaults.extension : 'triad',
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
    extension: CHORD_EXTENSION_OPTIONS.includes(step.extension) ? step.extension : 'triad',
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
    keyQuality: ['major', 'minor', 'dorian', 'mixolydian'].includes(progression.keyQuality) ? progression.keyQuality : 'major',
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

async function loadBundledProgressions() {
  const response = await fetch(`${DEFAULT_PROGRESSION_PACK_PATH}?v=${encodeURIComponent(APP_VERSION)}`);
  if (!response.ok) {
    throw new Error(`Failed to load bundled progressions: ${response.status}`);
  }

  const payload = await response.json();
  const normalized = normalizeImportedProgressionsPayload(payload);
  if (!normalized) {
    throw new Error('Bundled progressions JSON has an invalid format.');
  }

  const migrated = migrateProgressions(normalized.progressions, normalized.schemaVersion);
  const sanitized = migrated.map((progression) => sanitizeProgression(progression));
  if (sanitized.length === 0) {
    throw new Error('Bundled progressions JSON contained no valid progressions.');
  }

  return sanitized;
}

async function loadInitialProgressions() {
  loadProgressionsFromStorage();

  const hasStoredProgressions = Array.isArray(appState.progressions) && appState.progressions.length > 0;
  const hasOnlyDefaultProgression =
    hasStoredProgressions &&
    appState.progressions.length === 1 &&
    appState.progressions[0]?.name === 'New progression';

  if (!hasOnlyDefaultProgression) {
    return;
  }

  try {
    const bundled = await loadBundledProgressions();
    appState.progressions = bundled;
    appState.selectedProgressionId = bundled[0]?.id || null;
    appState.progressionDraft = bundled[0] ? cloneProgression(bundled[0]) : null;
    saveProgressionsToStorage();
  } catch (error) {
    console.warn('Failed to seed bundled progressions:', error);
  }
}

function formatProgressionSummary(progression) {
  return `${progression.keyRoot}${progression.keyAccidental || ''} ${getQualityLabel(progression.keyQuality)} · ${progression.steps.length} step${progression.steps.length === 1 ? '' : 's'}`;
}

function getProgressionById(progressionId) {
  return appState.progressions.find((progression) => progression.id === progressionId) || null;
}

function getDegreeSelectionForState(state) {
  const keyNote = parseNote(state.root, state.accidental);
  const degreeIndex = Math.min(6, Math.max(0, Math.trunc(Number(state.degree) || 1) - 1));
  const degreeLabel = getDegreeLabelByIndex(degreeIndex);
  const scaleIntervals = getScaleIntervalsForQuality(state.quality);
  const degreeQualities = DEGREE_TRIAD_QUALITIES[state.quality] || DEGREE_TRIAD_QUALITIES.major;
  const targetInterval = scaleIntervals[degreeIndex] ?? 0;
  const targetRootSemitone = normalizeSemitone(keyNote.semitone + targetInterval);
  const targetQuality = degreeQualities[degreeIndex] || 'major';
  const targetRootName = getNoteNameBySemitone(targetRootSemitone, state.accidental);
  const targetSymbol = `${targetRootName}${
    targetQuality === 'minor' ? 'm' : targetQuality === 'diminished' ? 'dim' : ''
  }`;

  return {
    keyRootSemitone: keyNote.semitone,
    keyQuality: state.quality,
    keySymbol: `${keyNote.preferredName}${state.quality === 'minor' ? 'm' : ''}`,
    degreeIndex,
    degreeLabel,
    isTonic: degreeIndex === 0,
    targetRootSemitone,
    targetQuality,
    targetSymbol,
  };
}

function resolveProgressionStepState(progression, step) {
  const keyState = {
    root: progression.keyRoot,
    accidental: progression.keyAccidental,
    quality: progression.keyQuality,
    extension: step.extension,
    degree: step.degree,
  };
  return {
    root: step.useDiatonicChord ? keyState.root : step.root,
    accidental: step.useDiatonicChord ? keyState.accidental : normalizeAccidental(step.accidental),
    quality: step.useDiatonicChord ? keyState.quality : step.quality,
    extension: step.extension,
    caged: step.cagedArea,
    degree: step.degree,
  };
}

// ── Metronome (Web Audio API) ────────────────────────────────────────────────

let metronomeAudioContext = null;

function canUseWebAudio() {
  return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
}

function getAudioContext() {
  if (!canUseWebAudio()) {
    throw new Error('Web Audio API is not available in this browser.');
  }

  if (!metronomeAudioContext || metronomeAudioContext.state === 'closed') {
    metronomeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  return metronomeAudioContext;
}

async function primeMetronomeAudio() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  return ctx;
}

/**
 * Click the metronome once.
 * @param {boolean} isAccent - true for beat 1 (higher pitch, louder).
 */
function playMetronomeClick(isAccent = false) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = 'square'; // sharper than sine
    oscillator.frequency.value = isAccent ? 1000 : 600; // lower frequencies, more audible
    gain.gain.setValueAtTime(isAccent ? 0.8 : 0.6, ctx.currentTime); // much louder
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); // longer decay, 100ms

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.12);
    console.log('[Metronome]', isAccent ? 'Accent click' : 'Regular click');
  } catch (error) {
    console.error('Metronome click failed:', error);
  }
}

function playTestTone() {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = 440; // A4 concert pitch
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.6);
    console.log('[Test Tone] A4 (440 Hz) playing for 600ms');
  } catch (error) {
    console.error('Test tone failed:', error);
  }
}

// ── Transport helpers ─────────────────────────────────────────────────────────

function clearTransportTimer() {
  if (appState.transport.timerId) {
    window.clearTimeout(appState.transport.timerId);
    appState.transport.timerId = null;
  }
}

function clearPreviewFade() {
  if (appState.transport.previewAnimationFrameId) {
    window.cancelAnimationFrame(appState.transport.previewAnimationFrameId);
    appState.transport.previewAnimationFrameId = null;
  }

  const previewChart = document.getElementById('preview-chart');
  if (previewChart) {
    previewChart.classList.remove('is-visible');
    previewChart.style.removeProperty('--preview-fade-duration');
    previewChart.innerHTML = '';
  }
}

function getProgressionStepDisplayState(progression, step) {
  const resolvedState = resolveProgressionStepState(progression, step);
  return {
    root: resolvedState.root,
    accidental: resolvedState.accidental,
    quality: resolvedState.quality,
    caged: resolvedState.caged,
    degree: resolvedState.degree,
  };
}

function getPreviewDurationMs(progression) {
  return (60 / Math.max(30, Number(progression?.tempo) || 100)) * 1000;
}

function shouldFadePreview(progression) {
  return Boolean(progression && Array.isArray(progression.steps) && progression.steps.length > 1);
}

async function showPreviewFadeForStep(progression, step) {
  if (!progression || !step || !shouldFadePreview(progression)) {
    clearPreviewFade();
    return;
  }

  const previewChart = document.getElementById('preview-chart');
  if (!previewChart) {
    return;
  }

  try {
    await ensureSvguitarScriptLoaded();
    const SVGuitarChord = await waitForChordRenderer();
    const previewState = getProgressionStepDisplayState(progression, step);
    renderChordFromTemplate(SVGuitarChord, {
      containerSelector: '#preview-chart',
      containerElement: previewChart,
      state: previewState,
    });

    previewChart.classList.remove('is-visible');
    previewChart.style.setProperty('--preview-fade-duration', `${getPreviewDurationMs(progression)}ms`);

    if (appState.transport.previewAnimationFrameId) {
      window.cancelAnimationFrame(appState.transport.previewAnimationFrameId);
    }

    appState.transport.previewAnimationFrameId = window.requestAnimationFrame(() => {
      previewChart.classList.add('is-visible');
      appState.transport.previewAnimationFrameId = null;
    });
  } catch (error) {
    console.warn('Failed to render preview fade:', error);
    clearPreviewFade();
  }
}

function updateTransportStatus(message = 'Stopped') {
  const node = document.getElementById('progression-transport-status');
  if (node) {
    node.textContent = message;
  }
}

function setupTransportControls() {
  const playPauseButton = document.getElementById('progression-play-pause');
  const prevStepButton = document.getElementById('progression-prev-step');
  const stopButton = document.getElementById('progression-stop');
  const nextStepButton = document.getElementById('progression-next-step');
  const testToneButton = document.getElementById('progression-test-tone');
  const tempoSlider = document.getElementById('transport-tempo');
  const tempoDisplay = document.getElementById('transport-tempo-display');

  if (!playPauseButton || !stopButton || !tempoSlider || !tempoDisplay) {
    return;
  }

  playPauseButton.addEventListener('click', () => {
    const isPlaying = appState.transport.status === 'playing';
    if (isPlaying) {
      pauseProgressionPlayback();
    } else {
      startProgressionPlayback();
    }
  });

  stopButton.addEventListener('click', () => {
    stopProgressionPlayback();
  });

  if (prevStepButton) {
    prevStepButton.addEventListener('click', () => {
      stepSelectedProgression(-1);
    });
  }

  if (nextStepButton) {
    nextStepButton.addEventListener('click', () => {
      stepSelectedProgression(1);
    });
  }

  if (testToneButton) {
    testToneButton.addEventListener('click', async () => {
      try {
        await primeMetronomeAudio();
        playTestTone();
      } catch (error) {
        console.warn('Failed to play test tone:', error);
        window.alert('Audio test failed. Check browser console.');
      }
    });
  }

  tempoSlider.addEventListener('input', () => {
    const tempo = Number(tempoSlider.value) || 100;
    tempoDisplay.textContent = `${tempo} BPM`;

    // If currently playing, update the saved tempo in the progression
    const progression = getSelectedProgression();
    if (progression) {
      progression.tempo = tempo;
      saveProgressionsToStorage();
    }
  });

  syncTransportControls();
}

function updateTransportTempoDisplay(tempo) {
  const tempoSlider = document.getElementById('transport-tempo');
  if (tempoSlider) {
    tempoSlider.value = tempo;
  }

  const tempoDisplay = document.getElementById('transport-tempo-display');
  if (tempoDisplay) {
    tempoDisplay.textContent = `${tempo} BPM`;
  }
}

function syncTransportControls() {
  const playPauseButton = document.getElementById('progression-play-pause');
  const stopButton = document.getElementById('progression-stop');
  const isPlaying = appState.transport.status === 'playing';
  const isPaused = appState.transport.status === 'paused';
  const isStopped = appState.transport.status === 'stopped';

  if (playPauseButton) {
    playPauseButton.textContent = isPlaying ? '⏸' : '▶';
    playPauseButton.title = isPlaying ? 'Pause' : 'Play';
    playPauseButton.disabled = !appState.selectedProgressionId;
  }

  if (stopButton) {
    stopButton.disabled = isStopped;
  }

  if (isPaused) {
    updateTransportStatus('Paused');
  } else if (isStopped) {
    updateTransportStatus('Stopped');
  }
}

function renderProgressionTransportState() {
  const activeProgression = getProgressionById(appState.transport.activeProgressionId);
  if (!activeProgression || appState.transport.status === 'stopped') {
    syncTransportControls();
    return;
  }

  if (appState.transport.countInRemaining > 0) {
    updateTransportStatus(`Count-in: ${appState.transport.countInRemaining}`);
  } else {
    const currentStep = activeProgression.steps[appState.transport.currentStepIndex];
    const stepNumber = appState.transport.currentStepIndex + 1;
    const beatNumber = appState.transport.currentBeatInStep + 1;
    updateTransportStatus(
      currentStep ? `Playing step ${stepNumber}/${activeProgression.steps.length} · Beat ${beatNumber}/${currentStep.beats}` : 'Playing'
    );
  }

  syncTransportControls();
}

function applyProgressionStepToMainView(progression, step) {
  if (!progression || !step) {
    return;
  }

  clearPreviewFade();

  const resolvedStepIndex = progression.steps.findIndex((item) => item.id === step.id);

  const resolvedState = resolveProgressionStepState(progression, step);
  appState.root = resolvedState.root;
  appState.accidental = resolvedState.accidental;
  appState.quality = resolvedState.quality;
  appState.extension = resolvedState.extension;
  appState.caged = resolvedState.caged;
  appState.degree = resolvedState.degree;
  appState.progressionKeyQuality = progression.keyQuality;
  appState.selectionContext = {
    source: 'progression',
    progressionId: progression.id,
    stepId: step.id,
    stepIndex: resolvedStepIndex >= 0 ? resolvedStepIndex : 0,
    beats: Math.min(16, Math.max(1, Number(step.beats) || 1)),
  };

  const root = document.getElementById('root-note');
  const accidental = document.getElementById('accidental');
  const quality = document.getElementById('quality');
  const chordType = document.getElementById('chord-type');
  if (root) {
    root.value = appState.root;
  }
  if (accidental) {
    accidental.value = appState.accidental;
  }
  if (quality) {
    quality.value = appState.quality;
  }
  if (chordType) {
    chordType.value = appState.extension;
  }

  const cagedButtons = document.getElementById('caged-buttons');
  if (cagedButtons) {
    Array.from(cagedButtons.querySelectorAll('button[data-voicing]')).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.voicing === appState.caged);
    });
  }

  const degreeButtons = document.getElementById('degree-buttons');
  if (degreeButtons) {
    Array.from(degreeButtons.querySelectorAll('button[data-degree]')).forEach((node) => {
      node.classList.toggle('is-active', Number(node.dataset.degree) === appState.degree);
    });
  }

  renderCharts();
}

function clearProgressionSelectionContext() {
  appState.progressionKeyQuality = null;
  appState.selectionContext = {
    source: 'manual',
    progressionId: null,
    stepId: null,
    stepIndex: null,
    beats: null,
  };
}

function applySelectedProgressionStep(stepIndex = 0) {
  const progression = getSelectedProgression();
  if (!progression || !Array.isArray(progression.steps) || progression.steps.length === 0) {
    return false;
  }

  const normalizedIndex = Math.min(
    progression.steps.length - 1,
    Math.max(0, Number.isFinite(Number(stepIndex)) ? Math.trunc(Number(stepIndex)) : 0)
  );
  const step = progression.steps[normalizedIndex];
  if (!step) {
    return false;
  }

  applyProgressionStepToMainView(progression, step);
  return true;
}

function stepSelectedProgression(direction = 1) {
  const progression = getSelectedProgression();
  if (!progression || !Array.isArray(progression.steps) || progression.steps.length === 0) {
    return;
  }

  let currentIndex = -1;
  if (
    appState.selectionContext.source === 'progression' &&
    appState.selectionContext.progressionId === progression.id &&
    Number.isInteger(appState.selectionContext.stepIndex)
  ) {
    currentIndex = appState.selectionContext.stepIndex;
  }

  if (appState.transport.status !== 'stopped') {
    stopProgressionPlayback({ preserveView: true, showFirstStep: false });
  }

  const stepDelta = direction < 0 ? -1 : 1;
  const nextIndex = (currentIndex + stepDelta + progression.steps.length) % progression.steps.length;
  applySelectedProgressionStep(nextIndex);
}

function stopProgressionPlayback({ preserveView = false, showFirstStep = true } = {}) {
  clearTransportTimer();
  clearPreviewFade();
  appState.transport.status = 'stopped';
  appState.transport.activeProgressionId = null;
  appState.transport.currentStepIndex = -1;
  appState.transport.currentBeatInStep = 0;
  appState.transport.countInRemaining = 0;
  renderProgressionPanel();
  syncTransportControls();

  if (showFirstStep) {
    applySelectedProgressionStep(0);
  }

  if (!preserveView) {
    updateTransportStatus('Stopped');
  }
}

function scheduleNextTransportTick(progression) {
  clearTransportTimer();
  const beatMs = (60 / Math.max(30, Number(progression.tempo) || 100)) * 1000;
  appState.transport.timerId = window.setTimeout(() => {
    advanceProgressionPlayback();
  }, beatMs);
}

function advanceProgressionPlayback() {
  const progression = getProgressionById(appState.transport.activeProgressionId);
  if (!progression || !Array.isArray(progression.steps) || progression.steps.length === 0) {
    stopProgressionPlayback();
    return;
  }

  if (appState.transport.countInRemaining > 0) {
    // Count-in ticks are 4-3-2-1; progression starts on the following beat.
    playMetronomeClick(false);
    renderProgressionTransportState();
    appState.transport.countInRemaining -= 1;
    scheduleNextTransportTick(progression);
    return;
  }

  if (appState.transport.currentStepIndex < 0) {
    // No count-in path: fire accented beat 1 of step 0 immediately.
    appState.transport.currentStepIndex = 0;
    appState.transport.currentBeatInStep = 0;
    playMetronomeClick(true);
    applyProgressionStepToMainView(progression, progression.steps[0]);
    renderProgressionPanel();
    renderProgressionTransportState();
    scheduleNextTransportTick(progression);
    return;
  }

  const currentStep = progression.steps[appState.transport.currentStepIndex];
  if (!currentStep) {
    stopProgressionPlayback();
    return;
  }

  appState.transport.currentBeatInStep += 1;
  if (appState.transport.currentBeatInStep >= currentStep.beats) {
    appState.transport.currentStepIndex += 1;
    appState.transport.currentBeatInStep = 0;

    if (appState.transport.currentStepIndex >= progression.steps.length) {
      appState.transport.currentStepIndex = 0;
    }

    playMetronomeClick(true); // accent: first beat of new step
    applyProgressionStepToMainView(progression, progression.steps[appState.transport.currentStepIndex]);
    renderProgressionPanel();
  } else {
    playMetronomeClick(false); // subdivision within step

    if (appState.transport.currentBeatInStep === currentStep.beats - 1) {
      const nextStepIndex = (appState.transport.currentStepIndex + 1) % progression.steps.length;
      showPreviewFadeForStep(progression, progression.steps[nextStepIndex]);
    }
  }

  renderProgressionTransportState();
  scheduleNextTransportTick(progression);
}

async function startProgressionPlayback() {
  const progression = getSelectedProgression();
  if (!progression || !Array.isArray(progression.steps) || progression.steps.length === 0) {
    return;
  }

  try {
    await primeMetronomeAudio();
  } catch (error) {
    console.warn('Failed to initialize metronome audio:', error);
    updateTransportStatus('Audio blocked — tap Play again');
    return;
  }

  clearTransportTimer();
  const previousProgressionId = appState.transport.activeProgressionId;
  const wasPaused = appState.transport.status === 'paused';
  appState.transport.status = 'playing';
  appState.transport.activeProgressionId = progression.id;
  let isFreshStart = false;

  if (appState.transport.currentStepIndex < 0 || previousProgressionId !== progression.id) {
    appState.transport.currentStepIndex = -1;
    appState.transport.currentBeatInStep = 0;
    appState.transport.countInRemaining = Math.max(0, Number(progression.countInBeats) || 0);
    isFreshStart = true;
  }

  if (isFreshStart && !wasPaused) {
    applySelectedProgressionStep(0);
  }

  renderProgressionPanel();
  renderProgressionTransportState();

  if (isFreshStart && !wasPaused) {
    advanceProgressionPlayback();
  } else {
    scheduleNextTransportTick(progression);
  }
}

function pauseProgressionPlayback() {
  if (appState.transport.status !== 'playing') {
    return;
  }

  clearTransportTimer();
  clearPreviewFade();
  appState.transport.status = 'paused';
  renderProgressionTransportState();
}

function setProgressionDraft(progression) {
  appState.progressionDraft = cloneProgression(sanitizeProgression(progression));
}

function deselectProgression() {
  if (appState.transport.status !== 'stopped') {
    stopProgressionPlayback({ preserveView: true, showFirstStep: false });
  }

  appState.selectedProgressionId = null;
  appState.progressionDraft = null;
  appState.progressionKeyQuality = null;
  clearProgressionSelectionContext();
  renderProgressionPanel();
  renderCharts();
}

function selectProgression(progressionId) {
  const progression = appState.progressions.find((item) => item.id === progressionId);
  if (!progression) {
    return;
  }

  if (appState.transport.status !== 'stopped') {
    stopProgressionPlayback({ preserveView: true, showFirstStep: false });
  }

  appState.selectedProgressionId = progression.id;
  setProgressionDraft(progression);
  updateTransportTempoDisplay(progression.tempo);
  renderProgressionPanel();
  applySelectedProgressionStep(0);
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
      extension: appState.extension,
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

  const noneItem = `
    <button type="button" class="progression-item${!appState.selectedProgressionId ? ' is-active' : ''}" data-progression-id="__none__">
      <span class="progression-item-title">— None (free play)</span>
      <span class="progression-item-meta">Use Chord Options panel independently</span>
    </button>
  `;

  if (appState.progressions.length === 0) {
    container.innerHTML = noneItem + '<p class="progression-list-empty">No saved progressions yet.</p>';
    return;
  }

  container.innerHTML = noneItem + appState.progressions
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
        <article class="progression-step-card${
          appState.transport.activeProgressionId === appState.selectedProgressionId &&
          appState.transport.currentStepIndex === index &&
          appState.transport.status !== 'stopped'
            ? ' is-playing'
            : ''
        }" data-step-id="${step.id}">
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
              <span>Chord type</span>
              <select data-step-field="extension">
                <option value="triad"${step.extension === 'triad' ? ' selected' : ''}>Triad</option>
                <option value="seventh"${step.extension === 'seventh' ? ' selected' : ''}>7th</option>
                <option value="ninth"${step.extension === 'ninth' ? ' selected' : ''}>9th</option>
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
  const selectedProgression = getSelectedProgression();
  if (selectedProgression) {
    updateTransportTempoDisplay(selectedProgression.tempo);
  }
  renderProgressionTransportState();

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

    if (button.dataset.progressionId === '__none__') {
      deselectProgression();
    } else {
      selectProgression(button.dataset.progressionId);
    }
  });

  const draftFieldBindings = [
    [name, 'name', (value) => value],
    [root, 'keyRoot', (value) => value],
    [accidental, 'keyAccidental', (value) => normalizeAccidental(value)],
    [quality, 'keyQuality', (value) => (['major', 'minor', 'dorian', 'mixolydian'].includes(value) ? value : 'major')],
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

  if (quality === 'dorian') {
    return 'Dorian';
  }

  if (quality === 'mixolydian') {
    return 'Mixolydian';
  }

  return 'Major';
}

function getChordSymbol(state = appState) {
  const note = parseSelectedNote(state);
  return `${note.preferredName}${getQualitySuffix(getExtendedChordQuality(state.quality, state.extension))}`;
}

function getExtendedChordQuality(baseQuality, extension = appState.extension) {
  if (extension === 'triad') {
    return baseQuality;
  }

  const baseToSeventh = {
    major: extension === 'ninth' ? 'major9' : 'major7',
    minor: extension === 'ninth' ? 'minor9' : 'minor7',
    diminished: extension === 'ninth' ? 'half-diminished9' : 'half-diminished7',
    major7: extension === 'ninth' ? 'major9' : 'major7',
    minor7: extension === 'ninth' ? 'minor9' : 'minor7',
    dominant7: extension === 'ninth' ? 'dominant9' : 'dominant7',
    'half-diminished7': extension === 'ninth' ? 'half-diminished9' : 'half-diminished7',
    major9: 'major9',
    minor9: 'minor9',
    dominant9: 'dominant9',
    'half-diminished9': 'half-diminished9',
  };

  return baseToSeventh[baseQuality] || baseQuality;
}

function getQualitySuffix(quality) {
  if (quality === 'minor') return 'm';
  if (quality === 'diminished') return 'dim';
  if (quality === 'major7') return 'maj7';
  if (quality === 'minor7') return 'm7';
  if (quality === 'dominant7') return '7';
  if (quality === 'half-diminished7') return 'm7♭5';
  if (quality === 'major9') return 'maj9';
  if (quality === 'minor9') return 'm9';
  if (quality === 'dominant9') return '9';
  if (quality === 'half-diminished9') return 'm9♭5';
  return '';
}

function getDegreeIndex(state = appState) {
  const parsed = Number(state.degree);
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

const EMBEDDED_MAJOR7_VOICINGS = [
  {
    id: 'fallback-voicing-major7-c',
    label: 'Major 7th',
    type: 'voicing',
    quality: 'major7',
    caged: 'C',
    referenceRoot: 'C',
    relativeFrets: ['x', 3, 2, 0, 0, 0],
  },
  {
    id: 'fallback-voicing-major7-a',
    label: 'Major 7th',
    type: 'voicing',
    quality: 'major7',
    caged: 'A',
    referenceRoot: 'A',
    relativeFrets: ['x', 0, 2, 1, 2, 0],
  },
  {
    id: 'fallback-voicing-major7-g',
    label: 'Major 7th',
    type: 'voicing',
    quality: 'major7',
    caged: 'G',
    referenceRoot: 'G',
    relativeFrets: [3, 2, 0, 0, 0, 2],
  },
  {
    id: 'fallback-voicing-major7-e',
    label: 'Major 7th',
    type: 'voicing',
    quality: 'major7',
    caged: 'E',
    referenceRoot: 'E',
    relativeFrets: [0, 2, 1, 1, 0, 0],
  },
  {
    id: 'fallback-voicing-major7-d',
    label: 'Major 7th',
    type: 'voicing',
    quality: 'major7',
    caged: 'D',
    referenceRoot: 'D',
    relativeFrets: ['x', 'x', 0, 2, 2, 2],
  },
];

const EMBEDDED_MINOR7_VOICINGS = [
  {
    id: 'fallback-voicing-minor7-c',
    label: 'Minor 7th',
    type: 'voicing',
    quality: 'minor7',
    caged: 'C',
    referenceRoot: 'C',
    relativeFrets: ['x', 3, 5, 3, 4, 3],
  },
  {
    id: 'fallback-voicing-minor7-a',
    label: 'Minor 7th',
    type: 'voicing',
    quality: 'minor7',
    caged: 'A',
    referenceRoot: 'A',
    relativeFrets: ['x', 0, 2, 0, 1, 0],
  },
  {
    id: 'fallback-voicing-minor7-g',
    label: 'Minor 7th',
    type: 'voicing',
    quality: 'minor7',
    caged: 'G',
    referenceRoot: 'G',
    relativeFrets: [3, 'x', 3, 3, 3, 3],
  },
  {
    id: 'fallback-voicing-minor7-e',
    label: 'Minor 7th',
    type: 'voicing',
    quality: 'minor7',
    caged: 'E',
    referenceRoot: 'E',
    relativeFrets: [0, 2, 0, 0, 0, 0],
  },
  {
    id: 'fallback-voicing-minor7-d',
    label: 'Minor 7th',
    type: 'voicing',
    quality: 'minor7',
    caged: 'D',
    referenceRoot: 'D',
    relativeFrets: ['x', 'x', 0, 2, 1, 1],
  },
];

const EMBEDDED_DOMINANT7_VOICINGS = [
  {
    id: 'fallback-voicing-dominant7-c',
    label: 'Dominant 7th',
    type: 'voicing',
    quality: 'dominant7',
    caged: 'C',
    referenceRoot: 'C',
    relativeFrets: ['x', 3, 2, 3, 1, 0],
  },
  {
    id: 'fallback-voicing-dominant7-a',
    label: 'Dominant 7th',
    type: 'voicing',
    quality: 'dominant7',
    caged: 'A',
    referenceRoot: 'A',
    relativeFrets: ['x', 0, 2, 0, 2, 0],
  },
  {
    id: 'fallback-voicing-dominant7-g',
    label: 'Dominant 7th',
    type: 'voicing',
    quality: 'dominant7',
    caged: 'G',
    referenceRoot: 'G',
    relativeFrets: [3, 2, 0, 0, 0, 1],
  },
  {
    id: 'fallback-voicing-dominant7-e',
    label: 'Dominant 7th',
    type: 'voicing',
    quality: 'dominant7',
    caged: 'E',
    referenceRoot: 'E',
    relativeFrets: [0, 2, 0, 1, 0, 0],
  },
  {
    id: 'fallback-voicing-dominant7-d',
    label: 'Dominant 7th',
    type: 'voicing',
    quality: 'dominant7',
    caged: 'D',
    referenceRoot: 'D',
    relativeFrets: ['x', 'x', 0, 2, 1, 2],
  },
];

const EMBEDDED_HALF_DIMINISHED7_VOICINGS = [
  {
    id: 'fallback-voicing-halfdim7-c',
    label: 'Half-diminished 7th',
    type: 'voicing',
    quality: 'half-diminished7',
    caged: 'C',
    referenceRoot: 'C',
    relativeFrets: ['x', 3, 4, 3, 4, 'x'],
  },
  {
    id: 'fallback-voicing-halfdim7-a',
    label: 'Half-diminished 7th',
    type: 'voicing',
    quality: 'half-diminished7',
    caged: 'A',
    referenceRoot: 'A',
    relativeFrets: ['x', 0, 1, 0, 1, 'x'],
  },
  {
    id: 'fallback-voicing-halfdim7-g',
    label: 'Half-diminished 7th',
    type: 'voicing',
    quality: 'half-diminished7',
    caged: 'G',
    referenceRoot: 'G',
    relativeFrets: [3, 'x', 2, 3, 2, 'x'],
  },
  {
    id: 'fallback-voicing-halfdim7-e',
    label: 'Half-diminished 7th',
    type: 'voicing',
    quality: 'half-diminished7',
    caged: 'E',
    referenceRoot: 'E',
    relativeFrets: [0, 1, 0, 0, 3, 0],
  },
  {
    id: 'fallback-voicing-halfdim7-d',
    label: 'Half-diminished 7th',
    type: 'voicing',
    quality: 'half-diminished7',
    caged: 'D',
    referenceRoot: 'D',
    relativeFrets: ['x', 'x', 0, 1, 1, 1],
  },
];

function getVoicingCandidatesByQuality(quality) {
  const matches = catalog.voicings.filter((voicing) => voicing.quality === quality);
  if (matches.length > 0) {
    return matches;
  }

  if (quality === 'major7') {
    return EMBEDDED_MAJOR7_VOICINGS;
  }

  if (quality === 'minor7') {
    return EMBEDDED_MINOR7_VOICINGS;
  }

  if (quality === 'dominant7') {
    return EMBEDDED_DOMINANT7_VOICINGS;
  }

  if (quality === 'half-diminished7') {
    return EMBEDDED_HALF_DIMINISHED7_VOICINGS;
  }

  if (quality === 'diminished') {
    return EMBEDDED_DIMINISHED_VOICINGS;
  }

  return [];
}

function getTriadVoicingQuality(quality) {
  if (quality === 'dorian') {
    return 'minor';
  }

  if (quality === 'mixolydian') {
    return 'major';
  }

  return quality;
}

function getDegreeSelection(state = appState) {
  const keyNote = parseSelectedNote(state);
  const degreeIndex = getDegreeIndex(state);
  const degreeLabel = getDegreeLabelByIndex(degreeIndex);
  // When in a progression context, use the progression's key quality for scale/degree, not the chord's quality
  const keyQuality = (state === appState && appState.selectionContext.source === 'progression' && appState.progressionKeyQuality)
    ? appState.progressionKeyQuality
    : state.quality;
  const scaleIntervals = getScaleIntervalsForQuality(keyQuality);
  const triadQualities = DEGREE_TRIAD_QUALITIES[keyQuality] || DEGREE_TRIAD_QUALITIES.major;
  const seventhQualities = DEGREE_SEVENTH_QUALITIES[keyQuality] || DEGREE_SEVENTH_QUALITIES.major;
  const targetInterval = scaleIntervals[degreeIndex] ?? 0;
  const targetRootSemitone = normalizeSemitone(keyNote.semitone + targetInterval);
  const targetTriadQuality = triadQualities[degreeIndex] || 'major';
  const targetSeventhQuality = seventhQualities[degreeIndex] || 'major7';
  const targetQuality =
    state.extension === 'triad'
      ? targetTriadQuality
      : state.extension === 'ninth'
        ? getExtendedChordQuality(targetSeventhQuality, 'ninth')
        : targetSeventhQuality;
  const targetRootName = getNoteNameBySemitone(targetRootSemitone, state.accidental);
  const targetSymbol = `${targetRootName}${getQualitySuffix(targetQuality)}`;

  return {
    keyRootSemitone: keyNote.semitone,
    keyQuality,
    keySymbol: getChordSymbol(state),
    degreeIndex,
    degreeLabel,
    isTonic: degreeIndex === 0,
    targetRootSemitone,
    targetTriadQuality,
    targetQuality,
    targetSymbol,
  };
}

function resolveVoicingForSelection(selection, state = appState) {
  const anchorQuality =
    state.extension === 'triad'
      ? getTriadVoicingQuality(state.quality)
      : state.extension === 'seventh'
        ? getExtendedChordQuality(getTriadVoicingQuality(state.quality), 'seventh')
        : getTriadVoicingQuality(state.quality);
  const baseCandidates = getVoicingCandidatesByQuality(anchorQuality);
  const basePattern = baseCandidates.find((pattern) => pattern.caged === state.caged) || findVoicingByState(getTriadVoicingQuality(state.quality), state.caged);
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

  let candidatePatterns = getVoicingCandidatesByQuality(
    state.extension === 'seventh' ? selection.targetQuality : (selection.targetTriadQuality || selection.targetQuality)
  );

  if (state.extension === 'ninth') {
    const preferredCaged = NINTH_VOICING_FALLBACKS[selection.targetQuality]?.[state.caged];
    if (Array.isArray(preferredCaged) && preferredCaged.length > 0) {
      const filtered = candidatePatterns.filter((pattern) => preferredCaged.includes(pattern.caged));
      if (filtered.length > 0) {
        candidatePatterns = filtered;
      }
    }
  }

  if (candidatePatterns.length === 0) {
    throw new Error(`No ${selection.targetTriadQuality || selection.targetQuality} voicing templates available.`);
  }

  const hasOpenAnchor = baseTransposed.position === 1;

  let best = null;

  for (const pattern of candidatePatterns) {
    const transposed = transposeVoicing(pattern, selection.targetRootSemitone);
    const distance = Math.abs(transposed.position - baseTransposed.position);
    const usesOpenPosition = transposed.position === 1;
    const openPenalty = !hasOpenAnchor && usesOpenPosition ? 1 : 0;
    const sameCagedPenalty = pattern.caged === state.caged ? 0 : 1;

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

function getSelectionLabel(selection = null, resolvedVoicing = null, state = appState) {
  if (!selection) {
    return `${getChordSymbol(state)} (${getDegreeLabelByIndex(0)}) · ${state.caged} voicing`;
  }

  const caged = resolvedVoicing?.caged || state.caged;
  return `${selection.targetSymbol} (${selection.degreeLabel}) · ${caged} voicing`;
}

function getSelectionBeatsSuffix() {
  if (appState.selectionContext.source !== 'progression') {
    return '';
  }

  if (!appState.selectedProgressionId || appState.selectionContext.progressionId !== appState.selectedProgressionId) {
    return '';
  }

  const beats = Number(appState.selectionContext.beats);
  if (!Number.isFinite(beats) || beats <= 0) {
    return '';
  }

  const stepNumber = Number(appState.selectionContext.stepIndex) + 1;
  if (!Number.isFinite(stepNumber) || stepNumber <= 0) {
    return ` (${beats} beat${beats === 1 ? '' : 's'})`;
  }

  return ` (Step ${stepNumber}: ${beats} beat${beats === 1 ? '' : 's'})`;
}

function updateSelectionTitle(label = getSelectionLabel()) {
  const title = document.getElementById('selection-title');
  if (title) {
    title.textContent = `${label}${getSelectionBeatsSuffix()}`;
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
  const normalizedQuality = getTriadVoicingQuality(quality);
  return (
    catalog.voicings.find((voicing) => voicing.quality === normalizedQuality && voicing.caged === caged) || null
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
  const normalizedQuality =
    quality === 'minor7' || quality === 'minor9'
      ? 'minor'
      : quality === 'diminished' || quality === 'half-diminished7' || quality === 'half-diminished9'
        ? 'minor'
        : quality === 'major7' || quality === 'major9' || quality === 'dominant7' || quality === 'dominant9'
          ? 'major'
          : quality;
  const match = catalog.scales.find((pattern) => pattern.quality === quality);
  if (match && Array.isArray(match.intervals) && match.intervals.length > 0) {
    return match.intervals;
  }

  if (normalizedQuality === 'minor') return [0, 2, 3, 5, 7, 8, 10];
  if (normalizedQuality === 'dorian') return [0, 2, 3, 5, 7, 9, 10];
  if (normalizedQuality === 'mixolydian') return [0, 2, 4, 5, 7, 9, 10];
  return [0, 2, 4, 5, 7, 9, 11];
}

function getPentatonicIntervalsForQuality(quality) {
  // minor-family chords/modes use minor pentatonic; major-family chords/modes use major pentatonic
  const isMinorFamily =
    quality === 'minor' ||
    quality === 'dorian' ||
    quality === 'minor7' ||
    quality === 'minor9' ||
    quality === 'diminished' ||
    quality === 'half-diminished7' ||
    quality === 'half-diminished9';
  return isMinorFamily ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
}

function buildDegreeLabelMap(scaleIntervals) {
  const labelMap = new Map();
  scaleIntervals.forEach((interval, index) => {
    labelMap.set(normalizeSemitone(interval), String(index + 1));
  });
  return labelMap;
}

function buildTriadLabelMap(quality) {
  const intervals = CHORD_QUALITY_INTERVALS[quality] || CHORD_QUALITY_INTERVALS.major;
  const labels = ['1', '3', '5', '7', '9'];
  const labelMap = new Map();

  intervals.forEach((interval, index) => {
    labelMap.set(normalizeSemitone(interval), labels[index] || '');
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
  const chordToneIntervals = CHORD_QUALITY_INTERVALS[displayedChordQuality] || CHORD_QUALITY_INTERVALS.major;

  const scaleSet = new Set(scaleIntervals.map((interval) => normalizeSemitone(interval)));
  const keyPentSet = new Set(keyPentIntervals.map((interval) => normalizeSemitone(interval)));
  const chordPentSet = new Set(chordPentIntervals.map((interval) => normalizeSemitone(interval)));
  const chordToneSet = new Set(chordToneIntervals.map((interval) => normalizeSemitone(interval)));
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
    const isOpenChordTone = chordToneSet.has(openIntervalFromDisplayedChordRoot);
    const isOpenScale = scaleSet.has(openIntervalFromKeyRoot);

    const openChordText = useDisplayedChordDegreeLabels
      ? chordDegreeLabels.get(openIntervalFromDisplayedChordRoot) || ''
      : keyDegreeLabels.get(openIntervalFromKeyRoot) || '';
    const hasOpenChordLabel = openChordText !== '';

    const isOpenChordHighlight = isVoicingOpen && isOpenChordTone;

    if (showChord && isOpenChordHighlight && chordOverlay && hasOpenChordLabel) {
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
      const isPreChordTone = chordToneSet.has(preIntervalFromDisplayedChordRoot);
      const isPreKeyPent = keyPentSet.has(preIntervalFromKeyRoot);
      const isPreChordPent = chordPentSet.has(preIntervalFromDisplayedChordRoot);
      const isPreScale = scaleSet.has(preIntervalFromKeyRoot);

      const preChordText = useDisplayedChordDegreeLabels
        ? chordDegreeLabels.get(preIntervalFromDisplayedChordRoot) || ''
        : keyDegreeLabels.get(preIntervalFromKeyRoot) || '';
      const hasPreChordLabel = preChordText !== '';

      const isPreChordHighlight = isPreChord && isPreChordTone;

      if (isPreChordHighlight && chordOverlay && hasPreChordLabel) {
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
      const isChordTone = chordToneSet.has(intervalFromDisplayedChordRoot);
      const isKeyPent = keyPentSet.has(intervalFromKeyRoot);
      const isChordPent = chordPentSet.has(intervalFromDisplayedChordRoot);
      const isScale = scaleSet.has(intervalFromKeyRoot);

      const chordText = useDisplayedChordDegreeLabels
        ? chordDegreeLabels.get(intervalFromDisplayedChordRoot) || ''
        : keyDegreeLabels.get(intervalFromKeyRoot) || '';
      const hasChordLabel = chordText !== '';

      const isChordHighlight = isVoicingPosition && isChordTone;

      if (showChord && isChordHighlight && chordOverlay && hasChordLabel) {
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

function renderChordFromTemplate(SVGuitarChord, options = {}) {
  const state = options.state || appState;
  const containerSelector = options.containerSelector || '#main-chart';
  const containerElement = options.containerElement || document.querySelector(containerSelector);
  if (!containerElement) {
    throw new Error('Chart container not found in DOM.');
  }

  containerElement.innerHTML = '';

  const selection = getDegreeSelection(state);
  const resolvedVoicing = resolveVoicingForSelection(selection, state);
  const selectionLabel = getSelectionLabel(selection, resolvedVoicing, state);
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

  const chart = new SVGuitarChord(containerSelector);

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

  applyTopRowFilledMarkerStyles(containerElement, fingers);

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

    clearPreviewFade();

    const renderResult = renderChordFromTemplate(SVGuitarChord, {
      containerSelector: '#main-chart',
      containerElement: document.getElementById('main-chart'),
      state: appState,
    });
    updateSelectionTitle(renderResult.selectionLabel);

    const svgCount = document.querySelectorAll('.chart svg').length;
    setDiagnostics(
      `Version: ${APP_VERSION}\nSVGuitar loaded: yes\nRendered SVG nodes: ${svgCount}\nKey: ${getChordSymbol()}\nChord type: ${appState.extension}\nDisplayed chord: ${renderResult.renderedDegreeLabel} (${renderResult.renderedChordSymbol})`,
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
  const chordType = document.getElementById('chord-type');
  const cagedButtons = document.getElementById('caged-buttons');
  const degreeButtons = document.getElementById('degree-buttons');

  if (!root || !accidental || !quality || !chordType || !cagedButtons || !degreeButtons) {
    return;
  }

  root.value = appState.root;
  accidental.value = appState.accidental;
  quality.value = appState.quality;
  chordType.value = appState.extension;

  root.addEventListener('change', () => {
    clearProgressionSelectionContext();
    appState.root = root.value;
    updateSelectionTitle();
    renderCharts();
  });

  accidental.addEventListener('change', () => {
    clearProgressionSelectionContext();
    appState.accidental = normalizeAccidental(accidental.value);
    updateSelectionTitle();
    renderCharts();
  });

  quality.addEventListener('change', () => {
    clearProgressionSelectionContext();
    appState.quality = quality.value;
    updateSelectionTitle();
    renderCharts();
  });

  chordType.addEventListener('change', () => {
    clearProgressionSelectionContext();
    appState.extension = CHORD_EXTENSION_OPTIONS.includes(chordType.value) ? chordType.value : 'triad';
    updateSelectionTitle();
    renderCharts();
  });

  cagedButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-voicing]');
    if (!button) {
      return;
    }

    clearProgressionSelectionContext();
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

    clearProgressionSelectionContext();
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
  await loadInitialProgressions();
  setupControls();
  setupProgressionControls();
  setupTransportControls();
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
