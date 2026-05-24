import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass }     from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass }     from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { GTAOPass }        from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TextGeometry }       from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader }         from 'three/examples/jsm/loaders/FontLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Typeface.json fonts bundled with the three npm package. We import as
// modules so they're code-split into their own chunks (~70 KB each gzipped,
// only fetched on first text generation).
const FONT_URLS = {
  helvetiker_bold:    () => import('three/examples/fonts/helvetiker_bold.typeface.json'),
  helvetiker_regular: () => import('three/examples/fonts/helvetiker_regular.typeface.json'),
  optimer_bold:       () => import('three/examples/fonts/optimer_bold.typeface.json'),
  optimer_regular:    () => import('three/examples/fonts/optimer_regular.typeface.json'),
  gentilis_bold:      () => import('three/examples/fonts/gentilis_bold.typeface.json'),
  gentilis_regular:   () => import('three/examples/fonts/gentilis_regular.typeface.json'),
};

// --- State Variables ---
let scene, camera, renderer, controls;
let currentModel = null;
let modelStats = { meshes: 0, vertices: 0, triangles: 0 };
let pmremGenerator, proceduralEnvTexture;
let voxelInstancedMesh = null;       // bricks (3-plate-tall) in heightmap mode; primary body in voxelize mode
let voxelPlateInstancedMesh = null;  // plates (1-plate-tall); only used in heightmap mode
let voxelStudInstancedMesh = null;
let brickCapacity = 0;
let plateCapacity = 0;
let studCapacity = 0;
let mediaAspect = 1.0;

// Voxel UV and Color states
let voxelUVMap = new Map(); // `${x},${y},${z}` -> THREE.Vector2
// Parallel to voxelUVMap — index into voxelizeMesh's returned meshList.
// Lets us look up which source mesh (and hence which material/texture)
// a voxel came from, so Block Effect can sample real per-piece colours
// instead of only using physicalMaterial.color.
let voxelMeshIdxMap = new Map(); // `${x},${y},${z}` -> number
let voxelizedMeshList = [];      // [mesh, mesh, ...] in idx order

// Cache: Texture -> { canvas, ctx, w, h } so each colour texture is only
// drawn to an offscreen canvas once per session, even if Block Effect is
// regenerated multiple times.
const textureSampleCache = new WeakMap();
let voxelKeys = []; // Stores keys of voxels for fast iteration in update loop

// Media State
let loadedMediaElement = null; // HTMLImageElement or HTMLVideoElement
let loadedMediaType = null; // 'image' or 'video'
let loadedMediaTexture = null; // THREE.Texture or THREE.VideoTexture
const samplingCanvas = document.createElement('canvas');
const samplingCtx = samplingCanvas.getContext('2d', { willReadFrequently: true });
let samplingData = null; // Cached ImageData for fast CPU pixel reads
let isMediaLoaded = false;
let activeBackgroundType = 'gradient'; // Tracks normal BG mode to restore it

// 2D Filter Mode State
let viewMode = '3d'; // '3d' (Three.js scene) | '2d' (Lego filter on 2D canvas)
let last2DRenderTime = 0; // throttling timestamp for video frames in 2D mode

// 2D viewport state.
//   zoom  — scale factor applied to the natural tileSize (NOT a ctx.scale
//           transform, so the gradients/masks stay vector-crisp at every
//           zoom level — they're re-rasterised at the new tile size)
//   gridX/gridY — absolute screen-px position of the grid's top-left.
//   null = "compute centered position on next render", used after reset.
const view2D = { zoom: 1.0, gridX: null, gridY: null };
let isPanning2D = false;
const panStart = { mouseX: 0, mouseY: 0, gridX: 0, gridY: 0 };

// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loaderProgress = document.getElementById('loader-progress');
const webglCanvas = document.getElementById('webgl');
const canvas2D = document.getElementById('canvas-2d');
const ctx2D = canvas2D.getContext('2d');
const canvas2DEmpty = document.getElementById('canvas-2d-empty');
const btnMode3D = document.getElementById('btn-mode-3d');
const btnMode2D = document.getElementById('btn-mode-2d');

// Material Inputs
const materialPreset = document.getElementById('material-preset');
const materialRoughness = document.getElementById('material-roughness');
const valRoughness = document.getElementById('val-roughness');
const materialMetalness = document.getElementById('material-metalness');
const valMetalness = document.getElementById('val-metalness');
const materialTransmission = document.getElementById('material-transmission');
const valTransmission = document.getElementById('val-transmission');
const materialThickness = document.getElementById('material-thickness');
const valThickness = document.getElementById('val-thickness');
const materialIor = document.getElementById('material-ior');
const valIor = document.getElementById('val-ior');
// Extended PBR sliders
const matClearcoat   = document.getElementById('material-clearcoat');
const valClearcoat   = document.getElementById('val-clearcoat');
const matSheen       = document.getElementById('material-sheen');
const valSheen       = document.getElementById('val-sheen');
const matIridescence = document.getElementById('material-iridescence');
const valIridescence = document.getElementById('val-iridescence');
const modelScale = document.getElementById('model-scale');
const valScale = document.getElementById('val-scale');

// Lights Inputs
const lightIntensity = document.getElementById('light-intensity');
const valLightIntensity = document.getElementById('val-light-intensity');
const lightX = document.getElementById('light-x');
const valLightX = document.getElementById('val-light-x');
const lightY = document.getElementById('light-y');
const valLightY = document.getElementById('val-light-y');
const lightZ = document.getElementById('light-z');
const valLightZ = document.getElementById('val-light-z');
const hemiIntensity = document.getElementById('hemi-intensity');
const valHemiIntensity = document.getElementById('val-hemi-intensity');
// Softbox / RectAreaLight
const rectPower    = document.getElementById('rect-power');
const valRectPower = document.getElementById('val-rect-power');
const rectSize     = document.getElementById('rect-size');
const valRectSize  = document.getElementById('val-rect-size');
// Post FX
const fxBloom            = document.getElementById('fx-bloom');
const fxBloomStrength    = document.getElementById('fx-bloom-strength');
const valFxBloomStrength = document.getElementById('val-fx-bloom-strength');
const fxBloomThreshold   = document.getElementById('fx-bloom-threshold');
const valFxBloomThreshold= document.getElementById('val-fx-bloom-threshold');
const fxOutline          = document.getElementById('fx-outline');
const fxOutlineStrength  = document.getElementById('fx-outline-strength');
const valFxOutlineStrength=document.getElementById('val-fx-outline-strength');
const fxGtao             = document.getElementById('fx-gtao');
// Voxel geom
const voxelGeomSelect  = document.getElementById('voxel-geom');
const voxelRoundRadius = document.getElementById('voxel-round-radius');
const valVoxelRoundRadius = document.getElementById('val-voxel-round-radius');
// Renderer
const rendererBackend = document.getElementById('renderer-backend');
const envMode = document.getElementById('env-mode');
const envUpload = document.getElementById('env-upload');
const envFileRow = document.getElementById('env-file-row');
const envFileName = document.getElementById('env-file-name');
const envIntensityInput = document.getElementById('env-intensity');
const valEnvIntensity = document.getElementById('val-env-intensity');

// Scene Inputs
const sceneBgType = document.getElementById('scene-bg-type');
const sceneBgColor = document.getElementById('scene-bg-color');
const bgColorHex = document.getElementById('bg-color-hex');
const bgColorPickerRow = document.getElementById('bg-color-picker-row');

// Motion Inputs
const animAutoRotate = document.getElementById('anim-auto-rotate');
const animSpeed = document.getElementById('anim-speed');
const valAnimSpeed = document.getElementById('val-anim-speed');
const animMass = document.getElementById('anim-mass');
const valAnimMass = document.getElementById('val-anim-mass');

// Display Stats
const infoFov = document.getElementById('info-fov');
const infoMeshes = document.getElementById('info-meshes');
const infoVertices = document.getElementById('info-vertices');
const infoTriangles = document.getElementById('info-triangles');
const displayProjectName = document.getElementById('display-project-name');

// Block Effect Inputs
const blockMode = document.getElementById('block-mode');
const blockShape = document.getElementById('block-shape');
const blockLegoSnap = document.getElementById('block-lego-snap');
const blockMix = document.getElementById('block-mix');
const blockResolution = document.getElementById('block-resolution');
const valBlockResolution = document.getElementById('val-block-resolution');
const blockGap = document.getElementById('block-gap');
const valBlockGap = document.getElementById('val-block-gap');
const shadowSpread = document.getElementById('shadow-spread');
const valShadowSpread = document.getElementById('val-shadow-spread');

// Media Upload Inputs
const mediaUpload = document.getElementById('media-upload');
const mediaUploadZone = document.getElementById('media-upload-zone');
const mediaInfoWrapper = document.getElementById('media-info-wrapper');
const mediaPreviewCanvas = document.getElementById('media-preview-canvas');
const mediaPreviewCtx = mediaPreviewCanvas.getContext('2d');
const mediaFilename = document.getElementById('media-filename');
const mediaTypeBadge = document.getElementById('media-type-badge');
const mediaVideoControls = document.getElementById('media-video-controls');
const btnVideoPlay = document.getElementById('btn-video-play');
const btnVideoMute = document.getElementById('btn-video-mute');
const mediaMapping = document.getElementById('media-mapping');
const mediaHeightScaleRow = document.getElementById('media-height-scale-row');
const mediaHeightScale = document.getElementById('media-height-scale');
const valMediaHeightScale = document.getElementById('val-media-height-scale');
const mediaHeightInvertRow = document.getElementById('media-height-invert-row');
const mediaHeightInvert = document.getElementById('media-height-invert');
const mediaBrightnessRow = document.getElementById('media-brightness-row');
const mediaBrightness = document.getElementById('media-brightness');
const valMediaBrightness = document.getElementById('val-media-brightness');

// Buttons & Interaction
const btnReset = document.getElementById('btn-reset');
const btnTheme = document.getElementById('btn-theme');
const btnScreenshot = document.getElementById('btn-screenshot');
const btnExportGlb = document.getElementById('btn-export-glb');

// Video export controls (visible only when a video is loaded)
const videoExportRow      = document.getElementById('video-export-row');
const videoExportFormat   = document.getElementById('video-export-format');
const btnExportVideo      = document.getElementById('btn-export-video');
const videoExportBtnLabel = document.getElementById('video-export-btn-label');
const videoExportProgress = document.getElementById('video-export-progress');
const videoExportBarFill  = document.getElementById('video-export-bar-fill');
const videoExportProgressText = document.getElementById('video-export-progress-text');
let isExportingVideo = false;
const modelUpload = document.getElementById('model-upload');
const uploadZone = document.getElementById('upload-zone');
// "Use file's own materials" — on by default. Keeps the loader's
// MeshStandardMaterial / MeshPhongMaterial / textures intact instead of
// stomping them with the global physicalMaterial.
const modelKeepMaterials = document.getElementById('model-keep-materials');

// ─── Color Overlay refs (multiplicative tint + emissive glow) ───────────
const matTintColor       = document.getElementById('material-tint-color');
const tintColorHex       = document.getElementById('tint-color-hex');
const matTintReset       = document.getElementById('material-tint-reset');
const matEmissiveColor   = document.getElementById('material-emissive-color');
const emissiveColorHex   = document.getElementById('emissive-color-hex');
const matEmissiveReset   = document.getElementById('material-emissive-reset');
const matEmissiveInt     = document.getElementById('material-emissive-intensity');
const valEmissiveInt     = document.getElementById('val-emissive-intensity');

// Overlay state — preset.color is the "base", these are multiplied onto it.
// White tint (1,1,1) = identity. Black emissive = off.
const tintColor       = new THREE.Color('#ffffff');
const baseMaterialColor = new THREE.Color('#ffffff'); // last preset's color, before tint

// ─── 3D Text refs (TextGeometry addon) ─────────────────────────────────
const textContentEl = document.getElementById('text-content');
const textFontEl    = document.getElementById('text-font');
const textSizeEl    = document.getElementById('text-size');
const valTextSize   = document.getElementById('val-text-size');
const textDepthEl   = document.getElementById('text-depth');
const valTextDepth  = document.getElementById('val-text-depth');
const textCurveEl   = document.getElementById('text-curve');
const valTextCurve  = document.getElementById('val-text-curve');
const textBevelEl   = document.getElementById('text-bevel');
const textAddBtn    = document.getElementById('text-add');
const textRemoveBtn = document.getElementById('text-remove');

// Font cache so the JSON file is only parsed once per face per session.
const fontLoader = new FontLoader();
const fontCache  = new Map(); // fontKey → THREE.Font instance

async function getFont(fontKey) {
  if (fontCache.has(fontKey)) return fontCache.get(fontKey);
  const loaderFn = FONT_URLS[fontKey];
  if (!loaderFn) return null;
  const mod = await loaderFn();
  // typeface.json is shipped as a JSON module → default export is the object
  const font = fontLoader.parse(mod.default || mod);
  fontCache.set(fontKey, font);
  return font;
}

// Builds 3D text and installs it as the active currentModel. This routes
// through setupModelInScene() so:
//   • the previous model (default video sample, uploaded GLB/STL/etc.)
//     is removed and its voxelization is cleared — no more overlapping
//   • Block Effect / Model Transform / focus camera all "just work"
//   • the text inherits the live physicalMaterial like any other model
async function buildOrUpdateText() {
  const text = (textContentEl.value || 'STUD').slice(0, 32);
  const fontKey = textFontEl.value;
  const size = parseFloat(textSizeEl.value);
  const depth = parseFloat(textDepthEl.value);
  const curve = parseInt(textCurveEl.value, 10);
  const bevel = textBevelEl.checked;

  const font = await getFont(fontKey);
  if (!font) {
    console.warn('[text] font failed to load:', fontKey);
    return;
  }

  // Build the geometry. `depth` in r163+ replaced the old `height` prop.
  const geom = new TextGeometry(text, {
    font,
    size,
    depth,
    curveSegments: curve,
    bevelEnabled: bevel,
    bevelThickness: bevel ? Math.max(0.5, depth * 0.15) : 0,
    bevelSize:      bevel ? Math.max(0.3, size * 0.04) : 0,
    bevelOffset:    0,
    bevelSegments:  bevel ? 3 : 0,
  });
  geom.computeBoundingBox();

  // CRITICAL — turn off any active heightmap mapping FIRST, before adding
  // the text. The default sample loads with mediaMapping='heightmap', and
  // the animate loop calls updateBlockHeightmap() every frame. If we leave
  // it on, the heightmap voxels get re-created the next frame and overlap
  // the text (the bug shown in the user's screenshot).
  if (mediaMapping && mediaMapping.value === 'heightmap') {
    mediaMapping.value = 'none';
    if (typeof applyMediaMapping === 'function') applyMediaMapping();
  }

  // Wrap the bare TextMesh in a Group so setupModelInScene's traversal
  // (which expects an Object3D root) treats it like any imported model.
  const mesh = new THREE.Mesh(geom, physicalMaterial);
  mesh.name = '__textMesh';
  const root = new THREE.Group();
  root.name = '__textRoot';
  root.add(mesh);

  // setupModelInScene re-applies physicalMaterial, clears voxel caches
  // (both regular and heightmap paths share voxelInstancedMesh refs),
  // re-centers, focuses orbit, and triggers Block Effect if it's on.
  setupModelInScene(root);
}

function removeTextMesh() {
  // If the current model is our text root, tear it down. Mirrors the
  // pattern setupModelInScene uses when a new model replaces the old.
  if (currentModel && currentModel.name === '__textRoot') {
    scene.remove(currentModel);
    currentModel.traverse((c) => {
      if (c.isMesh && c.geometry) c.geometry.dispose();
    });
    currentModel = null;
    modelStats = { meshes: 0, vertices: 0, triangles: 0 };
    // Sync the camera info panel inline (no central updater exists).
    if (infoMeshes)    infoMeshes.textContent    = '0';
    if (infoVertices)  infoVertices.textContent  = '0';
    if (infoTriangles) infoTriangles.textContent = '0';
  }
}

// --- Create Global Material ---
// Physically based material controlled by presets & inputs
const physicalMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#ffffff'), // Default to white to prevent color distortion on voxel meshes
  roughness: parseFloat(materialRoughness.value),
  metalness: parseFloat(materialMetalness.value),
  transmission: parseFloat(materialTransmission.value),
  thickness: parseFloat(materialThickness.value),
  ior: parseFloat(materialIor.value),
  reflectivity: 0.5,
  // --- Extended PBR properties (driven by presets / advanced sliders) ----
  clearcoat: 0.0,
  clearcoatRoughness: 0.1,
  sheen: 0.0,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color(0xffffff),
  iridescence: 0.0,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 800],
  // ----------------------------------------------------------------------
  side: THREE.DoubleSide,
  transparent: parseFloat(materialTransmission.value) > 0,
  depthWrite: true,
});

// ─── Wood PBR texture cache ─────────────────────────────────────────────
// Loaded once at startup. The 'wood' preset binds these three maps onto
// MeshPhysicalMaterial when selected. Anything that fails to load (e.g.
// user hasn't placed the file yet) silently stays `null`, and the preset
// falls back to its flat base colour.
//   • albedo  — colour (sRGB)
//   • normal  — surface bumps (linear RGB)
//   • ao      — ambient occlusion (linear single channel; uses uv channel 0
//               via aoMap.channel = 0 so we don't need a second UV set)
const woodTextureLoader = new THREE.TextureLoader();
const woodTextures = { albedo: null, normal: null, ao: null };

function loadWoodTexture(url, sRGB = true) {
  return new Promise((resolve) => {
    woodTextureLoader.load(
      url,
      (tex) => {
        if (sRGB) tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        resolve(tex);
      },
      undefined,
      () => resolve(null) // 404 / decode error → null, preset falls back to colour
    );
  });
}

(async function loadWoodTextures() {
  const base = '/textures/wood';
  const [albedo, normal, ao] = await Promise.all([
    loadWoodTexture(`${base}/Wood_Albedo.jpg`,            /*sRGB*/ true),
    loadWoodTexture(`${base}/Wood_Normal.jpg`,            /*sRGB*/ false),
    loadWoodTexture(`${base}/Wood_Ambient_Occlusion.jpg`, /*sRGB*/ false),
  ]);
  // aoMap defaults to channel 1 (a second UV set). Our brick BoxGeometry
  // only has uv channel 0, so retarget the AO map onto channel 0.
  if (ao) ao.channel = 0;
  woodTextures.albedo = albedo;
  woodTextures.normal = normal;
  woodTextures.ao     = ao;
  // If the wood preset is currently active, hot-swap the textures onto it.
  if (materialPreset && (materialPreset.value || '').startsWith('wood')) {
    applyMaterialPreset(materialPreset.value);
  }
})();

// ─── Mat Works PBR texture cache (50 materials, lazy-loaded) ────────────
// Each material lives at /textures/mats/<MatName>/<MatName>_<map>.png with
// four maps: basecolor, metallic, normal, roughness. We only fetch a
// material's 4 textures the first time the user picks its preset; after
// that the result is cached so re-selecting is instant.
const matTextureCache = new Map(); // matName → { basecolor, metallic, normal, roughness }

function loadMatTexture(url, sRGB) {
  return new Promise((resolve) => {
    woodTextureLoader.load(
      url,
      (tex) => {
        if (sRGB) tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        resolve(tex);
      },
      undefined,
      () => resolve(null) // 404 / decode error → null
    );
  });
}

async function getMatTextures(matName) {
  if (matTextureCache.has(matName)) return matTextureCache.get(matName);
  const base = `/textures/mats/${matName}/${matName}`;
  const [basecolor, metallic, normal, roughness] = await Promise.all([
    loadMatTexture(`${base}_basecolor.png`, /*sRGB*/ true),
    loadMatTexture(`${base}_metallic.png`,  /*sRGB*/ false),
    loadMatTexture(`${base}_normal.png`,    /*sRGB*/ false),
    loadMatTexture(`${base}_roughness.png`, /*sRGB*/ false),
  ]);
  const set = { basecolor, metallic, normal, roughness };
  matTextureCache.set(matName, set);
  return set;
}

// Material Presets — extended catalogue. Every preset specifies the full
// set of properties driven by Material Config + Advanced sliders. Missing
// extended props (clearcoat / sheen / iridescence) default to 0. Presets
// with a `texture` field will swap in diffuse + normal maps from the wood
// texture cache when applied.
// Helper: mat-based preset (textures override the scalars per-pixel)
// roughness/metalness=1 means "use the full value from the maps"
const mp = (mat, opts = {}) => ({
  roughness: 1, metalness: 1,
  transmission: 0, thickness: 0, ior: 1.5,
  clearcoat: 0, sheen: 0, iridescence: 0,
  color: '#ffffff',
  mat,
  ...opts,
});

