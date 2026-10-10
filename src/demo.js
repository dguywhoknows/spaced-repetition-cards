/* Sample deck and canned model output used when no API key is configured. */

var DEMO_NOTES = `Photosynthesis converts light energy into chemical energy stored in glucose. It happens in chloroplasts, mainly in leaf mesophyll cells. The overall equation is 6CO2 + 6H2O + light → C6H12O6 + 6O2.

There are two stages. The light-dependent reactions occur in the thylakoid membranes: chlorophyll absorbs light (mostly red and blue wavelengths), water is split (photolysis) releasing O2, and ATP and NADPH are produced.

The light-independent reactions (Calvin cycle) occur in the stroma. The enzyme RuBisCO fixes CO2 onto RuBP. ATP and NADPH from the light reactions are used to reduce the fixed carbon into G3P, which is used to build glucose.

Limiting factors include light intensity, CO2 concentration and temperature. C4 and CAM plants have adaptations that reduce photorespiration in hot, dry climates.`;

var DEMO_CARDS = [
  { type: 'qa', front: 'Where in the cell does photosynthesis take place?', back: 'In the chloroplasts (mainly in leaf mesophyll cells).', tags: ['cell'] },
  { type: 'cloze', front: 'The light-dependent reactions occur in the {{c::thylakoid membranes}}.', back: '', tags: ['light-reactions'] },
  { type: 'qa', front: 'Which molecule is split during photolysis, and what gas is released?', back: 'Water; oxygen (O₂) is released.', tags: ['light-reactions'] },
  { type: 'cloze', front: 'The Calvin cycle takes place in the {{c::stroma}} of the chloroplast.', back: '', tags: ['calvin-cycle'] },
  { type: 'qa', front: 'Which enzyme fixes CO₂ onto RuBP?', back: 'RuBisCO', tags: ['calvin-cycle', 'enzymes'] },
  { type: 'qa', front: 'Which two products of the light reactions power the Calvin cycle?', back: 'ATP and NADPH', tags: ['calvin-cycle'] },
  { type: 'cloze', front: 'Chlorophyll absorbs mostly {{c::red and blue}} wavelengths of light.', back: 'It reflects green, which is why leaves look green.', tags: ['light-reactions'] },
  { type: 'qa', front: 'What 3-carbon sugar does the Calvin cycle produce?', back: 'G3P (glyceraldehyde-3-phosphate)', tags: ['calvin-cycle'] },
  { type: 'qa', front: 'Name the three main limiting factors of photosynthesis.', back: 'Light intensity, CO₂ concentration and temperature.', tags: ['factors'] },
  { type: 'cloze', front: 'C4 and CAM plants reduce {{c::photorespiration}} in hot, dry climates.', back: '', tags: ['adaptations'] },
  { type: 'qa', front: 'Write the balanced overall equation for photosynthesis.', back: '6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂', tags: ['equation'] },
  { type: 'qa', front: 'What form of energy is photosynthesis converting, and into what?', back: 'Light energy into chemical energy (stored in glucose).', tags: ['overview'] },
];

var DEMO_GEO = [
  ['What is the capital of Canada?', 'Ottawa'], ['What is the capital of Australia?', 'Canberra'], ['What is the capital of Japan?', 'Tokyo'],
  ['What is the capital of Brazil?', 'Brasília'], ['What is the capital of Kenya?', 'Nairobi'], ['What is the capital of Turkey?', 'Ankara'],
  ['What is the capital of New Zealand?', 'Wellington'], ['What is the capital of Morocco?', 'Rabat'],
].map(function (p) { return { type: 'qa', front: p[0], back: p[1], tags: ['capitals'] }; });
