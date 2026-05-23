Wood PBR texture set — driven by the "Wood (木头 · PBR)" preset.

Three files are loaded from this folder at app startup:

──────────────────────────────────────────────────────────────────
  Required filename               Map type
──────────────────────────────────────────────────────────────────
  Wood_Albedo.jpg                 Diffuse colour (sRGB)
  Wood_Normal.jpg                 Tangent-space normal map
  Wood_Ambient_Occlusion.jpg      AO (single channel grayscale)
──────────────────────────────────────────────────────────────────

Notes
- Filenames are case-sensitive on web servers.
- Albedo is treated as sRGB; the other two as linear.
- All three wrap with RepeatWrapping + 4× anisotropic filtering.
- AO is bound to UV channel 0 (aoMap.channel = 0) so the brick
  BoxGeometry's single UV set drives it — no second UV needed.
- Any missing file silently leaves the corresponding map empty;
  the preset still applies, just without that channel.

To swap to a different wood set, just replace these three files —
no code changes required. The cache rebuilds on next page load.