const materialPresets = {
  // ── Plastic & Polymer (mat-textured + special) ──────────────────────
  plastic:               mp('Matte_Rough_Plastic'),
  'plastic-rough':       mp('Rough_Plastic'),
  'plastic-ultra-rough': mp('Ultra_Rough_Plastic'),
  'plastic-glossy':      mp('Shiny_Plastic', { clearcoat: 0.2 }),
  'plastic-industrial':  mp('Industrial_Plastic'),
  'plastic-half-matte':  mp('Half_Matte_Plastic'),
  'plastic-checkered':   mp('Checkered_Plastic'),
  'plastic-translucent': mp('Translucent_Plastic', { transmission: 0.6, thickness: 4, ior: 1.5 }),
  foam:                  mp('Hard_Foam'),
  wax: {
    roughness: 0.40, metalness: 0.00,
    transmission: 0.45, thickness: 8.0, ior: 1.45,
    clearcoat: 0.00, sheen: 0.00, iridescence: 0.00,
    color: '#fff8e0'
  },

  // ── Rubber & Soft ───────────────────────────────────────────────────
  rubber:                  mp('Synthetic_Rubber'),
  'rubber-mat':            mp('Rubber_Mat'),
  'rubber-mat-translucent':mp('Rubber_Mat_Translucent', { transmission: 0.45, thickness: 3 }),
  'rubber-diamond':        mp('Diamond_Rubber'),
  'rubber-indented':       mp('Indented_Rubber'),
  'rubber-perforated':     mp('Perforated_Rubber'),
  'rubber-tyre':           mp('Rubber_Tyre'),

  // ── Glass & Crystal ─────────────────────────────────────────────────
  'frosted-glass': mp('Frosted_Glass', { transmission: 0.85, thickness: 8, ior: 1.52 }),
  'canopy-glass':  mp('Canopy_Glass',  { transmission: 0.85, thickness: 6, ior: 1.50 }),
  'matte-screen':  mp('Matte_Screen'),
  crystal: { roughness: 0.00, metalness: 0.00, transmission: 1.00, thickness: 30.0, ior: 2.40, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#ffffff' },
  ice:     { roughness: 0.30, metalness: 0.00, transmission: 0.85, thickness: 12.0, ior: 1.31, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#cdeaff' },
  ruby:    { roughness: 0.15, metalness: 0.00, transmission: 0.95, thickness: 15.0, ior: 1.77, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#e0115f' },
  amber:   { roughness: 0.20, metalness: 0.00, transmission: 0.80, thickness: 14.0, ior: 1.55, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#ff9d2f' },
  diamond: { roughness: 0.00, metalness: 0.00, transmission: 1.00, thickness: 20.0, ior: 2.42, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#ffffff' },
  honey:   { roughness: 0.10, metalness: 0.00, transmission: 0.85, thickness: 18.0, ior: 1.50, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#f0b400' },

  // ── Metal (Aluminium / Steel / Titanium / Copper + classics) ─────────
  'al-polished':   mp('Polished_Aluminium'),
  'al-brushed':    mp('Alluminium'),
  'al-lc':         mp('LC_Aluminium'),
  'metal-basic':   mp('Basic_Metal'),
  'metal-white':   mp('White_Metal'),
  'steel-brushed': mp('Half_Matt_Steel'),
  'steel-machined':mp('Machined_Steel'),
  'steel-hex':     mp('Hex_Steel'),
  'steel-graphite':mp('Graphite_Steel'),
  'steel-midnight':mp('Midnight_Steel'),
  'steel-camo':    mp('Camo_Steel'),
  'steel-powder':  mp('Powder_Coated_Steel'),
  'steel-grainy':  mp('Coated_Grainy_Steel'),
  'titanium-coated':mp('Coated_Titanium'),
  'titanium-cyber':mp('Cyber_Titanium'),
  copper:          mp('Copper'),
  gold:    { roughness: 0.20, metalness: 1.00, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#ffd700' },
  'chrome-plated': { roughness: 0.04, metalness: 1.00, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 0.50, sheen: 0.00, iridescence: 0.00, color: '#f0f2f5' },

  // ── Carbon Composite ────────────────────────────────────────────────
  'carbon-fiber':        mp('Carbon_Fiber'),
  'carbon-fiber-coated': mp('Carbon_Fiber_Coated', { clearcoat: 0.5 }),

  // ── Fabric & Cable ──────────────────────────────────────────────────
  'leather-black':  mp('Black_Leather'),
  'fabric-military':mp('Military_Fabric', { sheen: 0.3 }),
  'cable-fabric':   mp('Braided_Cable_Fabric'),
  'cable-steel':    mp('Braided_Cable_Steel'),
  velcro:           mp('Velcro'),
  'hook-loop':      mp('Hook_And_Loop'),

  // ── Industrial / Patterns ───────────────────────────────────────────
  'floor-composite': mp('Composite_Floor'),
  'scales-composite':mp('Composite_Scales'),
  'floor-dotted':    mp('Dotted_Steel_Floor'),
  'net-dotted':      mp('Dotted_Steel_Net'),
  'floor-steel-1':   mp('Steel_Floor_1'),
  'floor-steel-2':   mp('Steel_Floor_2'),
  'scales-steel':    mp('Steel_Scales'),

  // ── Stone, Wood & Ceramic ───────────────────────────────────────────
  terracotta: { roughness: 0.95, metalness: 0.00, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 0.00, sheen: 0.00, iridescence: 0.00, color: '#c46a3c' },
  marble:     { roughness: 0.10, metalness: 0.00, transmission: 0.08, thickness: 4.0, ior: 1.52, clearcoat: 0.60, sheen: 0.00, iridescence: 0.00, color: '#f5f0e8' },
  wood:       { roughness: 0.80, metalness: 0.00, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 0.12, sheen: 0.00, iridescence: 0.00, color: '#ffffff', useWoodTextures: true },

  // ── Special Optics ──────────────────────────────────────────────────
  'car-paint':   { roughness: 0.40, metalness: 0.00, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 1.00, sheen: 0.00, iridescence: 0.00, color: '#ffffff' },
  velvet:        { roughness: 0.95, metalness: 0.00, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 0.00, sheen: 1.00, iridescence: 0.00, color: '#4a1a4a' },
  'soap-bubble': { roughness: 0.00, metalness: 0.00, transmission: 1.00, thickness: 5.0, ior: 1.33, clearcoat: 0.00, sheen: 0.00, iridescence: 1.00, color: '#ffffff' },
  pearl:         { roughness: 0.35, metalness: 0.30, transmission: 0.00, thickness: 0.0, ior: 1.50, clearcoat: 0.30, sheen: 0.40, iridescence: 0.50, color: '#fff5e8' }
};

// Real-Time Material Update/Synchronizer
function updateVoxelMaterials() {
  const meshes = [voxelInstancedMesh, voxelPlateInstancedMesh, voxelStudInstancedMesh];
  meshes.forEach(mesh => {
    if (mesh && mesh.material) {
      const mat = mesh.material;
      mat.color.copy(physicalMaterial.color);
      mat.roughness = physicalMaterial.roughness;
      mat.metalness = physicalMaterial.metalness;
      mat.transmission = physicalMaterial.transmission;
      mat.thickness = physicalMaterial.thickness;
      mat.ior = physicalMaterial.ior;
      // Extended PBR props
      mat.clearcoat = physicalMaterial.clearcoat;
      mat.clearcoatRoughness = physicalMaterial.clearcoatRoughness;
      mat.sheen = physicalMaterial.sheen;
      mat.sheenRoughness = physicalMaterial.sheenRoughness;
      if (mat.sheenColor && physicalMaterial.sheenColor) {
        mat.sheenColor.copy(physicalMaterial.sheenColor);
      }
      mat.iridescence = physicalMaterial.iridescence;
      mat.iridescenceIOR = physicalMaterial.iridescenceIOR;
      mat.iridescenceThicknessRange = physicalMaterial.iridescenceThicknessRange;
      // Color Overlay — emissive glow (independent of lighting)
      if (mat.emissive && physicalMaterial.emissive) {
        mat.emissive.copy(physicalMaterial.emissive);
      }
      mat.emissiveIntensity = physicalMaterial.emissiveIntensity ?? 1;
      // Texture forwarding — wood: albedo+normal+AO, mat: basecolor+normal+
      // metalness+roughness. We forward whichever ones are set; the rest
      // stay null and the per-material scalars take over.
      mat.map          = physicalMaterial.map          || null;
      mat.normalMap    = physicalMaterial.normalMap    || null;
      mat.metalnessMap = physicalMaterial.metalnessMap || null;
      mat.roughnessMap = physicalMaterial.roughnessMap || null;
      mat.aoMap        = physicalMaterial.aoMap        || null;
      mat.aoMapIntensity = physicalMaterial.aoMapIntensity ?? 0;
      if (mat.normalScale && physicalMaterial.normalScale) {
        mat.normalScale.copy(physicalMaterial.normalScale);
      }
      mat.transparent = physicalMaterial.transmission > 0;
      mat.needsUpdate = true;
    }
  });
}

// Function to apply preset settings to controls and global material
function applyMaterialPreset(presetKey) {
  const preset = materialPresets[presetKey];
  if (!preset) return;

  // ── Basic PBR sliders ─────────────────────────────────────────────────
  materialRoughness.value = preset.roughness;
  valRoughness.textContent = preset.roughness.toFixed(2);

  materialMetalness.value = preset.metalness;
  valMetalness.textContent = preset.metalness.toFixed(2);

  materialTransmission.value = preset.transmission;
  valTransmission.textContent = preset.transmission.toFixed(2);

  materialThickness.value = preset.thickness;
  valThickness.textContent = preset.thickness.toFixed(1);

  materialIor.value = preset.ior;
  valIor.textContent = preset.ior.toFixed(2);

  physicalMaterial.roughness    = preset.roughness;
  physicalMaterial.metalness    = preset.metalness;
  physicalMaterial.transmission = preset.transmission;
  physicalMaterial.thickness    = preset.thickness;
  physicalMaterial.ior          = preset.ior;
  // Remember the preset's intended color, then multiply by user tint.
  baseMaterialColor.set(preset.color);
  physicalMaterial.color.copy(baseMaterialColor).multiply(tintColor);
  physicalMaterial.transparent  = preset.transmission > 0;

  // ── Textured presets (wood + Mat Works PBR sets) ──────────────────────
  // Three branches:
  //   1. useWoodTextures → eagerly-loaded albedo / normal / AO from
  //      /textures/wood/.
  //   2. mat: '<Name>'  → lazy-loaded basecolor / metallic / normal /
  //      roughness from /textures/mats/<Name>/, downloaded on first use
  //      and cached for the session.
  //   3. neither       → flat-colour preset, all maps cleared.
  const useWood = !!preset.useWoodTextures;
  const useMat  = !!preset.mat;

  if (useWood) {
    physicalMaterial.map          = woodTextures.albedo || null;
    physicalMaterial.normalMap    = woodTextures.normal || null;
    physicalMaterial.aoMap        = woodTextures.ao     || null;
    physicalMaterial.metalnessMap = null;
    physicalMaterial.roughnessMap = null;
    physicalMaterial.aoMapIntensity = 1.0;
    if (physicalMaterial.normalScale) {
      const on = !!woodTextures.normal;
      physicalMaterial.normalScale.set(on ? 1 : 0, on ? 1 : 0);
    }
  } else if (useMat) {
    // Clear any prior maps immediately. While the new PBR set streams in,
    // use a safe matte-plastic fallback (metalness=0, roughness 0.8) so the
    // brick doesn't flash as a black mirror.
    physicalMaterial.map          = null;
    physicalMaterial.normalMap    = null;
    physicalMaterial.metalnessMap = null;
    physicalMaterial.roughnessMap = null;
    physicalMaterial.aoMap        = null;
    physicalMaterial.aoMapIntensity = 0.0;
    physicalMaterial.metalness    = preset.metalnessFallback ?? 0.0;
    physicalMaterial.roughness    = preset.roughnessFallback ?? 0.8;
    if (physicalMaterial.normalScale) physicalMaterial.normalScale.set(1, 1);
    physicalMaterial.needsUpdate = true;
    updateVoxelMaterials();

    // Lazy-load + apply, then bail out if user already switched to another preset.
    getMatTextures(preset.mat).then((tex) => {
      if (materialPreset.value !== presetKey) return;
      physicalMaterial.map          = tex.basecolor || null;
      physicalMaterial.normalMap    = tex.normal    || null;
      physicalMaterial.metalnessMap = tex.metallic  || null;
      physicalMaterial.roughnessMap = tex.roughness || null;
      physicalMaterial.aoMap        = null;
      physicalMaterial.aoMapIntensity = 0.0;
      // ── Scalar fallbacks when a map is missing ──────────────────────────
      // metalnessMap absent → use preset's metalnessFallback (default 0,
      //   so plastics / rubber / fabric don't render as 100 % metal mirror).
      // roughnessMap absent → fall back to 0.8 (matte) so missing roughness
      //   doesn't leave the surface mirror-smooth at metalness=1.
      // When the map IS present, scalar=1 lets the per-pixel map values
      // drive the look unchanged.
      physicalMaterial.metalness = tex.metallic  ? 1.0 : (preset.metalnessFallback ?? 0.0);
      physicalMaterial.roughness = tex.roughness ? 1.0 : (preset.roughnessFallback ?? 0.8);
      if (physicalMaterial.normalScale) {
        const on = !!tex.normal;
        physicalMaterial.normalScale.set(on ? 1 : 0, on ? 1 : 0);
      }
      physicalMaterial.needsUpdate = true;
      updateVoxelMaterials();
    });
    return; // updateVoxelMaterials() will fire again after the async swap
  } else {
    physicalMaterial.map          = null;
    physicalMaterial.normalMap    = null;
    physicalMaterial.metalnessMap = null;
    physicalMaterial.roughnessMap = null;
    physicalMaterial.aoMap        = null;
    physicalMaterial.aoMapIntensity = 0.0;
    if (physicalMaterial.normalScale) physicalMaterial.normalScale.set(0, 0);
  }

  // ── Extended PBR (Clearcoat / Sheen / Iridescence) ─────────────────────
  const cc  = preset.clearcoat   ?? 0;
  const sh  = preset.sheen       ?? 0;
  const ir  = preset.iridescence ?? 0;
  physicalMaterial.clearcoat   = cc;
  physicalMaterial.sheen       = sh;
  physicalMaterial.iridescence = ir;
  // Sheen on cloth tints toward the base color so the rim catches it naturally
  if (sh > 0 && physicalMaterial.sheenColor) {
    physicalMaterial.sheenColor.copy(physicalMaterial.color);
  } else if (physicalMaterial.sheenColor) {
    physicalMaterial.sheenColor.set(0xffffff);
  }

  if (matClearcoat) {
    matClearcoat.value = cc;
    valClearcoat.textContent = cc.toFixed(2);
  }
  if (matSheen) {
    matSheen.value = sh;
    valSheen.textContent = sh.toFixed(2);
  }
  if (matIridescence) {
    matIridescence.value = ir;
    valIridescence.textContent = ir.toFixed(2);
  }

  physicalMaterial.needsUpdate = true;
  updateVoxelMaterials();
}

// Key directional light and hemi sky light
let dirLight, hemiLight, fillLight, rimLight, ambientLight, rectAreaLight;

// TransformControls (translate / rotate / scale gizmo for the model)
let transformControls = null;
let transformHelper   = null; // r170+ — gizmo visual is a separate Object3D

// Post-processing chain (created in setupPostFx())
let composer = null;
let bloomPass = null;
let outlinePass = null;
let gtaoPass = null;
let postFxEnabled = true;        // master switch — false uses renderer.render directly

// WebGPU experimental renderer (loaded dynamically on toggle / reload)
let useWebGPU = false;

// ─── Performance Mode ──────────────────────────────────────────────────
// Bundles four GPU savings, toggled via the "Performance Mode" checkbox:
//   1. Frame rate cap @ 60 FPS (animate() bails early on excess rAF ticks)
//   2. Pixel ratio × 0.75 (cuts shaded pixel count ~44%)
//   3. transmissionResolutionScale = 0.5 (glass pass at half res ~4× cheaper)
//   4. Auto-pause video element when document.hidden — rAF already pauses
//      on hidden tabs, but a playing <video> keeps decoding & uploading.
let perfMode = false;
const PERF_FRAME_MS = 1000 / 60; // 60 FPS cap when perf mode is on
let lastFrameTime = 0;
const perfModeEl = document.getElementById('perf-mode');

function applyPerfMode() {
  if (!renderer) return;
  const dpr = window.devicePixelRatio || 1;
  if (perfMode) {
    renderer.setPixelRatio(Math.min(dpr * 0.75, 1.5));
    if (composer) composer.setPixelRatio(Math.min(dpr * 0.75, 1.5));
    if ('transmissionResolutionScale' in renderer) {
      renderer.transmissionResolutionScale = 0.5;
    }
  } else {
    renderer.setPixelRatio(Math.min(dpr, 2));
    if (composer) composer.setPixelRatio(Math.min(dpr, 2));
    if ('transmissionResolutionScale' in renderer) {
      renderer.transmissionResolutionScale = 1.0;
    }
  }
}

// Pause/resume video when tab visibility changes — saves the video decode
// pipeline + the texture upload that runs every frame.
document.addEventListener('visibilitychange', () => {
  if (!perfMode) return;
  if (typeof loadedMediaElement !== 'undefined' && loadedMediaElement &&
      loadedMediaType === 'video') {
    if (document.hidden) loadedMediaElement.pause();
    // Don't auto-play on return — that would break user intent if they paused.
  }
});

// --- Step 1: Initialize Three.js Environment ---
async function init() {
  // 1. Scene Setup
  scene = new THREE.Scene();
  updateSceneBackground();

  // 2. Camera Setup (FOV 10 degrees from metadata)
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(10, aspect, 0.1, 1000);
  resetCameraPosition();
  infoFov.textContent = `${camera.fov}°`;

  // 3. Renderer Setup
  // Try WebGPU if user opted in; otherwise WebGL.
  const wantWebGPU = (localStorage.getItem('everything-lego-backend') === 'webgpu');
  if (wantWebGPU && 'gpu' in navigator) {
    try {
      const wgpu = await import('three/webgpu');
      window.__threeWGPU = wgpu; // expose for PMREMGenerator swap below
      renderer = new wgpu.WebGPURenderer({ canvas: webglCanvas, antialias: true });
      await renderer.init();
      useWebGPU = true;
      postFxEnabled = false; // Composer pipeline below is WebGL-only
      console.warn(
        '[Everything-Lego] WebGPU renderer is ACTIVE.\n' +
        'Note: Three.js r' + THREE.REVISION + ' WebGPU + MeshPhysicalMaterial + ' +
        'InstancedMesh.instanceColor is only partially compatible — voxel bricks ' +
        'may render black. This is a Three.js limitation, not an app bug. ' +
        'Switch the Renderer dropdown back to "WebGL" and reload to recover.'
      );
      showWebGPUWarningBanner();
    } catch (err) {
      console.warn('[Everything-Lego] WebGPU init failed, falling back to WebGL:', err);
      renderer = new THREE.WebGLRenderer({
        canvas: webglCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
      });
    }
  } else {
    renderer = new THREE.WebGLRenderer({
      canvas: webglCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true // Required for capturing screenshots
    });
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Pixel ratio is gated through applyPerfMode() — perf mode multiplies the
  // device pixel ratio by 0.75 to cut shaded pixel work ~44%.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 4. Controls Setup (OrbitControls with Damping)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 1.0 / parseFloat(animMass.value); // Maps to easing inertia
  controls.autoRotate = false; // Disabled on startup for better UX
  controls.autoRotateSpeed = parseFloat(animSpeed.value) * 50.0;

  // TransformControls (gizmo for translate / rotate / scale of currentModel)
  // — disabled by default; user picks a mode via the Model Transform panel.
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setSize(0.7);
  transformControls.addEventListener('dragging-changed', (e) => {
    // Suspend orbit drag while the gizmo is grabbed so the camera doesn't
    // fight the manipulation.
    controls.enabled = !e.value;
    if (!e.value) {
      // Re-aim OrbitControls at the new model centre so subsequent orbit
      // rotates around the model, not around the original world origin.
      focusOrbitTarget();
      // Re-voxelise if Block Mode is on so the brick grid matches new pose.
      if (blockMode.checked) updateBlockEffect();
    }
  });
  // r170+: the gizmo geometry lives in a separate helper object; we must
  // toggle the HELPER's visible, not the controls'. Older versions where
  // TransformControls IS an Object3D fall back to using it directly.
  transformHelper = (typeof transformControls.getHelper === 'function')
    ? transformControls.getHelper()
    : transformControls;
  scene.add(transformHelper);
  transformHelper.visible = false; // hidden until user selects a mode
  // Tag the gizmo so OutlinePass never strokes the arrows / rings.
  transformHelper.userData.__outlineSkip = true;
  transformHelper.traverse((c) => { c.userData.__outlineSkip = true; });

  // Uncheck the auto-rotate checkbox to match the actual state
  animAutoRotate.checked = false;
  controls.maxDistance = 150;
  controls.minDistance = 2;

  // 5. Lighting Setup
  ambientLight = new THREE.AmbientLight(0xffffff, 0.45); // Add a supportive global ambient light to prevent dead blacks
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x33333f, parseFloat(hemiIntensity.value)); // Ground bounce light set to soft grey-blue instead of pitch black
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, parseFloat(lightIntensity.value));
  dirLight.position.set(
    parseFloat(lightX.value),
    parseFloat(lightY.value),
    parseFloat(lightZ.value)
  );
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  const d = 10;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  // Studio 3-point: cool fill light from opposite side lifts shadow side without
  // washing out shape. Rim light from behind-above traces the silhouette / stud edges.
  fillLight = new THREE.DirectionalLight(0xdce8ff, 1.8); // Increased from 1.0 to 1.8 for stronger fill
  fillLight.position.set(-8, 6, 6);
  scene.add(fillLight);

  rimLight = new THREE.DirectionalLight(0xffffff, 2.5); // Increased from 2.0 to 2.5 for better outline definition
  rimLight.position.set(2, 8, -10);
  scene.add(rimLight);

  // RectAreaLight — physically-accurate softbox. Best for metals + glossy
  // surfaces because it lights with an actual rectangle of emissive area
  // (not a point), so reflections show a real strip-shape highlight that
  // sells the surface. Disabled by default; toggled via UI.
  RectAreaLightUniformsLib.init();
  rectAreaLight = new THREE.RectAreaLight(0xffffff, 0.0, 12, 8);
  rectAreaLight.position.set(0, 8, 6);
  rectAreaLight.lookAt(0, 0, 0);
  scene.add(rectAreaLight);

  // 6. PMREM Procedural Environment Reflection Map.
  // Use the WebGPU-aware PMREMGenerator when running the WebGPU backend
  // (the WebGL one would silently produce a broken cube texture there).
  const PMREMCtor = (useWebGPU && window.__threeWGPU?.PMREMGenerator) || THREE.PMREMGenerator;
  pmremGenerator = new PMREMCtor(renderer);
  if (pmremGenerator.compileEquirectangularShader) {
    pmremGenerator.compileEquirectangularShader();
  }
  generateProceduralEnvironment();

  // 6b. Post-processing pipeline (EffectComposer).
  // Default: pass-through (RenderPass + OutputPass). Bloom / Outline /
  // GTAO passes exist but start disabled; UI toggles flip their `enabled`.
  setupPostFx();

  // 7. Load Default Model
  loadDefaultModel();

  // 8. Event Listeners
  window.addEventListener('resize', onWindowResize);
  setupUIEventListeners();
  setupAccordionControls();

  // 9. Prevent scroll wheel events on sidebars from being captured by OrbitControls
  document.querySelectorAll('.sidebar-scroll').forEach((el) => {
    el.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: false });
  });
}

// --- Step 2: Generate Procedural Environment reflection map ---
// Creates a canvas-based studio equirectangular map on-the-fly for smooth glass reflections offline.
/* ─── Post-processing setup ─────────────────────────────────────────────
   EffectComposer pipeline:
     1. RenderPass        — draw the scene normally
     2. GTAOPass          — ground-truth ambient occlusion (crevice shadows)
     3. OutlinePass       — cel-style stroke around selected/all objects
     4. UnrealBloomPass   — soft glow on bright (metallic / glass) pixels
     5. OutputPass        — final tone-mapping + sRGB output
   Each effect pass starts disabled; UI toggles flip pass.enabled.
   ------------------------------------------------------------------- */
/* Yellow banner shown when WebGPU is active, with a one-click "Switch back
   to WebGL" button. Mounted to <body> so it's visible even if the canvas
   itself ends up all-black due to the known compatibility issues. */
function showWebGPUWarningBanner() {
  if (document.getElementById('webgpu-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'webgpu-banner';
  bar.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#ff9f0a', 'color:#201d1d',
    'padding:8px 16px', 'font-family:JetBrains Mono,monospace',
    'font-size:12px', 'font-weight:600', 'letter-spacing:0.04em',
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'gap:12px', 'box-shadow:0 1px 0 rgba(0,0,0,0.2)',
  ].join(';');
  bar.innerHTML = `
    <span>[!] WebGPU experimental mode — PBR + InstancedMesh may render black.
      This is a Three.js compatibility limitation, not a bug in the app.</span>
    <button id="webgpu-revert"
      style="background:#201d1d;color:#fdfcfc;border:none;padding:5px 12px;
             border-radius:4px;cursor:pointer;font-family:inherit;
             font-size:11px;font-weight:600;letter-spacing:0.05em">
      ↻ Switch back to WebGL
    </button>`;
  document.body.appendChild(bar);
  document.getElementById('webgpu-revert').addEventListener('click', () => {
    localStorage.setItem('everything-lego-backend', 'webgl');
    location.reload();
  });
}

function setupPostFx() {
  // EffectComposer (from three/examples/jsm) is built on the WebGLRenderer
  // pipeline. Skip silently when running the WebGPU backend.
  if (useWebGPU) return;
  const w = window.innerWidth;
  const h = window.innerHeight;

  composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(w, h);
  // Apply perf-mode pixel ratio override now that composer exists.
  applyPerfMode();

  // 1. Base scene render
  composer.addPass(new RenderPass(scene, camera));

  // 2. GTAO — much higher quality than legacy SSAOPass; subtle crevice
  // shadows make the bricks read as a real assembled pile of pieces.
  gtaoPass = new GTAOPass(scene, camera, w, h);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.enabled = false;
  composer.addPass(gtaoPass);

  // 3. Outline — Lego illustration / cel-shaded mode. We outline all
  // currently-active voxel meshes; refreshed whenever they're rebuilt.
  outlinePass = new OutlinePass(new THREE.Vector2(w, h), scene, camera);
  outlinePass.edgeStrength    = 3.0;
  outlinePass.edgeGlow        = 0.0;
  outlinePass.edgeThickness   = 1.0;
  outlinePass.pulsePeriod     = 0;
  outlinePass.visibleEdgeColor.set('#000000');
  outlinePass.hiddenEdgeColor.set('#000000');
  outlinePass.enabled = false;
  composer.addPass(outlinePass);

  // 4. Bloom — gives metals + lights that "render" punch.
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.4, 0.85);
  bloomPass.enabled = false;
  composer.addPass(bloomPass);

  // 5. Final tone-map + colour-space pass.
  composer.addPass(new OutputPass());
}

/* Sync outline pass's selectedObjects to everything currently in the scene
   that should receive a stroke — voxel meshes AND the uploaded/text model.
   OutlinePass traverses selected Object3Ds internally, so passing a Group
   (currentModel) auto-includes all child meshes. The transform-gizmo
   helper is tagged with __outlineSkip and excluded to avoid stroking the
   gizmo arrows. */
function refreshOutlineSelection() {
  if (!outlinePass) return;
  const sel = [];
  if (currentModel) sel.push(currentModel);
  if (voxelInstancedMesh)      sel.push(voxelInstancedMesh);
  if (voxelPlateInstancedMesh) sel.push(voxelPlateInstancedMesh);
  if (voxelStudInstancedMesh)  sel.push(voxelStudInstancedMesh);
  outlinePass.selectedObjects = sel;
}

/* Build the brick / plate body geometry based on the Voxel Primitive
   select. All variants are sized to fit the (w × h × d) cell so the
   greedy-packing layout doesn't need any changes — only the shape does. */
function makeBrickGeometry(w, h, d) {
  const kind = voxelGeomSelect ? voxelGeomSelect.value : 'box';
  const r    = voxelRoundRadius ? parseFloat(voxelRoundRadius.value) : 0.10;
  switch (kind) {
    case 'rounded-box': {
      const min = Math.min(w, h, d);
      // r is a fraction of the smallest side; clamp so we never exceed
      // half (anything larger is degenerate)
      const radius = Math.min(min * 0.49, r * min);
      return new RoundedBoxGeometry(w, h, d, 4, radius);
    }
    case 'sphere': {
      // Use max dimension as diameter so the sphere fills the cell visually
      const s = Math.max(w, h, d);
      const g = new THREE.SphereGeometry(s / 2, 24, 16);
      g.scale(w / s, h / s, d / s); // ellipsoid for non-cube footprints
      return g;
    }
    case 'cylinder': {
      // Axis is Y so a cylinder reads as a "post" — diameter from xz
      const radius = Math.min(w, d) / 2;
      return new THREE.CylinderGeometry(radius, radius, h, 24);
    }
    case 'capsule': {
      const radius = Math.min(w, d) / 2;
      const length = Math.max(0, h - 2 * radius);
      return new THREE.CapsuleGeometry(radius, length, 6, 16);
    }
    case 'octahedron': {
      const g = new THREE.OctahedronGeometry(Math.max(w, h, d) / 2, 0);
      const s = Math.max(w, h, d);
      g.scale(w / s, h / s, d / s);
      return g;
    }
    case 'box':
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

function generateProceduralEnvironment() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fill dark background grey
  ctx.fillStyle = '#0f0f13';
  ctx.fillRect(0, 0, width, height);

  // Add broad soft reflection panels (gradients)
  // Left softbox
  let grad = ctx.createLinearGradient(100, 0, 300, 0);
  grad.addColorStop(0, 'rgba(15, 15, 19, 0)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
  grad.addColorStop(1, 'rgba(15, 15, 19, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(100, 0, 200, height);

  // Right softbox
  grad = ctx.createLinearGradient(700, 0, 900, 0);
  grad.addColorStop(0, 'rgba(15, 15, 19, 0)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(1, 'rgba(15, 15, 19, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(700, 0, 200, height);

  // Top overhead light bar
  grad = ctx.createRadialGradient(512, 100, 10, 512, 100, 300);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
  grad.addColorStop(0.5, 'rgba(230, 240, 255, 0.2)');
  grad.addColorStop(1, 'rgba(15, 15, 19, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(512, 100, 300, 0, Math.PI * 2);
  ctx.fill();

  // Bottom bounce light panel
  grad = ctx.createLinearGradient(0, 400, 0, 512);
  grad.addColorStop(0, 'rgba(15, 15, 19, 0)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 400, width, 112);

  // Create texture from canvas
  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.mapping = THREE.EquirectangularReflectionMapping;
  canvasTexture.colorSpace = THREE.SRGBColorSpace;

  // Process through PMREM Generator
  proceduralEnvTexture = pmremGenerator.fromEquirectangular(canvasTexture).texture;
  scene.environment = proceduralEnvTexture;
  scene.environmentIntensity = parseFloat(envIntensityInput?.value ?? 1.0);

  canvasTexture.dispose();
}

/* ─── Environment-map manager ───────────────────────────────────────────
   The PBR look of every metal / glass / pearl preset depends on whatever
   scene.environment is set to. This pair of helpers lets the user pick
   from procedural / built-in studio / their own HDR / off.
   ------------------------------------------------------------------- */
let userEnvTexture = null;        // PMREM-processed user upload (HDR/img)
let studioEnvTexture = null;      // PMREM RoomEnvironment, lazy-built

function applyEnvironment(mode) {
  if (!scene || !pmremGenerator) return;
  switch (mode) {
    case 'studio':
      if (!studioEnvTexture) {
        studioEnvTexture = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04).texture;
      }
      scene.environment = studioEnvTexture;
      break;
    case 'upload':
      if (userEnvTexture) scene.environment = userEnvTexture;
      // If no file picked yet, fall back to procedural so the scene
      // doesn't suddenly go pitch black.
      else if (proceduralEnvTexture) scene.environment = proceduralEnvTexture;
      break;
    case 'none':
      scene.environment = null;
      break;
    case 'procedural':
    default:
      if (proceduralEnvTexture) scene.environment = proceduralEnvTexture;
      break;
  }
  // Re-apply intensity since it's a scene-level property
  scene.environmentIntensity = parseFloat(envIntensityInput?.value ?? 1.0);
  updateVoxelMaterials();
}

function handleEnvUpload(file) {
  if (!file || !pmremGenerator) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const url = URL.createObjectURL(file);
  envFileName.textContent = `loading ${file.name}…`;
  envFileRow.style.display = 'block';

  const onLoaded = (sourceTex) => {
    // Dispose previous user env so we don't leak GPU memory
    if (userEnvTexture) { userEnvTexture.dispose(); userEnvTexture = null; }
    const env = pmremGenerator.fromEquirectangular(sourceTex).texture;
    userEnvTexture = env;
    sourceTex.dispose();
    URL.revokeObjectURL(url);
    envFileName.textContent = file.name;
    // Auto-switch to upload mode so the user sees the result immediately
    envMode.value = 'upload';
    applyEnvironment('upload');
  };
  const onErr = (err) => {
    console.error('Env upload failed', err);
    envFileName.textContent = `failed: ${file.name}`;
    URL.revokeObjectURL(url);
  };

  if (ext === 'hdr') {
    new RGBELoader().load(url, onLoaded, undefined, onErr);
  } else {
    // jpg / png / webp equirectangular
    new THREE.TextureLoader().load(
      url,
      (tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; onLoaded(tex); },
      undefined,
      onErr,
    );
  }
}

// --- Step 3: Load Default Model ---
function loadDefaultModel() {
  showLoader(true);
  const loader = new FBXLoader();
  
  loader.load(
    '/models/model.fbx',
    (fbx) => {
      // Setup current model object
      setupModelInScene(fbx);
      
      // Configure target rotation from metadata:
      // x: -1.63367528844671, y: -1.132304520315852, z: -1.3343262743635598
      currentModel.rotation.set(-1.6337, -1.1323, -1.3343);
      
      // Apply initial custom scaling (metadata scale factor is 0.069357, let's auto-scale appropriately)
      const targetScale = 0.069357 * parseFloat(modelScale.value);
      currentModel.scale.set(targetScale, targetScale, targetScale);

      // Load default sample video as initial startup view
      loadDefaultSample();
    },
    (xhr) => {
      if (xhr.total > 0) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        loaderProgress.textContent = `${percent}%`;
      } else {
        loaderProgress.textContent = 'Streaming...';
      }
    },
    (error) => {
      console.error('Error loading default FBX model:', error);
      loaderProgress.textContent = 'Loading failed. Use custom upload!';
      // Show default placeholder shape (TorusKnot) if the fbx failed to load
      createPlaceholderShape();
      loadDefaultSample();
    }
  );
}

// Swap the currentModel's meshes between their file-provided materials
// and the global physicalMaterial, based on the "Use file's own materials"
// checkbox. Called both right after load (via setupModelInScene) and on
// every toggle of the checkbox so the swap is reversible.
//
// Edge cases:
//   • STL files arrive with no material at all — the stash holds `null`,
//     so we fall through to physicalMaterial regardless of the toggle.
//   • __textRoot meshes were built with physicalMaterial as their original,
//     so toggling is a no-op for them (correct behaviour).
function applyModelMaterials() {
  if (!currentModel) return;
  const useOriginal = modelKeepMaterials ? modelKeepMaterials.checked : true;
  currentModel.traverse((child) => {
    if (!child.isMesh) return;
    const orig = child.userData.__originalMaterial;
    if (useOriginal && orig) {
      child.material = orig;
    } else {
      child.material = physicalMaterial;
    }
  });
}

// Setup a 3D model in scene
function setupModelInScene(object) {
  if (currentModel) {
    scene.remove(currentModel);
  }

  currentModel = object;
  scene.add(currentModel);

  // Clear any existing instanced mesh reference since we loaded a new model
  clearInstancedMesh(voxelInstancedMesh);
  voxelInstancedMesh = null;
  brickCapacity = 0;
  clearInstancedMesh(voxelPlateInstancedMesh);
  voxelPlateInstancedMesh = null;
  plateCapacity = 0;
  clearInstancedMesh(voxelStudInstancedMesh);
  voxelStudInstancedMesh = null;
  studCapacity = 0;

  // Initialize stats
  modelStats = { meshes: 0, vertices: 0, triangles: 0 };

  // First pass — count stats AND stash the loader-provided material so the
  // "Use file's own materials" toggle can swap back to it later. Without
  // this stash, the first call to applyModelMaterials() would lose the
  // original because we'd already overwritten it.
  currentModel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      // Preserve whatever the loader produced (GLTFLoader → MeshStandard,
      // FBXLoader → MeshPhong with textures, 3MFLoader → vertex-coloured
      // MeshStandard, STLLoader → no material → null).
      if (!child.userData.__originalMaterial) {
        child.userData.__originalMaterial = child.material || null;
      }

      modelStats.meshes++;
      if (child.geometry) {
        const geom = child.geometry;
        const posAttr = geom.attributes.position;
        if (posAttr) {
          modelStats.vertices += posAttr.count;
        }
        if (geom.index) {
          modelStats.triangles += geom.index.count / 3;
        } else if (posAttr) {
          modelStats.triangles += posAttr.count / 3;
        }
      }
    }
  });
  // Second pass — apply materials per current toggle state.
  applyModelMaterials();

  // Center model bounding box
  const box = new THREE.Box3().setFromObject(currentModel);
  const center = new THREE.Vector3();
  box.getCenter(center);
  
  // Reposition model pivot to its geometric center
  currentModel.position.sub(center);

  // Update Block Effect if active, otherwise display raw stats and show original meshes
  if (blockMode.checked) {
    updateBlockEffect();
  } else {
    currentModel.traverse((child) => {
      if (child.isMesh) {
        child.visible = true;
      }
    });
    // Update Stats in UI
    infoMeshes.textContent = modelStats.meshes;
    infoVertices.textContent = formatNumber(modelStats.vertices);
    infoTriangles.textContent = formatNumber(modelStats.triangles);
  }

  // Re-attach the transform gizmo to the new model (if a mode is active)
  if (transformControls) {
    transformControls.attach(currentModel);
    if (transformHelper) {
      transformHelper.visible = transformGizmoMode !== 'none';
    }
  }
  // Re-aim OrbitControls at the new model so orbiting feels right
  // even if a previous model left the target somewhere else.
  focusOrbitTarget();
}

// Tracks which manipulation mode is active (controls gizmo visibility)
let transformGizmoMode = 'none';

/* Set the transform gizmo mode. 'none' hides it; the other three switch
   the gizmo handles to translate / rotate / scale.
   Note for r170+: visibility lives on the helper Object3D, NOT on the
   TransformControls itself (which is no longer an Object3D). */
function setTransformMode(mode) {
  transformGizmoMode = mode;
  if (!transformControls) return;

  if (mode === 'none') {
    if (transformHelper) transformHelper.visible = false;
    transformControls.enabled = false;
    if (transformControls.detach) transformControls.detach();
  } else {
    if (currentModel && transformControls.object !== currentModel) {
      transformControls.attach(currentModel);
    }
    transformControls.setMode(mode);
    transformControls.enabled = true;
    if (transformHelper) transformHelper.visible = true;
  }
  // Reflect the active button in the UI
  ['translate','rotate','scale','none'].forEach((m) => {
    const btn = document.getElementById(`tf-${m}`);
    if (btn) btn.classList.toggle('active', m === mode);
  });
}

/* Rotate currentModel so that one of its local axes becomes the "down"
   direction, then drop it onto the floor (minY = 0). Useful for STL /
   3MF imports that came out of a slicer in arbitrary orientation. */
function setModelBottomAxis(axis) {
  if (!currentModel) return;
  switch (axis) {
    case '+x': currentModel.rotation.set(0, 0, -Math.PI / 2); break;
    case '-x': currentModel.rotation.set(0, 0,  Math.PI / 2); break;
    case '+y': currentModel.rotation.set( Math.PI, 0, 0);     break;
    case '-y': currentModel.rotation.set(0, 0, 0);            break; // default
    case '+z': currentModel.rotation.set( Math.PI / 2, 0, 0); break;
    case '-z': currentModel.rotation.set(-Math.PI / 2, 0, 0); break;
  }
  snapModelToFloor();
  if (blockMode.checked) updateBlockEffect();
}

/* Translate currentModel so its lowest point sits at y = 0. Preserves
   rotation + XZ position. */
function snapModelToFloor() {
  if (!currentModel) return;
  currentModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(currentModel);
  if (!isFinite(box.min.y)) return;
  currentModel.position.y -= box.min.y;
  focusOrbitTarget();
}

/* Re-aim OrbitControls at the live model's bounding-box centre. Cheap
   helper called after every action that translates / rotates / scales
   currentModel — so the orbit pivot keeps matching the geometry instead
   of being stuck at world (0,0,0). */
function focusOrbitTarget() {
  if (!currentModel || !controls) return;
  currentModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(currentModel);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  controls.target.copy(center);
  controls.update();
}

/* Full "frame model" — recompute orbit target AND pull/push the camera
   to a distance that fits the model in view. Triggered by the Focus on
   Model button. */
function frameCameraOnModel() {
  if (!currentModel || !controls || !camera) return;
  currentModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(currentModel);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  const size   = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  controls.target.copy(center);

  // Distance so the largest model dimension comfortably fits the FOV
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fovRad = camera.fov * Math.PI / 180;
  const dist   = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.6;
  // Slight elevated 3/4 view — common "hero" angle
  const offset = new THREE.Vector3(0.55, 0.45, 1).normalize().multiplyScalar(dist);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);
  controls.update();
}

/* Reset all transform state on currentModel back to identity. */
function resetModelTransform() {
  if (!currentModel) return;
  currentModel.position.set(0, 0, 0);
  currentModel.rotation.set(0, 0, 0);
  currentModel.scale.set(1, 1, 1);
  autoScaleModel();
  // Re-center after reset
  const box = new THREE.Box3().setFromObject(currentModel);
  const center = new THREE.Vector3();
  box.getCenter(center);
  currentModel.position.sub(center);
  focusOrbitTarget();
  if (blockMode.checked) updateBlockEffect();
}

// Fallback placeholder shape
function createPlaceholderShape() {
  const geom = new THREE.TorusKnotGeometry(2, 0.6, 120, 16);
  const mesh = new THREE.Mesh(geom, physicalMaterial);
  const pivot = new THREE.Group();
  pivot.add(mesh);
  setupModelInScene(pivot);
  displayProjectName.textContent = 'Project / Torus Knot Fallback';
}

// Helper to format stats numbers
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num;
}

// Helper to safely clear and dispose an InstancedMesh
function clearInstancedMesh(mesh) {
  if (mesh) {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }
}

// --- LEGO Brick Geometry Helpers ---
// No longer needs a merged geometry since box base and studs are rendered as separate InstancedMeshes
// to prevent vertical stretching of studs in heightmap mode.

// ─── LEGO Official Color Palette — 130 colors ──────────────────────────
// Source: BrickLink + LEGO Official color IDs, grouped by category:
//   • Solid (56)            — Core production palette, what most bricks ship in
//   • Transparent (24)      — Trans-clear / Trans-coloured for windows, lights
//   • Pearl / Metallic (22) — Pearl & metallic-particle injection mix
//   • Chrome / Milky (14)   — Mirror-chrome plating, milky / satin opal
//   • Speckle / Marbled (14)— Two-tone unmixed, glitter, glow-in-dark
//
// Each entry has { name, hex, cat } — `cat` is one of 'solid' | 'trans' |
// 'pearl' | 'chrome' | 'speckle'. The snap algorithm uses hex only; name
// is retained for future tooltip / legend UI.
const LEGO_COLOR_DEFS = [
  // ── Solid Colors (56) ──────────────────────────────────────────────
  { name: 'Red',                            hex: '#B40000', cat: 'solid' },
  { name: 'Blue',                           hex: '#1E5AA8', cat: 'solid' },
  { name: 'Yellow',                         hex: '#FAC800', cat: 'solid' },
  { name: 'Dark Green',                     hex: '#184632', cat: 'solid' },
  { name: 'Bright Light Yellow',            hex: '#FCD157', cat: 'solid' },
  { name: 'Bright Light Orange',            hex: '#F8BB3D', cat: 'solid' },
  { name: 'Flame Yellowish Orange',         hex: '#F49B00', cat: 'solid' },
  { name: 'Tan (Brick Yellow)',             hex: '#B0A06F', cat: 'solid' },
  { name: 'White',                          hex: '#F4F4F4', cat: 'solid' },
  { name: 'Black',                          hex: '#1B2A34', cat: 'solid' },
  { name: 'Earth Green (Dark Green)',       hex: '#003220', cat: 'solid' },
  { name: 'Earth Blue (Dark Blue)',         hex: '#19325A', cat: 'solid' },
  { name: 'Dark Tan (Sand Yellow)',         hex: '#947E5F', cat: 'solid' },
  { name: 'Medium Dark Flesh',              hex: '#A7754D', cat: 'solid' },
  { name: 'Light Nougat',                   hex: '#F6D3B6', cat: 'solid' },
  { name: 'Sand Green',                     hex: '#708E7A', cat: 'solid' },
  { name: 'Sand Blue',                      hex: '#5E748C', cat: 'solid' },
  { name: 'Light Bluish Gray',              hex: '#A0A19F', cat: 'solid' },
  { name: 'Dark Bluish Gray',               hex: '#646464', cat: 'solid' },
  { name: 'Medium Blue',                    hex: '#488CC6', cat: 'solid' },
  { name: 'Bright Purple (Medium Lavender)',hex: '#8F4D93', cat: 'solid' },
  { name: 'Lavender',                       hex: '#B18CBF', cat: 'solid' },
  { name: 'Lilac',                          hex: '#564E7A', cat: 'solid' },
  { name: 'Medium Lavender',                hex: '#AC78B4', cat: 'solid' },
  { name: 'Light Aqua',                     hex: '#ADC3C9', cat: 'solid' },
  { name: 'Dark Azure',                     hex: '#007CA7', cat: 'solid' },
  { name: 'Medium Azure',                   hex: '#36AEB4', cat: 'solid' },
  { name: 'Bright Reddish Violet',          hex: '#92397F', cat: 'solid' },
  { name: 'Light Purple (Bright Pink)',     hex: '#E4ADC8', cat: 'solid' },
  { name: 'Vibrant Coral',                  hex: '#FF6D6A', cat: 'solid' },
  { name: 'Reddish Orange',                 hex: '#FF4F00', cat: 'solid' }, // 2024
  { name: 'Medium Dark Pink',               hex: '#F06D9C', cat: 'solid' },
  { name: 'Light Pink',                     hex: '#FAADB8', cat: 'solid' },
  { name: 'Dark Red',                       hex: '#6A0E1D', cat: 'solid' },
  { name: 'Dark Purple',                    hex: '#5F285F', cat: 'solid' },
  { name: 'Medium Nougat',                  hex: '#BB8053', cat: 'solid' },
  { name: 'Flesh (Nougat)',                 hex: '#D09168', cat: 'solid' },
  { name: 'Dark Flesh',                     hex: '#7C503A', cat: 'solid' },
  { name: 'Reddish Brown',                  hex: '#692E14', cat: 'solid' },
  { name: 'Umber Brown',                    hex: '#4D3226', cat: 'solid' }, // 2024
  { name: 'Sienna Brown',                   hex: '#8A4A37', cat: 'solid' }, // 2024
  { name: 'Dark Brown',                     hex: '#372115', cat: 'solid' },
  { name: 'Medium Green',                   hex: '#43A553', cat: 'solid' },
  { name: 'Dark Lime',                      hex: '#A5CA16', cat: 'solid' },
  { name: 'Bright Yellowish Green (Lime)',  hex: '#A4BD30', cat: 'solid' },
  { name: 'Olive Green',                    hex: '#77774E', cat: 'solid' },
  { name: 'Bright Orange',                  hex: '#D67923', cat: 'solid' },
  { name: 'Dark Orange',                    hex: '#A95519', cat: 'solid' },
  { name: 'Sand Red',                       hex: '#88605E', cat: 'solid' }, // 绝版
  { name: 'Sand Purple',                    hex: '#706672', cat: 'solid' }, // 绝版
  { name: 'Old Light Gray (pre-2004)',      hex: '#969696', cat: 'solid' },
  { name: 'Old Dark Gray (pre-2004)',       hex: '#5F5F5F', cat: 'solid' },
  { name: 'Old Brown (pre-2004)',           hex: '#582A12', cat: 'solid' },
  { name: 'Bright Green',                   hex: '#00AA44', cat: 'solid' },
  { name: 'Medium Lime',                    hex: '#C1D862', cat: 'solid' },
  { name: 'Mint (Pastel Mint)',             hex: '#A2CFC0', cat: 'solid' },

  // ── Transparent Colors (24) ────────────────────────────────────────
  { name: 'Trans-Light Blue',               hex: '#AEE9EF', cat: 'trans' },
  { name: 'Trans-Dark Blue',                hex: '#002A6F', cat: 'trans' },
  { name: 'Trans-Neon Green',               hex: '#C0F500', cat: 'trans' },
  { name: 'Trans-Light Green',              hex: '#77E7B0', cat: 'trans' },
  { name: 'Trans-Green',                    hex: '#008F39', cat: 'trans' },
  { name: 'Trans-Neon Yellow',              hex: '#DAB000', cat: 'trans' },
  { name: 'Trans-Light Orange',             hex: '#FFA100', cat: 'trans' },
  { name: 'Trans-Orange',                   hex: '#F06C00', cat: 'trans' },
  { name: 'Trans-Red',                      hex: '#C40026', cat: 'trans' },
  { name: 'Trans-Pink',                     hex: '#E485B8', cat: 'trans' },
  { name: 'Trans-Neon Orange',              hex: '#FF3F00', cat: 'trans' },
  { name: 'Trans-Purple',                   hex: '#A54BB7', cat: 'trans' },
  { name: 'Trans-Clear',                    hex: '#EEEEEE', cat: 'trans' },
  { name: 'Trans-Black (Smoke)',            hex: '#635F61', cat: 'trans' },
  { name: 'Trans-Dark Pink',                hex: '#DF1E7B', cat: 'trans' },
  { name: 'Trans-Light Purple (Opal)',      hex: '#E2CCEC', cat: 'trans' },
  { name: 'Trans-Bright Green',             hex: '#56E200', cat: 'trans' },
  { name: 'Trans-Yellow',                   hex: '#F5CD00', cat: 'trans' },
  { name: 'Trans-Medium Blue',              hex: '#68AEF5', cat: 'trans' },
  { name: 'Trans-Brown (Beer)',             hex: '#845226', cat: 'trans' },
  { name: 'Trans-Turquoise',                hex: '#00E1D9', cat: 'trans' },
  { name: 'Trans-Light Bright Green',       hex: '#A2EDB0', cat: 'trans' },
  { name: 'Trans-Aqua',                     hex: '#D0FAF4', cat: 'trans' },
  { name: 'Trans-Crimson',                  hex: '#990011', cat: 'trans' }, // 2025

  // ── Pearl / Metallic (22) ──────────────────────────────────────────
  { name: 'Silver (Cool Silver)',           hex: '#8F9E9D', cat: 'pearl' },
  { name: 'Pearl Gold',                     hex: '#AA7F2A', cat: 'pearl' },
  { name: 'Metalized Gold (Warm Gold)',     hex: '#B78E43', cat: 'pearl' },
  { name: 'Silver (Flat Silver)',           hex: '#899393', cat: 'pearl' },
  { name: 'Metallic Dark Grey (Titanium)',  hex: '#484E50', cat: 'pearl' },
  { name: 'Pearl Dark Gray',                hex: '#575857', cat: 'pearl' },
  { name: 'Pearl Light Gray',               hex: '#9CA3A8', cat: 'pearl' },
  { name: 'Pearl White',                    hex: '#F2F3ED', cat: 'pearl' },
  { name: 'Copper',                         hex: '#AE6F4E', cat: 'pearl' },
  { name: 'Flat Dark Gold',                 hex: '#B48443', cat: 'pearl' },
  { name: 'Flat Light Gold',                hex: '#D5B97B', cat: 'pearl' },
  { name: 'Phosphor. Green (夜光绿)',       hex: '#C0D1A9', cat: 'pearl' },
  { name: 'Pearl Blue',                     hex: '#5D758F', cat: 'pearl' },
  { name: 'Pearl Medium Blue',              hex: '#6E8CA4', cat: 'pearl' },
  { name: 'Pearl Green',                    hex: '#548A64', cat: 'pearl' },
  { name: 'Pearl Light Green',              hex: '#82B28B', cat: 'pearl' },
  { name: 'Metallic Sand Blue',             hex: '#6B7F96', cat: 'pearl' },
  { name: 'Metallic Sand Green',            hex: '#758D7C', cat: 'pearl' },
  { name: 'Pearl Very Light Gray',          hex: '#BBBFB6', cat: 'pearl' },
  { name: 'Pearl Black',                    hex: '#2C3135', cat: 'pearl' },
  { name: 'Rose Gold',                      hex: '#CF9E90', cat: 'pearl' },
  { name: 'Pearl Dark Red',                 hex: '#6E2025', cat: 'pearl' },

  // ── Chrome / Milky / Satin (14) ────────────────────────────────────
  { name: 'Chrome Gold',                    hex: '#BCA625', cat: 'chrome' },
  { name: 'Chrome Silver',                  hex: '#E6E6E6', cat: 'chrome' },
  { name: 'Chrome Antique Brass',           hex: '#645A41', cat: 'chrome' },
  { name: 'Chrome Black',                   hex: '#1A1A1A', cat: 'chrome' },
  { name: 'Chrome Blue',                    hex: '#1A5599', cat: 'chrome' },
  { name: 'Chrome Green',                   hex: '#1A7733', cat: 'chrome' },
  { name: 'Chrome Pink',                    hex: '#D462A0', cat: 'chrome' },
  { name: 'Chrome Red',                     hex: '#B81414', cat: 'chrome' },
  { name: 'Milky White',                    hex: '#EEEEEE', cat: 'chrome' },
  { name: 'Milky Violet',                   hex: '#C0A0D0', cat: 'chrome' },
  { name: 'Satin White',                    hex: '#EFF2F3', cat: 'chrome' },
  { name: 'Satin Trans-Clear',              hex: '#E2E6E7', cat: 'chrome' },
  { name: 'Satin Trans-Light Blue',         hex: '#9FD6E2', cat: 'chrome' },
  { name: 'Satin Trans-Dark Pink',          hex: '#D2649B', cat: 'chrome' },

  // ── Speckle / Marbled / Glitter / Glow (14) ────────────────────────
  { name: 'Speckle Black-Silver',           hex: '#2C3033', cat: 'speckle' },
  { name: 'Speckle Black-Gold',             hex: '#2B261D', cat: 'speckle' },
  { name: 'Speckle DB-Gray',                hex: '#5A5A5A', cat: 'speckle' },
  { name: 'Marbled Black / Silver',         hex: '#404346', cat: 'speckle' },
  { name: 'Marbled Blue / White',           hex: '#5080C0', cat: 'speckle' },
  { name: 'Marbled Red / Gold',             hex: '#A03020', cat: 'speckle' },
  { name: 'Marbled Green / Silver',         hex: '#307050', cat: 'speckle' },
  { name: 'Glow In Dark White',             hex: '#EBF2D6', cat: 'speckle' },
  { name: 'Glow In Dark Opaque',            hex: '#D9E8BE', cat: 'speckle' },
  { name: 'Dark Copper',                    hex: '#7B4832', cat: 'speckle' },
  { name: 'Glitter Trans-Clear',            hex: '#EEEEEE', cat: 'speckle' },
  { name: 'Glitter Trans-Purple',           hex: '#A54BB7', cat: 'speckle' },
  { name: 'Glitter Trans-Light Blue',       hex: '#AEE9EF', cat: 'speckle' },
  { name: 'Speckle Dark Red-Black',         hex: '#52161E', cat: 'speckle' }, // 2026
];

// LEGO_PALETTE is the flat THREE.Color array consumed by snapToLegoColor().
// Built from active categories via rebuildLegoPalette(); see palette picker
// UI for the toggle. Default: all categories on (full 130-colour standard).
let LEGO_PALETTE = [];
const activeLegoCategories = new Set(['solid', 'trans', 'pearl', 'chrome', 'speckle']);

function rebuildLegoPalette() {
  LEGO_PALETTE = LEGO_COLOR_DEFS
    .filter((d) => activeLegoCategories.has(d.cat))
    .map((d) => new THREE.Color(d.hex));
  // Safety fallback: empty palette would crash snapToLegoColor's min loop.
  if (LEGO_PALETTE.length === 0) {
    LEGO_PALETTE = [new THREE.Color('#FFFFFF'), new THREE.Color('#000000')];
  }
}
rebuildLegoPalette();

function snapToLegoColor(color) {
  let minDistance = Infinity;
  let closestColor = color;
  
  for (let i = 0; i < LEGO_PALETTE.length; i++) {
    const pColor = LEGO_PALETTE[i];
    
    // Perceptually weighted RGB color distance (redmean formula)
    const rmean = (color.r + pColor.r) / 2.0;
    const r = color.r - pColor.r;
    const g = color.g - pColor.g;
    const b = color.b - pColor.b;
    
    const weightR = 2.0 + rmean;
    const weightG = 4.0;
    const weightB = 3.0 - rmean;
    
    const distSq = weightR * r * r + weightG * g * g + weightB * b * b;
    if (distSq < minDistance) {
      minDistance = distSq;
      closestColor = pColor;
    }
  }
  return closestColor;
}

let voxelizeTimeout = null;

// --- Voxelization (Block Effect) Implementation ---
function updateBlockEffect() {
  if (!currentModel) return;

  if (voxelizeTimeout) {
    clearTimeout(voxelizeTimeout);
    voxelizeTimeout = null;
  }

  // 1. Clear existing voxel mesh if any
  clearInstancedMesh(voxelInstancedMesh);
  voxelInstancedMesh = null;
  brickCapacity = 0;

  clearInstancedMesh(voxelStudInstancedMesh);
  voxelStudInstancedMesh = null;
  studCapacity = 0;

  clearInstancedMesh(voxelPlateInstancedMesh);
  voxelPlateInstancedMesh = null;
  plateCapacity = 0;

  // 2. Toggle original mesh visibility based on block mode status
  const active = blockMode.checked;
  currentModel.traverse((child) => {
    if (child.isMesh && !child.isInstancedMesh) {
      child.visible = !active;
    }
  });

  if (active) {
    showLoader(true);
    loaderProgress.textContent = 'Generating Blocks...';
    
    // Ensure world matrix is updated before computing local transforms
    currentModel.updateMatrixWorld(true);

    // Run in timeout to prevent UI freezing
    voxelizeTimeout = setTimeout(() => {
      voxelizeTimeout = null;
      const resolution = parseInt(blockResolution.value);
      const gapPercent = parseFloat(blockGap.value) / 100.0;
      
      const { voxels, voxelSize, voxelSizeY, min } = voxelizeMesh(currentModel, resolution);

      if (voxels.size > 0) {
        // Create instanced box/lego geometry scaled down by outline gap
        const boxWidth = voxelSize * (1.0 - gapPercent);
        const boxHeight = voxelSizeY * (1.0 - gapPercent);
        const boxDepth = voxelSize * (1.0 - gapPercent);
        
        const shape = blockShape.value;
        const voxelGeom = makeBrickGeometry(boxWidth, boxHeight, boxDepth);
        
        let studGeom = null;
        const studRadius = boxWidth * 0.3;
        const studHeight = boxWidth * 0.2;
        if (shape === 'lego' || shape === 'lego-plate') {
          studGeom = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 16);
        }
        
        // Use a clone of physicalMaterial. Its properties will be fully synced dynamically.
        const voxelMat = physicalMaterial.clone();

        voxelInstancedMesh = new THREE.InstancedMesh(voxelGeom, voxelMat, voxels.size);
        voxelInstancedMesh.userData = {
          isHeightmap: false,
          shape: shape,
          gapPercent: gapPercent
        };
        voxelInstancedMesh.castShadow = true;
        voxelInstancedMesh.receiveShadow = true;
        currentModel.add(voxelInstancedMesh);

        if (studGeom) {
          const studMat = voxelMat.clone();
          voxelStudInstancedMesh = new THREE.InstancedMesh(studGeom, studMat, voxels.size);
          voxelStudInstancedMesh.userData = {
            isHeightmap: false,
            shape: shape,
            gapPercent: gapPercent
          };
          voxelStudInstancedMesh.castShadow = true;
          voxelStudInstancedMesh.receiveShadow = true;
          currentModel.add(voxelStudInstancedMesh);
        }

        // Save voxel keys for update loop
        voxelKeys = Array.from(voxels);

        // Make sure we draw media canvas if mapping is model
        if (isMediaLoaded && mediaMapping.value === 'model') {
          sampleOffscreenCanvas();
        }

        let baseColor = physicalMaterial.color.clone();
        if (blockLegoSnap.checked) {
          baseColor = snapToLegoColor(baseColor);
        }

        // Pre-build a per-mesh colour sampler when the user wants to keep
        // the source model's materials. Each entry resolves (uv -> Color)
        // by sampling that mesh's basecolor texture × material.color, or
        // just the flat colour if there's no texture. Samplers are built
        // once here, then called once per voxel below.
        //
        // Skipped when:
        //   • Use file's own materials is unchecked (use the global baseColor)
        //   • A media mapping is overriding model colour (video → model)
        const useFileMaterials = (modelKeepMaterials && modelKeepMaterials.checked)
          && !(isMediaLoaded && mediaMapping.value === 'model');
        const matSamplers = useFileMaterials
          ? voxelizedMeshList.map((m) => createMaterialSampler(m.material))
          : null;

        const dummy = new THREE.Object3D();
        const studDummy = new THREE.Object3D();
        let idx = 0;
        for (const key of voxelKeys) {
          const [x, y, z] = key.split(',').map(Number);
          const posX = min.x + (x + 0.5) * voxelSize;
          const posY = min.y + (y + 0.5) * voxelSizeY;
          const posZ = min.z + (z + 0.5) * voxelSize;

          dummy.position.set(posX, posY, posZ);
          dummy.updateMatrix();
          voxelInstancedMesh.setMatrixAt(idx, dummy.matrix);

          if (voxelStudInstancedMesh) {
            studDummy.position.set(posX, posY + boxHeight / 2 + studHeight / 2, posZ);
            studDummy.updateMatrix();
            voxelStudInstancedMesh.setMatrixAt(idx, studDummy.matrix);
          }

          // Determine color — three sources, in priority order:
          //   1. Uploaded media (video/image) mapped to 'model'
          //   2. Source mesh's own material (texture sample × material.color)
          //   3. Global physicalMaterial.color
          let colorToUse = baseColor.clone();
          if (isMediaLoaded && mediaMapping.value === 'model') {
            const uv = voxelUVMap.get(key);
            if (uv) {
              colorToUse = getSampledPixelColor(uv.x, uv.y);
            }
          } else if (matSamplers) {
            const meshIdx = voxelMeshIdxMap.get(key);
            const sampler = (meshIdx !== undefined) ? matSamplers[meshIdx] : null;
            const uv = voxelUVMap.get(key);
            if (sampler && uv) {
              colorToUse = sampler(uv);
            }
          }
          if (blockLegoSnap.checked) {
            colorToUse = snapToLegoColor(colorToUse);
          }
          voxelInstancedMesh.setColorAt(idx, colorToUse);
          if (voxelStudInstancedMesh) {
            voxelStudInstancedMesh.setColorAt(idx, colorToUse);
          }
          idx++;
        }
        voxelInstancedMesh.instanceMatrix.needsUpdate = true;
        if (voxelInstancedMesh.instanceColor) {
          voxelInstancedMesh.instanceColor.needsUpdate = true;
        }
        if (voxelStudInstancedMesh) {
          voxelStudInstancedMesh.instanceMatrix.needsUpdate = true;
          if (voxelStudInstancedMesh.instanceColor) {
            voxelStudInstancedMesh.instanceColor.needsUpdate = true;
          }
        }

        // Update UI Stats using the mesh geometry directly for 100% accuracy
        const geom = voxelInstancedMesh.geometry;
        const verticesPerVoxel = geom.attributes.position.count;
        const trianglesPerVoxel = geom.index ? (geom.index.count / 3) : (verticesPerVoxel / 3);

        let extraVertices = 0;
        let extraTriangles = 0;
        if (voxelStudInstancedMesh) {
          const sGeom = voxelStudInstancedMesh.geometry;
          extraVertices = sGeom.attributes.position.count;
          extraTriangles = sGeom.index ? (sGeom.index.count / 3) : (extraVertices / 3);
        }

        infoMeshes.textContent = 1 + (voxelStudInstancedMesh ? 1 : 0);
        infoVertices.textContent = formatNumber(voxels.size * (verticesPerVoxel + extraVertices));
        infoTriangles.textContent = formatNumber(voxels.size * (trianglesPerVoxel + extraTriangles));
      } else {
        // Fallback if no voxels could be generated
        infoMeshes.textContent = 0;
        infoVertices.textContent = 0;
        infoTriangles.textContent = 0;
      }
      showLoader(false);
    }, 20);
  } else {
    // Voxel mode disabled: restore original stats
    infoMeshes.textContent = modelStats.meshes;
    infoVertices.textContent = formatNumber(modelStats.vertices);
    infoTriangles.textContent = formatNumber(modelStats.triangles);
  }
}

// Surface voxelization algorithm in local coordinate space
// Returns a function (uv: Vector2) -> THREE.Color that resolves the
// material's colour at the given UV. Handles three common cases:
//   • Material has a colour texture (mat.map)  → sample pixel × mat.color
//   • Material has only a colour (no map)      → return mat.color
//   • No usable material                        → fall back to physicalMaterial.color
// Multi-material arrays are simplified to [0]. Texture images are drawn
// to an offscreen canvas once and cached per Texture via WeakMap.
function createMaterialSampler(material) {
  const fallback = () => physicalMaterial.color.clone();
  if (!material) return fallback;
  // Multi-material → pick the first slot. Most imported models use single.
  const mat = Array.isArray(material) ? material[0] : material;
  if (!mat) return fallback;

  const baseColor = (mat.color && mat.color.isColor) ? mat.color.clone() : null;
  const map = mat.map || null;

  // Best case: colour texture present. Bake it to a canvas (cached) and
  // sample by UV. Multiply by mat.color (the PBR baseColorFactor).
  if (map && map.image) {
    let entry = textureSampleCache.get(map);
    if (!entry) {
      const img = map.image;
      // Image dimensions can come from <img>, <canvas>, ImageBitmap, or <video>
      const w = img.width || img.videoWidth || 0;
      const h = img.height || img.videoHeight || 0;
      if (w > 0 && h > 0) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        try {
          ctx.drawImage(img, 0, 0, w, h);
          entry = { canvas: c, ctx, w, h };
          textureSampleCache.set(map, entry);
        } catch (e) {
          // Cross-origin tainted canvas, etc. → fall back to flat colour.
          entry = null;
        }
      }
    }
    if (entry) {
      const { ctx, w, h } = entry;
      const mul = baseColor || new THREE.Color(0xffffff);
      const out = new THREE.Color();
      return (uv) => {
        // Wrap UVs into [0,1) the simple way — matches RepeatWrapping
        // behaviour close enough for Block sampling. Three.js itself
        // uses fract() in the shader.
        const u = ((uv.x % 1) + 1) % 1;
        const v = ((uv.y % 1) + 1) % 1;
        const px = Math.min(w - 1, Math.floor(u * w));
        // Flip V — image y is top-down, UVs are bottom-up
        const py = Math.min(h - 1, Math.floor((1 - v) * h));
        const data = ctx.getImageData(px, py, 1, 1).data;
        out.setRGB(data[0] / 255, data[1] / 255, data[2] / 255);
        out.r *= mul.r; out.g *= mul.g; out.b *= mul.b;
        return out.clone();
      };
    }
  }

  // No texture → just use the flat colour factor.
  if (baseColor) return () => baseColor.clone();
  return fallback;
}

function voxelizeMesh(model, resolution) {
  voxelUVMap.clear();
  voxelMeshIdxMap.clear();
  voxelizedMeshList = [];
  const voxels = new Set();
  
  // Compute local bounding box of child meshes
  const box = new THREE.Box3();
  model.traverse((child) => {
    if (child.isMesh && !child.isInstancedMesh) {
      const geom = child.geometry;
      if (geom) {
        const localMatrix = new THREE.Matrix4();
        localMatrix.copy(model.matrixWorld).invert().multiply(child.matrixWorld);
        
        const tempBox = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);
        tempBox.applyMatrix4(localMatrix);
        box.union(tempBox);
      }
    }
  });

  if (box.isEmpty()) {
    return { voxels, voxelSize: 1, min: new THREE.Vector3() };
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  const min = box.min;

  const maxDim = Math.max(size.x, size.y, size.z);
  const voxelSize = maxDim / resolution;

  const shape = blockShape.value;
  const heightFactor = (shape === 'lego') ? 1.2 : (shape === 'lego-plate' ? 0.4 : 1.0);
  const voxelSizeY = voxelSize * heightFactor;
  const sampleStep = Math.min(voxelSize, voxelSizeY);

  const tempV1 = new THREE.Vector3();
  const tempV2 = new THREE.Vector3();
  const tempV3 = new THREE.Vector3();

  const tempUV1 = new THREE.Vector2();
  const tempUV2 = new THREE.Vector2();
  const tempUV3 = new THREE.Vector2();

  // currentMeshIdx is updated inside the traverse loop so addVoxel knows
  // which mesh produced each sample point.
  let currentMeshIdx = -1;
  const addVoxel = (p, uv) => {
    const x = Math.floor((p.x - min.x) / voxelSize);
    const y = Math.floor((p.y - min.y) / voxelSizeY);
    const z = Math.floor((p.z - min.z) / voxelSize);
    const key = `${x},${y},${z}`;
    voxels.add(key);
    voxelUVMap.set(key, uv);
    if (currentMeshIdx >= 0) voxelMeshIdxMap.set(key, currentMeshIdx);
  };

  model.traverse((child) => {
    if (child.isMesh && !child.isInstancedMesh && child.geometry) {
      currentMeshIdx = voxelizedMeshList.length;
      voxelizedMeshList.push(child);
      const geom = child.geometry;
      const posAttr = geom.attributes.position;
      const uvAttr = geom.attributes.uv;
      const indexAttr = geom.index;

      const localMatrix = new THREE.Matrix4();
      localMatrix.copy(model.matrixWorld).invert().multiply(child.matrixWorld);

      const getVertex = (idx, outVec) => {
        outVec.fromBufferAttribute(posAttr, idx);
        outVec.applyMatrix4(localMatrix); // Transform to model local coordinates
      };

      const getUV = (idx, outVec) => {
        if (uvAttr) {
          outVec.fromBufferAttribute(uvAttr, idx);
        } else {
          outVec.set(0, 0);
        }
      };

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
          const idx1 = indexAttr.getX(i);
          const idx2 = indexAttr.getX(i + 1);
          const idx3 = indexAttr.getX(i + 2);

          getVertex(idx1, tempV1);
          getVertex(idx2, tempV2);
          getVertex(idx3, tempV3);
          
          getUV(idx1, tempUV1);
          getUV(idx2, tempUV2);
          getUV(idx3, tempUV3);
          
          sampleTriangle(tempV1, tempV2, tempV3, tempUV1, tempUV2, tempUV3, sampleStep, addVoxel);
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          getVertex(i, tempV1);
          getVertex(i + 1, tempV2);
          getVertex(i + 2, tempV3);
          
          getUV(i, tempUV1);
          getUV(i + 1, tempUV2);
          getUV(i + 2, tempUV3);
          
          sampleTriangle(tempV1, tempV2, tempV3, tempUV1, tempUV2, tempUV3, sampleStep, addVoxel);
        }
      }
    }
  });

  return { voxels, voxelSize, voxelSizeY, min };
}

