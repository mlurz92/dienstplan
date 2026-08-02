/**
 * Trend Atlas source data.
 * Curated 2025–2027 trend references and selection constraints.
 */
export const SPECTRUM_REFERENCE_YEAR = 2026;
export const SPECTRUM_CYCLE_YEARS = 24;
export const SPECTRUM_DURATION_MS = 760;

export const TREND_SOURCES = Object.freeze({
  PANTONE_2026: 'Pantone Fashion Color Trend Reports S/S 2026 and A/W 2026/27',
  PANTONE_COTY: 'Pantone Color of the Year 2025/2026',
  WGSN_COLORO: 'WGSN × Coloro key colours 2025/2026',
  PAINT_2026: 'Major paint-brand Colors of the Year 2026'
});

/**
 * Browser-oriented sRGB approximations of named trend colours.
 * These values are design references for the UI, not production conversions
 * for physical Pantone systems.
 */
export const TREND_COLORS = Object.freeze([
  {
    month: 1, season: 'Winter', family: 'Ice · Polar light',
    colors: [
      ['Ether', '#c7d3da', TREND_SOURCES.WGSN_COLORO],
      ['Vapor Blue', '#b9c4cb', TREND_SOURCES.PANTONE_2026],
      ['Dutch Canal', '#7fa9c9', TREND_SOURCES.PANTONE_2026],
      ['Blue Aura', '#8eb4de', TREND_SOURCES.WGSN_COLORO],
      ['Marina', '#5085c3', TREND_SOURCES.PANTONE_2026],
      ['All Aboard', '#3f7ca6', TREND_SOURCES.PANTONE_2026],
      ['Poseidon', '#123651', TREND_SOURCES.PANTONE_2026],
      ['Retro Blue', '#5f7ea8', TREND_SOURCES.WGSN_COLORO]
    ]
  },
  {
    month: 2, season: 'Late winter', family: 'Berry · Lacquer',
    colors: [
      ['Primrose Pink', '#f0d3d8', TREND_SOURCES.PANTONE_2026],
      ['Tickled Pink', '#e7b6c0', TREND_SOURCES.PANTONE_2026],
      ['Tea Rose', '#dc7178', TREND_SOURCES.PANTONE_2026],
      ['Dusky Rose', '#ba7b7c', TREND_SOURCES.PANTONE_2026],
      ['Foxglove', '#c49ba0', TREND_SOURCES.PANTONE_2026],
      ['Teaberry', '#c6455c', TREND_SOURCES.PANTONE_2026],
      ['Festival Fuchsia', '#b8296a', TREND_SOURCES.PANTONE_2026],
      ['Cherry Lacquer', '#8e2436', TREND_SOURCES.WGSN_COLORO]
    ]
  },
  {
    month: 3, season: 'Early spring', family: 'Bud green · Botanical',
    colors: [
      ['Jelly Mint', '#a9dbc0', TREND_SOURCES.WGSN_COLORO],
      ['Neptune Green', '#7fbc9c', TREND_SOURCES.PANTONE_2026],
      ['Sage Green', '#b2ac88', TREND_SOURCES.PANTONE_2026],
      ['Warm Eucalyptus', '#98a189', TREND_SOURCES.PAINT_2026],
      ['Shale Green', '#79957f', TREND_SOURCES.WGSN_COLORO],
      ['Hidden Gem', '#5e7a72', TREND_SOURCES.PAINT_2026],
      ['Green Envy', '#6e8b3d', TREND_SOURCES.PANTONE_2026],
      ['Palm', '#6f7c3f', TREND_SOURCES.PANTONE_2026]
    ]
  },
  {
    month: 4, season: 'Spring', family: 'Bloom · Iris',
    colors: [
      ['Burnished Lilac', '#c5aeb1', TREND_SOURCES.PANTONE_2026],
      ['Amethyst Orchid', '#9f6ba0', TREND_SOURCES.PANTONE_2026],
      ['Fresh Purple', '#8c63c8', TREND_SOURCES.WGSN_COLORO],
      ['Orchid Bloom', '#c6a4ce', TREND_SOURCES.PANTONE_2026],
      ['Damson', '#8e6f82', TREND_SOURCES.WGSN_COLORO],
      ['Amaranth', '#6e3b4f', TREND_SOURCES.PANTONE_2026],
      ['Electric Fuchsia', '#d2409a', TREND_SOURCES.WGSN_COLORO],
      ['Divine Damson', '#4c2e48', TREND_SOURCES.PAINT_2026]
    ]
  },
  {
    month: 5, season: 'Spring', family: 'Leaf green · Citrus',
    colors: [
      ['Pale Banana', '#f4e3a0', TREND_SOURCES.PANTONE_2026],
      ['Celestial Yellow', '#efe08c', TREND_SOURCES.WGSN_COLORO],
      ['Acacia', '#ded33c', TREND_SOURCES.PANTONE_2026],
      ['Green Glow', '#c3d63c', TREND_SOURCES.WGSN_COLORO],
      ['Lemon Grass', '#ddd5a5', TREND_SOURCES.PANTONE_2026],
      ['Jelly Mint', '#a9dbc0', TREND_SOURCES.WGSN_COLORO],
      ['Green Envy', '#6e8b3d', TREND_SOURCES.PANTONE_2026],
      ['Palm', '#6f7c3f', TREND_SOURCES.PANTONE_2026]
    ]
  },
  {
    month: 6, season: 'Early summer', family: 'Water · Coast',
    colors: [
      ['Jelly Mint', '#a9dbc0', TREND_SOURCES.WGSN_COLORO],
      ['Neptune Green', '#7fbc9c', TREND_SOURCES.PANTONE_2026],
      ['Satin Lagoon', '#2e7c84', TREND_SOURCES.WGSN_COLORO],
      ['Transformative Teal', '#1c7e84', TREND_SOURCES.WGSN_COLORO],
      ['Alexandrite', '#3e7e8c', TREND_SOURCES.PANTONE_2026],
      ['Dutch Canal', '#7fa9c9', TREND_SOURCES.PANTONE_2026],
      ['Blue Aura', '#8eb4de', TREND_SOURCES.WGSN_COLORO],
      ['Marina', '#5085c3', TREND_SOURCES.PANTONE_2026]
    ]
  },
  {
    month: 7, season: 'High summer', family: 'Fruit · Solar heat',
    colors: [
      ['Muskmelon', '#e8834a', TREND_SOURCES.PANTONE_2026],
      ['Mandarin Orange', '#e2703a', TREND_SOURCES.WGSN_COLORO],
      ['Amber Haze', '#e0a46b', TREND_SOURCES.WGSN_COLORO],
      ['Brandied Melon', '#c86a4b', TREND_SOURCES.PANTONE_2026],
      ['Burnt Sienna', '#b75b3f', TREND_SOURCES.PANTONE_2026],
      ['Chili Oil', '#b5462f', TREND_SOURCES.PANTONE_2026],
      ['Poppy Red', '#be3a34', TREND_SOURCES.PANTONE_2026],
      ['Lava Falls', '#a32b31', TREND_SOURCES.PANTONE_2026]
    ]
  },
  {
    month: 8, season: 'Late summer', family: 'Gold · Harvest',
    colors: [
      ['Epernay', '#d6b96c', TREND_SOURCES.PAINT_2026],
      ['Universal Khaki', '#cbbba1', TREND_SOURCES.PAINT_2026],
      ['Pale Banana', '#f4e3a0', TREND_SOURCES.PANTONE_2026],
      ['Acacia', '#ded33c', TREND_SOURCES.PANTONE_2026],
      ['Lemon Grass', '#ddd5a5', TREND_SOURCES.PANTONE_2026],
      ['Green Glow', '#c3d63c', TREND_SOURCES.WGSN_COLORO],
      ['Burnt Olive', '#8a7b4e', TREND_SOURCES.PANTONE_2026],
      ['Celestial Yellow', '#efe08c', TREND_SOURCES.WGSN_COLORO]
    ]
  },
  {
    month: 9, season: 'Early autumn', family: 'Wine · Plum',
    colors: [
      ['Foxglove', '#c49ba0', TREND_SOURCES.PANTONE_2026],
      ['Burnished Lilac', '#c5aeb1', TREND_SOURCES.PANTONE_2026],
      ['Amethyst Orchid', '#9f6ba0', TREND_SOURCES.PANTONE_2026],
      ['Damson', '#8e6f82', TREND_SOURCES.WGSN_COLORO],
      ['Mauve Wine', '#734550', TREND_SOURCES.WGSN_COLORO],
      ['Amaranth', '#6e3b4f', TREND_SOURCES.PANTONE_2026],
      ['Festival Fuchsia', '#b8296a', TREND_SOURCES.PANTONE_2026],
      ['Divine Damson', '#4c2e48', TREND_SOURCES.PAINT_2026]
    ]
  },
  {
    month: 10, season: 'Autumn', family: 'Copper · Earth',
    colors: [
      ['Candied Ginger', '#d8a47f', TREND_SOURCES.PANTONE_2026],
      ['Caramel', '#c67c4e', TREND_SOURCES.PAINT_2026],
      ['Amber Haze', '#e0a46b', TREND_SOURCES.WGSN_COLORO],
      ['Muted Clay', '#c08a78', TREND_SOURCES.PANTONE_2026],
      ['Toffee', '#a2704f', TREND_SOURCES.PANTONE_2026],
      ['Arabian Spice', '#8b4a2f', TREND_SOURCES.PANTONE_2026],
      ['Cocoa Powder', '#7b4a3a', TREND_SOURCES.WGSN_COLORO],
      ['Warm Mahogany', '#7b473c', TREND_SOURCES.PAINT_2026]
    ]
  },
  {
    month: 11, season: 'Late autumn', family: 'Mineral · Storm',
    colors: [
      ['Vapor Blue', '#b9c4cb', TREND_SOURCES.PANTONE_2026],
      ['Underworld', '#8c93a1', TREND_SOURCES.PANTONE_2026],
      ['Future Dusk', '#57668b', TREND_SOURCES.WGSN_COLORO],
      ['Silhouette', '#57504c', TREND_SOURCES.PAINT_2026],
      ['Crown Blue', '#3a3f63', TREND_SOURCES.PANTONE_2026],
      ['Evening Blue', '#2c3a4a', TREND_SOURCES.WGSN_COLORO],
      ['Rhodonite', '#3e3a55', TREND_SOURCES.PANTONE_2026],
      ['Retro Blue', '#5f7ea8', TREND_SOURCES.WGSN_COLORO]
    ]
  },
  {
    month: 12, season: 'Winter', family: 'Evergreen · Festive light',
    colors: [
      ['Neptune Green', '#7fbc9c', TREND_SOURCES.PANTONE_2026],
      ['Satin Lagoon', '#2e7c84', TREND_SOURCES.WGSN_COLORO],
      ['Transformative Teal', '#1c7e84', TREND_SOURCES.WGSN_COLORO],
      ['Hidden Gem', '#5e7a72', TREND_SOURCES.PAINT_2026],
      ['Shale Green', '#79957f', TREND_SOURCES.WGSN_COLORO],
      ['Sycamore', '#3f4c42', TREND_SOURCES.PANTONE_2026],
      ['Midnight Garden', '#39463c', TREND_SOURCES.PAINT_2026],
      ['Alexandrite', '#3e7e8c', TREND_SOURCES.PANTONE_2026]
    ]
  }
]);

