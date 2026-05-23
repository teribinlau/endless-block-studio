Wood textures for the "Wood" material preset family.

Drop the 5 files here, renamed exactly as below.
Anything missing falls back to the flat-color base colour automatically.

──────────────────────────────────────────────────────────────────
  Required filename            Source image you shared
──────────────────────────────────────────────────────────────────
  wood_normal.jpg              The purple-blue image (NORMAL MAP)
  wood_oak.jpg                 The warm brown end-grain image
  wood_white_grain.jpg         The white end-grain image (1st)
  wood_tan_plank.jpg           The light tan plank image
  wood_white_plank.jpg         The white plank image
──────────────────────────────────────────────────────────────────

How they map to presets:
  wood          → wood_oak.jpg          + wood_normal.jpg  (warm oak)
  wood-white    → wood_white_plank.jpg  + wood_normal.jpg  (white wood)
  wood-tan      → wood_tan_plank.jpg    + wood_normal.jpg  (light tan)
  wood-end      → wood_oak.jpg          + wood_normal.jpg  (end-grain)
                                                            same base, different UV scale

The normal map is shared across every wood variant — it's the surface
geometry detail; the diffuse map provides the colour & grain pattern.

Notes
- All textures should be ~1024×1024 (or any square seamless size).
- Diffuse files should be sRGB JPGs. Normal map should be a regular
  RGB image (Three.js will treat it as linear automatically when assigned
  to material.normalMap).
- If you only drop wood_normal.jpg + wood_oak.jpg, the "wood" preset
  alone will activate the texture; the other wood-* presets stay flat.
