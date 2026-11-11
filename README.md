# DRAW! Desktop — v0.1.0

`deskVersion1.0` is the first desktop version, built with Tauri 2. The existing retro drawing interface runs in a standalone window. Drawing and filters work offline; AI tools still require a network connection and your own Volcano Ark API key.

## Desktop workflow

- **新建 / 打开工程 / 保存 / 另存为**: work with portable `.draw` projects. Version 1 stores one flattened canvas, its original pixel dimensions, name and format version. It does **not** include layers, undo history, API keys or music.
- **导出 PNG / PNG**: export an image for sharing, separately from saving a project.
- **Recovery**: after an edit, an idle delay of 800 ms schedules a local draft. The status bar reports success or failure. On the next launch, choose whether to restore it. This is a local recovery copy, not a replacement for saving a `.draw` file.
- **Close protection**: closing the window, choosing the app's Quit menu or pressing Cmd/Ctrl+Q prompts you to save, discard or cancel. A failed save never closes the document automatically. macOS Dock Quit and operating-system termination rely on the latest completed recovery backup; they do not use this confirmation flow.
- **Canvas**: starts at 1280 × 720. Resizing the window only changes the display scale, preserving the original pixels. Loaded projects can use other dimensions, with a maximum of 8192 per side and 16,777,216 total pixels.
- **History**: up to 30 steps within a shared 96 MiB budget. Larger canvases can retain fewer steps. AI results and completed filters participate in undo and recovery.
- **Input**: mouse, touch and pen share Pointer Events. Pressure-sensitive brush width is not implemented in this version.
- **Music**: starts muted by default. Click the top-right logo to adjust the volume. Theme and volume preferences are remembered.

| Action | Windows | macOS |
| --- | --- | --- |
| Save project | Ctrl+S | ⌘S |
| Save as | Ctrl+Shift+S | ⌘Shift+S |
| Open project | Ctrl+O | ⌘O |
| New project | Ctrl+N | ⌘N |
| Undo | Ctrl+Z | ⌘Z |
| Redo | Ctrl+Shift+Z / Ctrl+Y | ⌘Shift+Z |

## Run and build the desktop app

Install Node.js 20+ and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust and platform development tools). On Windows, Tauri uses Microsoft C++ Build Tools and WebView2. On macOS, install Xcode Command Line Tools.

```bash
npm ci
npm run desktop:dev
```

The launcher also detects a project-local Rust toolchain in `.tools/cargo` and `.tools/rustup`, if present. It does not change your shell's PATH. These directories are ignored by Git.

Build on the target platform:

```bash
# Windows: NSIS installer
npm run desktop:build -- --bundles nsis

# macOS: standalone app
npm run desktop:build -- --bundles app
```

Outputs are under `src-tauri/target/release/bundle/`: `nsis/*-setup.exe` on Windows and `macos/DRAW.app` on macOS. The unsigned development build does not include automatic updates.

The [desktop workflow](.github/workflows/desktop.yml) builds Windows and macOS artifacts when this branch is pushed, or when manually dispatched in GitHub Actions. It uploads build artifacts only; it does not publish a release. Local builds do not upload source or artifacts.

## Validation

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

The JavaScript tests cover project validation, viewport-independent pixels, coordinate mapping, history, image import, stale AI results and restricted math expressions. Rust tests cover file limits, path authorization, atomic replacement and recovery storage.

## Storage and first-version limits

Desktop project writes use a native picker; subsequent saves may reuse only a path chosen during that app session. Recovery is stored in the OS app-data directory for `io.github.myassk.draw` as `recovery.draw`. Writes use a temporary file followed by atomic replacement.

Browser preview remains available with `npm run dev`, using downloads for project export and IndexedDB for the recovery draft. Desktop and browser preview have separate storage; existing browser API keys are not automatically migrated.

This release does not add layers, zoom/pan controls, recent-file lists, file associations, pressure-sensitive brushes or a background filter worker. AI colorization/completion/style transfer still describe the source image and generate a new image from that description; they do not guarantee preservation of the original lines. Requests now support cancellation and timeout. Pixel math accepts a limited mathematical grammar, not arbitrary JavaScript.

---

## Original project

