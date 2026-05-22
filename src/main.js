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
let voxelInstancedMesh = null;
let voxelStudInstancedMesh = null;
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

// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loaderProgress = document.getElementById('loader-progress');
const webglCanvas = document.getElementById('webgl');

// Material Inputs
const materialColor = document.getElementById('material-color');
const colorHex = document.getElementById('color-hex');
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

// Buttons & Interaction
const btnReset = document.getElementById('btn-reset');
const btnScreenshot = document.getElementById('btn-screenshot');
const btnExportGlb = document.getElementById('btn-export-glb');
const modelUpload = document.getElementById('model-upload');
const uploadZone = document.getElementById('upload-zone');
const presetCards = document.querySelectorAll('.preset-card');

// --- Create Global Material ---
// Neon green, refractive glass-like physically based material as defined in metadata
const physicalMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(materialColor.value),
  roughness: parseFloat(materialRoughness.value),
  metalness: parseFloat(materialMetalness.value),
  transmission: parseFloat(materialTransmission.value),
  thickness: parseFloat(materialThickness.value),
  ior: parseFloat(materialIor.value),
  reflectivity: 0.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: true,
});

// Key directional light and hemi sky light
let dirLight, hemiLight;

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
  controls.autoRotate = animAutoRotate.checked;
  controls.autoRotateSpeed = parseFloat(animSpeed.value) * 50.0;
  controls.maxDistance = 150;
  controls.minDistance = 2;

  // 5. Lighting Setup
  hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, parseFloat(hemiIntensity.value));
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

      // Hide loader
      showLoader(false);
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
      showLoader(false);
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
  voxelInstancedMesh = null;
  voxelStudInstancedMesh = null;

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

// --- LEGO Brick Geometry Helpers ---
// No longer needs a merged geometry since box base and studs are rendered as separate InstancedMeshes
// to prevent vertical stretching of studs in heightmap mode.

// --- Official LEGO Color Palette & Snapping ---
const LEGO_PALETTE = [
  new THREE.Color('#C91A09'), // Red
  new THREE.Color('#0055BF'), // Blue
  new THREE.Color('#F2CD37'), // Yellow
  new THREE.Color('#237841'), // Green
  new THREE.Color('#1B2A34'), // Black
  new THREE.Color('#F2F3F2'), // White
  new THREE.Color('#F57D11'), // Orange
  new THREE.Color('#BBE90B'), // Lime Green
  new THREE.Color('#672196'), // Purple
  new THREE.Color('#F4B5CD'), // Pink
  new THREE.Color('#583927'), // Brown
  new THREE.Color('#5F5F5F'), // Dark Grey
  new THREE.Color('#969696'), // Light Grey
  new THREE.Color('#93B8C1'), // Light Blue
  new THREE.Color('#D3A5C5'), // Lavender
  new THREE.Color('#E4CD9E'), // Sand Yellow / Tan
];