// Samples points on triangle surface at half voxel size to guarantee connectivity and interpolates UVs
function sampleTriangle(v1, v2, v3, uv1, uv2, uv3, step, callback) {
  const d12 = v1.distanceTo(v2);
  const d13 = v1.distanceTo(v3);
  const maxD = Math.max(d12, d13);
  const steps = Math.ceil(maxD / (step * 0.5)); // Denser sampling to avoid holes

  const tempP = new THREE.Vector3();
  const tempUV = new THREE.Vector2();
  for (let i = 0; i <= steps; i++) {
    const t1 = i / steps;
    for (let j = 0; j <= steps - i; j++) {
      const t2 = j / steps;
      const t3 = 1 - t1 - t2;
      
      tempP.set(0, 0, 0)
        .addScaledVector(v1, t1)
        .addScaledVector(v2, t2)
        .addScaledVector(v3, t3);
        
      tempUV.set(0, 0)
        .addScaledVector(uv1, t1)
        .addScaledVector(uv2, t2)
        .addScaledVector(uv3, t3);
        
      callback(tempP, tempUV.clone());
    }
  }
}

// --- Step 4: UI Listeners and Real-Time Modifiers ---
function setupUIEventListeners() {

  // 0. 2D / 3D View-Mode toggle (top-center pill)
  btnMode3D.addEventListener('click', () => setViewMode('3d'));
  btnMode2D.addEventListener('click', () => setViewMode('2d'));

  // ── Model Transform gizmo + bottom-face controls ─────────────────────
  ['translate','rotate','scale','none'].forEach((mode) => {
    const btn = document.getElementById(`tf-${mode}`);
    if (btn) btn.addEventListener('click', () => setTransformMode(mode));
  });
  document.querySelectorAll('.tf-bottom-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const axis = btn.getAttribute('data-axis');
      setModelBottomAxis(axis);
    });
  });
  const btnSnapFloor = document.getElementById('tf-snap-floor');
  const btnResetXf   = document.getElementById('tf-reset');
  if (btnSnapFloor) btnSnapFloor.addEventListener('click', () => {
    snapModelToFloor();
    if (blockMode.checked) updateBlockEffect();
  });
  if (btnResetXf)   btnResetXf.addEventListener('click',   resetModelTransform);
  const btnFocusModel = document.getElementById('tf-focus');
  if (btnFocusModel) btnFocusModel.addEventListener('click', frameCameraOnModel);

  // 0a. Pan + Zoom for the 2D Lego-filter canvas
  // ---------------------------------------------
  // Wheel = zoom toward the cursor. Default zoom = 1, range = 0.2 to 10.
  // Zooming changes tileSize (via baseTileSize × zoom) rather than scaling
  // the canvas context — so the gradients & cached masks stay crisp.
  canvas2D.addEventListener('wheel', (e) => {
    if (viewMode !== '2d') return;
    e.preventDefault();

    const oldZoom = view2D.zoom;
    const factor  = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.2, Math.min(10, oldZoom * factor));
    if (newZoom === oldZoom) return;

    // Ensure gridX/gridY are initialised — kick a render if needed.
    if (view2D.gridX === null || view2D.gridY === null) {
      render2D();
      if (view2D.gridX === null) return; // no media — nothing to zoom
    }

    const rect = canvas2D.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Keep the point under the cursor stationary across the zoom step.
    // Because tileSize scales linearly with zoom, the same algebra still
    // applies: new gridX = mx - (mx - old gridX) × (newZoom / oldZoom).
    const k = newZoom / oldZoom;
    view2D.gridX = mx - (mx - view2D.gridX) * k;
    view2D.gridY = my - (my - view2D.gridY) * k;
    view2D.zoom  = newZoom;
    render2D();
  }, { passive: false });

  // Left-button drag = pan. Track on window so dragging off-canvas still works.
  canvas2D.addEventListener('mousedown', (e) => {
    if (viewMode !== '2d' || e.button !== 0) return;
    if (view2D.gridX === null || view2D.gridY === null) {
      render2D();
      if (view2D.gridX === null) return;
    }
    isPanning2D = true;
    panStart.mouseX = e.clientX;
    panStart.mouseY = e.clientY;
    panStart.gridX  = view2D.gridX;
    panStart.gridY  = view2D.gridY;
    canvas2D.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning2D) return;
    view2D.gridX = panStart.gridX + (e.clientX - panStart.mouseX);
    view2D.gridY = panStart.gridY + (e.clientY - panStart.mouseY);
    render2D();
  });
  window.addEventListener('mouseup', () => {
    if (!isPanning2D) return;
    isPanning2D = false;
    canvas2D.style.cursor = 'grab';
  });

  // Double-click to reset the 2D viewport — clears gridX/Y so the next
  // render recentres, and resets zoom to 1.
  canvas2D.addEventListener('dblclick', () => {
    if (viewMode !== '2d') return;
    view2D.zoom  = 1.0;
    view2D.gridX = null;
    view2D.gridY = null;
    render2D();
  });

  // 0b. Video export — captures one full loop of the active video as WebM / MP4
  btnExportVideo.addEventListener('click', () => { exportVideo(); });

  // 1. Material Inputs
  materialPreset.addEventListener('change', (e) => {
    applyMaterialPreset(e.target.value);
  });

  materialRoughness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valRoughness.textContent = val.toFixed(2);
    physicalMaterial.roughness = val;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  materialMetalness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valMetalness.textContent = val.toFixed(2);
    physicalMaterial.metalness = val;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  materialTransmission.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valTransmission.textContent = val.toFixed(2);
    physicalMaterial.transmission = val;
    physicalMaterial.transparent = val > 0;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  materialThickness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valThickness.textContent = val.toFixed(1);
    physicalMaterial.thickness = val;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  materialIor.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valIor.textContent = val.toFixed(2);
    physicalMaterial.ior = val;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  // Advanced PBR — Clearcoat (透明涂层)
  matClearcoat.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valClearcoat.textContent = val.toFixed(2);
    physicalMaterial.clearcoat = val;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  // Advanced PBR — Sheen (绒面边缘高光). Tints sheenColor toward base so
  // velvet / fabric reads naturally on any colour.
  matSheen.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valSheen.textContent = val.toFixed(2);
    physicalMaterial.sheen = val;
    if (val > 0 && physicalMaterial.sheenColor) {
      physicalMaterial.sheenColor.copy(physicalMaterial.color);
    } else if (physicalMaterial.sheenColor) {
      physicalMaterial.sheenColor.set(0xffffff);
    }
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  // Advanced PBR — Iridescence (彩虹薄膜)
  matIridescence.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valIridescence.textContent = val.toFixed(2);
    physicalMaterial.iridescence = val;
    materialPreset.value = 'custom';
    updateVoxelMaterials();
  });

  modelScale.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valScale.textContent = val.toFixed(2);
    if (currentModel) {
      // Default fbx factor is 0.069357
      const factor = 0.069357 * val;
      currentModel.scale.set(factor, factor, factor);
    }
  });

  // 2. Light Controls
  lightIntensity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valLightIntensity.textContent = val.toFixed(1);
    dirLight.intensity = val;
  });

  const updateLightPosition = () => {
    const x = parseFloat(lightX.value);
    const y = parseFloat(lightY.value);
    const z = parseFloat(lightZ.value);
    valLightX.textContent = x.toFixed(1);
    valLightY.textContent = y.toFixed(1);
    valLightZ.textContent = z.toFixed(1);
    dirLight.position.set(x, y, z);
  };
  lightX.addEventListener('input', updateLightPosition);
  lightY.addEventListener('input', updateLightPosition);
  lightZ.addEventListener('input', updateLightPosition);

  hemiIntensity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valHemiIntensity.textContent = val.toFixed(2);
    hemiLight.intensity = val;
  });

  // Environment-map selector. 'upload' opens the file picker on click.
  envMode.addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'upload') {
      envFileRow.style.display = userEnvTexture ? 'block' : 'none';
      if (!userEnvTexture) envUpload.click();
      else applyEnvironment('upload');
    } else {
      envFileRow.style.display = 'none';
      applyEnvironment(v);
    }
  });
  envUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleEnvUpload(e.target.files[0]);
    envUpload.value = ''; // allow re-uploading the same file
  });
  envIntensityInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valEnvIntensity.textContent = val.toFixed(2);
    if (scene) scene.environmentIntensity = val;
  });

  // RectAreaLight (Softbox)
  rectPower.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    valRectPower.textContent = v.toFixed(1);
    if (rectAreaLight) rectAreaLight.intensity = v;
  });
  rectSize.addEventListener('input', (e) => {
    const w = parseFloat(e.target.value);
    const h = w * (8/12); // preserve initial 12:8 aspect
    valRectSize.textContent = `${w.toFixed(1)} × ${h.toFixed(1)}`;
    if (rectAreaLight) {
      rectAreaLight.width  = w;
      rectAreaLight.height = h;
    }
  });

  // Post FX — Bloom
  fxBloom.addEventListener('change', (e) => {
    if (bloomPass) bloomPass.enabled = e.target.checked;
  });
  fxBloomStrength.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    valFxBloomStrength.textContent = v.toFixed(2);
    if (bloomPass) bloomPass.strength = v;
  });
  fxBloomThreshold.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    valFxBloomThreshold.textContent = v.toFixed(2);
    if (bloomPass) bloomPass.threshold = v;
  });
  // Post FX — Outline
  fxOutline.addEventListener('change', (e) => {
    if (outlinePass) {
      outlinePass.enabled = e.target.checked;
      if (e.target.checked) refreshOutlineSelection();
    }
  });
  fxOutlineStrength.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    valFxOutlineStrength.textContent = v.toFixed(1);
    if (outlinePass) outlinePass.edgeStrength = v;
  });
  // Post FX — GTAO
  fxGtao.addEventListener('change', (e) => {
    if (gtaoPass) gtaoPass.enabled = e.target.checked;
  });

  // Voxel primitive
  voxelGeomSelect.addEventListener('change', () => {
    // Force masks / pools to rebuild against the new geometry shape
    triggerBlockUpdate();
  });
  voxelRoundRadius.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    valVoxelRoundRadius.textContent = v.toFixed(2);
    if (voxelGeomSelect.value === 'rounded-box') triggerBlockUpdate();
  });

  // Renderer backend (reload to apply)
  rendererBackend.value = (localStorage.getItem('everything-lego-backend') === 'webgpu') ? 'webgpu' : 'webgl';
  rendererBackend.addEventListener('change', (e) => {
    localStorage.setItem('everything-lego-backend', e.target.value);
    // Soft warning + reload prompt
    setTimeout(() => {
      if (confirm(`Reload now to switch to ${e.target.value.toUpperCase()} renderer?`)) {
        location.reload();
      }
    }, 50);
  });

  // 3D Text — slider value labels + Add/Remove buttons.
  // Sliders only update the displayed value; the user has to press
  // "Add / Update Text" to regenerate (TextGeometry is expensive enough
  // that we don't want to rebuild on every slider tick).
  if (textSizeEl) {
    textSizeEl.addEventListener('input', (e) => {
      valTextSize.textContent = e.target.value;
    });
    textDepthEl.addEventListener('input', (e) => {
      valTextDepth.textContent = e.target.value;
    });
    textCurveEl.addEventListener('input', (e) => {
      valTextCurve.textContent = e.target.value;
    });
    textAddBtn.addEventListener('click', () => {
      buildOrUpdateText().catch((err) => console.error('[text] build failed:', err));
    });
    textRemoveBtn.addEventListener('click', removeTextMesh);
  }

  // Performance Mode — persisted across reloads
  const savedPerf = localStorage.getItem('everything-lego-perf-mode') === '1';
  perfMode = savedPerf;
  if (perfModeEl) {
    perfModeEl.checked = savedPerf;
    perfModeEl.addEventListener('change', (e) => {
      perfMode = e.target.checked;
      localStorage.setItem('everything-lego-perf-mode', perfMode ? '1' : '0');
      applyPerfMode();
    });
  }
  // Apply once at startup so the saved state takes effect immediately.
  applyPerfMode();

  // 3. Scene Background Controls
  sceneBgType.addEventListener('change', updateSceneBackground);
  sceneBgColor.addEventListener('input', (e) => {
    bgColorHex.textContent = e.target.value.toUpperCase();
    updateSceneBackground();
  });

  // 4. Motion Controls
  animAutoRotate.addEventListener('change', (e) => {
    controls.autoRotate = e.target.checked;
  });

  animSpeed.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valAnimSpeed.textContent = val.toFixed(3);
    controls.autoRotateSpeed = val * 50.0;
  });

  animMass.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valAnimMass.textContent = val.toFixed(1);
    controls.dampingFactor = 1.0 / val;
  });

  // 5. Action Buttons
  btnReset.addEventListener('click', () => {
    resetCameraPosition();
    controls.reset();
  });

  // Theme Toggle
  btnTheme.addEventListener('click', () => {
    toggleTheme();
  });

  btnScreenshot.addEventListener('click', captureScreenshot);
  btnExportGlb.addEventListener('click', exportToGLB);

  // 6. Custom Model Upload Handler
  uploadZone.addEventListener('click', () => modelUpload.click());
  
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--accent-color)';
    uploadZone.style.backgroundColor = 'rgba(119, 255, 0, 0.05)';
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = 'var(--sidebar-border)';
    uploadZone.style.backgroundColor = 'rgba(255, 255, 255, 0.01)';
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--sidebar-border)';
    uploadZone.style.backgroundColor = 'rgba(255, 255, 255, 0.01)';
    if (e.dataTransfer.files.length > 0) {
      handleCustomFile(e.dataTransfer.files[0]);
    }
  });

  modelUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleCustomFile(e.target.files[0]);
    }
  });

  // "Use file's own materials" — live toggle. Stashed originals from the
  // load-time pass are restored or replaced by physicalMaterial as needed.
  if (modelKeepMaterials) {
    modelKeepMaterials.addEventListener('change', () => {
      applyModelMaterials();
    });
  }

  // 7. Color Overlay — multiplicative tint + emissive glow.
  //    Tint sits on top of whatever the active preset already loaded:
  //      final.color = baseMaterialColor × tintColor
  //    Emissive is independent of lighting (acts like self-illumination).
  matTintColor.addEventListener('input', (e) => {
    const hex = e.target.value;
    tintColor.set(hex);
    tintColorHex.textContent = hex.toUpperCase();
    applyColorOverlay();
  });
  matTintReset.addEventListener('click', () => {
    matTintColor.value = '#ffffff';
    tintColor.set('#ffffff');
    tintColorHex.textContent = '#FFFFFF';
    applyColorOverlay();
  });
  matEmissiveColor.addEventListener('input', (e) => {
    const hex = e.target.value;
    emissiveColorHex.textContent = hex.toUpperCase();
    physicalMaterial.emissive.set(hex);
    physicalMaterial.needsUpdate = true;
    updateVoxelMaterials();
  });
  matEmissiveReset.addEventListener('click', () => {
    matEmissiveColor.value = '#000000';
    emissiveColorHex.textContent = '#000000';
    physicalMaterial.emissive.set('#000000');
    physicalMaterial.needsUpdate = true;
    updateVoxelMaterials();
  });
  matEmissiveInt.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valEmissiveInt.textContent = val.toFixed(2);
    physicalMaterial.emissiveIntensity = val;
    updateVoxelMaterials();
  });

  // 8. Block Effect Listeners
  blockMode.addEventListener('change', () => {
    triggerBlockUpdate();
  });

  blockShape.addEventListener('change', () => {
    triggerBlockUpdate();
  });

  blockLegoSnap.addEventListener('change', () => {
    triggerBlockUpdate();
  });

  blockMix.addEventListener('change', () => {
    // Mix mode needs quantised colours so adjacent cells can merge into a single
    // brick. Sync "Snap to Lego Colors" so the UI matches actual behaviour.
    if (blockMix.checked) {
      blockLegoSnap.checked = true;
      blockLegoSnap.disabled = true;
    } else {
      blockLegoSnap.disabled = false;
    }
    triggerBlockUpdate();
  });

  blockResolution.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valBlockResolution.textContent = val;
    debouncedTriggerBlockUpdate();
  });

  blockGap.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valBlockGap.textContent = `${val}%`;
    debouncedTriggerBlockUpdate();
  });

  // Shadow Spread — 2D only. Drives outerR multiplier in getShadowMask().
  shadowSpread.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valShadowSpread.textContent = `${val.toFixed(2)}×`;
    if (viewMode === '2d') render2D();
  });

  // 9. Media Upload Listeners
  mediaUploadZone.addEventListener('click', () => mediaUpload.click());
  
  mediaUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    mediaUploadZone.style.borderColor = 'var(--accent-color)';
    mediaUploadZone.style.backgroundColor = 'rgba(119, 255, 0, 0.05)';
  });

  mediaUploadZone.addEventListener('dragleave', () => {
    mediaUploadZone.style.borderColor = 'var(--sidebar-border)';
    mediaUploadZone.style.backgroundColor = 'rgba(255, 255, 255, 0.01)';
  });

  mediaUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    mediaUploadZone.style.borderColor = 'var(--sidebar-border)';
    mediaUploadZone.style.backgroundColor = 'rgba(255, 255, 255, 0.01)';
    if (e.dataTransfer.files.length > 0) {
      handleMediaFile(e.dataTransfer.files[0]);
    }
  });

  mediaUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleMediaFile(e.target.files[0]);
    }
  });

  mediaMapping.addEventListener('change', () => {
    applyMediaMapping();
  });

  mediaBrightness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valMediaBrightness.textContent = val.toFixed(2);
    debouncedTriggerBlockUpdate();
  });

  mediaHeightScale.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valMediaHeightScale.textContent = val.toFixed(1);
    debouncedTriggerBlockUpdate();
  });

  mediaHeightInvert.addEventListener('change', () => {
    triggerBlockUpdate();
  });

  btnVideoPlay.addEventListener('click', () => {
    if (loadedMediaElement && loadedMediaType === 'video') {
      if (loadedMediaElement.paused) {
        loadedMediaElement.play();
        btnVideoPlay.textContent = 'Pause';
      } else {
        loadedMediaElement.pause();
        btnVideoPlay.textContent = 'Play';
      }
    }
  });

  btnVideoMute.addEventListener('click', () => {
    if (loadedMediaElement && loadedMediaType === 'video') {
      loadedMediaElement.muted = !loadedMediaElement.muted;
      btnVideoMute.textContent = loadedMediaElement.muted ? 'Unmute' : 'Mute';
    }
  });
}

