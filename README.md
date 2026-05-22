# Everything Lego Studio

A browser-based 3D editor for real-time material editing and voxel/Lego-style remeshing, built with Three.js and Vite.

## Features

- **Material presets** — Glass Green, Chrome, Ruby Glass, Clay, Obsidian, Gold
- **Physical material controls** — color, roughness, metalness, transmission (glass), thickness, IOR, scale
- **Block Effect (voxelize)** — turn any mesh into cubes, Lego bricks, or Lego plates; optional snap-to-Lego-colors
- **Lighting & scene** — key light direction/intensity, hemisphere sky light, solid/gradient/transparent background
- **Custom model import** — drag-and-drop FBX / GLB / GLTF
- **Media mapping** — upload image or video and map it to scene background, model texture, or voxel heightmap
- **Camera** — OrbitControls with auto-rotate and inertia
- **Export** — high-resolution PNG screenshot, or download the scene as `.glb`

## Tech stack

- [Three.js](https://threejs.org/) `0.184`
- [Vite](https://vitejs.dev/) `8`
- [fflate](https://github.com/101arrowz/fflate) for compressed export
- Vanilla JS (no framework)

## Getting started

```bash
npm install
npm run dev      # start dev server
npm run build    # production build to dist/
npm run preview  # preview production build
```

## Project layout

```
everything-lego/
├── index.html         UI shell — left/right sidebars + canvas
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── models/
│       └── model.fbx  default model (Strange 19 Remesh)
└── src/
    ├── main.js        all logic — scene, voxelizer, media, export
    ├── style.css      dark studio UI
    └── assets/        static images
```

## Controls

- **Left-click + drag** — rotate model
- **Right-click + drag** — pan
- **Scroll** — zoom
