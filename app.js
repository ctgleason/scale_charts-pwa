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
  templateId: '',
  templateLabel: '',
  overlays: {},
};

function parseSelectedNote(state = appState) {
  return parseNote(state.root, state.accidental);
}

function getQualityLabel(quality) {
  return quality === 'minor' ? 'Minor' : 'Major';
}

function getChordSymbol() {
  const note = parseSelectedNote();
  const qualitySuffix = appState.quality === 'minor' ? 'm' : '';
  return `${note.preferredName}${qualitySuffix}`;
}

function getSelectionLabel() {
  return `${getChordSymbol()} (${getQualityLabel(appState.quality)}) · ${appState.caged} voicing`;
}

function updateSelectionTitle() {
  const title = document.getElementById('selection-title');
  if (title) {
    title.textContent = getSelectionLabel();
  }
}

async function loadTemplates() {
  const registryResponse = await fetch('./data/templates/registry.json');
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
      const response = await fetch(path);
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
  if (appState.templateId) {
    const selected = catalog.voicings.find((voicing) => voicing.id === appState.templateId);
    if (selected) {
      return selected;
    }
  }

  return findVoicingByState(appState.quality, appState.caged);
}

function syncStateFromTemplate(template) {
  if (!template) {
    return;
  }

  appState.templateId = template.id;
  appState.templateLabel = template.label || '';
  appState.quality = template.quality || appState.quality;
  appState.caged = template.caged || appState.caged;

  const quality = document.getElementById('quality');
  if (quality) {
    quality.value = appState.quality;
  }

  const cagedButtons = document.getElementById('caged-buttons');
  if (cagedButtons) {
    Array.from(cagedButtons.querySelectorAll('button[data-voicing]')).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.voicing === appState.caged);
    });
  }
}

function syncTemplateSelectionToState() {
  const selector = document.getElementById('template-pattern');
  if (!selector) {
    return;
  }

  const match = findVoicingByState(appState.quality, appState.caged);
  if (match) {
    appState.templateId = match.id;
    appState.templateLabel = match.label || '';
    selector.value = match.id;
  }
}

function populateTemplateSelector() {
  const selector = document.getElementById('template-pattern');
  if (!selector) {
    return;
  }

  selector.innerHTML = '';

  for (const voicing of catalog.voicings) {
    const option = document.createElement('option');
    option.value = voicing.id;
    option.textContent = `${getQualityLabel(voicing.quality)} ${voicing.caged} · ${voicing.label}`;
    selector.appendChild(option);
  }

  syncTemplateSelectionToState();
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
      appState.overlays[overlay.id] = checkbox.checked;
      label.classList.toggle('is-active', checkbox.checked);
      renderCharts();
    });
  }
}

function transposeVoicing(pattern, targetSemitone) {
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
  const position = fretted.length > 0 ? Math.min(...fretted) : 1;

  const fingers = absoluteFrets.map((fret, index) => {
    const stringIndex = index + 1;

    if (fret === 'x') {
      return [stringIndex, 'x'];
    }

    if (fret === 0) {
      return [stringIndex, 0];
    }

    const displayFret = fret - position + 1;
    return [stringIndex, displayFret];
  });

  return {
    title: getSelectionLabel(),
    position,
    fingers,
    barres: Array.isArray(pattern.barres) ? pattern.barres : [],
  };
}

function renderChordFromTemplate(SVGuitarChord) {
  const pattern = findActiveVoicing();
  if (!pattern) {
    throw new Error('No voicing template found for current selection.');
  }

  const selected = parseSelectedNote();
  const transposed = transposeVoicing(pattern, selected.semitone);

  const chart = new SVGuitarChord('#main-chart');

  chart
    .configure({
      style: 'normal',
      strings: 6,
      frets: 5,
      position: transposed.position,
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
    })
    .chord({
      title: transposed.title,
      fingers: transposed.fingers,
      barres: transposed.barres,
    })
    .draw();
}

async function renderCharts() {
  try {
    await ensureSvguitarScriptLoaded();
    const SVGuitarChord = await waitForChordRenderer();

    const chartContainer = document.getElementById('main-chart');
    if (!chartContainer) {
      throw new Error('Chart container not found in DOM.');
    }

    chartContainer.innerHTML = '';

    renderChordFromTemplate(SVGuitarChord);
    updateSelectionTitle();

    const svgCount = document.querySelectorAll('.chart svg').length;
    setDiagnostics(
      `SVGuitar loaded: yes\nRendered SVG nodes: ${svgCount}\nChord: ${getChordSymbol()}\nTemplate: ${appState.templateId || 'none'}`,
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
  }
}

function setupControls() {
  const root = document.getElementById('root-note');
  const accidental = document.getElementById('accidental');
  const quality = document.getElementById('quality');
  const cagedButtons = document.getElementById('caged-buttons');
  const templateSelector = document.getElementById('template-pattern');

  if (!root || !accidental || !quality || !cagedButtons || !templateSelector) {
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
    syncTemplateSelectionToState();
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

    syncTemplateSelectionToState();
    updateSelectionTitle();
    renderCharts();
  });

  templateSelector.addEventListener('change', () => {
    const selected = catalog.voicings.find((voicing) => voicing.id === templateSelector.value);
    syncStateFromTemplate(selected || null);
    updateSelectionTitle();
    renderCharts();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      await registration.update();
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  });
}

async function boot() {
  await loadTemplates();
  setupControls();
  populateTemplateSelector();
  populateOverlayToggles();

  const active = findActiveVoicing();
  syncStateFromTemplate(active);
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