// Helper to trigger correct block updates depending on mapping mode
function triggerBlockUpdate() {
  // In 2D filter mode, all "block" controls map to the 2D Lego canvas instead
  // of the Three.js voxel grid — short-circuit here.
  if (viewMode === '2d') {
    render2D();
    return;
  }
  if (isMediaLoaded && mediaMapping.value === 'heightmap') {
    updateBlockHeightmap();
  } else {
    updateBlockEffect();
  }
}

let blockUpdateTimeout = null;
function debouncedTriggerBlockUpdate() {
  if (blockUpdateTimeout) clearTimeout(blockUpdateTimeout);
  blockUpdateTimeout = setTimeout(() => {
    triggerBlockUpdate();
  }, 40);
}

// Loads the default heightmap image on startup
function loadDefaultSample() {
  loaderProgress.textContent = 'Loading sample video...';

  // Reset media state
  isMediaLoaded = false;
  mediaAspect = 1.0;
  if (loadedMediaElement) {
    if (loadedMediaType === 'video') {
      loadedMediaElement.pause();
      loadedMediaElement.removeAttribute('src');
      loadedMediaElement.load();
    }
    loadedMediaElement = null;
  }
  if (loadedMediaTexture) {
    loadedMediaTexture.dispose();
    loadedMediaTexture = null;
  }

  // Default sample is now a looping video (replaces the static heightmap PNG)
  loadedMediaType = 'video';
  mediaTypeBadge.textContent = 'VIDEO';
  mediaVideoControls.style.display = 'flex';
  btnVideoPlay.textContent = 'Pause';
  btnVideoMute.textContent  = 'Unmute'; // muted by default

  const video = document.createElement('video');
  video.src = '/default-sample.mp4';
  video.autoplay = true;
  video.loop     = true;
  video.muted    = true;
  video.playsInline  = true;
  video.crossOrigin  = 'anonymous';

  video.onloadeddata = () => {
    loadedMediaElement = video;
    isMediaLoaded = true;

    // Create video texture
    loadedMediaTexture = new THREE.VideoTexture(video);
    loadedMediaTexture.colorSpace = THREE.SRGBColorSpace;

    // Setup sampling canvas (cap to 128 for real-time per-frame reads)
    const size   = 128;
    const aspect = video.videoWidth / video.videoHeight;
    mediaAspect  = aspect;
    samplingCanvas.width  = aspect >= 1 ? size : size * aspect;
    samplingCanvas.height = aspect >= 1 ? size / aspect : size;

    // Preview & filename in sidebar
    mediaInfoWrapper.style.display = 'block';
    mediaFilename.textContent = 'cat girls.mp4';
    mediaPreviewCanvas.width  = 60;
    mediaPreviewCanvas.height = 60;
    // First frame to preview (drawImage works as soon as loadeddata fires)
    try { mediaPreviewCtx.drawImage(video, 0, 0, 60, 60); } catch (_) { /* ignore */ }

    video.play().catch(() => { /* autoplay policy fallback */ });

    // Auto-route to heightmap so the scene shows the video-driven voxel grid
    mediaMapping.value = 'heightmap';
    applyMediaMapping();
    resetCameraPosition();
    showVideoExportUIIfApplicable(); // reveal video export controls
    showLoader(false);
  };
  video.onerror = (err) => {
    console.error('Error loading default sample video:', err);
    showLoader(false);
  };
}

