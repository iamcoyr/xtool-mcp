# The xTool `.xcs` file format — reverse-engineered

Sources studied (source code read directly, not summaries):

- `github.com/whodafloater/xtool_xcs` — Python module that generates `.xcs` files (targets xTool D1); FreeCAD Path post-processors. Files: `xtool_xcs.py`, `xtoolxcs_post.py`, `xtoolgcode_post.py`, `UtilsXTool.py`, `test_cuts.py`, `xcstest.py`, `notes`, `job_xtoolD1_3mm_cardboard.json`.
- `github.com/kgiszewski/xToolMerge` — C# CLI that reads two real `.xcs` files (produced by actual xTool Creative Space) and merges them. Files under `src/Xcs/`: `XcsReader.cs`, `XcsWriter.cs`, `XcsMergeService.cs`, `Models/*.cs`.
- `github.com/jonzkys/xtool-color-testing` ("xcs-gen") — production Python/TypeScript app that generates `.xcs` (and a newer zip-based `.xs`) test-grid files for metal-tagging color calibration on the xTool F2 Ultra family. Files: `src/xcs_gen/model.py`, `builder.py`, `machines.py`, `pulse_width.py`, `laser_indices.py`, `xcs_v2/*.py`, `web/src/types.ts`, plus **real sample `.xcs` fixtures** in `samples/`.
- Real, valid `.xcs` sample JSON fixtures (from xcs-gen's `samples/` directory, produced by actual xTool Creative Space / Studio, not by the repo's own generator): `samples/xcs/sizes_ex.xcs`, `samples/Square-Line-Text.xcs`, `samples/xcs/test-text.xcs`.
- `github.com/AdvancedResearchConsulting/xtool-utilities` — Python SVG-extraction utility, tested against files "saved from xTool Studio v1.3.6" (README + `convert_xcs_to_svg.py`, corroborating evidence only).

All local mirrors of the above live under `/agent/workspace/research/src/{whodafloater,xtoolmerge,xcs-gen,xtool-utilities}/`.

---

## 1. Prose description of the format

**`.xcs` is plain, uncompressed JSON — not a zip/archive.** This is confirmed independently three ways: whodafloater's Python generator calls `json.dump(xcs, outfile, ...)` directly to the `.xcs` file; xToolMerge's C# `XcsWriter.WriteAsync` calls `JsonSerializer.Serialize(model)` and writes the text directly; and three real `.xcs` sample files pulled from xcs-gen's repository parse cleanly with a plain `json.load()`. A `.xcs` file can be opened in a text editor and is human-readable JSON (whitespace/minified depending on which app wrote it).

The file has one top-level JSON object with keys covering: a project identity/version block (`canvasId`, `version`, `created`, `modify`, `ua`, `meta`, `cover`, `projectTraceID`, and in newer samples `name`/`projectID`), a `canvas` array (in every real-world sample and every generator observed, this array has exactly one element — the schema is technically an array but the ecosystem treats "one project = one canvas" as an invariant), a machine-identity pair (`extId` / `extName`), and a `device` object that carries the machine's power capability plus **all processing/laser parameters for every shape in the file** (parameters are not stored on the shape itself — they live in a separate, parallel structure inside `device.data`, keyed by shape id).

**Shapes ("displays") live inside `canvas[0].displays`** as an array of objects. Each display has a `type` (`RECT`, `LINE`, `CIRCLE`, `PATH`, `PEN`, `TEXT`, `BITMAP`) and a large common set of transform/paint fields (`x`, `y`, `angle`, `scale`, `skew`, `pivot`, `width`, `height`, `lineColor`, `fillColor`, `isFill`, `groupTag`, `zOrder`, etc.), plus a handful of type-specific fields (`dPath` for `PATH`, `endPoint` for `LINE`, `text`/`style` for `TEXT`, `base64` for `BITMAP`).

**Processing parameters (power/speed/passes/etc.) live in `device.data`, not on the display object.** `device.data` is `{"dataType": "Map", "value": [...]}` — an array of `[canvasId, {...}]` pairs. This is the JSON serialization of a JavaScript `Map` object (xTool Creative Space is an Electron/web app; a `Map`'s `[key, value]` iteration order serializes to an array-of-2-element-arrays, and the app writes that shape verbatim instead of converting to a plain object). Inside each pair's second element there's a `mode` (`"LASER_PLANE"` for normal laser-plane engrave/cut jobs, `"RELIEF_PROCESS"` for 3D relief carving), a `data` object keyed by that mode name (holding canvas-wide settings like material id and thickness), and a nested `displays` object — **which is itself another Map-shaped `{"dataType":"Map","value":[...]}`**, this time an array of `[displayId, {...}]` pairs. Each of those inner pairs is where the actual per-shape processing lives: `type`, `isFill`, `processingType` (the "mode" — `VECTOR_CUTTING`, `VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `FILL_VECTOR_ENGRAVING`, `INTAGLIO`, `COLOR_ENGRAVE`), and a `data` object keyed by that same processing type, containing `materialType: "customize"` and a `parameter.customize` block with the actual power/speed/repeat/dpi/density/pulseWidth/mopaFrequency fields.

This two-level "Map of Map" indirection was the single most confusing part of the format and is independently confirmed by three sources agreeing on the exact same shape: the xToolMerge C# `XcsReader.cs` explicitly comments "now we have to parse the wonky format where the first element is the id and the second is the object" and implements exactly this unwrapping, twice (once for `device.data.value`, once for the nested `displays.value`); the Python `xtool_xcs.py`'s `device_encode()` builds the identical shape by hand (`canvas_ops.append((c.id, canvas_op))` and `procmap.append(list((e.id, e.process)))`); and every real sample `.xcs` file inspected has this exact nesting.

**Coordinates are in millimeters, origin top-left.** whodafloater's code has an explicit comment: "x, y positions the upper left corner of the objects bounding box." `width`/`height` are also mm. No explicit unit-declaration key exists anywhere in the JSON — units are implicit/hardcoded by convention (every mm-scale example — 10, 20, 40, 80 — treats the numbers as millimeters, and xcs-gen's code comments say things like "physical size in mm" directly on the dataclass fields).

**Vector paths use an SVG-like path-data string** (`dPath`, an absolute-coordinate SVG `d`-attribute string, e.g. `"m19 18.5-.5.5-16.3 7.2..."` or `"M100 100 c -3 -20 13 7 10 10 v 20 h -5 Z"`), not a raw point array. `PATH` also carries an empty `points: []` and `graphicX`/`graphicY` (both `0.0` in every case observed — an internal-editor offset, not something a generator needs to set meaningfully). `PEN` elements (only seen in the older whodafloater Python API, not in xcs-gen or the real samples) use `points` (array of `{x,y}`) plus a `controlPoints` dict for bezier handles, and default to an open (`isClosePath: False`) polyline. `LINE` doesn't use path data at all — it's `x`,`y` (start point) plus `width` = length, `height` ≈ `0.001` (a hairline height, not literally zero), `angle` (rotation), and `endPoint: {x, y}` giving the line's vector.