function snapToLegoColor(color) {
  let minDistance = Infinity;
  let closestColor = color;
  
  for (let i = 0; i < LEGO_PALETTE.length; i++) {
    const pColor = LEGO_PALETTE[i];
    const dist = Math.sqrt(
      Math.pow(color.r - pColor.r, 2) +
      Math.pow(color.g - pColor.g, 2) +
      Math.pow(color.b - pColor.b, 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestColor = pColor;
    }
  }
  return closestColor;
}

// --- Voxelization (Block Effect) Implementation ---
function updateBlockEffect() {
  if (!currentModel) return;

  // 1. Clear existing voxel mesh if any
  if (voxelInstancedMesh) {
    currentModel.remove(voxelInstancedMesh);
    scene.remove(voxelInstancedMesh);
    if (voxelInstancedMesh.geometry) voxelInstancedMesh.geometry.dispose();
    if (voxelInstancedMesh.material) voxelInstancedMesh.material.dispose();
    voxelInstancedMesh = null;
  }
  if (voxelStudInstancedMesh) {
    currentModel.remove(voxelStudInstancedMesh);
    scene.remove(voxelStudInstancedMesh);
    if (voxelStudInstancedMesh.geometry) voxelStudInstancedMesh.geometry.dispose();
    if (voxelStudInstancedMesh.material) voxelStudInstancedMesh.material.dispose();
    voxelStudInstancedMesh = null;
  }

  // 2. Toggle original mesh visibility based on block mode status
  const active = blockMode.checked;
  currentModel.traverse((child) => {
    if (child.isMesh && child !== voxelInstancedMesh && child !== voxelStudInstancedMesh) {
      child.visible = !active;
    }
  });

  if (active) {
    showLoader(true);
    loaderProgress.textContent = 'Generating Blocks...';
    
    // Ensure world matrix is updated before computing local transforms
    currentModel.updateMatrixWorld(true);

    // Run in timeout to prevent UI freezing
    setTimeout(() => {
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
        
        // Use a clone of physicalMaterial with color white so instance colors are unmodified
        const voxelMat = physicalMaterial.clone();
        voxelMat.color.set('#ffffff');
        
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

        let baseColor = new THREE.Color(materialColor.value);
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
    if (child.isMesh && child !== voxelInstancedMesh) {
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
    if (child.isMesh && child !== voxelInstancedMesh && child.geometry) {
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
          
          sampleTriangle(tempV1, tempV2, tempV3, tempUV1, tempUV2, tempUV3, voxelSize, addVoxel);
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          getVertex(i, tempV1);
          getVertex(i + 1, tempV2);
          getVertex(i + 2, tempV3);
          
          getUV(i, tempUV1);
          getUV(i + 1, tempUV2);
          getUV(i + 2, tempUV3);
          
          sampleTriangle(tempV1, tempV2, tempV3, tempUV1, tempUV2, tempUV3, voxelSize, addVoxel);
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
  
  // 1. Material Inputs
  materialColor.addEventListener('input', (e) => {
    const hexVal = e.target.value;
    colorHex.textContent = hexVal.toUpperCase();
    physicalMaterial.color.set(hexVal);
  });

  materialRoughness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valRoughness.textContent = val.toFixed(2);
    physicalMaterial.roughness = val;
  });

  materialMetalness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valMetalness.textContent = val.toFixed(2);
    physicalMaterial.metalness = val;
  });

  materialTransmission.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valTransmission.textContent = val.toFixed(2);
    physicalMaterial.transmission = val;
  });

  materialThickness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valThickness.textContent = val.toFixed(1);
    physicalMaterial.thickness = val;
  });

  materialIor.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valIor.textContent = val.toFixed(2);
    physicalMaterial.ior = val;
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

  blockResolution.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valBlockResolution.textContent = val;
    triggerBlockUpdate();
  });

  blockGap.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valBlockGap.textContent = `${val}%`;
    triggerBlockUpdate();
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

  mediaHeightScale.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valMediaHeightScale.textContent = val.toFixed(1);
    if (mediaMapping.value === 'heightmap') {
      updateBlockHeightmap();
    }
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
  if (isMediaLoaded && mediaMapping.value === 'heightmap') {
    updateBlockHeightmap();
  } else {
    updateBlockEffect();
  }
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

      // Trigger update
      applyMediaMapping();
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
      
      // Trigger update
      applyMediaMapping();
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
      if (voxelInstancedMesh) {
        scene.remove(voxelInstancedMesh);
        voxelInstancedMesh = null;
      }
      if (voxelStudInstancedMesh) {
        scene.remove(voxelStudInstancedMesh);
        voxelStudInstancedMesh = null;
      }
      if (currentModel) {
        currentModel.traverse(c => {
          if (c.isMesh && c !== voxelInstancedMesh && c !== voxelStudInstancedMesh) c.visible = true;
        });
      }
    }
    mediaHeightScaleRow.style.display = 'none';
    updateBlockEffect();
    return;
  }

  const mappingMode = mediaMapping.value;

  if (mappingMode === 'background') {
    mediaHeightScaleRow.style.display = 'none';
    scene.background = loadedMediaTexture;
    document.querySelector('.canvas-container').style.background = 'none';
    
    // Hide heightmap voxel mesh if active, restore model visibility
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && c !== voxelInstancedMesh && c !== voxelStudInstancedMesh) {
          c.visible = !blockMode.checked;
        }
      });
    }
    updateBlockEffect();
  } else if (mappingMode === 'model') {
    mediaHeightScaleRow.style.display = 'none';
    physicalMaterial.map = loadedMediaTexture;
    physicalMaterial.needsUpdate = true;
    
    // Restore model visibility
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && c !== voxelInstancedMesh && c !== voxelStudInstancedMesh) {
          c.visible = !blockMode.checked;
        }
      });
    }
    updateBlockEffect();
  } else if (mappingMode === 'heightmap') {
    mediaHeightScaleRow.style.display = 'block';
    
    // Hide original meshes completely
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && c !== voxelInstancedMesh && c !== voxelStudInstancedMesh) c.visible = false;
      });
    }
    updateBlockHeightmap();
  } else {
    mediaHeightScaleRow.style.display = 'none';
    if (currentModel) {
      currentModel.traverse(c => {
        if (c.isMesh && c !== voxelInstancedMesh && c !== voxelStudInstancedMesh) {
          c.visible = !blockMode.checked;
        }
      });
    }
    updateBlockEffect();
  }
}

