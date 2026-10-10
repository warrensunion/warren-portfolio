// Ported from HowPolluted src/core/grades.js at 80f6d06 (Warren's own project). Changes: none (this header only).
// One five-word scale for five units, so a person can compare a sky with a
// street. The bands are the spec's: WHO 2021's 24-hour PM2.5 levels, Falchi et
// al. 2016's Table 1 levels (as a ratio to the natural sky, 174
// µcd/m²), WHO 2018's noise guideline (53 dB Lden for roads), and our own
// litter-coverage steps (no standard exists, so the card says they are ours).
export const GRADES = ['Good', 'Pretty good', 'Moderate', 'Mildly poor', 'Poor'];

// Upper edges of Good .. Mildly poor; `inclusive` says whether a value equal
// to an edge still belongs to the better band.
const BANDS = {
  air: { edges: [15, 25, 37.5, 50], inclusive: true },
  light: { edges: [0.01, 0.08, 1.28, 5.12], inclusive: true }, // Falchi Table 1: pristine, ~polluted, winter / summer Milky Way lost
  litter: { edges: [1, 3, 8, 15], inclusive: false },
  sound: { edges: [45, 53, 60, 68], inclusive: false },
};

export const BAND_SOURCES = {
  air: 'WHO global air quality guidelines (2021), 24-hour PM2.5',
  light: 'Falchi et al. (2016) sky-brightness levels',
  litter: 'HowPolluted’s own coverage steps (no standard exists)',
  sound: 'WHO Environmental Noise Guidelines (2018)',
};

export function gradeFor(kind, value) {
  const b = BANDS[kind];
  if (!b) throw new Error(`no grade bands for ${kind}`);
  let index = b.edges.findIndex((e) => (b.inclusive ? value <= e : value < e));
  if (index === -1) index = GRADES.length - 1;
  return { grade: GRADES[index], index };
}
