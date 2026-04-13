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
  let node = document.getElementById('debug-status');
  if (!node) {
    node = document.createElement('pre');
    node.id = 'debug-status';
    node.style.whiteSpace = 'pre-wrap';
    node.style.wordBreak = 'break-word';
    node.style.fontSize = '0.8rem';
    node.style.padding = '0.75rem';
    node.style.border = '1px solid #374151';
    node.style.borderRadius = '0.5rem';
    node.style.margin = '1rem 0 0';
    node.style.background = '#0b1220';
    node.style.color = '#cbd5e1';
    const shell = document.querySelector('.app-shell') || document.body;
    shell.appendChild(node);
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
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed loading existing svguitar script.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = './vendor/svguitar.umd.js';
    script.async = false;
    script.onload = () => resolve();
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

const appState = {
  root: 'A',
  accidental: '',
  quality: 'major',
  caged: 'C',
};

function getQualityLabel(quality) {
  return quality === 'minor' ? 'Minor' : 'Major';
}

function getSelectionLabel() {
  const note = `${appState.root}${appState.accidental}`;
  return `${note} ${getQualityLabel(appState.quality)} · ${appState.caged} voicing`;
}

function updateSelectionTitle() {
  const title = document.getElementById('selection-title');
  if (title) {
    title.textContent = getSelectionLabel();
  }
}

function renderChordExample(SVGuitarChord) {
  const chart = new SVGuitarChord('#main-chart');

  chart
    .configure({
      style: 'normal',
      strings: 6,
      frets: 5,
      position: 1,
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
    })
    .chord({
      title: getSelectionLabel(),
      barres: [],
      fingers: [
        [1, 'x'],
        [2, 0],
        [3, 2, '2'],
        [4, 2, '3'],
        [5, 1, '1'],
        [6, 0],
      ],
    })
    .draw();
}

function setupControls() {
  const root = document.getElementById('root-note');
  const accidental = document.getElementById('accidental');
  const quality = document.getElementById('quality');
  const cagedButtons = document.getElementById('caged-buttons');

  if (!root || !accidental || !quality || !cagedButtons) {
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
    appState.accidental = accidental.value;
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

async function renderCharts() {
  try {
    await ensureSvguitarScriptLoaded();
    const SVGuitarChord = await waitForChordRenderer();

    const chartContainer = document.getElementById('main-chart');
    if (!chartContainer) {
      throw new Error('Chart container not found in DOM.');
    }

    chartContainer.innerHTML = '';

    renderChordExample(SVGuitarChord);

    const svgCount = document.querySelectorAll('.chart svg').length;
    setDiagnostics(
      `SVGuitar loaded: yes\nRenderer: ${SVGuitarChord.name || 'anonymous'}\nRendered SVG nodes: ${svgCount}\nLocation: ${window.location.href}`,
      svgCount === 0
    );

    if (svgCount === 0) {
      throw new Error('Render completed but no SVG nodes were produced.');
    }
  } catch (error) {
    console.error('Render error:', error);
    setDiagnostics(
      `Render error: ${error?.message || String(error)}\nwindow.svguitar: ${!!window.svguitar}\nwindow.SVGuitar: ${!!window.SVGuitar}\nwindow.SVGuitarChord: ${typeof window.SVGuitarChord}`,
      true
    );
  }
}


function logSVGuitarGlobals() {
  console.log('[SVGuitar diagnostic] window.svguitar:', window.svguitar);
  console.log('[SVGuitar diagnostic] window.SVGuitar:', window.SVGuitar);
  console.log('[SVGuitar diagnostic] window.SVGuitarChord:', window.SVGuitarChord);
  console.log('[SVGuitar diagnostic] script src list:', Array.from(document.scripts).map((s) => s.src));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    updateSelectionTitle();
    logSVGuitarGlobals();
    renderCharts();
  });
} else {
  setupControls();
  updateSelectionTitle();
  logSVGuitarGlobals();
  renderCharts();
}
registerServiceWorker();