A retro-styled drawing application inspired by the early internet era, featuring Windows 95 UI aesthetics, pixel fonts, and vibrant colors. Its frontend uses HTML, CSS and JavaScript ES Modules.

## Features

### Drawing Tools
- **Brush** — Free-hand drawing with adjustable size (1-50px)
- **Eraser** — Erase content by painting in white
- **Fill** — Flood fill connected regions with the selected color
- **Blur** — Localized blur brush for softening areas

### Color System
- 12-color preset palette + RGB numeric input (0-255)
- Real-time color preview

### History
- **Undo / Redo** — Up to 30 steps within a 96 MiB memory budget
- **Clear** — Reset the canvas to blank white

### File Operations
- **Save** — Export canvas as PNG with auto-generated timestamped filename
- **Import** — Load an image with drag-to-move and corner-resize handles (hold Shift for free-form resizing)

### Image Processing
- **Extract Lines** — One-click line art extraction (Sobel edge detection)
- **Filter Workshop** — 15 convolution filters across 5 categories (blur, edge detection, sharpen, artistic FX, morphology), with custom 3x3 kernel editor and scanline animation
- **Pixel Math f(x)** — Apply math expressions to each pixel's R/G/B channels (e.g. `255-x` for invert, `x*0.5` for darken), with built-in presets and a full set of operator/function shortcut buttons

### AI Features (requires API key)
Powered by Volcano Ark API (ByteDance) with DeepSeek and Seedream models:
- **Auto-Color** — AI colorization of line art
- **Finish Drawing** — AI completion of unfinished sketches
- **Text to Draw** — Generate images from text descriptions
- **Style Transfer** — Apply artistic styles (Oil Painting, Watercolor, Pixel Art, Comic, Pencil Sketch, Ukiyo-e)

### Settings
- 3 visual themes: **Classic** (Win95 gray), **Modern** (dark mode), **Summer** (warm tones)
- Built-in Help dialog with full feature guide (in Chinese)

## Getting Started

### Prerequisites
- Any modern web browser (Chrome, Firefox, Edge, Safari)
- A static HTTP server (required for ES Modules)

### Run Locally

```bash
# Clone the repository
git clone https://github.com/MYASSK/DRAW.git
cd DRAW

# Start a local server (pick one)
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000` in your browser.

> **Note:** Opening `index.html` directly as a file (`file://`) will not work due to ES Module restrictions. You must use an HTTP server.

### AI Features Setup

AI features require a [Volcano Ark](https://www.volcengine.com/product/ark) API key. When you click the **AI FUNCTION** button for the first time, a dialog will prompt you to enter your key. The key is stored in your browser's `localStorage` and never sent anywhere except the Volcano Ark API.

## Project Structure

```
DRAW/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js              # Entry point
│   ├── canvas.js            # Canvas, undo/redo, import overlay
│   ├── tools.js             # Brush, eraser, fill, blur
│   ├── toolbar.js           # Toolbar & sidebar UI wiring
│   ├── filters.js           # Convolution engine, 15 presets
│   ├── filter-dialog.js     # Filter dialog UI + scan animation
│   ├── pixel-math.js        # Pixel math f(x) evaluator
│   ├── settings.js          # Logo, themes, help dialog
│   ├── ai-api.js            # Volcano Ark API wrapper
│   └── ai-tools.js          # AI feature implementations
├── fonts/
│   ├── BoldsPixels.ttf
│   ├── Mister Pixel Regular.otf
│   └── HYPixel11pxU-2.ttf
├── pict/
│   ├── ic.png               # Favicon
│   ├── logo.png             # Toolbar logo
│   └── logo2.png            # Logo hover variant
└── todraw.md                # Version changelog
```

## Tech Stack

- **Frontend:** Pure HTML5 + CSS3 + JavaScript (ES Modules)
- **Canvas:** HTML5 Canvas 2D API
- **Fonts:** BoldsPixels, Mister Pixel, HYPixel11pxU-2
- **AI Backend:** Volcano Ark API — DeepSeek (chat/vision), Seedream (image generation)
- **Desktop:** Tauri 2 + Rust; static asset packaging with Node.js
- **Browser preview:** Runs on a local static HTTP server

## License

This project is for personal and educational use.