// Generates a 3D heightmap voxel grid from the uploaded media
function updateBlockHeightmap() {
  if (!isMediaLoaded || mediaMapping.value !== 'heightmap') return;

  const resolution = parseInt(blockResolution.value);
  const gapPercent = parseFloat(blockGap.value) / 100.0;
  const shape = blockShape.value;

  // Determine grid dimensions based on media aspect ratio
  let cols, rows;
  if (mediaAspect >= 1.0) {
    cols = resolution;
    rows = Math.max(1, Math.round(resolution / mediaAspect));
  } else {
    cols = Math.max(1, Math.round(resolution * mediaAspect));
    rows = resolution;
  }
  const gridCount = cols * rows;

  const needsRecreate = !voxelInstancedMesh || 
    !voxelInstancedMesh.userData.isHeightmap ||
    voxelInstancedMesh.count !== gridCount ||
    voxelInstancedMesh.userData.shape !== shape ||
    voxelInstancedMesh.userData.gapPercent !== gapPercent;

  const boardWidth = 10.0;
  const voxelSize = boardWidth / resolution;
  const boxSize = voxelSize * (1.0 - gapPercent);
  const heightFactor = (shape === 'lego') ? 1.2 : (shape === 'lego-plate' ? 0.4 : 1.0);
  const boxHeight = boxSize * heightFactor;
  const studRadius = boxSize * 0.3;
  const studHeight = boxSize * 0.2;

  if (needsRecreate) {
    if (voxelInstancedMesh) {
      scene.remove(voxelInstancedMesh);
      if (currentModel) currentModel.remove(voxelInstancedMesh);
      if (voxelInstancedMesh.geometry) voxelInstancedMesh.geometry.dispose();
      if (voxelInstancedMesh.material) voxelInstancedMesh.material.dispose();
      voxelInstancedMesh = null;
    }
    if (voxelStudInstancedMesh) {
      scene.remove(voxelStudInstancedMesh);
      if (currentModel) currentModel.remove(voxelStudInstancedMesh);
      if (voxelStudInstancedMesh.geometry) voxelStudInstancedMesh.geometry.dispose();
      if (voxelStudInstancedMesh.material) voxelStudInstancedMesh.material.dispose();
      voxelStudInstancedMesh = null;
    }

    // Create shape geometry
    const voxelGeom = new THREE.BoxGeometry(boxSize, boxHeight, boxSize);
    let studGeom = null;
    if (shape === 'lego' || shape === 'lego-plate') {
      studGeom = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 16);
    }

    // Use texture-mapped white material for precise color representation
    const voxelMat = physicalMaterial.clone();
    voxelMat.color.set('#ffffff');

    voxelInstancedMesh = new THREE.InstancedMesh(voxelGeom, voxelMat, gridCount);
    voxelInstancedMesh.userData = {
      isHeightmap: true,
      shape: shape,
      gapPercent: gapPercent
    };
    voxelInstancedMesh.castShadow = true;
    voxelInstancedMesh.receiveShadow = true;
    scene.add(voxelInstancedMesh);

    if (studGeom) {
      const studMat = voxelMat.clone();
      voxelStudInstancedMesh = new THREE.InstancedMesh(studGeom, studMat, gridCount);
      voxelStudInstancedMesh.userData = {
        isHeightmap: true,
        shape: shape,
        gapPercent: gapPercent
      };
      voxelStudInstancedMesh.castShadow = true;
      voxelStudInstancedMesh.receiveShadow = true;
      scene.add(voxelStudInstancedMesh);
    }
  }

  // Sample canvas pixels
  sampleOffscreenCanvas();

  const heightScale = parseFloat(mediaHeightScale.value);

  const dummy = new THREE.Object3D();
  const studDummy = new THREE.Object3D();
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1 || 1);
      const v = r / (rows - 1 || 1);

      let pixelColor = getSampledPixelColor(u, v);
      const brightness = 0.299 * pixelColor.r + 0.587 * pixelColor.g + 0.114 * pixelColor.b;

      // Quantize height to discrete layers of bricks/plates
      const layers = Math.max(1, Math.round(brightness * heightScale));

      const posX = (c - cols / 2 + 0.5) * voxelSize;
      const posZ = (r - rows / 2 + 0.5) * voxelSize;
      const posY = (layers * boxHeight) / 2; // Sit on ground

      dummy.position.set(posX, posY, posZ);
      dummy.scale.set(1.0, layers, 1.0);
      dummy.updateMatrix();
      voxelInstancedMesh.setMatrixAt(idx, dummy.matrix);

      if (voxelStudInstancedMesh) {
        const posY_stud = layers * boxHeight + studHeight / 2;
        studDummy.position.set(posX, posY_stud, posZ);
        studDummy.scale.set(1.0, 1.0, 1.0); // Never stretched!
        studDummy.updateMatrix();
        voxelStudInstancedMesh.setMatrixAt(idx, studDummy.matrix);
      }

      if (blockLegoSnap.checked) {
        pixelColor = snapToLegoColor(pixelColor);
      }
      voxelInstancedMesh.setColorAt(idx, pixelColor);
      if (voxelStudInstancedMesh) {
        voxelStudInstancedMesh.setColorAt(idx, pixelColor);
      }
      idx++;
    }
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
  infoVertices.textContent = formatNumber(gridCount * (verticesPerVoxel + extraVertices));
  infoTriangles.textContent = formatNumber(gridCount * (trianglesPerVoxel + extraTriangles));
}