// Handles image/video files uploaded by the user
function handleMediaFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(file);
  
  // Reset media state
  isMediaLoaded = false;
  mediaAspect = 1.0;
  if (loadedMediaElement) {
    if (loadedMediaType === 'video') {
      loadedMediaElement.pause();
      loadedMediaElement.removeAttribute('src');
      loadedMediaElement.load();
    }
    loadedMediaElement = null;
  }
  
  if (loadedMediaTexture) {
    loadedMediaTexture.dispose();
    loadedMediaTexture = null;
  }

  // Show status bar and set filename
  mediaInfoWrapper.style.display = 'block';
  mediaFilename.textContent = file.name;
  
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension) || file.type.startsWith('image/')) {
    loadedMediaType = 'image';
    mediaTypeBadge.textContent = 'IMAGE';
    mediaVideoControls.style.display = 'none';
    
    const img = new Image();
    img.src = url;
    img.onload = () => {
      loadedMediaElement = img;
      isMediaLoaded = true;
      
      // Create Texture
      loadedMediaTexture = new THREE.Texture(img);
      loadedMediaTexture.colorSpace = THREE.SRGBColorSpace;
      loadedMediaTexture.needsUpdate = true;
      
      // Setup offscreen canvas size to match image (cap to 256 for speed)
      const size = Math.min(256, Math.max(img.width, img.height));
      const aspect = img.width / img.height;
      mediaAspect = aspect;
      samplingCanvas.width = aspect >= 1 ? size : size * aspect;
      samplingCanvas.height = aspect >= 1 ? size / aspect : size;
      
      // Draw image to sample canvas once
      samplingCtx.drawImage(img, 0, 0, samplingCanvas.width, samplingCanvas.height);
      samplingData = samplingCtx.getImageData(0, 0, samplingCanvas.width, samplingCanvas.height);
      
      // Draw preview canvas
      mediaPreviewCanvas.width = 60;
      mediaPreviewCanvas.height = 60;
      mediaPreviewCtx.drawImage(img, 0, 0, 60, 60);

      // Uploaded image becomes the scene's primary subject — auto-switch to heightmap.
      mediaMapping.value = 'heightmap';
      applyMediaMapping();
      showVideoExportUIIfApplicable(); // hide video export controls for images
    };
  } else if (['mp4', 'webm', 'ogg', 'mov'].includes(extension) || file.type.startsWith('video/')) {
    loadedMediaType = 'video';
    mediaTypeBadge.textContent = 'VIDEO';
    mediaVideoControls.style.display = 'flex';
    btnVideoPlay.textContent = 'Pause';
    btnVideoMute.textContent = 'Unmute'; // Muted by default

    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    
    video.onloadeddata = () => {
      loadedMediaElement = video;
      isMediaLoaded = true;
      
      // Create Texture
      loadedMediaTexture = new THREE.VideoTexture(video);
      loadedMediaTexture.colorSpace = THREE.SRGBColorSpace;
      
      // Setup offscreen canvas size (cap to 128 for real-time performance)
      const size = 128;
      const aspect = video.videoWidth / video.videoHeight;
      mediaAspect = aspect;
      samplingCanvas.width = aspect >= 1 ? size : size * aspect;
      samplingCanvas.height = aspect >= 1 ? size / aspect : size;
      
      // Play
      video.play();

      // Uploaded video becomes the scene's primary subject — auto-switch to heightmap.
      mediaMapping.value = 'heightmap';
      applyMediaMapping();
      showVideoExportUIIfApplicable(); // reveal video export controls
    };
  } else {
    alert('Unsupported file format! Please upload an image or video.');
    mediaInfoWrapper.style.display = 'none';
  }
}

