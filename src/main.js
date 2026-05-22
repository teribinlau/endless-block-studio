import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
const presetCards = document.querySelectorAll('.preset-card');

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
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
  transparent: parseFloat(materialTransmission.value) > 0,
  depthWrite: true,
});

// Material Presets Parameter Configs
const materialPresets = {
  plastic: {
    roughness: 0.5,
    metalness: 0.0,
    transmission: 0.0,
    thickness: 0.0,
    ior: 1.5,
    color: '#ffffff'
  },
  'frosted-glass': {
    roughness: 0.45,
    metalness: 0.0,
    transmission: 0.9,
    thickness: 10.0,
    ior: 1.52,
    color: '#ffffff'
  },
  terracotta: {
    roughness: 0.95,
    metalness: 0.0,
    transmission: 0.0,
    thickness: 0.0,
    ior: 1.5,
    color: '#ffffff'
  },
  ruby: {
    roughness: 0.15,
    metalness: 0.0,
    transmission: 0.95,
    thickness: 15.0,
    ior: 1.77,
    color: '#e0115f'
  },
  metal: {
    roughness: 0.1,
    metalness: 1.0,
    transmission: 0.0,
    thickness: 0.0,
    ior: 1.5,
    color: '#ffffff'
  }
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
      mat.transparent = physicalMaterial.transmission > 0;
      mat.needsUpdate = true;
    }
  });
}

// Function to apply preset settings to controls and global material
function applyMaterialPreset(presetKey) {
  const preset = materialPresets[presetKey];
  if (!preset) return;

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

  physicalMaterial.roughness = preset.roughness;
  physicalMaterial.metalness = preset.metalness;
  physicalMaterial.transmission = preset.transmission;
  physicalMaterial.thickness = preset.thickness;
  physicalMaterial.ior = preset.ior;
  physicalMaterial.color.set(preset.color);
  physicalMaterial.transparent = preset.transmission > 0;
  physicalMaterial.needsUpdate = true;

  updateVoxelMaterials();
}

// Key directional light and hemi sky light
let dirLight, hemiLight, fillLight, rimLight, ambientLight;