// Offscreen canvas helpers
function sampleOffscreenCanvas() {
  if (!isMediaLoaded || !loadedMediaElement) return;
  samplingCtx.drawImage(loadedMediaElement, 0, 0, samplingCanvas.width, samplingCanvas.height);
  samplingData = samplingCtx.getImageData(0, 0, samplingCanvas.width, samplingCanvas.height);
}

function getSampledPixelColor(u, v) {
  if (!samplingData) return new THREE.Color(0xffffff);
  
  const w = samplingCanvas.width;
  const h = samplingCanvas.height;
  
  // Flip V coordinate to match Canvas coordinate system (Y starts at top)
  const px = Math.max(0, Math.min(w - 1, Math.floor(u * (w - 1))));
  const py = Math.max(0, Math.min(h - 1, Math.floor((1.0 - v) * (h - 1))));
  
  const idx = (py * w + px) * 4;
  
  const r = samplingData.data[idx] / 255;
  const g = samplingData.data[idx + 1] / 255;
  const b = samplingData.data[idx + 2] / 255;
  
  return new THREE.Color(r, g, b);
}

// Reset camera view angle (FOV 10, distance is high to match zoom factor)
function resetCameraPosition() {
  camera.position.set(0, 0, 60);
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
    bgColorPickerRow.style.display = 'none';
    scene.background = null; // Let renderer clear transparently
    // Set modern studio radial background via CSS on canvas container
    document.querySelector('.canvas-container').style.background = 'radial-gradient(circle, #2d2d38 0%, #0d0d12 100%)';
  } else {
    // Transparent mode
    bgColorPickerRow.style.display = 'none';
    scene.background = null;
    document.querySelector('.canvas-container').style.background = 'none';
  }
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
  materialColor.value = config.color;
  colorHex.textContent = config.color.toUpperCase();

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
  link.download = `endless-render-${Date.now()}.png`;
  link.href = dataURL;
  link.click();
}

// Export Scene to GLB File format
function exportToGLB() {
  if (!currentModel) return;

  const exporter = new GLTFExporter();
  
  // Temporarily reset rotation and position for direct export or keep it as is
  exporter.parse(
    currentModel,
    (glb) => {
      const blob = new Blob([glb], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `endless-model-${Date.now()}.glb`;
      link.click();
    },
    (err) => {
      console.error('Error creating GLB file:', err);
      alert('Could not export GLB file!');
    },
    { binary: true }
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
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  // Update controls
  controls.update();

  // Real-time video updates for voxel grids and sidebar preview
  if (isMediaLoaded && loadedMediaElement) {
    if (loadedMediaType === 'video' && !loadedMediaElement.paused) {
      // 1. Update live preview in sidebar
      mediaPreviewCanvas.width = 60;
      mediaPreviewCanvas.height = 60;
      mediaPreviewCtx.drawImage(loadedMediaElement, 0, 0, 60, 60);

      // 2. Update real-time voxels
      if (blockMode.checked && voxelInstancedMesh) {
        if (mediaMapping.value === 'model') {
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
        } else if (mediaMapping.value === 'heightmap') {
          updateBlockHeightmap();
        }
      }
    }
  }

  // Draw scene
  renderer.render(scene, camera);
}

// Start Project
init();
animate();