// Applies active media mapping destination
function applyMediaMapping() {
  // Restore scene background
  updateSceneBackground();

  // Reset physical material map
  physicalMaterial.map = null;
  physicalMaterial.needsUpdate = true;

  if (!isMediaLoaded || !loadedMediaTexture) {
    if (mediaMapping.value === 'heightmap') {
      clearInstancedMesh(voxelInstancedMesh);
      voxelInstancedMesh = null;
      brickCapacity = 0;

      clearInstancedMesh(voxelPlateInstancedMesh);
      voxelPlateInstancedMesh = null;
      plateCapacity = 0;

      clearInstancedMesh(voxelStudInstancedMesh);
      voxelStudInstancedMesh = null;
      studCapacity = 0;
      if (currentModel) {
        currentModel.traverse(c => {
          if (c.isMesh && !c.isInstancedMesh) c.visible = true;
        });
      }
    }
    mediaHeightScaleRow.style.display = 'none';
    mediaHeightInvertRow.style.display = 'none';
    mediaBrightnessRow.style.display = 'none';
    updateBlockEffect();
    return;
  }

  const mappingMode = mediaMapping.value;

  if (mappingMode === 'background') {
    mediaHeightScaleRow.style.display = 'none';
    mediaHeightInvertRow.style.display = 'none';
    mediaBrightnessRow.style.display = 'none';
    scene.background = loadedMediaTexture;
    document.querySelector('.canvas-container').style.background = 'none';
    
    // Hide heightmap voxel mesh if active, restore model visibility
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && !c.isInstancedMesh) {
          c.visible = !blockMode.checked;
        }
      });
    }
    updateBlockEffect();
  } else if (mappingMode === 'model') {
    mediaHeightScaleRow.style.display = 'none';
    mediaHeightInvertRow.style.display = 'none';
    mediaBrightnessRow.style.display = 'block';
    physicalMaterial.map = loadedMediaTexture;
    physicalMaterial.needsUpdate = true;
    
    // Restore model visibility
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && !c.isInstancedMesh) {
          c.visible = !blockMode.checked;
        }
      });
    }
    updateBlockEffect();
  } else if (mappingMode === 'heightmap') {
    mediaHeightScaleRow.style.display = 'block';
    mediaHeightInvertRow.style.display = 'flex';
    mediaBrightnessRow.style.display = 'block';
    
    // Hide original meshes completely
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && !c.isInstancedMesh) c.visible = false;
      });
    }
    updateBlockHeightmap();
  } else {
    mediaHeightScaleRow.style.display = 'none';
    mediaHeightInvertRow.style.display = 'none';
    mediaBrightnessRow.style.display = 'none';
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && !c.isInstancedMesh) {
          c.visible = !blockMode.checked;
        }
      });
    }
    updateBlockEffect();
  }

  // 2D filter mode mirrors any media change immediately.
  if (viewMode === '2d') render2D();
}