export const SUPPLEMENTAL_TREND_ANCHORS = Object.freeze([
  ['Cloud Dancer', '#f0eee9', TREND_SOURCES.PANTONE_COTY, [1, 12]],
  ['Mocha Mousse', '#a47864', TREND_SOURCES.PANTONE_COTY, [2, 10]],
  ['White Onyx', '#ece9df', TREND_SOURCES.PANTONE_2026, [1, 12]],
  ['Wax Paper', '#e4d7b6', TREND_SOURCES.WGSN_COLORO, [5, 8]],
  ['Red Mahogany', '#7f3d3d', TREND_SOURCES.PANTONE_2026, [2, 9, 10]],
  ['Coffee Bean', '#4a2f27', TREND_SOURCES.PANTONE_2026, [10]],
  ['Magical Forest', '#244f46', TREND_SOURCES.PANTONE_2026, [3, 12]],
  ['Lavender Blue', '#a9a9c8', TREND_SOURCES.PANTONE_2026, [1, 4, 11]]
]);

export const YEAR_MOODS = Object.freeze([
  ['Crystal', -10, .030, -.010], ['Jewel', 8, -.030, .035], ['Botanical', -14, .005, .020],
  ['Lacquer', 13, -.012, .045], ['Mineral', -5, -.035, -.025], ['Solar', 16, .025, .030],
  ['Nordic', -18, .020, -.010], ['Velvet', 6, -.055, .015], ['Electric', 22, .000, .050],
  ['Organic', -9, .010, -.020], ['Chromatic', 18, .020, .015], ['Heritage', 3, -.025, -.005],
  ['Aurora', -22, .015, .035], ['Couture', 10, -.015, .005], ['Signal', 25, .005, .055],
  ['Porcelain', -6, .045, -.030], ['Dusk', 14, -.060, .020], ['Fresh', -17, .035, .025],
  ['Metallic', 7, -.035, -.020], ['Bloom', 20, .020, .040], ['Forest', -12, -.020, .015],
  ['Prism', 28, .000, .045], ['Linen', -3, .040, -.040], ['Atelier', 12, -.015, .025]
].map(([name, hue, lightness, chroma]) => Object.freeze({ name, hue, lightness, chroma })));

export const SURFACE_MIX = Object.freeze({
  '--weekday-field-bg': .49,
  '--saturday-row-bg': .16,
  '--sunday-row-bg': .25,
  '--holiday-row-bg': .34
});
export const VARIABLE_NAMES = Object.freeze([
  '--month-accent', '--month-accent-strong', '--month-ink', '--month-glow', '--month-panel-tint',
  ...Object.keys(SURFACE_MIX)
]);

export const MIN_NEIGHBOUR_DISTANCE = .13;
export const MIN_NEIGHBOUR_HUE = 42;
export const MIN_NEIGHBOUR_LIGHTNESS = .038;
export const MIN_ANNUAL_DISTANCE = .07;
export const MIN_RECENT_DISTANCE = .075;
export const NAME_COOLDOWN_MONTHS = 18;
export const VISUAL_MEMORY_MONTHS = 6;
export const HUE_SECTOR_MEMORY_MONTHS = 3;
