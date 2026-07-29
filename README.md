# DRAW!

A retro-styled web drawing application inspired by the early internet era, featuring Windows 95 UI aesthetics, pixel fonts, and vibrant colors. Built with pure HTML, CSS, and JavaScript — no frameworks, no build tools.

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
- **Undo / Redo** — Up to 30 steps of undo history
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
- **Build tools:** None — runs directly on any static HTTP server

## License

This project is for personal and educational use.