// Generates a 3D heightmap voxel grid from the uploaded media
function updateBlockHeightmap() {
  if (!isMediaLoaded || mediaMapping.value !== 'heightmap') return;

  const shape = blockShape.value;
  const resolution = parseInt(blockResolution.value);
  const gapPercent = parseFloat(blockGap.value) / 100.0;

  let cols, rows;
  if (mediaAspect >= 1.0) {
    cols = resolution;
    rows = Math.max(1, Math.round(resolution / mediaAspect));
  } else {
    cols = Math.max(1, Math.round(resolution * mediaAspect));
    rows = resolution;
  }
  const gridCount = cols * rows;

  const boardWidth = 10.0;
  const voxelSize = boardWidth / resolution;
  const boxSize = voxelSize * (1.0 - gapPercent);
  const plateH = boxSize * 0.4;          // 1 plate unit height
  const brickH = plateH * 3;             // 1 brick = 3 plates (real-world Lego ratio)
  const studRadius = boxSize * 0.3;
  const studHeight = boxSize * 0.2;

  sampleOffscreenCanvas();

  const heightScale = parseFloat(mediaHeightScale.value);
  const invertHeight = mediaHeightInvert.checked;
  const mixBricks = blockMix.checked;
  // Mixing requires quantized colours so neighbours can match — force lego snap
  // for the match key (and the displayed colour) when mix is on.
  const useLegoColors = blockLegoSnap.checked || mixBricks;

  // Pass 1: per-cell layer count (in plate units), display colour, match key.
  const cellLayers = new Int16Array(gridCount);
  const cellColors = new Array(gridCount);
  const cellKeys = new Int32Array(gridCount);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1 || 1);
      const v = r / (rows - 1 || 1);
      const px = getSampledPixelColor(u, v);
      const alpha = getSampledPixelAlpha(u, v);
      
      let layers = 0;
      if (alpha >= 0.1) {
        const brightness = 0.299 * px.r + 0.587 * px.g + 0.114 * px.b;
        const h = invertHeight ? (1 - brightness) : brightness;
        layers = Math.max(1, Math.round(h * heightScale));
      }

      let display = px;
      let key = 0;
      if (useLegoColors) {
        display = snapToLegoColor(px);
        key = (Math.round(display.r * 255) << 16) | (Math.round(display.g * 255) << 8) | Math.round(display.b * 255);
      }
      const i = r * cols + c;
      cellLayers[i] = layers;
      cellColors[i] = display;
      cellKeys[i] = key;
    }
  }

  // Pass 2: greedy footprint packing (mix mode) — longer bricks first so flat colour
  // regions get realistic 1x6 / 1x8 / 2x8 bars like real Lego sets.
  const bricks = [];
  if (mixBricks && shape !== 'cube') {
    const covered = new Uint8Array(gridCount);
    const sizes = [
      [8, 2], [2, 8], [6, 2], [2, 6], [8, 1], [1, 8], [6, 1], [1, 6],
      [4, 2], [2, 4], [3, 2], [2, 3], [2, 2],
      [4, 1], [1, 4], [3, 1], [1, 3], [2, 1], [1, 2],
      [1, 1]
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i0 = r * cols + c;
        if (covered[i0]) continue;
        const h0 = cellLayers[i0];
        if (h0 <= 0) {
          covered[i0] = 1;
          continue;
        }
        const k0 = cellKeys[i0];
        let pickedW = 1, pickedD = 1;
        const start = (r * 7 + c * 13) % sizes.length;
        for (let s = 0; s < sizes.length; s++) {
          const [w, d] = sizes[(start + s) % sizes.length];
          if (c + w > cols || r + d > rows) continue;
          let ok = true;
          for (let dr = 0; dr < d && ok; dr++) {
            for (let dc = 0; dc < w; dc++) {
              const idx = (r + dr) * cols + (c + dc);
              if (covered[idx] || cellLayers[idx] !== h0 || cellKeys[idx] !== k0) { ok = false; break; }
            }
          }
          if (ok) { pickedW = w; pickedD = d; break; }
        }
        for (let dr = 0; dr < pickedD; dr++) {
          for (let dc = 0; dc < pickedW; dc++) {
            covered[(r + dr) * cols + (c + dc)] = 1;
          }
        }
        bricks.push({ r, c, w: pickedW, d: pickedD, layers: h0, color: cellColors[i0] });
      }
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (cellLayers[i] <= 0) continue;
        bricks.push({ r, c, w: 1, d: 1, layers: cellLayers[i], color: cellColors[i] });
      }
    }
  }

  // Pre-calculate exact instance counts required for bricks, plates, and studs
  let neededBricks = 0;
  let neededPlates = 0;
  let neededStuds = 0;

  for (const b of bricks) {
    if (shape === 'lego') {
      neededBricks += b.layers;   // each layer = 1 brick (brickH tall)
      neededStuds  += b.w * b.d;
    } else if (shape === 'lego-plate') {
      neededPlates += b.layers;   // each layer = 1 plate (plateH tall)
      neededStuds  += b.w * b.d;
    } else if (shape === 'cube') {
      neededBricks += 1;
    }
  }

  // Dynamically manage / pool InstancedMesh for bricks
  const geomKind = voxelGeomSelect ? voxelGeomSelect.value : 'box';
  if (neededBricks > 0) {
    const brickGeomHeight = (shape === 'lego') ? brickH : boxSize;
    const needsRecreate = !voxelInstancedMesh ||
      !voxelInstancedMesh.userData.isHeightmap ||
      voxelInstancedMesh.userData.shape !== shape ||
      voxelInstancedMesh.userData.gapPercent !== gapPercent ||
      voxelInstancedMesh.userData.voxelSize !== voxelSize ||
      voxelInstancedMesh.userData.geomKind !== geomKind ||
      brickCapacity < neededBricks;

    if (needsRecreate) {
      clearInstancedMesh(voxelInstancedMesh);
      brickCapacity = Math.max(512, Math.round(neededBricks * 1.2));
      const voxelGeom = makeBrickGeometry(boxSize, brickGeomHeight, boxSize);
      const voxelMat = physicalMaterial.clone();

      voxelInstancedMesh = new THREE.InstancedMesh(voxelGeom, voxelMat, brickCapacity);
      voxelInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(brickCapacity * 3), 3);
      voxelInstancedMesh.userData = {
        isHeightmap: true,
        shape: shape,
        gapPercent: gapPercent,
        voxelSize: voxelSize,
        geomKind: geomKind
      };
      voxelInstancedMesh.castShadow = true;
      voxelInstancedMesh.receiveShadow = true;
      scene.add(voxelInstancedMesh);
    }
    voxelInstancedMesh.count = neededBricks;
    voxelInstancedMesh.visible = true;
  } else {
    if (voxelInstancedMesh) {
      voxelInstancedMesh.count = 0;
      voxelInstancedMesh.visible = false;
    }
  }

  // Dynamically manage / pool InstancedMesh for plates
  if (neededPlates > 0) {
    const needsRecreate = !voxelPlateInstancedMesh ||
      !voxelPlateInstancedMesh.userData.isHeightmap ||
      voxelPlateInstancedMesh.userData.shape !== shape ||
      voxelPlateInstancedMesh.userData.gapPercent !== gapPercent ||
      voxelPlateInstancedMesh.userData.voxelSize !== voxelSize ||
      voxelPlateInstancedMesh.userData.geomKind !== geomKind ||
      plateCapacity < neededPlates;

    if (needsRecreate) {
      clearInstancedMesh(voxelPlateInstancedMesh);
      plateCapacity = Math.max(512, Math.round(neededPlates * 1.2));
      const plateGeom = makeBrickGeometry(boxSize, plateH, boxSize);
      const plateMat = physicalMaterial.clone();

      voxelPlateInstancedMesh = new THREE.InstancedMesh(plateGeom, plateMat, plateCapacity);
      voxelPlateInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(plateCapacity * 3), 3);
      voxelPlateInstancedMesh.userData = {
        isHeightmap: true,
        shape: shape,
        gapPercent: gapPercent,
        voxelSize: voxelSize,
        geomKind: geomKind
      };
      voxelPlateInstancedMesh.castShadow = true;
      voxelPlateInstancedMesh.receiveShadow = true;
      scene.add(voxelPlateInstancedMesh);
    }
    voxelPlateInstancedMesh.count = neededPlates;
    voxelPlateInstancedMesh.visible = true;
  } else {
    if (voxelPlateInstancedMesh) {
      voxelPlateInstancedMesh.count = 0;
      voxelPlateInstancedMesh.visible = false;
    }
  }

  // Dynamically manage / pool InstancedMesh for studs
  if (neededStuds > 0) {
    const needsRecreate = !voxelStudInstancedMesh || 
      !voxelStudInstancedMesh.userData.isHeightmap ||
      voxelStudInstancedMesh.userData.shape !== shape ||
      voxelStudInstancedMesh.userData.gapPercent !== gapPercent ||
      voxelStudInstancedMesh.userData.voxelSize !== voxelSize ||
      studCapacity < neededStuds;

    if (needsRecreate) {
      clearInstancedMesh(voxelStudInstancedMesh);
      studCapacity = Math.max(512, Math.round(neededStuds * 1.2));
      const studGeom = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 16);
      const studMat = physicalMaterial.clone();

      voxelStudInstancedMesh = new THREE.InstancedMesh(studGeom, studMat, studCapacity);
      voxelStudInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(studCapacity * 3), 3);
      voxelStudInstancedMesh.userData = {
        isHeightmap: true,
        shape: shape,
        gapPercent: gapPercent,
        voxelSize: voxelSize
      };
      voxelStudInstancedMesh.castShadow = true;
      voxelStudInstancedMesh.receiveShadow = true;
      scene.add(voxelStudInstancedMesh);
    }
    voxelStudInstancedMesh.count = neededStuds;
    voxelStudInstancedMesh.visible = true;
  } else {
    if (voxelStudInstancedMesh) {
      voxelStudInstancedMesh.count = 0;
      voxelStudInstancedMesh.visible = false;
    }
  }

  // Pass 3: emit instance matrices.
  const dummy = new THREE.Object3D();
  const studDummy = new THREE.Object3D();
  const denom = (1.0 - gapPercent) || 1e-6;
  const scaleN = (n) => (n - gapPercent) / denom;

  let brickIdx = 0, plateIdx = 0, studIdx = 0;
  for (const b of bricks) {
    const cx = (b.c + b.w / 2 - cols / 2) * voxelSize;
    const cz = (b.r + b.d / 2 - rows / 2) * voxelSize;
    const sX = scaleN(b.w);
    const sZ = scaleN(b.d);

    if (shape === 'lego') {
      // Stack bricks — each layer is one full brick (brickH = 3× plateH).
      for (let i = 0; i < b.layers; i++) {
        const py = (i + 0.5) * brickH;
        dummy.position.set(cx, py, cz);
        dummy.scale.set(sX, 1, sZ);
        dummy.updateMatrix();
        voxelInstancedMesh.setMatrixAt(brickIdx, dummy.matrix);
        voxelInstancedMesh.setColorAt(brickIdx, b.color);
        brickIdx++;
      }

      // Studs on top of the brick stack
      const stackTop = b.layers * brickH;
      for (let dr = 0; dr < b.d; dr++) {
        for (let dc = 0; dc < b.w; dc++) {
          const sx = (b.c + dc - cols / 2 + 0.5) * voxelSize;
          const sz = (b.r + dr - rows / 2 + 0.5) * voxelSize;
          studDummy.position.set(sx, stackTop + studHeight / 2, sz);
          studDummy.scale.set(1, 1, 1);
          studDummy.updateMatrix();
          voxelStudInstancedMesh.setMatrixAt(studIdx, studDummy.matrix);
          voxelStudInstancedMesh.setColorAt(studIdx, b.color);
          studIdx++;
        }
      }
    } else if (shape === 'lego-plate') {
      // Stack only plates
      for (let i = 0; i < b.layers; i++) {
        const py = (i + 0.5) * plateH;
        dummy.position.set(cx, py, cz);
        dummy.scale.set(sX, 1, sZ);
        dummy.updateMatrix();
        voxelPlateInstancedMesh.setMatrixAt(plateIdx, dummy.matrix);
        voxelPlateInstancedMesh.setColorAt(plateIdx, b.color);
        plateIdx++;
      }

      // Studs on top
      const stackTop = b.layers * plateH;
      for (let dr = 0; dr < b.d; dr++) {
        for (let dc = 0; dc < b.w; dc++) {
          const sx = (b.c + dc - cols / 2 + 0.5) * voxelSize;
          const sz = (b.r + dr - rows / 2 + 0.5) * voxelSize;
          studDummy.position.set(sx, stackTop + studHeight / 2, sz);
          studDummy.scale.set(1, 1, 1);
          studDummy.updateMatrix();
          voxelStudInstancedMesh.setMatrixAt(studIdx, studDummy.matrix);
          voxelStudInstancedMesh.setColorAt(studIdx, b.color);
          studIdx++;
        }
      }
    } else if (shape === 'cube') {
      // Single box/cube per stack
      const totalH = b.layers * voxelSize;
      const scaleY = totalH / boxSize;
      
      dummy.position.set(cx, totalH / 2, cz);
      dummy.scale.set(sX, scaleY, sZ);
      dummy.updateMatrix();
      voxelInstancedMesh.setMatrixAt(brickIdx, dummy.matrix);
      voxelInstancedMesh.setColorAt(brickIdx, b.color);
      brickIdx++;
    }
  }

  // Trigger GPU matrix updates
  if (voxelInstancedMesh && neededBricks > 0) {
    voxelInstancedMesh.instanceMatrix.needsUpdate = true;
    if (voxelInstancedMesh.instanceColor) voxelInstancedMesh.instanceColor.needsUpdate = true;
  }
  if (voxelPlateInstancedMesh && neededPlates > 0) {
    voxelPlateInstancedMesh.instanceMatrix.needsUpdate = true;
    if (voxelPlateInstancedMesh.instanceColor) voxelPlateInstancedMesh.instanceColor.needsUpdate = true;
  }
  if (voxelStudInstancedMesh && neededStuds > 0) {
    voxelStudInstancedMesh.instanceMatrix.needsUpdate = true;
    if (voxelStudInstancedMesh.instanceColor) voxelStudInstancedMesh.instanceColor.needsUpdate = true;
  }

  // Keep the OutlinePass's selection in sync with the live voxel meshes
  // so the cel-shaded stroke follows new geometry instantly.
  refreshOutlineSelection();

  // Stats calculation
  const v = (g) => g ? g.attributes.position.count : 0;
  const t = (g) => g ? (g.index ? (g.index.count / 3) : (v(g) / 3)) : 0;

  const brickGeom = voxelInstancedMesh ? voxelInstancedMesh.geometry : null;
  const plateGeom = voxelPlateInstancedMesh ? voxelPlateInstancedMesh.geometry : null;
  const studGeom = voxelStudInstancedMesh ? voxelStudInstancedMesh.geometry : null;

  let activeMeshes = 0;
  if (voxelInstancedMesh && voxelInstancedMesh.visible) activeMeshes++;
  if (voxelPlateInstancedMesh && voxelPlateInstancedMesh.visible) activeMeshes++;
  if (voxelStudInstancedMesh && voxelStudInstancedMesh.visible) activeMeshes++;

  infoMeshes.textContent = activeMeshes;
  
  const totalV = (brickIdx * v(brickGeom)) + (plateIdx * v(plateGeom)) + (studIdx * v(studGeom));
  const totalT = (brickIdx * t(brickGeom)) + (plateIdx * t(plateGeom)) + (studIdx * t(studGeom));

  infoVertices.textContent = formatNumber(totalV);
  infoTriangles.textContent = formatNumber(totalT);
}

// Offscreen canvas helpers
function sampleOffscreenCanvas() {
  if (!isMediaLoaded || !loadedMediaElement) return;
  samplingCtx.clearRect(0, 0, samplingCanvas.width, samplingCanvas.height);
  samplingCtx.drawImage(loadedMediaElement, 0, 0, samplingCanvas.width, samplingCanvas.height);
  samplingData = samplingCtx.getImageData(0, 0, samplingCanvas.width, samplingCanvas.height);
}

function getSampledPixelColor(u, v) {
  if (!samplingData) return new THREE.Color(0xffffff);
  
  const w = samplingCanvas.width;
  const h = samplingCanvas.height;
  
  // Image top (canvas py=0) maps to grid row 0 (far side of relief, top of view)
  // so the image appears right-side-up when looking at the heightmap from the camera.
  const px = Math.max(0, Math.min(w - 1, Math.floor(u * (w - 1))));
  const py = Math.max(0, Math.min(h - 1, Math.floor(v * (h - 1))));
  
  const idx = (py * w + px) * 4;
  
  const brightnessVal = mediaBrightness ? parseFloat(mediaBrightness.value) : 1.0;
  
  const r = Math.max(0.0, Math.min(1.0, (samplingData.data[idx] / 255) * brightnessVal));
  const g = Math.max(0.0, Math.min(1.0, (samplingData.data[idx + 1] / 255) * brightnessVal));
  const b = Math.max(0.0, Math.min(1.0, (samplingData.data[idx + 2] / 255) * brightnessVal));
  
  return new THREE.Color(r, g, b);
}

function getSampledPixelAlpha(u, v) {
  if (!samplingData) return 1.0;

  const w = samplingCanvas.width;
  const h = samplingCanvas.height;

  const px = Math.max(0, Math.min(w - 1, Math.floor(u * (w - 1))));
  const py = Math.max(0, Math.min(h - 1, Math.floor(v * (h - 1))));

  const idx = (py * w + px) * 4;
  return samplingData.data[idx + 3] / 255;
}

/* ===========================================================================
   2D LEGO FILTER MODE
   ---------------------------------------------------------------------------
   A purely 2D canvas pipeline: takes the loaded image/video and renders it as
   a flat Lego mosaic — every cell is a single 1×1 brick snapped to the Lego
   palette, drawn with a stud on top. Independent of Three.js — no scene,
   no camera, no Mix Bricks. Only two controls matter here:
     • Block Density slider  →  brick size (lower = bigger bricks)
     • Image Brightness      →  per-channel multiplier (via getSampledPixelColor)
   =========================================================================== */

function resize2DCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas2D.clientWidth;
  const h = canvas2D.clientHeight;
  canvas2D.width  = Math.round(w * dpr);
  canvas2D.height = Math.round(h * dpr);
  ctx2D.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* Cached shadow mask — a transparent canvas containing only the half-donut
   shadow as black pixels. Drawing this on top of any coloured brick will
   darken it in the shadow region (source-over with black is equivalent to
   a same-hue darken). Building it inside an offscreen canvas lets us use
   destination-in to soften the top edge without affecting the brick body. */
let cachedShadowMask = null;
let cachedShadowMaskTile = 0;
let cachedShadowMaskSpread = 0;   // outerR multiplier baked into cached mask
let cachedHighlightMask = null;
let cachedHighlightMaskTile = 0;

function getShadowMask(tileSize, studR) {
  const spread = shadowSpread ? parseFloat(shadowSpread.value) : 1.8;
  if (cachedShadowMask
      && cachedShadowMaskTile   === tileSize
      && cachedShadowMaskSpread === spread) return cachedShadowMask;

  const off = document.createElement('canvas');
  off.width  = tileSize;
  off.height = tileSize;
  const octx = off.getContext('2d');
  const half = tileSize / 2;

  // Crescent shadow — the area between the stud's silhouette (inner) and a
  // larger outer circle around it, restricted to the bottom half via the
  // destination-in fade further below. The outerR multiplier (Shadow Spread
  // slider) controls how far the shadow extends before fading to zero.
  const outerR = studR * spread;
  const innerR = studR;

  octx.save();

  // Donut clip: full canvas rect with stud cut out (even-odd subtraction)
  octx.beginPath();
  octx.rect(0, 0, tileSize, tileSize);
  octx.arc(half, half, innerR, 0, Math.PI * 2, true);
  octx.clip('evenodd');

  // Radial gradient — dark right at the stud rim, fading to fully
  // transparent at outerR. Three-stop ease-out so it doesn't decay
  // linearly. Black on transparent canvas → same-hue darken when
  // composited over any brick colour via source-over.
  const grad = octx.createRadialGradient(half, half, innerR, half, half, outerR);
  grad.addColorStop(0.00, 'rgba(0,0,0,0.60)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1.00, 'rgba(0,0,0,0)');
  octx.fillStyle = grad;
  octx.fillRect(0, 0, tileSize, tileSize);

  octx.restore();

  // Soft top fade — destination-in with a vertical alpha ramp centered
  // on the stud's equator. Keeps the bottom of the donut (the cast
  // shadow), smoothly erases the top half. No hard horizontal seam.
  octx.globalCompositeOperation = 'destination-in';
  const fade = octx.createLinearGradient(0, half - studR * 0.40, 0, half + studR * 0.25);
  fade.addColorStop(0, 'rgba(0,0,0,0)');   // top: erase
  fade.addColorStop(1, 'rgba(0,0,0,1)');   // bottom: keep
  octx.fillStyle = fade;
  octx.fillRect(0, 0, tileSize, tileSize);

  cachedShadowMask = off;
  cachedShadowMaskTile = tileSize;
  cachedShadowMaskSpread = spread;
  return off;
}

/* Cached highlight mask — top-arc highlight as WHITE pixels with alpha.
   Drawn over the brick body it produces a same-hue brighter tint. The arc
   is stroked first, then a horizontal triangular fade is applied via
   destination-in so the left/right ends taper smoothly to nothing. */
function getHighlightMask(tileSize, studR) {
  if (cachedHighlightMask && cachedHighlightMaskTile === tileSize) return cachedHighlightMask;

  const off = document.createElement('canvas');
  off.width  = tileSize;
  off.height = tileSize;
  const octx = off.getContext('2d');
  const half = tileSize / 2;
  const lineW = Math.max(1.5, studR * 0.13);
  const r = studR * 0.93;

  // Stroke the top-arc highlight in white. Alpha here determines the
  // overall highlight brightness when composited onto any brick colour.
  octx.strokeStyle = 'rgba(255,255,255,0.42)';
  octx.lineWidth = lineW;
  octx.lineCap = 'round';
  octx.beginPath();
  // 7π/6 → 11π/6  ≡  210° → 330°  (≈120° centred on 12 o'clock)
  octx.arc(half, half, r, Math.PI * 7 / 6, Math.PI * 11 / 6);
  octx.stroke();

  // Soft left/right fade — destination-in with a triangular alpha gradient
  // keeps the centre of the arc opaque and erases the tips smoothly.
  octx.globalCompositeOperation = 'destination-in';
  const fade = octx.createLinearGradient(0, 0, tileSize, 0);
  fade.addColorStop(0.00, 'rgba(0,0,0,0)');
  fade.addColorStop(0.50, 'rgba(0,0,0,1)');
  fade.addColorStop(1.00, 'rgba(0,0,0,0)');
  octx.fillStyle = fade;
  octx.fillRect(0, 0, tileSize, tileSize);

  cachedHighlightMask = off;
  cachedHighlightMaskTile = tileSize;
  return off;
}

function render2D() {
  if (viewMode !== '2d') return;

  const w = canvas2D.clientWidth;
  const h = canvas2D.clientHeight;

  // Background fill (always in untransformed CSS-pixel space)
  const bgStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#08080a';
  ctx2D.fillStyle = bgStyle;
  ctx2D.fillRect(0, 0, w, h);

  if (!isMediaLoaded || !loadedMediaElement) {
    canvas2DEmpty.style.display = 'flex';
    return;
  }
  canvas2DEmpty.style.display = 'none';

  // Refresh pixel buffer from current image / video frame
  sampleOffscreenCanvas();
  if (!samplingData) return;

  // Compute tile grid based on Block Density and media aspect
  const resolution = parseInt(blockResolution.value);
  let cols, rows;
  if (mediaAspect >= 1.0) {
    cols = resolution;
    rows = Math.max(1, Math.round(resolution / mediaAspect));
  } else {
    cols = Math.max(1, Math.round(resolution * mediaAspect));
    rows = resolution;
  }

  // Natural tile size at zoom = 1 (fits the grid in the viewport with margins)
  const margin = 32;
  const availW = w - 2 * margin;
  const availH = h - 2 * margin;
  const baseTileSize = Math.max(2, Math.floor(Math.min(availW / cols, availH / rows)));

  // Apply zoom by scaling the tile size itself — this keeps gradients and
  // cached masks crisp at every zoom level, because they're re-rasterised
  // at the new tileSize instead of being pixel-stretched by ctx.scale().
  const tileSize = Math.max(2, Math.round(baseTileSize * view2D.zoom));
  const gridW = tileSize * cols;
  const gridH = tileSize * rows;

  // Lazy-init / reset: centre the grid in the viewport
  if (view2D.gridX === null) view2D.gridX = (w - gridW) / 2;
  if (view2D.gridY === null) view2D.gridY = (h - gridH) / 2;

  const offsetX = Math.round(view2D.gridX);
  const offsetY = Math.round(view2D.gridY);

  // Stud geometry
  const studR = tileSize * 0.36;

  // Pre-rendered overlays (one per tileSize, so they re-build automatically
  // when zoom changes the effective tileSize)
  const shadowMask    = getShadowMask(tileSize, studR);
  const highlightMask = getHighlightMask(tileSize, studR);

  const useSnap = blockLegoSnap.checked; // optional; defaults checked

  // Skip cells that fall entirely outside the visible viewport — at high
  // zoom most cells are off-screen, so this keeps the inner loop cheap.
  const cStart = Math.max(0, Math.floor((-offsetX) / tileSize));
  const cEnd   = Math.min(cols, Math.ceil((w - offsetX) / tileSize) + 1);
  const rStart = Math.max(0, Math.floor((-offsetY) / tileSize));
  const rEnd   = Math.min(rows, Math.ceil((h - offsetY) / tileSize) + 1);

  for (let r = rStart; r < rEnd; r++) {
    for (let c = cStart; c < cEnd; c++) {
      const u = c / (cols - 1 || 1);
      const v = r / (rows - 1 || 1);
      const a = getSampledPixelAlpha(u, v);
      if (a < 0.1) continue;

      let col = getSampledPixelColor(u, v);
      if (useSnap) col = snapToLegoColor(col);

      const R = Math.max(0, Math.min(255, Math.round(col.r * 255)));
      const G = Math.max(0, Math.min(255, Math.round(col.g * 255)));
      const B = Math.max(0, Math.min(255, Math.round(col.b * 255)));

      const x = offsetX + c * tileSize;
      const y = offsetY + r * tileSize;

      // 1. Brick body — flat solid fill, seamless (no gap)
      ctx2D.fillStyle = `rgb(${R},${G},${B})`;
      ctx2D.fillRect(x, y, tileSize, tileSize);

      // 2. Stud shadow — composite the cached black mask. Black-over-colour
      //    via source-over yields a same-hue darken; the mask already has
      //    the half-donut shape + soft vertical fade baked in.
      ctx2D.drawImage(shadowMask, x, y);

      // 3. Top-arc highlight — composite the cached white mask. White-over-
      //    colour yields a same-hue brighten; the mask already has its
      //    left/right tips faded out via a horizontal triangular gradient.
      ctx2D.drawImage(highlightMask, x, y);
    }
  }
}

/* ===========================================================================
   VIDEO EXPORT (MediaRecorder + canvas.captureStream)
   ---------------------------------------------------------------------------
   Records one full loop of the active video while the current canvas (either
   the WebGL canvas in 3D mode or the 2D filter canvas) plays. Output format
   is WebM (VP9) or MP4 (H.264), depending on browser support.
   =========================================================================== */

function pickSupportedMimeType(format) {
  const candidates = format === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=h264', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function showVideoExportUIIfApplicable() {
  // Only meaningful when a video is loaded and not currently exporting
  const hasVideo = isMediaLoaded && loadedMediaType === 'video';
  videoExportRow.style.display = hasVideo ? 'flex' : 'none';
}

function setExportProgress(ratio, label) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  videoExportBarFill.style.width = `${pct}%`;
  videoExportProgressText.textContent = label || `Recording ${pct}%`;
}

