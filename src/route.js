const HOLDS = [
    [118, 1400, 'JUG'],
    [238, 1392, 'JUG'],
    [126, 1500, 'JUG'],
    [232, 1494, 'JUG'],
    [100, 1344, 'PINCH'],
    [250, 1338, 'JUG'],
    [166, 1292, 'CRIMP'],
    [244, 1244, 'JUG'],
    [112, 1240, 'JUG'],
    [192, 1194, 'PINCH'],
    [250, 1146, 'SLOPER'],
    [118, 1142, 'JUG'],
    [200, 1096, 'PINCH'],
    [246, 1046, 'JUG'],
    [126, 1040, 'CRIMP'],
    [190, 994, 'JUG'],
    [104, 944, 'PINCH'],
    [236, 938, 'SLOPER'],
    [160, 892, 'CRIMP'],
    [222, 842, 'PINCH'],
    [118, 836, 'JUG'],
    [176, 786, 'JUG'],
    [180, 1448, 'CRIMP'],
    [160, 1356, 'PINCH'],
    [200, 1264, 'CRIMP'],
    [150, 1172, 'PINCH'],
    [160, 1080, 'CRIMP'],
    [150, 988, 'PINCH']
];

const ROUTE = Crux.problem({
  name: 'Blue Tape',
  grade: 'V3',
  tape: '#5980A6',
  holds: HOLDS,
  start: [0, 1, 2, 3],
  bonus: 15,
  top: 21
});

const TIDE_ROUTE = Crux.problem({
  name: 'Salt Spray',
  grade: 'V3',
  tape: '#C8683F',
  holds: HOLDS,
  start: [0, null, null, null],
  bonus: 15,
  top: 21
});

const KIT = { pump: 1 };

const TIDE_KIT = {
  pump: 1,
  tide: { start: 1548, rate: 15, near: 22, cruise: 150, min: 0.1, max: 2.6 }
};

const RIVAL = { name: 'MAX', base: 0.95, ahead: 2.1, behind: 0.55, finish: 3.2 };