// --- Step 1: Initialize Three.js Environment ---
function init() {
  // 1. Scene Setup
  scene = new THREE.Scene();
  updateSceneBackground();

  // 2. Camera Setup (FOV 10 degrees from metadata)
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(10, aspect, 0.1, 1000);
  resetCameraPosition();
  infoFov.textContent = `${camera.fov}°`;

  // 3. Renderer Setup
  renderer = new THREE.WebGLRenderer({
    canvas: webglCanvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true // Required for capturing screenshots
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
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

  // 6. PMREM Procedural Environment Reflection Map
  pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  generateProceduralEnvironment();

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

  canvasTexture.dispose();
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

      // Load default heightmap as initial startup view
      loadDefaultHeightmap();
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
      loadDefaultHeightmap();
    }
  );
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

  // Apply materials and count meshes/vertices
  currentModel.traverse((child) => {
    if (child.isMesh) {
      child.material = physicalMaterial;
      child.castShadow = true;
      child.receiveShadow = true;
      
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

// --- LEGO Color Palette: 24 colors covering standard, Earth, and pastel tones
// to ensure snapped colors match uploaded images with high fidelity.
const LEGO_PALETTE = [
  new THREE.Color('#FFFFFF'), // White
  new THREE.Color('#1B2A34'), // Black
  new THREE.Color('#9BABAC'), // Light Grey / Medium Stone Grey
  new THREE.Color('#5C5C5C'), // Dark Grey / Dark Stone Grey
  new THREE.Color('#C91A09'), // Red
  new THREE.Color('#0055BF'), // Blue
  new THREE.Color('#F2CD37'), // Yellow
  new THREE.Color('#237841'), // Green
  new THREE.Color('#184632'), // Dark Green
  new THREE.Color('#F57D11'), // Orange
  new THREE.Color('#58251B'), // Reddish Brown
  new THREE.Color('#DFB17B'), // Tan / Brick Yellow
  new THREE.Color('#5A93DB'), // Medium Blue
  new THREE.Color('#F45C96'), // Bright Pink
  new THREE.Color('#E1A6E8'), // Lavender
  new THREE.Color('#92397F'), // Magenta
  new THREE.Color('#BBE90B'), // Lime Green
  new THREE.Color('#708E7A'), // Sand Green
  new THREE.Color('#0D325B'), // Dark Blue
  new THREE.Color('#008F9B'), // Dark Turquoise / Teal
  new THREE.Color('#CC8E56'), // Medium Nougat / Light Brown
  new THREE.Color('#7C905C'), // Olive Green
  new THREE.Color('#9FC3E9'), // Sky Blue / Bright Light Blue
  new THREE.Color('#35211B'), // Dark Brown
];

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
        const voxelGeom = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
        
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

          // Determine color
          let colorToUse = baseColor.clone();
          if (isMediaLoaded && mediaMapping.value === 'model') {
            const uv = voxelUVMap.get(key);
            if (uv) {
              colorToUse = getSampledPixelColor(uv.x, uv.y);
            }
            if (blockLegoSnap.checked) {
              colorToUse = snapToLegoColor(colorToUse);
            }
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
function voxelizeMesh(model, resolution) {
  voxelUVMap.clear();
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

  const addVoxel = (p, uv) => {
    const x = Math.floor((p.x - min.x) / voxelSize);
    const y = Math.floor((p.y - min.y) / voxelSizeY);
    const z = Math.floor((p.z - min.z) / voxelSize);
    const key = `${x},${y},${z}`;
    voxels.add(key);
    voxelUVMap.set(key, uv);
  };

  model.traverse((child) => {
    if (child.isMesh && !child.isInstancedMesh && child.geometry) {
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

  // 7. Preset Selection
  presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      presetCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      applyPreset(card.getAttribute('data-preset'));
    });
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
function loadDefaultHeightmap() {
  loaderProgress.textContent = 'Loading heightmap...';
  
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

  loadedMediaType = 'image';
  mediaTypeBadge.textContent = 'IMAGE';
  mediaVideoControls.style.display = 'none';
  
  const img = new Image();
  img.src = '/default-heightmap.png';
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

    // Show status bar and set filename
    mediaInfoWrapper.style.display = 'block';
    mediaFilename.textContent = 'default-heightmap.png';

    // Uploaded image becomes the scene's primary subject — auto-switch to heightmap.
    mediaMapping.value = 'heightmap';
    applyMediaMapping();
    resetCameraPosition();
    
    showLoader(false);
  };
  img.onerror = (err) => {
    console.error('Error loading default heightmap image:', err);
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
  if (neededBricks > 0) {
    const brickGeomHeight = (shape === 'lego') ? brickH : boxSize;
    const needsRecreate = !voxelInstancedMesh || 
      !voxelInstancedMesh.userData.isHeightmap ||
      voxelInstancedMesh.userData.shape !== shape ||
      voxelInstancedMesh.userData.gapPercent !== gapPercent ||
      voxelInstancedMesh.userData.voxelSize !== voxelSize ||
      brickCapacity < neededBricks;

    if (needsRecreate) {
      clearInstancedMesh(voxelInstancedMesh);
      brickCapacity = Math.max(512, Math.round(neededBricks * 1.2));
      const voxelGeom = new THREE.BoxGeometry(boxSize, brickGeomHeight, boxSize);
      const voxelMat = physicalMaterial.clone();

      voxelInstancedMesh = new THREE.InstancedMesh(voxelGeom, voxelMat, brickCapacity);
      voxelInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(brickCapacity * 3), 3);
      voxelInstancedMesh.userData = {
        isHeightmap: true,
        shape: shape,
        gapPercent: gapPercent,
        voxelSize: voxelSize
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
      plateCapacity < neededPlates;

    if (needsRecreate) {
      clearInstancedMesh(voxelPlateInstancedMesh);
      plateCapacity = Math.max(512, Math.round(neededPlates * 1.2));
      const plateGeom = new THREE.BoxGeometry(boxSize, plateH, boxSize);
      const plateMat = physicalMaterial.clone();

      voxelPlateInstancedMesh = new THREE.InstancedMesh(plateGeom, plateMat, plateCapacity);
      voxelPlateInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(plateCapacity * 3), 3);
      voxelPlateInstancedMesh.userData = {
        isHeightmap: true,
        shape: shape,
        gapPercent: gapPercent,
        voxelSize: voxelSize
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

function render2D() {
  if (viewMode !== '2d') return;

  const w = canvas2D.clientWidth;
  const h = canvas2D.clientHeight;

  // Background fill (matches CSS bg)
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

  // Fit the grid inside the viewport with breathing room
  const margin = 32;
  const availW = w - 2 * margin;
  const availH = h - 2 * margin;
  const tileSize = Math.max(2, Math.floor(Math.min(availW / cols, availH / rows)));
  const gridW = tileSize * cols;
  const gridH = tileSize * rows;
  const offsetX = Math.round((w - gridW) / 2);
  const offsetY = Math.round((h - gridH) / 2);

  // Stud geometry
  const studR = tileSize * 0.36;
  const highlightLineW = Math.max(1.5, studR * 0.13);
  const highlightR = studR * 0.93;
  // Top-arc spans ~120° centred on 12 o'clock (Canvas angles: 3π/2 is up).
  const arcStart = Math.PI * 7 / 6;   // ≈ 210°
  const arcEnd   = Math.PI * 11 / 6;  // ≈ 330°

  const useSnap = blockLegoSnap.checked; // optional; defaults checked

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1 || 1);
      const v = r / (rows - 1 || 1);
      const a = getSampledPixelAlpha(u, v);
      if (a < 0.1) continue;

      let col = getSampledPixelColor(u, v);
      if (useSnap) col = snapToLegoColor(col);

      const R = Math.max(0, Math.min(255, Math.round(col.r * 255)));
      const G = Math.max(0, Math.min(255, Math.round(col.g * 255)));
      const B = Math.max(0, Math.min(255, Math.round(col.b * 255)));

      // Same-hue brighter (toward white) and darker (toward black) variants
      const hR = Math.min(255, R + Math.round((255 - R) * 0.32));
      const hG = Math.min(255, G + Math.round((255 - G) * 0.32));
      const hB = Math.min(255, B + Math.round((255 - B) * 0.32));
      const dR = Math.round(R * 0.40);
      const dG = Math.round(G * 0.40);
      const dB = Math.round(B * 0.40);

      const x = offsetX + c * tileSize;
      const y = offsetY + r * tileSize;
      const cxp = x + tileSize / 2;
      const cyp = y + tileSize / 2;

      // 1. Brick body — flat solid fill, seamless (no gap)
      ctx2D.fillStyle = `rgb(${R},${G},${B})`;
      ctx2D.fillRect(x, y, tileSize, tileSize);

      // 2. Bottom shadow inside the stud area — same-hue darker, vertical
      //    linear gradient from transparent (top) to dark (bottom), clipped
      //    to the stud circle.
      ctx2D.save();
      ctx2D.beginPath();
      ctx2D.arc(cxp, cyp, studR, 0, Math.PI * 2);
      ctx2D.clip();

      const grad = ctx2D.createLinearGradient(cxp, cyp - studR * 0.25, cxp, cyp + studR);
      grad.addColorStop(0, `rgba(${dR},${dG},${dB},0)`);
      grad.addColorStop(1, `rgba(${dR},${dG},${dB},0.88)`);
      ctx2D.fillStyle = grad;
      ctx2D.fillRect(x, y, tileSize, tileSize);
      ctx2D.restore();

      // 3. Top-arc highlight — bright same-hue stroke covering ~120° of
      //    the upper rim of the circle.
      ctx2D.strokeStyle = `rgb(${hR},${hG},${hB})`;
      ctx2D.lineWidth = highlightLineW;
      ctx2D.beginPath();
      ctx2D.arc(cxp, cyp, highlightR, arcStart, arcEnd);
      ctx2D.stroke();
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
  const isCurrentlyLight = root.getAttribute('data-theme') === 'light';
  const newTheme = isCurrentlyLight ? 'dark' : 'light';
  root.setAttribute('data-theme', newTheme);
  localStorage.setItem('everything-lego-theme', newTheme);

  // Swap background color to a theme-appropriate default
  const newBgColor = newTheme === 'light' ? '#d8d8e2' : '#1a1a24';
  sceneBgColor.value = newBgColor;
  bgColorHex.textContent = newBgColor.toUpperCase();

  // Update the 3D scene background to match the new theme
  updateSceneBackground();
}

function loadSavedTheme() {
  const saved = localStorage.getItem('everything-lego-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  // else: default dark, no attribute needed
}

// --- Step 5: Preset Implementation ---
const presetsMap = {
  'glass-green': {
    color: '#77FF00',
    roughness: 0.49,
    metalness: 1.00,
    transmission: 1.00,
    thickness: 20.0,
    ior: 2.55,
  },
  'liquid-chrome': {
    color: '#E0E0E0',
    roughness: 0.10,
    metalness: 1.00,
    transmission: 0.00,
    thickness: 0.0,
    ior: 1.50,
  },
  'ruby-red': {
    color: '#FF003C',
    roughness: 0.15,
    metalness: 0.20,
    transmission: 1.00,
    thickness: 15.0,
    ior: 1.85,
  },
  'ceramic-matte': {
    color: '#F9F6F0',
    roughness: 0.85,
    metalness: 0.00,
    transmission: 0.00,
    thickness: 0.0,
    ior: 1.00,
  },
  'matte-black': {
    color: '#111115',
    roughness: 0.05,
    metalness: 0.90,
    transmission: 0.40,
    thickness: 25.0,
    ior: 2.40,
  },
  'gold-glitch': {
    color: '#FFE600',
    roughness: 0.20,
    metalness: 1.00,
    transmission: 0.00,
    thickness: 0.0,
    ior: 1.50,
  }
};

function applyPreset(presetKey) {
  const config = presetsMap[presetKey];
  if (!config) return;

  // 1. Update UI Elements
  materialPreset.value = 'custom';

  materialRoughness.value = config.roughness;
  valRoughness.textContent = config.roughness.toFixed(2);

  materialMetalness.value = config.metalness;
  valMetalness.textContent = config.metalness.toFixed(2);

  materialTransmission.value = config.transmission;
  valTransmission.textContent = config.transmission.toFixed(2);

  materialThickness.value = config.thickness;
  valThickness.textContent = config.thickness.toFixed(1);

  materialIor.value = config.ior;
  valIor.textContent = config.ior.toFixed(2);

  // 2. Apply config directly to physicalMaterial
  physicalMaterial.color.set(config.color);
  physicalMaterial.roughness = config.roughness;
  physicalMaterial.metalness = config.metalness;
  physicalMaterial.transmission = config.transmission;
  physicalMaterial.thickness = config.thickness;
  physicalMaterial.ior = config.ior;
  
  // Set transparent state correctly based on transmission
  physicalMaterial.transparent = config.transmission > 0;
  physicalMaterial.needsUpdate = true;

  // 3. Sync to existing voxels
  updateVoxelMaterials();
}

// --- Step 6: Handle Custom Uploaded Model (FBX/GLB) ---
function handleCustomFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  showLoader(true);
  loaderProgress.textContent = 'Parsing...';

  reader.onload = function (e) {
    const contents = e.target.result;

    if (extension === 'fbx') {
      const loader = new FBXLoader();
      try {
        const fbx = loader.parse(contents, '');
        setupModelInScene(fbx);
        
        // Auto-scale custom model to fit view nicely
        autoScaleModel();
        
        displayProjectName.textContent = `Custom / ${file.name}`;
        showLoader(false);
      } catch (err) {
        console.error('Failed to parse uploaded FBX model:', err);
        loaderProgress.textContent = 'Parse error. File corrupted?';
        setTimeout(() => showLoader(false), 2000);
      }
    } else if (extension === 'glb' || extension === 'gltf') {
      const loader = new GLTFLoader();
      try {
        loader.parse(contents, '', (gltf) => {
          setupModelInScene(gltf.scene);
          
          // Auto-scale custom model
          autoScaleModel();

          displayProjectName.textContent = `Custom / ${file.name}`;
          showLoader(false);
        }, (err) => {
          console.error('Failed parsing GLB scene:', err);
          loaderProgress.textContent = 'Parse error. Check file.';
          setTimeout(() => showLoader(false), 2000);
        });
      } catch (err) {
        console.error('GLTF parser exception:', err);
        loaderProgress.textContent = 'Error parsing file.';
        setTimeout(() => showLoader(false), 2000);
      }
    } else {
      loaderProgress.textContent = 'Unsupported format!';
      setTimeout(() => showLoader(false), 2000);
    }
  };

  reader.readAsArrayBuffer(file);
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
  // Re-render immediately to capture clean buffer
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL('image/png');

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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Also keep the 2D filter canvas in sync — even when hidden, so a future
  // switch to 2D mode renders at the right resolution immediately.
  resize2DCanvas();
  if (viewMode === '2d') render2D();
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

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

  // Draw scene
  renderer.render(scene, camera);
}

// Start Project
loadSavedTheme(); // Restore theme before init so CSS variables are ready
init();
animate();