async function exportVideo() {
  if (isExportingVideo) return;
  if (!isMediaLoaded || loadedMediaType !== 'video' || !loadedMediaElement) {
    alert('Please upload a video first.');
    return;
  }

  const format = videoExportFormat.value === 'mp4' ? 'mp4' : 'webm';
  const mimeType = pickSupportedMimeType(format);
  if (!mimeType) {
    alert(`${format.toUpperCase()} encoding is not supported in this browser. Try the other format.`);
    return;
  }

  const sourceCanvas = (viewMode === '2d') ? canvas2D : webglCanvas;
  const video = loadedMediaElement;
  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 5; // safety fallback
  const fps = 30;

  isExportingVideo = true;
  btnExportVideo.disabled = true;
  videoExportBtnLabel.textContent = 'Recording...';
  videoExportProgress.style.display = 'flex';
  setExportProgress(0, 'Recording 0%');

  // Rewind & restart playback so we capture the full loop from the start
  const wasMuted = video.muted;
  video.pause();
  try {
    video.currentTime = 0;
    // Wait for the seek to settle so the first captured frame is actually t=0
    if (video.seekable && video.seekable.length > 0) {
      await new Promise((res) => {
        const done = () => { video.removeEventListener('seeked', done); res(); };
        video.addEventListener('seeked', done, { once: true });
        // Hard timeout in case 'seeked' never fires on some codecs
        setTimeout(done, 250);
      });
    }
  } catch (_) { /* some streams disallow seeking */ }

  // Capture stream after rewind, so the first frame is t=0
  let stream;
  try {
    stream = sourceCanvas.captureStream(fps);
  } catch (err) {
    cleanupAfterExport();
    alert('Could not capture canvas stream: ' + err.message);
    return;
  }

  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const startedAt = performance.now();
  let progressInterval = null;

  const finish = () => {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
    if (recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) { /* ignore */ }
    }
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `everything-lego-${ts}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setExportProgress(1, 'Saved ✓');
    setTimeout(() => {
      cleanupAfterExport();
      video.muted = wasMuted;
      video.play().catch(() => {});
    }, 800);
  };

  recorder.onerror = (e) => {
    console.error('MediaRecorder error', e);
    cleanupAfterExport();
    alert('Recording failed: ' + (e.error?.message || 'unknown error'));
  };

  // Begin: play video, start recorder, schedule stop at one full loop
  try {
    await video.play();
  } catch (err) {
    cleanupAfterExport();
    alert('Could not start video playback: ' + err.message);
    return;
  }
  recorder.start(100); // collect chunks every 100 ms

  // Progress reporter
  progressInterval = setInterval(() => {
    const elapsed = (performance.now() - startedAt) / 1000;
    setExportProgress(elapsed / duration);
  }, 100);

  // Stop after the full duration (+ small grace period so the last frame lands)
  setTimeout(finish, duration * 1000 + 250);
}

function cleanupAfterExport() {
  isExportingVideo = false;
  btnExportVideo.disabled = false;
  videoExportBtnLabel.textContent = 'Export Video (one loop)';
  setTimeout(() => {
    videoExportProgress.style.display = 'none';
    setExportProgress(0, 'Recording 0%');
  }, 1200);
}

function setViewMode(mode) {
  if (mode !== '2d' && mode !== '3d') return;
  if (viewMode === mode) return;
  viewMode = mode;

  // Toggle pill buttons
  btnMode3D.classList.toggle('active', mode === '3d');
  btnMode2D.classList.toggle('active', mode === '2d');
  btnMode3D.setAttribute('aria-selected', mode === '3d' ? 'true' : 'false');
  btnMode2D.setAttribute('aria-selected', mode === '2d' ? 'true' : 'false');

  if (mode === '2d') {
    webglCanvas.style.display = 'none';
    canvas2D.style.display = 'block';
    resize2DCanvas();
    render2D();
  } else {
    canvas2D.style.display = 'none';
    canvas2DEmpty.style.display = 'none';
    webglCanvas.style.display = 'block';
    // Force a 3D resize so the canvas regrows after being hidden
    onWindowResize();
  }
}

// Reset camera view angle (FOV 10, distance is high to match zoom factor)
function resetCameraPosition() {
  if (mediaMapping && mediaMapping.value === 'heightmap') {
    camera.position.set(20, 25, 50);
  } else {
    camera.position.set(0, 0, 60);
  }
  camera.lookAt(0, 0, 0);
  if (controls) {
    controls.target.set(0, 0, 0);
  }
}

// Update background colors
function updateSceneBackground() {
  const type = sceneBgType.value;
  const valColor = sceneBgColor.value;

  if (type === 'solid') {
    bgColorPickerRow.style.display = 'block';
    scene.background = new THREE.Color(valColor);
    document.querySelector('.canvas-container').style.background = 'none';
  } else if (type === 'gradient') {
    bgColorPickerRow.style.display = 'block';
    scene.background = null; // Let renderer clear transparently
    // Build a radial gradient derived from the picked color
    const { h, s, l } = hexToHSL(valColor);
    const centerL = Math.min(l + 15, 97);
    const edgeL = Math.max(l - 12, 3);
    const centerColor = `hsl(${h}, ${s}%, ${centerL}%)`;
    const edgeColor = `hsl(${h}, ${s}%, ${edgeL}%)`;
    document.querySelector('.canvas-container').style.background =
      `radial-gradient(circle, ${centerColor} 0%, ${edgeColor} 100%)`;
  } else {
    // Transparent mode
    bgColorPickerRow.style.display = 'none';
    scene.background = null;
    document.querySelector('.canvas-container').style.background = 'none';
  }
}

// Convert hex color to HSL values
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// --- Theme Toggle ---
function toggleTheme() {
  const root = document.documentElement;
  const isCurrentlyDark = root.getAttribute('data-theme') === 'dark';
  const newTheme = isCurrentlyDark ? 'light' : 'dark';
  if (newTheme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
  localStorage.setItem('everything-lego-theme', newTheme);

  // Swap 3D scene background to a theme-appropriate cream / ink default
  const newBgColor = newTheme === 'light' ? '#fdfcfc' : '#201d1d';
  sceneBgColor.value = newBgColor;
  bgColorHex.textContent = newBgColor.toUpperCase();

  updateSceneBackground();
}

function loadSavedTheme() {
  const saved = localStorage.getItem('everything-lego-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  // else: default light (cream OpenCode canvas), no attribute needed
}

// --- Step 5: Preset Implementation ---
// ── Color Overlay: recompute material.color = baseMaterialColor × tintColor
// Called by tint picker / reset. baseMaterialColor is refreshed by
// applyMaterialPreset() so the tint always sits on top of the current preset.
function applyColorOverlay() {
  physicalMaterial.color.copy(baseMaterialColor).multiply(tintColor);
  // Sheen tint follows base × tint for consistency on cloth presets
  if (physicalMaterial.sheen > 0 && physicalMaterial.sheenColor) {
    physicalMaterial.sheenColor.copy(physicalMaterial.color);
  }
  physicalMaterial.needsUpdate = true;
  updateVoxelMaterials();
}

// --- Step 6: Handle Custom Uploaded Model (FBX/GLB) ---
function handleCustomFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  showLoader(true);
  loaderProgress.textContent = 'Parsing...';

  // OBJ is text; everything else is binary
  const needsText = (extension === 'obj');

  const finish = (rootObject) => {
    // STL gives us a BufferGeometry; wrap it in a Mesh with the current
    // physicalMaterial so it slots into setupModelInScene like any other.
    if (rootObject && rootObject.isBufferGeometry) {
      rootObject.computeVertexNormals();
      const mesh = new THREE.Mesh(rootObject, physicalMaterial.clone());
      mesh.castShadow = mesh.receiveShadow = true;
      const wrap = new THREE.Group();
      wrap.add(mesh);
      rootObject = wrap;
    }
    setupModelInScene(rootObject);
    autoScaleModel();
    displayProjectName.textContent = `Custom / ${file.name}`;

    // Uploading a custom 3D model means the user wants to focus on THAT
    // model — not the heightmap currently driven by the default sample
    // video. Switch mediaMapping away from 'heightmap' so the Block
    // Effect uses the model voxelizer (and so the original model isn't
    // hidden by the heightmap branch of applyMediaMapping).
    if (mediaMapping.value === 'heightmap') {
      mediaMapping.value = 'none';
      applyMediaMapping();
    }
    // If Block Mode is already on, re-run it now that the new model
    // is in place so the user sees voxels immediately.
    if (blockMode.checked) {
      updateBlockEffect();
    }

    showLoader(false);
  };
  const fail = (err, label) => {
    console.error(`Failed to parse ${label}:`, err);
    loaderProgress.textContent = 'Parse error. Check file.';
    setTimeout(() => showLoader(false), 2000);
  };

  reader.onload = function (e) {
    const contents = e.target.result;
    try {
      if (extension === 'fbx') {
        finish(new FBXLoader().parse(contents, ''));
      } else if (extension === 'glb' || extension === 'gltf') {
        new GLTFLoader().parse(contents, '', (gltf) => finish(gltf.scene), (err) => fail(err, 'GLTF'));
      } else if (extension === 'obj') {
        // OBJLoader.parse(text) → Group
        finish(new OBJLoader().parse(contents));
      } else if (extension === 'stl') {
        // STLLoader.parse(buffer) → BufferGeometry (handles ASCII + binary)
        finish(new STLLoader().parse(contents));
      } else if (extension === '3mf') {
        // 3MF is a ZIP; ThreeMFLoader.parse(buffer) → Group
        finish(new ThreeMFLoader().parse(contents));
      } else {
        loaderProgress.textContent = 'Unsupported format!';
        setTimeout(() => showLoader(false), 2000);
      }
    } catch (err) {
      fail(err, extension.toUpperCase());
    }
  };
  reader.onerror = (err) => fail(err, 'file read');

  if (needsText) reader.readAsText(file);
  else           reader.readAsArrayBuffer(file);
}

// Auto-scale custom models based on bounding boxes
function autoScaleModel() {
  if (!currentModel) return;
  const box = new THREE.Box3().setFromObject(currentModel);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  
  // Target a geometric dimension around 8.0 units in FOV 10 camera
  const targetDimension = 8.0;
  let scale = targetDimension / maxDim;

  // Constrain scale values
  if (scale <= 0) scale = 1.0;
  
  currentModel.scale.set(scale, scale, scale);
  
  // Set scale slider default
  modelScale.value = 1.0;
  valScale.textContent = '1.00';
}

// --- Step 7: Export Actions ---
// Snapshot PNG Capture
function captureScreenshot() {
  let dataURL;

  if (viewMode === '2d') {
    // 2D mode: snapshot the Lego-filter canvas. Re-render synchronously
    // so the latest frame is in the buffer before we read it out.
    render2D();
    dataURL = canvas2D.toDataURL('image/png');
  } else {
    // 3D mode: re-render the WebGL scene to ensure preserveDrawingBuffer
    // has the latest frame, then snapshot the renderer canvas. Composer
    // path is used when post-FX is on so the export matches the screen.
    const anyFxOn = postFxEnabled && composer &&
      ((bloomPass && bloomPass.enabled) ||
       (outlinePass && outlinePass.enabled) ||
       (gtaoPass && gtaoPass.enabled));
    if (anyFxOn) composer.render();
    else         renderer.render(scene, camera);
    dataURL = renderer.domElement.toDataURL('image/png');
  }

  // Trigger download
  const link = document.createElement('a');
  link.download = `everything-lego-render-${Date.now()}.png`;
  link.href = dataURL;
  link.click();
}

// Helper to convert an InstancedMesh to standard Meshes grouped by color inside a THREE.Group for GLB compatibility
function convertInstancedMeshToMesh(instancedMesh, baseName = 'voxel') {
  if (!instancedMesh || instancedMesh.count === 0) return null;

  const count = instancedMesh.count;
  const baseGeometry = instancedMesh.geometry;
  const groupsByColor = {}; // hex -> Array of geometries

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    instancedMesh.getMatrixAt(i, matrix);
    
    if (instancedMesh.instanceColor) {
      instancedMesh.getColorAt(i, color);
    } else {
      color.setRGB(1, 1, 1);
    }

    const hex = color.getHexString().toUpperCase();
    if (!groupsByColor[hex]) {
      groupsByColor[hex] = [];
    }

    const geom = baseGeometry.clone();
    geom.applyMatrix4(matrix);
    groupsByColor[hex].push(geom);
  }

  const exportGroup = new THREE.Group();

  for (const hex in groupsByColor) {
    const geometries = groupsByColor[hex];
    let mergedGeom = null;
    try {
      mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, false);
    } catch (e) {
      console.error(`Failed to merge geometries for color ${hex}:`, e);
      geometries.forEach(g => g.dispose());
      continue;
    }

    // Clean up individual geometries in this group
    geometries.forEach(g => g.dispose());

    if (!mergedGeom) continue;

    // Create material clone for this color
    const material = instancedMesh.material.clone();
    material.color.set('#' + hex);
    material.vertexColors = false; // Disable vertex colors since we set color on the material directly

    const colorMesh = new THREE.Mesh(mergedGeom, material);
    colorMesh.name = `${baseName}_${hex}`;
    exportGroup.add(colorMesh);
  }

  return exportGroup;
}

// Export Scene to GLB File format
function exportToGLB() {
  const isHeightmapMode = (isMediaLoaded && mediaMapping.value === 'heightmap');
  if (!currentModel && !isHeightmapMode) return;

  showLoader(true);
  loaderProgress.textContent = 'Preparing 3D model for export...';

  // Build a temporary group containing all visible meshes
  const exportGroup = new THREE.Group();
  exportGroup.name = "exported_scene";

  const isVoxelizedMode = (!isHeightmapMode && blockMode.checked);

  // Array to keep track of cloned objects/materials/geometries to dispose later
  const tempObjectsToDispose = [];

  const addMergedVoxelMesh = (instancedMesh, name) => {
    if (instancedMesh && instancedMesh.count > 0 && instancedMesh.visible) {
      const mergedMesh = convertInstancedMeshToMesh(instancedMesh, name);
      if (mergedMesh) {
        mergedMesh.name = name;
        exportGroup.add(mergedMesh);
        tempObjectsToDispose.push(mergedMesh);
      }
    }
  };

  const addMergedVoxelMeshToGroup = (instancedMesh, name, parentGroup) => {
    if (instancedMesh && instancedMesh.count > 0 && instancedMesh.visible) {
      const mergedMesh = convertInstancedMeshToMesh(instancedMesh, name);
      if (mergedMesh) {
        mergedMesh.name = name;
        parentGroup.add(mergedMesh);
        tempObjectsToDispose.push(mergedMesh);
      }
    }
  };

  if (isHeightmapMode) {
    // Heightmap mode: export voxelInstancedMesh, voxelPlateInstancedMesh, and voxelStudInstancedMesh
    const shape = blockShape.value;
    const baseName = (shape === 'cube') ? "voxel_cubes" : "voxel_bricks";
    addMergedVoxelMesh(voxelInstancedMesh, baseName);
    addMergedVoxelMesh(voxelPlateInstancedMesh, "voxel_plates");
    addMergedVoxelMesh(voxelStudInstancedMesh, "voxel_studs");
  } else if (isVoxelizedMode) {
    // Voxelized mode: export voxelInstancedMesh and voxelStudInstancedMesh
    const modelGroup = new THREE.Group();
    modelGroup.name = (currentModel && currentModel.name) ? `${currentModel.name}_voxelized` : "voxel_model";
    
    // Copy currentModel's transform to modelGroup
    if (currentModel) {
      modelGroup.position.copy(currentModel.position);
      modelGroup.rotation.copy(currentModel.rotation);
      modelGroup.scale.copy(currentModel.scale);
      modelGroup.updateMatrix();
    }
    
    const shape = blockShape.value;
    const baseName = (shape === 'lego-plate') ? "voxel_plates" : ((shape === 'cube') ? "voxel_cubes" : "voxel_bricks");
    
    addMergedVoxelMeshToGroup(voxelInstancedMesh, baseName, modelGroup);
    addMergedVoxelMeshToGroup(voxelStudInstancedMesh, "voxel_studs", modelGroup);
    
    exportGroup.add(modelGroup);
    tempObjectsToDispose.push(modelGroup);
  } else {
    // Standard model mode (not heightmap, not voxelized)
    if (currentModel) {
      // Clone currentModel
      const clonedModel = currentModel.clone(true);
      
      // Filter out invisible children and any instanced meshes
      const toRemove = [];
      clonedModel.traverse((child) => {
        if (child.isMesh) {
          if (!child.visible || child.isInstancedMesh) {
            toRemove.push(child);
          }
        }
      });
      toRemove.forEach((child) => {
        if (child.parent) {
          child.parent.remove(child);
        }
      });

      exportGroup.add(clonedModel);
      tempObjectsToDispose.push(clonedModel);
    }
  }

  // If there is nothing to export, warn user
  if (exportGroup.children.length === 0) {
    showLoader(false);
    alert('No visible 3D models to export!');
    return;
  }

  const exporter = new GLTFExporter();
  exporter.parse(
    exportGroup,
    (glb) => {
      // Clean up temporary objects
      tempObjectsToDispose.forEach((obj) => {
        obj.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });
      showLoader(false);

      const blob = new Blob([glb], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `everything-lego-model-${Date.now()}.glb`;
      link.click();
    },
    (err) => {
      console.error('Error creating GLB file:', err);
      // Clean up temporary objects
      tempObjectsToDispose.forEach((obj) => {
        obj.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });
      showLoader(false);
      alert('Could not export GLB file!');
    },
    { binary: true, onlyVisible: true }
  );
}

// --- Step 8: Collapsible Sidebar Accordions ---
function setupAccordionControls() {
  const headers = document.querySelectorAll('.control-group-header');
  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const group = header.parentElement;
      const content = group.querySelector('.control-group-content');
      
      if (group.classList.contains('expanded')) {
        // Collapse panel
        content.style.height = content.scrollHeight + 'px';
        // Trigger reflow
        content.offsetHeight; 
        content.style.height = '0px';
        content.style.padding = '0';
        group.classList.remove('expanded');
      } else {
        // Expand panel
        group.classList.add('expanded');
        content.style.padding = '18px';
        content.style.height = content.scrollHeight + 'px';
        
        // Remove hardcoded height after animation completes for responsiveness
        setTimeout(() => {
          if (group.classList.contains('expanded')) {
            content.style.height = 'auto';
          }
        }, 300);
      }
    });
  });
}

// Loader wrapper
function showLoader(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

// Handle Window Resizing
function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  // Post-FX composer + its passes need the same size
  if (composer)   composer.setSize(w, h);
  if (bloomPass)  bloomPass.setSize(w, h);
  if (outlinePass)outlinePass.setSize(w, h);
  if (gtaoPass)   gtaoPass.setSize(w, h);
  // Also keep the 2D filter canvas in sync — even when hidden, so a future
  // switch to 2D mode renders at the right resolution immediately.
  resize2DCanvas();
  if (viewMode === '2d') render2D();
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  // Perf-mode frame cap — bail early on excess rAF ticks (144Hz → ~60Hz).
  // Subtract 1ms tolerance so we don't drop occasional frames to 30Hz on
  // displays whose refresh interval doesn't divide cleanly into 16.67ms.
  if (perfMode) {
    const now = performance.now();
    if (now - lastFrameTime < PERF_FRAME_MS - 1) return;
    lastFrameTime = now;
  }

  // ----- 2D filter mode: bypass the entire Three.js pipeline -----
  if (viewMode === '2d') {
    // For video, re-render at ~30fps. Static images draw once on mode/slider
    // changes — no need to redraw every frame.
    if (isMediaLoaded && loadedMediaType === 'video' && !loadedMediaElement.paused) {
      const now = performance.now();
      if (now - last2DRenderTime > 33) {
        // Keep sidebar preview alive
        mediaPreviewCanvas.width = 60;
        mediaPreviewCanvas.height = 60;
        mediaPreviewCtx.drawImage(loadedMediaElement, 0, 0, 60, 60);
        render2D();
        last2DRenderTime = now;
      }
    }
    return;
  }

  // Update controls
  controls.update();

  // Real-time video updates for voxel grids and sidebar preview
  if (isMediaLoaded && loadedMediaElement) {
    if (loadedMediaType === 'video' && !loadedMediaElement.paused) {
      // 1. Update live preview in sidebar
      mediaPreviewCanvas.width = 60;
      mediaPreviewCanvas.height = 60;
      mediaPreviewCtx.drawImage(loadedMediaElement, 0, 0, 60, 60);

      // 2a. Update real-time voxel colours on a 3D-model voxelization
      //     (only meaningful when Block Mode is on and mapping is 'model')
      if (blockMode.checked && mediaMapping.value === 'model') {
        if (voxelInstancedMesh) {
          sampleOffscreenCanvas();

          if (voxelKeys && voxelKeys.length > 0) {
            for (let i = 0; i < voxelKeys.length; i++) {
              const key = voxelKeys[i];
              const uv = voxelUVMap.get(key);
              if (uv) {
                let colorToUse = getSampledPixelColor(uv.x, uv.y);
                if (blockLegoSnap.checked) {
                  colorToUse = snapToLegoColor(colorToUse);
                }
                voxelInstancedMesh.setColorAt(i, colorToUse);
                if (voxelStudInstancedMesh) {
                  voxelStudInstancedMesh.setColorAt(i, colorToUse);
                }
              }
            }
            if (voxelInstancedMesh.instanceColor) {
              voxelInstancedMesh.instanceColor.needsUpdate = true;
            }
            if (voxelStudInstancedMesh && voxelStudInstancedMesh.instanceColor) {
              voxelStudInstancedMesh.instanceColor.needsUpdate = true;
            }
          }
        }
      }

      // 2b. Update heightmap voxels from the latest video frame.
      //     Independent of Block Mode — heightmap is its own display mode.
      if (mediaMapping.value === 'heightmap') {
        updateBlockHeightmap();
      }
    }
  }

  // Keep the outline selection live — covers cases where a model is
  // uploaded, text is added, or voxel meshes are rebuilt mid-session.
  // The work is O(few scene roots) so re-syncing every frame is trivial.
  if (outlinePass && outlinePass.enabled) refreshOutlineSelection();

  // Draw scene — through EffectComposer if post-FX is enabled and any
  // pass is active, otherwise straight to the renderer (cheaper, skips
  // unnecessary FBO swaps when all effects are off).
  const anyFxOn = postFxEnabled && composer &&
    ((bloomPass && bloomPass.enabled) ||
     (outlinePass && outlinePass.enabled) ||
     (gtaoPass && gtaoPass.enabled));
  if (anyFxOn) composer.render();
  else         renderer.render(scene, camera);
}

// Start Project
loadSavedTheme(); // Restore theme before init so CSS variables are ready
init().then(() => animate()).catch((err) => {
  console.error('Init failed:', err);
});
