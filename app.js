function getChordRenderer() {
  const lib = window.svguitar || globalThis.svguitar || window.SVGuitar;

  if (lib && typeof lib.SVGuitarChord === 'function') {
    return lib.SVGuitarChord;
  }

  if (typeof window.SVGuitarChord === 'function') {
    return window.SVGuitarChord;
  }

  throw new Error('SVGuitar library failed to load.');
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
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  });
}

async function renderCharts() {
  try {
    const SVGuitarChord = await waitForChordRenderer();
    renderChordExample(SVGuitarChord);
    renderSegmentExample(SVGuitarChord);
  } catch (error) {
    console.error(error);
  }
}


function logSVGuitarGlobals() {
  console.log('[SVGuitar diagnostic] window.svguitar:', window.svguitar);
  console.log('[SVGuitar diagnostic] window.SVGuitar:', window.SVGuitar);
  console.log('[SVGuitar diagnostic] window.SVGuitarChord:', window.SVGuitarChord);
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