**Rectangles (`RECT`) and circles (`CIRCLE`)** are simple bounding-box shapes: `x`,`y` = top-left of the bbox, `width`/`height` = size (for `CIRCLE`, `width`/`height` = diameter, not radius). `CIRCLE` has one non-obvious invariant, discovered and explicitly documented by xcs-gen against multiple real samples (`circles.xcs`, `eng-angle.xcs`, `shape.xcs`): `scale.x` and `scale.y` are NOT `{1,1}` like other shapes — they must equal `width / 5900` (`height / 5900`). xcs-gen's code comment states an earlier attempt that emitted `scale = diameter/40` opened in Studio but rendered "as a broken/empty shape — it does not draw unless the 5900 invariant holds." This is a real risk for anyone hand-building a `.xcs` circle.

**Text (`TEXT`)** carries a `text` string and a `style` object (`fontFamily`, `fontSubfamily`, `fontSource`, `fontSize`, `letterSpacing`, `leading`, `align`, and in newer Studio versions also `curveX`/`curveY`/`isUppercase`/`isWeld`/`direction`/`writingMode`/`textOrientation`). Real Studio-produced `TEXT` displays additionally carry `fontData`, `charJSONs`, and `fillRule` — internal font-rendering/glyph-cache data that a generator can very likely omit or leave empty/null, since it's derived, but this has not been proven safe by direct testing.

**Bitmap/raster images (`BITMAP`)** embed the image as a base64 **data URL** in a `base64` field (e.g. `"data:image/png;base64,iVBOR..."` — note this is the full data-URL string, not raw base64), plus `originWidth`/`originHeight` (source pixel dimensions), `scale` (computed as `displayed_mm / origin_px`), `dpi` (`{dpiX, dpiY}`, derived as `origin_px * 25.4 / displayed_mm`), and a large family of image-adjustment fields (`filterList`, `grayValue: [0,255]`, `sharpness`, `brightness`, `contrast`, `saturation`, `temperature`, `tone`, `colorInverted`, `filterAttrsMap` with per-filter sub-settings for emboss/halftone/binary/sketch/dot). `BITMAP` elements use a distinct processing type, `COLOR_ENGRAVE`, which is otherwise schema-identical to the vector-shape processing type `COLOR_FILL_ENGRAVE`.

