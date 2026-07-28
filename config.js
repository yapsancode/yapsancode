// Full effect configuration — mirrors the 21st.dev "ascii" community block schema.
const CONFIG = {
  imageSrc: "assets/me-speaking.jpg",
  renderMode: "dither",
  bgMode: "solid",
  bgColor: "#02110a",
  bgBlur: 12,
  bgOpacity: 100,
  cellSize: 10,
  coverage: 36,
  invert: false,
  styleBlend: "screen",
  charSet: "binary",
  customChars: "",
  brightness: 0,
  contrast: 115,
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
    chromatic:  { enabled: true,  intensity: 40 },
    bloom:      { enabled: true,  intensity: 60 },
    filmGrain:  { enabled: true,  intensity: 40 },
    glitch:     { enabled: true,  intensity: 20 },
    pixelate:   { enabled: false, intensity: 15 },
    halftone:   { enabled: false, intensity: 20 },
    filmDust:   { enabled: false, intensity: 20 }
  },

  animated: true,
  animStyle: "flicker",
  animSpeed: { enabled: true, intensity: 100 },
  animIntensity: { enabled: true, intensity: 60 },

  lights: { enabled: false, points: [] },
  mask: { enabled: false, dataUrl: null, invert: false }
};

const CHARSETS = {
  binary: "01",
  ascii: " .:-=+*#%@",
  blocks: " ░▒▓█",
  hex: "0123456789ABCDEF"
};
