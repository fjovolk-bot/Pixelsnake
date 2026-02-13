# Pixel Snake

Pixelart Snake als Electron-Desktop-App (Windows-EXE Build via electron-builder) mit Web-Fallback (`src/index.html`).

## Dev starten

```bash
npm install
npm run dev
```

## Windows EXE bauen

```bash
npm run build
```

Output liegt unter `dist/` (z. B. `dist/Pixel Snake Setup 1.0.0.exe`).

## HTML-Fallback starten

- Direkter Doppelklick auf `src/index.html`, oder
- lokaler Server:

```bash
python3 -m http.server 8080
```

Dann öffnen: `http://localhost:8080/src/index.html`.
