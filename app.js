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

function renderChordExample(SVGuitarChord) {
  const chart = new SVGuitarChord('#chord-chart');

  chart
    .configure({
      style: 'normal',
      strings: 6,
      frets: 5,
      position: 1,
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
    })
    .chord({
      title: 'A Minor',
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

function renderSegmentExample(SVGuitarChord) {
  const chart = new SVGuitarChord('#segment-chart');

  chart
    .configure({
      style: 'normal',
      strings: 6,
      frets: 5,
      position: 5,
      tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
      noPosition: false,
    })
    .chord({
      title: 'A Minor Pentatonic (5th Pos.)',
      barres: [],
      fingers: [
        [1, 1, 'A'],
        [1, 4, 'C'],
        [2, 1, 'E'],
        [2, 4, 'G'],
        [3, 1, 'A'],
        [3, 3, 'B'],
        [4, 1, 'D'],
        [4, 3, 'E'],
        [5, 1, 'G'],
        [5, 3, 'A'],
        [6, 1, 'C'],
        [6, 4, 'D'],
      ],
    })
    .draw();
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

    const chordContainer = document.getElementById('chord-chart');
    const segmentContainer = document.getElementById('segment-chart');
    if (!chordContainer || !segmentContainer) {
      throw new Error('Chart containers not found in DOM.');
    }

    chordContainer.innerHTML = '';
    segmentContainer.innerHTML = '';

    renderChordExample(SVGuitarChord);
    renderSegmentExample(SVGuitarChord);

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
    logSVGuitarGlobals();
    renderCharts();
  });
} else {
  logSVGuitarGlobals();
  renderCharts();
}
registerServiceWorker();