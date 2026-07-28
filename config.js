// Full effect configuration — mirrors the 21st.dev "ascii" community block schema.
const CONFIG = {
  imageSrc: "assets/me-speaking.jpg",

  // Tight crop on head + shoulders, normalized to the source image.
  // The full photo is wide and mostly empty wall; without this the face is
  // only ~10 cells across and reads as noise.
  crop: { x: 0.27, y: 0.15, w: 0.44, h: 0.56 },

  renderMode: "dither",
  bgMode: "solid",
  bgColor: "#02110a",
  bgBlur: 12,
  bgOpacity: 100,
  cellSize: 8,
  // Dither's own threshold pattern makes the texture; random dropout on top
  // of it only shreds the shapes.
  coverage: 100,
  invert: false,
  // How strongly cells take the tint colour scaled by luminance (phosphor
  // ramp) instead of the raw photo colour. High = CRT terminal look.
  phosphor: 88,
  styleBlend: "screen",
  charSet: "binary",
  customChars: "",
  brightness: 0,
  // Left neutral on purpose — toneCurve below does all the tonal shaping, and
  // its control points are tied to measured luminance of this photo.
  contrast: 100,

  // Maps source luminance -> ink. A gentle S-ramp: bright is ink, so the face
  // keeps its natural modelling (lit forehead bright, eyes and hair dark).
  // The background is removed by warmthGate below, not by this curve.
  toneCurve: [
    { x: 0.00, y: 0.06 },
    { x: 0.15, y: 0.22 },
    { x: 0.33, y: 0.45 },
    { x: 0.55, y: 0.68 },
    { x: 0.75, y: 0.90 },
    { x: 1.00, y: 1.00 }
  ],

  // Background knockout by colour, not brightness.
  // Measured on this photo: the wall and its panel seams run 0.69-0.89 luma
  // but are near-neutral (R-B only 0.10-0.16), while skin sits *lower* at
  // 0.63-0.77 luma yet is strongly warm (R-B 0.31-0.41). Luminance alone
  // cannot split them - the seams land right on top of the skin range - so
  // anything bright AND neutral is treated as background and faded out.
  // The hoodie and mic are neutral too but sit well below fromLum, so they
  // are never gated.
  warmthGate: {
    enabled: true,
    fromLum: 0.50,
    feather: 0.12,
    min: 0.18,
    max: 0.28
  },
  edgeEmphasis: 40,
  density: 0,
  tint: "#00ff66",
  tintOpacity: 45,
  overlayBlend: "overlay",
  saturation: 100,
  grayscale: 0,
  blurType: "off",
  blurAmount: 35,

  pfx: {
    vignette:   { enabled: true,  intensity: 38 },
    scanLines:  { enabled: true,  intensity: 28 },
    chromatic:  { enabled: true,  intensity: 22 },
    bloom:      { enabled: true,  intensity: 40 },
    filmGrain:  { enabled: true,  intensity: 40 },
    glitch:     { enabled: true,  intensity: 20 },
    pixelate:   { enabled: false, intensity: 15 },
    halftone:   { enabled: false, intensity: 20 },
    filmDust:   { enabled: false, intensity: 20 }
  },

  animated: true,
  animStyle: "flicker",
  animSpeed: { enabled: true, intensity: 100 },
  animIntensity: { enabled: true, intensity: 32 },

  lights: { enabled: false, points: [] },
  mask: { enabled: false, dataUrl: null, invert: false }
};

const CHARSETS = {
  binary: "01",
  ascii: " .:-=+*#%@",
  blocks: " ░▒▓█",
  hex: "0123456789ABCDEF"
};