**Device/material references are NOT a lookup into a shared external preset library inside the file itself.** Every parameter (power, speed, etc.) is written out in full, inline, under `materialType: "customize"` — i.e. the file is fully self-contained and does not merely reference a named preset by id that Studio would need to resolve externally. `device.materialList` exists as a field but is empty (`[]`) in every example seen; it appears to be a slot for saved/favorited presets rather than something a minimal cut file needs populated. The *machine* itself is identified by exactly two top-level string fields, `extId` (the machine's internal model code, e.g. `"D1"`, `"F1"`, `"GS004-CLASS-4"` for F2 Ultra) and `extName` (its human-readable name, e.g. `"F2 Ultra"`) — both are simple free-text-like identifiers, not object references. `device.power` gives the laser's rated wattage(s) as either a single int (`10` in the D1 example) or, on multi-laser machines, an array ordered `[fiber, blue, uv]` (e.g. `[60, 40]` for F2 Ultra's 60W fiber + 40W diode). The per-canvas `mode.data.LASER_PLANE` block additionally carries a `material` id (an internal numeric code, e.g. `1323` for "Stainless Steel" reverse-engineered from a real sample) and a `thickness` (mm, used for autofocus).

**"Mode" (cut vs. score vs. vector engrave vs. fill engrave) is the `processingType` string on the per-display device entry, not a separate "layer" concept.** The confirmed values are `VECTOR_CUTTING` (cut), `VECTOR_ENGRAVING` (vector/line engrave — this is also used for plain "score" style low-power vector passes, since the format has no distinct "SCORE" processingType — score is just `VECTOR_ENGRAVING` with different power/speed), `COLOR_FILL_ENGRAVE` (filled/raster engrave of a vector shape, e.g. rasterizing a filled rectangle), `FILL_VECTOR_ENGRAVING` (a hybrid — fills with the raster-engrave hatch algorithm but is applied to path/vector geometry — distinct key with almost the same parameter set as `COLOR_FILL_ENGRAVE` plus `needGapNumDensity`/`enableDelayPerLine`/`outlineTrace`), `INTAGLIO` (relief/3D depth-mapped engraving — carries z-axis fields `sliceNumber`, `zLayers`, `zDecline`, `zAxisMove`, `processAngle`), and `COLOR_ENGRAVE` (the `BITMAP`-specific twin of `COLOR_FILL_ENGRAVE`). Processing is attached **per-element** (each display id gets its own entry in the `displays` Map inside `device.data`), so different shapes in the same file can have completely different modes/parameters; there is no "layer" object that groups several shapes under one shared parameter set in the JSON itself — grouping for *editing* convenience is a separate mechanism (`groupTag`, a string shared by multiple displays, used by the UI's group-select/move behavior, unrelated to processing).

**Exact parameter key names (all inside `device.data.value[i][1].displays.value[j][1].data.<PROCESSING_TYPE>.parameter.customize`):**
- `power` — number, 0–100(-ish), the power percentage. NOTE: the Python whodafloater API and a real Studio sample both show power values as low as `1`; the field is a plain number and its practical range depends on the machine/laser (float or int, both seen).
- `speed` — number, mm/s.
- `repeat` — integer, number of passes. (The xcs-gen TypeScript wire-level `PARAM_NAMES` and `BaseParams` interface instead call this `passes` at their HTTP-API layer, but the field is renamed to `repeat` by the time it is written into the actual `.xcs` JSON — this is confirmed by both the Python `add_process(proc_type, power, speed, repeat)` signature and the real sample's `"repeat": 1`. So: **use `repeat` in the file itself**, not `passes`.)
- `density` — integer, lines per cm (only for raster/fill modes: `INTAGLIO`, `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE`). Confirmed physically meaningful: `line_spacing_mm = 10 / density`.
- `dpi` — integer (e.g. `500`), fill-engrave scan resolution (only for `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` — NOT present on `VECTOR_ENGRAVING`/`VECTOR_CUTTING`/plain `INTAGLIO`).
- `pulseWidth` — integer, nanoseconds, MOPA fiber-laser pulse width. Present on every processing type observed (`INTAGLIO`, `VECTOR_ENGRAVING`, `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE`, `VECTOR_CUTTING`). **Only a fixed, discrete set of values is accepted by real firmware**: `{2, 4, 6, 9, 13, 20, 30, 45, 60, 80, 100, 150, 200, 250, 350, 500}` ns (xcs-gen's `pulse_width.py`: "The laser head only accepts these exact pulse-width values (ns). Anything else we send gets rejected by the machine firmware without warning"). Irrelevant/ignored on non-fiber (diode-only) lasers but still present with a default value in every sample.
- `mopaFrequency` — integer, kHz, MOPA pulse repetition frequency (e.g. `65`). Present alongside `pulseWidth` on the same set of processing types.
- `processingLightSource` — string, `"red"` or `"blue"` (per xcs-gen's own comment: `"red"` = the MOPA/fiber laser, `"blue"` = the diode laser — a real machine-registry naming choice, not colloquial English "which laser color", so do not assume "red" always means a visible-red diode). `"uv"` also exists as a device-registry laser kind (F2 Ultra UV) but was not observed as a `processingLightSource` value in any sample studied.
- `bitmapEngraveMode` — string, `"normal"` (raster modes only: `INTAGLIO`, `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE`).
- `bitmapScanMode` — string, `"zMode"` (bidirectional/zigzag, default) or `"oneWay"` (unidirectional — slower, avoids backlash artifacts on fine detail).
- `scanAngle` — number, degrees, starting raster scan angle (90 = vertical, default).
- `angleType` — integer, `1` = fixed angle every pass, `2` = incremental (Studio rotates the angle between passes). Only meaningful when `repeat > 1`.
- `crossAngle` — boolean, adds a 90°-rotated companion stroke per pass.
- `enableKerf` / `kerfDistance` — boolean / number(mm); kerf (cut-width) compensation, on `VECTOR_ENGRAVING`, `FILL_VECTOR_ENGRAVING`, `VECTOR_CUTTING`.
- `VECTOR_CUTTING`-only extras: `cuttingDrop` (bool), `sinkingMethod` (`"one"`), `firstCuttingDropValue`/`cuttingDropValue`/`descentPerStep` (mm), `descentIntervalDescent` (int), `enableBreakPoint`/`breakPointGenMode`/`breakPointSize`/`breakPointCount`/`breakPointMode`/`breakPointDistance`/`breakPointPower` (tab/bridge-break settings so a cut piece doesn't fall out), `wobbleEnable`/`wobbleDiameter`/`wobbleSpacing` (a "wobble"/circular-dither cut technique for effectively widening a thin beam kerf).
- `INTAGLIO`-only (relief/3D) extras: `sliceNumber` (int, e.g. `100`), `processAngle` (degrees, e.g. `15`), `zAxisMove` (bool), `zLayers` (int), `zDecline` (mm, e.g. `0.01`).

None of `power`/`speed`/`repeat`/`pulseWidth`/`mopaFrequency`/`processingLightSource` are optional-looking in any sample — every processing-type block, regardless of mode, carries at least those.

**Version differences (v1 single-file JSON vs. "xcs_v2" vs. Studio):** The task asked specifically about "XCS v1 vs v2 vs Studio." Having now read the `xcs_v2` Python submodule in xcs-gen directly, the picture is clearer and more specific than initially suspected:
- There is exactly **one on-disk JSON schema for the single-file `.xcs` format** — the one described above. Every source studied (whodafloater targeting D1 firmware `~v1.1–1.5`, xToolMerge reading files from an unspecified but "real" Creative Space version, and xcs-gen's real samples carrying `"version": "1.7.24"` and `"minRequiredVersion": "2.6.0"`) writes/reads this same top-level shape. Field names are stable; what changes release-to-release is (a) the `version`/`minRequiredVersion` strings themselves, (b) additive fields that appear in newer Studio output but are absent from older/simpler generator output (e.g. real samples have `name`, `sourceId`, `hidden`, `fontData`, `charJSONs`, `fillRule`, `radius`/`maxRadius` on `RECT`, layer/group data directly on the canvas object as `layerData`/`groupData` — none of which whodafloater's simpler 2023-era D1 generator emits), and (c) which `processingType` values a given machine/firmware pair actually accepts (e.g. `INTAGLIO`/relief modes only make sense on machines with that capability, like F2 Ultra, not D1).
- **`xcs_v2` / `.xs` is a genuinely DIFFERENT CONTAINER FORMAT, not a newer version of the single-file JSON schema.** This was the most important open question and is now conclusively resolved by reading `xcs_gen/xcs_v2/writer.py` directly: `.xs` ("xcs-workspace-v2") is a **ZIP archive** (built with Python's `zipfile.ZipFile`, `ZIP_DEFLATED`) containing *multiple* JSON member files: a `.format` marker file containing the literal bytes `v2`, `meta/persistence-meta.json`, `project.json`, `profiles.json`, `devices/device-<id>.json`, `canvases/<id>.json`, `canvases/<id>/displays-0.json`, plus optional `vectors/svg/*.svg` and `resources/*.png` for de-duplicated/large geometry and images. The code's own docstrings state this directly: `writer.py`'s module docstring calls it "an xcs-workspace-v2 (`.xs`) ZIP bundle" and the `OutputFormat` TypeScript type literally documents `"xs (the default) returns a ZIP; xcs returns the legacy single-file XCS JSON."` **The task at hand — generating `.xcs` files programmatically — should target the single-file JSON format** described in this document; `.xs`/v2 is a separate, more complex multi-file bundle format that appears to be how a newer Studio version internally organizes/persists a project (possibly for larger projects, with content-addressed dedup of repeated vector paths and images), and is out of scope unless the target software specifically requires `.xs`.
- Both formats encode the *same logical data* — the v2 code explicitly reuses the *exact same* per-element display-builder functions (`_build_rect_display`, `_build_path_display`, `_build_circle_display`, `build_bitmap_display`) and the *exact same* `_build_processing_data()` parameter-block builder from the legacy/v1 module (`xcs_gen/builder.py`) — it just re-arranges where those JSON fragments physically live (split across multiple files inside a zip, with a "profile" indirection layer between displays and their parameters, instead of everything embedded in one file). So everything this document says about parameter field names (`power`, `speed`, `repeat`, `pulseWidth`, `mopaFrequency`, `dpi`, `density`, processing-type names, etc.) is directly reusable if a future v2/`.xs` writer is ever needed — it is a repackaging of the same fields, not a redesign of them.
- "XCS Studio" (the newer desktop/Electron app name, vs. the older "Creative Space" branding) is very likely the tool version that introduced the `.xs`/v2 workspace format, but this could not be confirmed with direct version-string evidence in the sources read.

---

## 2. Field tables

### 2.1 Top-level object

| Key | Type | Meaning | Example |
|---|---|---|---|
| `canvasId` | string (UUID) | Id of the (sole) canvas; duplicated as `canvas[0].id` and as the key of the single entry in `device.data.value`. | `"01f033f8-6d9b-4ea1-8a1f-7e12bcaae55e"` |
| `canvas` | array of canvas objects | The project's drawing surface(s). Every real-world file and generator observed has exactly 1 entry. | see §2.2 |
| `extId` | string | Machine model code. Written to the file and echoed inside `device.id`/`device.extId`. | `"D1"`, `"F1"`, `"GS004-CLASS-4"` (F2 Ultra) |
| `extName` | string | Machine human-readable name. | `"F2 Ultra"` |
| `device` | object | Machine identity + ALL per-shape processing parameters (see §2.4). | see §2.4 |
| `version` | string | Studio/app version that wrote the file. | `"1.1.19"`, `"1.6.6"`, `"1.7.24"` |
| `created` | integer (ms epoch) | Project creation timestamp. | `1750000000000` |
| `modify` | integer (ms epoch) | Last-modified timestamp. | `1750000000000` |
| `ua` | string | User-agent-like string identifying the writing app/browser. | `"xcs-gen/0.1.0"` or a full Electron/Chrome UA string for real Studio |
| `meta` | array | Unstructured metadata slot; empty (`[]`) in every sample seen. | `[]` |
| `cover` | string | Data-URL of a thumbnail/cover image (PNG). | `"data:image/png;base64,iVBOR..."` |
| `minRequiredVersion` | string | Minimum Studio version required to open the file. | `"2.6.0"` |
| `appMinRequiredVersion` | string | Same, desktop-app-specific; often empty. | `""` |
| `webMinRequiredVersion` | string | Same, web-app-specific; often empty. | `""` |
| `projectTraceID` | string (UUID) | Analytics/telemetry trace id for the project. | `"a1b2c3..."` |
| `name` | string | Project display name. **Only seen in real Studio samples, not in whodafloater/xcs-gen generator output** — likely optional/safe to omit. | `"sizes_ex"` |
| `projectID` | string | A second UUID-ish project identifier, distinct from `projectTraceID`/`canvasId`. **Only seen in real Studio samples.** Purpose/redundancy with `projectTraceID` unconfirmed. | (UUID) |

### 2.2 Canvas object (`canvas[0]`)

| Key | Type | Meaning | Example |
|---|---|---|---|
| `id` | string (UUID) | Must match top-level `canvasId`. | |
| `title` | string | Panel/tab label shown in Studio's UI. | `"{panel}1"` |
| `displays` | array of display objects | The shapes on this canvas. See §2.3. | |
| `hidden` | boolean | Canvas visibility. **Real-sample-only field**, not in either generator; safe default `false`. | `false` |
| `layerData` | object, keyed by hex color | UI "layer" grouping metadata (name/order/visible) per distinct `layerColor` used by displays. Cosmetic/organizational — not required for processing to work, since processing is per-display, not per-layer. | `{"#000000": {"name":"#000000","order":1,"visible":true}}` |
| `groupData` | object | UI group metadata; empty (`{}`) in every sample. | `{}` |
| `extendInfo` | object | Canvas-format-version + grid/ruler UI settings. Sub-fields: `version` (canvas-format version string, e.g. `"2.15.108"`), `minCanvasVersion`, `displayProcessConfigMap`, `rulerPluginData.rulerGuide` (array), `type` (`"2d"`), `gridOptions` (`{color, isShow}`). | |
| `chunkLayout` | object | **Real-sample-only.** Pagination metadata for very large projects: `displayCount`, `chunkCount`, `chunkIndexes`. Safe to omit for a small generated file. | |

### 2.3 Display (shape) object — common fields (all types)

| Key | Type | Meaning | Example |
|---|---|---|---|
| `id` | string (UUID) | Unique shape id; referenced by `device.data`'s nested displays-Map key. | |
| `name` | string or null | User-facing shape name/label. Safe to set `null`. | `null` |
| `type` | string enum | `RECT` \| `LINE` \| `CIRCLE` \| `PATH` \| `PEN` \| `TEXT` \| `BITMAP`. | `"RECT"` |
| `x`, `y` | number (mm) | Top-left of the shape's bounding box. Origin is canvas top-left. | `20`, `20` |
| `angle` | number (degrees) | Rotation. `0` = unrotated. | `0` |
| `scale` | `{x:number, y:number}` | Scale factors. `{1,1}` for most shapes; **CIRCLE requires `width/5900`** (see §1). | `{"x":1,"y":1}` |
| `skew` | `{x:number, y:number}` | Shear. `{0,0}` typical. | |
| `pivot` | `{x:number, y:number}` | Transform pivot offset. `{0,0}` typical. | |
| `localSkew` | `{x:number, y:number}` | Second skew field (distinct from `skew` in the schema; both present, both `{0,0}` typically). | |
| `offsetX`, `offsetY` | number | In every sample/generator observed, equal to `x`/`y`. | |
| `lockRatio` | boolean | UI aspect-ratio-lock toggle. `false` for RECT/LINE/PATH, `true` for CIRCLE/BITMAP. | |
| `isClosePath` | boolean | Whether the outline is a closed loop. `true` for RECT/CIRCLE, `false` for LINE, caller-specified for PATH/PEN. | |
| `zOrder` | integer | Stacking order / draw order (also drives per-display processing order). | `1` |
| `groupTag` | string (UUID) | Shared id linking multiple displays into one UI-selectable group. Omit or use a distinct UUID per ungrouped shape. | |
| `groupTags` | array | **Real-sample/xcs-gen field**, plural companion to `groupTag`; empty array `[]` when ungrouped. | `[]` |
| `layerTag`, `layerColor` | string (hex color) | The shape's assigned "layer" (cosmetic grouping, keyed into canvas `layerData`). | `"#00befe"` |
| `visible`, `visibleState` | boolean | Shape visibility (two near-duplicate fields both present in real output). | `true` |
| `lockState` | boolean | Locked-for-editing flag. | `false` |
| `originColor` | string (hex) | Original/reference color before any layer recoloring. | `"#000000"` |
| `enableTransform` | boolean | Whether the shape can be transformed in the UI. | `true` |
| `resourceOrigin` | string | Provenance tag for imported resources; empty for native shapes. | `""` |
| `customData` | object | Free-form; observed sub-keys `from.officialMaterialId` (int), `tabBreaks` (object), `startPoint` (object). Safe to emit as mostly-empty. | |
| `rootComponentId` | string | Component/symbol-instance linkage; empty for simple shapes. | `""` |
| `minCanvasVersion` | string | Minimum canvas-format version this shape requires. | `"0.0.0"` |
| `alpha` | number | Shape opacity, 0–1. | `1` |
| `fill` | object | `{paintType:"color", visible:bool, color:int, alpha:number}` — this is the UI *stroke-panel* fill toggle, largely redundant with `isFill`/`fillColor` below. | |
| `stroke` | object | `{paintType, visible, color, alpha, width, cap, join, miterLimit, alignment}` — UI stroke-panel settings, distinct from `lineColor`. | |
| `effects` | array | UI filter/effect stack; empty `[]` typically. | `[]` |
| `width`, `height` | number (mm) | Bounding-box size (diameter for CIRCLE). | `40`, `40` |
| `isFill` | boolean | Whether the shape is rendered filled (drives which `processingType` values make sense, e.g. fill-engrave modes). | `true` |
| `lineColor` | integer | Packed color (not hex string) for the outline, e.g. `0x551100`. | `0` or `16421416` |
| `fillColor` | string OR integer | **Inconsistent across sources**: whodafloater's Python emits an int (`0x777777`); xcs-gen/real samples emit a hex string (`"#000000"`, `"#f9932b"`). Both apparently accepted; prefer the hex-string form to match modern real output. | `"#000000"` |
| `sourceId` | string (UUID) | **Real-sample-only.** Distinct from `id`; purpose unconfirmed (possibly links back to an original imported-resource id). Safe to omit. | |

### 2.3.1 Type-specific extra fields

| Type | Extra key(s) | Type | Meaning / example |
|---|---|---|---|
| `LINE` | `endPoint` | `{x,y}` | End-point vector of the line relative to `x,y`. `width` doubles as line length, `height` is a near-zero hairline (`0.001`), not `0`. |
| `PATH` | `dPath` | string | SVG-like path-data (`d` attribute) string, absolute coordinates in bed-mm. E.g. `"M100 100 c -3 -20 13 7 10 10 v 20 h -5 Z"`. |
| `PATH` | `points` | array | Present but empty (`[]`) whenever `dPath` is used. |
| `PATH` | `graphicX`, `graphicY` | number | Internal editor offset; `0.0` in every sample. |
| `PATH` | `isCompoundPath` | boolean | Whether the path has multiple sub-paths/holes. |
| `PATH` | `fillRule` | string | `"evenodd"` or `"nonzero"` — SVG fill-rule for compound paths. |
| `PEN` | `points` | array of `{x,y}` | Polyline vertices (older/simpler API only — not seen in xcs-gen or real samples; may be a legacy or Studio-internal-only type). |
| `PEN` | `controlPoints` | dict | Bezier control-handle data keyed by vertex index. |
| `TEXT` | `text` | string | The literal text content. |
| `TEXT` | `resolution` | number | Text rendering resolution (older whodafloater API only). |
| `TEXT` | `style` | object | `fontFamily`, `fontSubfamily`, `fontSource` (`"build-in"` for bundled fonts), `fontSize`, `letterSpacing`, `leading`, `align`; newer Studio adds `curveX`/`curveY`/`isUppercase`/`isWeld`/`direction`/`writingMode`/`textOrientation`. |
| `TEXT` | `fontData`, `charJSONs`, `fillRule` | (varies) | **Real-Studio-only**, internal glyph/font-cache data. Purpose/necessity for a generator unconfirmed — may be safely omittable since it's presumably re-derivable from `text`+`style`, but not verified. |
| `CIRCLE` | (no extra keys; uses common `width`/`height`/`scale` — see the 5900-divisor invariant in §1) | | |
| `BITMAP` | `base64` | string (data URL) | `"data:image/png;base64,..."` — full data-URL, not raw base64. |
| `BITMAP` | `originWidth`, `originHeight` | integer | Source image pixel dimensions. |
| `BITMAP` | `dpi` | `{dpiX, dpiY}` | Derived: `originPx * 25.4 / displayed_mm`. |
| `BITMAP` | `filterList`, `filterList_V2` | array | Applied-filter stack; empty `[]` for an unmodified image. |
| `BITMAP` | `grayValue` | `[int,int]` | Black/white point remap, default `[0,255]` (no remap). |
| `BITMAP` | `sharpness`, `brightness`, `contrast`, `saturation`, `temperature`, `tone` | number | Image-adjustment sliders (0 = unmodified, except `sharpness` default `50`). |
| `BITMAP` | `colorInverted`, `colorInvertedFillTransparent` | boolean | Invert / invert-with-transparency toggles. |
| `BITMAP` | `colorInvertedTransparentColor` | string | e.g. `"black"` — literal color-name string, not hex, per real-sample evidence. |
| `BITMAP` | `filterAttrsMap` | object | Per-filter settings, e.g. `{"emboss":{"strength":5},"halftone":{"radius":4,"angle":45},"binary":{"threshold":128},"sketch":{"strength":2},"dot":{"angle":45,"scale":14}}`. |
| `BITMAP` | `mask`, `originAutoAdjust` | null | Observed always `null`. |
| `BITMAP` | `isGray`, `autoStrength`, `opacity` | boolean/number | Grayscale flag, auto-adjust strength, layer opacity. |
| `BITMAP` | `modifyData`, `currentUrl` | object/string | Internal edit-history/source-url bookkeeping; empty in generated output. |

### 2.4 `device` object (machine identity + all processing parameters)

| Key | Type | Meaning | Example |
|---|---|---|---|
| `id` | string | Same value as top-level `extId` in the simplest generators; real Studio samples instead use `"<extId>-1"` (e.g. `"GS004-CLASS-4-1"`). Both forms observed as accepted. | `"MD1"` (whodafloater's own convention) or `"D1"` or `"GS004-CLASS-4-1"` |
| `deviceCode` | string | **Real-sample-only**, duplicates `extId`. | `"GS004-CLASS-4"` |
| `extId` | string | Duplicate of top-level `extId`, inside the device object too. | |
| `extName` | string | Duplicate of top-level `extName`. | |
| `power` | integer OR array of integers | Single-laser machines: plain int wattage (`10` for D1). Multi-laser machines: `[fiber_W, blue_W, uv_W]` ordered array, entries only for lasers the machine actually has (e.g. `[60, 40]` for F2 Ultra's fiber+blue). | `10` or `[60, 40]` |
| `data` | object, `{dataType:"Map", value: [...]}` | The Map-of-canvases → per-canvas mode+processing. See §2.5. | |
| `materialList` | array | Saved/favorited material presets; empty `[]` in every sample studied. | `[]` |
| `materialTypeList` | array | **Real-sample/xcs-gen-only.** Empty `[]`. | `[]` |
| `customProjectData` | object | Free-form; empty `{}`. | `{}` |

### 2.5 `device.data.value[i]` — one `[canvasId, canvasProcessing]` pair

| Key (inside `canvasProcessing`, the pair's 2nd element) | Type | Meaning | Example |
|---|---|---|---|
| `mode` | string | `"LASER_PLANE"` (standard 2D laser job) or `"RELIEF_PROCESS"` (3D relief). | `"LASER_PLANE"` |
| `data` | object, keyed by the `mode` string | Canvas-wide settings for that mode. For `LASER_PLANE`: `material` (int, internal material-id code — e.g. `1323` = Stainless Steel, `0` = unset/generic), `lightSourceMode` (`"blue"`/`"red"`), `thickness` (mm, `null` if unset — used for autofocus), `isProcessByLayer` (bool), `pathPlanning` (`"auto"`), `fillPlanning` (`"separate"`), `dreedyTsp` (bool — sic, likely a typo for "greedy TSP" toolpath ordering), `avoidSmokeModal` (bool), `scanDirection` (`"topToBottom"`), `enableOddEvenKerf` (bool), `xcsUsed` (array). Older/simpler whodafloater form is much smaller: just `{material, thickness, LASER_PLANE:{material,thickness,diameter,perimeter}}`. | |
| `displays` | object, `{dataType:"Map", value: [...]}` | The Map of per-shape processing entries. See §2.6. | |

### 2.6 `displays.value[j]` — one `[displayId, processingEntry]` pair

| Key (inside `processingEntry`) | Type | Meaning | Example |
|---|---|---|---|
| `type` | string | Echo of the display's `type` (`RECT`/`PATH`/`CIRCLE`/`BITMAP`/etc.) — must match the display it's paired with. | `"RECT"` |
| `isFill` | boolean | Echo of the display's `isFill`. | `true` |
| `processingType` | string enum | The **mode**: `VECTOR_CUTTING` \| `VECTOR_ENGRAVING` \| `COLOR_FILL_ENGRAVE` \| `FILL_VECTOR_ENGRAVING` \| `INTAGLIO` \| `COLOR_ENGRAVE`. | `"VECTOR_CUTTING"` |
| `processIgnore` | boolean | If `true`, Studio skips this shape when running the job (a "disable this layer" toggle). `false` normally. | `false` |
| `isWhiteModel` | boolean | **Real-sample/xcs-gen-only.** Purpose unconfirmed from source alone (name suggests a material-preview/simulation toggle); every sample sets `true`. | `true` |
| `sourceId` | string (UUID) | **Real-sample-only**, distinct id, purpose unconfirmed (parallel to the display-level `sourceId`). | |
| `data` | object, keyed by processing-type name(s) | The actual parameter block(s) — see §2.7. Real samples can carry MULTIPLE processing-type keys simultaneously (e.g. both `INTAGLIO` and `VECTOR_ENGRAVING` present on one shape) even though only the one matching `processingType` is "active" — this looks like Studio preserving the other modes' last-used settings so switching modes in the UI doesn't lose them. A minimal generator only needs to emit the one active key. | |

### 2.7 `data.<PROCESSING_TYPE>.parameter.customize` — the actual laser parameters

Common envelope around every processing-type block:
```
"<PROCESSING_TYPE>": {
  "materialType": "customize",
  "planType": "blue",              // real-sample-only; "blue" or "red" depending on light source
  "parameter": { "customize": { ...fields below... } }
}
```

| Key | Type | Applies to | Meaning | Example |
|---|---|---|---|---|
| `power` | number | all | Power, percent-ish scale. | `100`, `1`, `50.0` |
| `speed` | number | all | Speed, mm/s. | `6`, `80`, `1000` |
| `repeat` | integer | all | Number of passes. | `1`, `2` |
| `processingLightSource` | string | all | `"red"` (fiber/MOPA) or `"blue"` (diode). | `"blue"` |
| `pulseWidth` | integer (ns) | all | MOPA pulse width; only these exact values are firmware-legal: `2,4,6,9,13,20,30,45,60,80,100,150,200,250,350,500`. | `200` |
| `mopaFrequency` | integer (kHz) | all | MOPA pulse repetition frequency. | `65` |
| `density` | integer (lines/cm) | `INTAGLIO`, `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | Raster line density. `line_spacing_mm = 10/density`. | `100` |
| `dpi` | integer | `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | Fill-engrave scan resolution. | `500` |
| `dotDuration` | integer | `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | Per-dot burn duration (raster dwell). | `100` |
| `bitmapEngraveMode` | string | raster modes | `"normal"`. | `"normal"` |
| `bitmapScanMode` | string | raster modes | `"zMode"` (bidirectional, default) or `"oneWay"`. | `"zMode"` |
| `scanAngle` | number (deg) | `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | Starting raster angle; `90` = vertical. | `90` |
| `angleType` | integer | `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | `1` = fixed, `2` = incremental across passes. | `1` |
| `crossAngle` | boolean | `FILL_VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | Add a 90°-companion stroke per pass. | `false` |
| `notResize` | boolean | `COLOR_FILL_ENGRAVE`, `COLOR_ENGRAVE` | UI resize-lock during raster fill. | `true` |
| `needGapNumDensity` | boolean | `FILL_VECTOR_ENGRAVING` only | Density-gap calc toggle. | `true` |
| `delayPerLine`, `enableDelayPerLine` | number(ms)/bool | `FILL_VECTOR_ENGRAVING` only | Per-scan-line dwell delay. | `0.3`, `false` |
| `outlineTrace` | boolean | `FILL_VECTOR_ENGRAVING` only | Trace shape outline in addition to fill. | `false` |
| `enableKerf`, `kerfDistance` | bool / number(mm) | `VECTOR_ENGRAVING`, `FILL_VECTOR_ENGRAVING`, `VECTOR_CUTTING` | Kerf-width compensation. | `false`, `0` |
| `sliceNumber` | integer | `INTAGLIO` | Z-depth slice count for relief. | `100` |
| `processAngle` | number(deg) | `INTAGLIO` | Relief raster angle. | `15` |
| `zAxisMove` | boolean | `INTAGLIO` | Whether the head physically moves in Z between slices. | `false` |
| `zLayers` | integer | `INTAGLIO` | Number of Z layers. | `1` |
| `zDecline` | number(mm) | `INTAGLIO` | Z step-down per layer. | `0.01` |
| `cuttingDrop`, `sinkingMethod`, `firstCuttingDropValue`, `cuttingDropValue`, `descentIntervalDescent`, `descentPerStep` | bool/string/number | `VECTOR_CUTTING` only | Progressive Z-drop-while-cutting settings (cuts through thick material by lowering the head/table as it goes). | `false`, `"one"`, `0.01`, `0.01`, `1`, `0.01` |
| `enableBreakPoint`, `breakPointGenMode`, `breakPointSize`, `breakPointCount`, `breakPointMode`, `breakPointDistance`, `breakPointPower` | bool/string/number | `VECTOR_CUTTING` only | Tab/bridge-break settings (leaves small uncut bridges so cut pieces don't fall free). | `false`, `"auto"`, `0.5`, `2`, `"count"`, `100`, `0` |
| `wobbleEnable`, `wobbleDiameter`, `wobbleSpacing` | bool/number(mm) | `VECTOR_CUTTING` only | "Wobble" cut technique (small circular dither pattern to widen effective kerf). | `false`, `0.05`, `0.015` |

---

## 3. Minimal annotated example — cut a 40x40mm rectangle on an xTool D1

**This is a best-effort RECONSTRUCTED example**, assembled by hand from the confirmed field tables above (not copy-pasted from any single real source — no real D1 sample file was available to this research, only D1-targeting generator *code*). It follows the D1-targeting whodafloater Python API's exact output shape (simpler/older schema — D1 predates the F2 Ultra-era additive fields like `sourceId`, `isWhiteModel`, `chunkLayout`, `radius`/`maxRadius`, so those are deliberately omitted here) plus the universally-confirmed common display fields from every source. Values chosen: 40x40mm square, `VECTOR_CUTTING`, power 100, speed 6mm/s, 2 passes (a plausible D1 setting to cut through ~3mm material, per whodafloater's own `test_cuts.py` examples which use similar magnitudes).

```jsonc
{
  // ---- project identity ----
  "canvasId": "c5e1f9a0-0000-4000-8000-000000000001",   // UUID; must equal canvas[0].id AND device.data.value[0][0]
  "version": "1.1.19",                                   // Studio/format version string (whodafloater targets this for D1)
  "extId": "D1",                                          // machine model code (top-level)
  "extName": "D1",                                        // machine display name (best-effort; not directly confirmed at top level for D1 by whodafloater, which omits it — added here for completeness/consistency with newer schema)
  "created": 1752000000000,                               // ms epoch; any recent timestamp is fine
  "modify": 1752000000000,
  "ua": "xcs-mcp-generator/0.1",                           // free-text; identifies the writing tool
  "meta": [],
  "projectTraceID": "b6a2e6a1-0000-4000-8000-000000000002",// any UUID

  "canvas": [
    {
      "id": "c5e1f9a0-0000-4000-8000-000000000001",       // == top-level canvasId
      "title": "{panel}1",                                 // Studio's default panel-tab naming convention
      "displays": [
        {
          // ---- the 40x40mm square, as a RECT display ----
          "id": "d1a1a1a1-0000-4000-8000-000000000003",     // UUID; referenced by device.data's nested displays Map
          "type": "RECT",
          "x": 20, "y": 20,          // top-left corner of the 40x40 bbox, in mm from canvas top-left origin
          "angle": 0,
          "scale": {"x": 1, "y": 1},
          "skew": {"x": 0, "y": 0},
          "pivot": {"x": 0, "y": 0},
          "localSkew": {"x": 0, "y": 0},
          "offsetX": 20, "offsetY": 20,   // conventionally mirrors x/y
          "lockRatio": false,
          "isClosePath": true,            // RECT is always a closed outline
          "zOrder": 0,
          "width": 40, "height": 40,      // the 40x40mm size
          "isFill": false,                 // false = outline-only (appropriate for a CUT, not a fill-engrave)
          "lineColor": 5570304,            // 0x551100 packed int; cosmetic only, any int is fine
          "fillColor": "#777777"           // cosmetic only, unused when isFill=false
          // NOTE: groupTag intentionally omitted (ungrouped single shape) — real Studio
          // output always includes a groupTag/groupTags pair; omitting appears safe for
          // a single ungrouped shape, but this is UNVERIFIED against real D1 firmware.
        }
      ]
    }
  ],

  "device": {
    "id": "MD1",                 // device id; whodafloater's own convention ("M" + extId) for D1
    "power": 10,                 // D1's rated laser wattage (single int for a single-laser machine)
    "materialList": [],
    "data": {
      "dataType": "Map",         // REQUIRED literal marker — signals this array-of-pairs is a serialized JS Map
      "value": [
        [
          "c5e1f9a0-0000-4000-8000-000000000001",   // pair[0] = canvasId (must match canvas[0].id)
          {                                            // pair[1] = this canvas's processing block
            "mode": "LASER_PLANE",
            "data": {
              "LASER_PLANE": {
                "material": 1,        // internal material-id int; 1 = generic/default in whodafloater's simple form
                "thickness": 3,        // material thickness in mm (used for autofocus)
                "diameter": null,
                "perimeter": null
              }
            },
            "displays": {
              "dataType": "Map",       // same Map-marker convention, one level deeper
              "value": [
                [
                  "d1a1a1a1-0000-4000-8000-000000000003",  // pair[0] = the RECT's display id (must match canvas display id)
                  {                                            // pair[1] = that display's processing entry
                    "type": "RECT",           // echoes the display's type
                    "isFill": false,           // echoes the display's isFill
                    "processingType": "VECTOR_CUTTING",   // THE MODE: cut
                    "processIgnore": false,
                    "data": {
                      "VECTOR_CUTTING": {
                        "materialType": "customize",
                        "parameter": {
                          "customize": {
                            "power": 100,             // 100% power
                            "speed": 6,                // 6 mm/s — slow, appropriate for a cut
                            "repeat": 2,                // 2 passes
                            "processingLightSource": "blue",  // D1 is diode-only
                            "pulseWidth": 200,          // MOPA field; irrelevant on D1's diode laser but
                            "mopaFrequency": 65,         // present in every real sample regardless of laser type
                            "enableKerf": false,
                            "kerfDistance": 0
                          }
                        }
                      }
                    }
                  }
                ]
              ]
            }
          }
        ]
      ]
    }
  }
}
```

To cut this same square from a raw shape spec programmatically (pseudocode mirroring whodafloater's actual API):
```python
import xtool_xcs as xt
rect = xt.XcsRect('id').place(20, 20).size(40, 40)
canvas = xt.XcsCanvas()
canvas.add_element(rect)
rect.add_process('VECTOR_CUTTING', power=100, speed=6, repeat=2)
xt.XcsSave('forty_mm_square')   # writes forty_mm_square.xcs
```

---

## 4. Confidence & gaps

**High confidence (directly confirmed by 2+ independent sources, including real Studio-produced sample files):**
- `.xcs` is plain uncompressed JSON, not a zip/archive.
- The overall top-level shape (`canvasId`, `canvas`, `extId`/`extName`, `device`, `version`, `created`/`modify`, `ua`, `meta`, `cover`, `minRequiredVersion`, `projectTraceID`).
- The "Map serialized as array-of-`[id,obj]`-pairs" structure for `device.data.value` and the nested `displays.value` — this exact shape is independently reproduced by hand-written Python, independently parsed by hand-written C#, and present verbatim in real sample files.
- Coordinate origin (top-left of each shape's bbox) and units (millimeters).
- Core parameter field names: `power`, `speed`, `repeat`, `processingLightSource`, `pulseWidth`, `mopaFrequency`, `density`, `dpi` — all confirmed directly inside a real sample's device-processing block, not just generator code.
- The 6 `processingType`/"mode" values (`VECTOR_CUTTING`, `VECTOR_ENGRAVING`, `COLOR_FILL_ENGRAVE`, `FILL_VECTOR_ENGRAVING`, `INTAGLIO`, `COLOR_ENGRAVE`) and their parameter-block differences.
- `PATH` uses an SVG-`d`-attribute-style string (`dPath`), not a raw point array, for its primary geometry encoding.
- `.xs`/`xcs_v2` is a structurally different ZIP-bundle container, NOT a newer version of the single-file JSON — confirmed directly from `xcs_v2/writer.py`'s use of `zipfile.ZipFile` and its own module docstring/type comments.
- The CIRCLE `scale = width/5900` invariant (an easy, non-obvious way to silently produce a broken/invisible circle) — confirmed against multiple real samples by xcs-gen's own code comments.
- The fixed, firmware-enforced `pulseWidth` value set (`2,4,6,9,13,20,30,45,60,80,100,150,200,250,350,500` ns).

**Medium confidence (confirmed in generator/reader code and/or one real sample, but not cross-checked against a second independent implementation):**
- The exact field list for `TEXT` (`style` sub-object) and `BITMAP` (image-adjustment fields) — sourced mainly from xcs-gen's builder plus one real Studio `TEXT` sample; not cross-checked against the C# `DisplayModel` for every single one of these (the C# model has a notably smaller/older field set, suggesting it predates several of these additions).
- The exact `LASER_PLANE.data` canvas-wide settings block for newer machines (`pathPlanning`, `fillPlanning`, `dreedyTsp`, `avoidSmokeModal`, `scanDirection`, `enableOddEvenKerf`, `xcsUsed`) — confirmed only from xcs-gen's builder and not independently cross-verified against a second source, though a real sample's `mode.data` was not directly dumped key-by-key in this research pass to fully confirm every one of these specific sub-keys (time constraint — the RECT/device-entry-level fields were prioritized and fully confirmed instead).
- `device.materialList`/`materialTypeList` semantics — always empty in every sample seen, so their populated shape (what a saved preset actually looks like) is unconfirmed.
- Whether `groupTag`/`groupTags` can be safely omitted entirely for an ungrouped shape, vs. needing a present-but-unique placeholder value — whodafloater's Python omits it conditionally (`if self.groupTag != "": d['groupTag'] = self.groupTag`), but every real Studio-produced sample examined always includes both `groupTag` (a UUID) and `groupTags` (an array) on every display, suggesting modern Studio may expect the keys to always be present even when functionally "ungrouped."

**Low confidence / open gaps (inferred from naming/context only, not confirmed):**
- **`extId`/`extID` casing.** whodafloater's `XcsSave()` function writes the key as `extID` (capital ID); the same repo's `xcstest.py` example and every other source (C# model, xcs-gen builder, real samples) use `extId` (lowercase d). This is a real, unresolved discrepancy in the actual whodafloater source and should be flagged: **use `extId`** (lowercase d) — it's what every other source, including real Studio output, agrees on; `extID` is very likely a bug/typo in that one function.
- **D1-specific real sample.** No real D1-produced `.xcs` sample was found/read in this research; the reconstructed example in §3 is assembled from D1-targeting *generator code* (whodafloater) plus universally-confirmed common fields from other machines' real samples. It is very plausible D1's actual Studio output includes additional fields not present in whodafloater's simplified 2023-era generator (analogous to how the F2 Ultra real samples have many fields absent from even xcs-gen's own from-scratch builder) — e.g. `sourceId`, `groupTags`, `chunkLayout`, `radius`/`maxRadius` on RECT. Treat §3's example as "very likely sufficient to be understood/imported," not "guaranteed byte-identical to what Studio would natively produce."
- **`isWhiteModel` field's actual purpose** — name suggests a material-simulation/preview toggle; not explained in any source's comments, just always set `true`.
- **Whether omitting real-sample-only fields (`name`, `projectID`, `sourceId`, `chunkLayout`, `isWhiteModel`, `deviceCode`, `materialTypeList`, `fontData`/`charJSONs` on TEXT) breaks import in real Studio.** No source tested/confirmed a minimal file lacking these actually opens correctly in current Studio — the two working generator codebases (whodafloater, xcs-gen's legacy `builder.py`) both *omit* several of these fields relative to what real Studio samples contain, and their own repos' test suites (not read in this pass) are the strongest evidence they DO work when opened by real users, but this document did not directly execute or open-in-Studio-verify anything.
- **`power` value range/scale.** Observed values span `1` to `100` in different sources with no explicit min/max documented anywhere; likely 0–100 as a percent, but not explicitly stated as such in any source (inferred from typical laser-cutter UI conventions, not confirmed by a schema/validation constant).
- **Format drift risk.** The real samples used here carry `"version": "1.6.6"`/`"1.7.24"` and `"minRequiredVersion": "2.6.0"` (2025-era xcs-gen/F2-Ultra-targeting), while whodafloater's D1 code was last confirmed working against `"1.2.24"`–`"1.5.10"` (per its own `notes` file, dated through late 2024) — spanning roughly a year and multiple minor versions with only additive (not breaking) field changes observed. There is no strong evidence of *breaking* schema changes across this span, but the trend is clearly additive-only in one direction (more fields over time), so a generator that emits a lean/minimal file (like §3) is betting that Studio's parser tolerates missing optional fields — consistent with everything observed, but not stress-tested against every Studio release.
- **Whether Studio's parser is strict about key order or the exact literal string `"Map"` for `dataType`** (vs. accepting other marker strings) — only `"Map"` was ever observed, so this should be treated as required-exact, not just a convention that happens to be used everywhere.

**Overall confidence for the stated goal (generating `.xcs` files programmatically):** **High** for a single-canvas file containing `RECT`/`PATH`/`CIRCLE`/`LINE` shapes with standard cut/engrave/fill-engrave processing on a diode-laser machine (D1/F1-class) — this is exactly the well-trodden path both whodafloater and xcs-gen's legacy builder already exercise successfully. **Medium** for `TEXT` and `BITMAP` elements (schema is documented above but with fewer independent cross-checks). **Medium-low** for MOPA-specific fields on fiber-laser machines and for `INTAGLIO`/relief processing (documented in detail from a single source lineage — xcs-gen — with one real-sample cross-check, but not independently reproduced by a second codebase the way the core cut/engrave path was).
