function renderChordExample() {
  const chart = new svguitar.SVGuitarChord('#chord-chart');

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

function renderSegmentExample() {
  const chart = new svguitar.SVGuitarChord('#segment-chart');

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
        [1, 5, 'A'],
        [1, 8, 'C'],
        [2, 5, 'E'],
        [2, 8, 'G'],
        [3, 5, 'A'],
        [3, 7, 'B'],
        [4, 5, 'D'],
        [4, 7, 'E'],
        [5, 5, 'G'],
        [5, 7, 'A'],
        [6, 5, 'C'],
        [6, 8, 'D'],
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

renderChordExample();
renderSegmentExample();
registerServiceWorker();