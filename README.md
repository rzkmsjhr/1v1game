# 1v1 Arcade Arena (Multiplayer & AI)

A modern, competitive 1v1 web arcade featuring four classic games built with TypeScript, Vite, Tailwind CSS, and HTML5 Canvas. Supports direct peer-to-peer multiplayer via WebRTC and single-player vs intelligent AI bots.

![Arcade Preview](preview.png)

---

## 🎮 The Games

### 1. 1v1 Battle Tetris
- **Competitive Garbage Mechanics**: Clear lines to attack; 4-line Tetrises, combos, and Back-to-Backs send massive garbage bursts.
- **Garbage Cancellation**: Clearing lines counter-acts incoming enemy garbage in real-time.
- **Guideline Engine**: Authentic Super Rotation System (SRS) with full wall/floor kicks, 7-bag randomizer, hold slot, 4-piece next queue, DAS/ARR responsive keyboard controls, and High-DPI Retina canvas rendering.
- **AI Opponents**: 4 difficulty tiers powered by Pierre Dellacherie evaluation algorithms (landing height, eroded cells, transitions, buried holes, and well depth).

### 2. 8-Ball & 9-Ball Pool (Billiards)
- **Physics Engine**: Multi-substep continuous collision detection, realistic cushion restitution, angular momentum, and pocket attraction.
- **Official Rules**: Opening lag contest to earn break rights, ball-in-hand placement after fouls, legal object ball contact rules, and open table on break.
- **Controls & Aiming**: Interactive cue aiming, drag-to-aim cue stick, fine-tune angle slider, power charge bar, and ghost ball collision guideline.
- **Single-Player AI**: Geometric raycasting and cushion deflection scoring.

### 3. Othello / Reversi
- **Strategic Depth**: Classic 8x8 disc-flipping board with automatic legal move calculation and pass detection.
- **Animations & Visuals**: Smooth disc-flipping animations, flip combo counts, and turn indicators.
- **Positional AI**: Multi-ply heuristic AI evaluating corner dominance, stable discs, danger X/C squares, and mobility.

### 4. Snakes & Ladders
- **Dynamic 100-Tile Board**: Randomized snake and ladder placement with serpentine grid pathing.
- **Dual Dice Roll**: Authentic Asian-style dice rendering (big red 1, red 4, blue pips) with doubles rolling again rule.
- **Opening Duel**: Roll-off tie-breaker to decide who moves first.
- **Smooth Animation**: Step-by-step token hopping with slide down and climb animations.

---

## ⚡ Core Features

- **P2P Real-Time Multiplayer**:
  - Direct peer-to-peer connection via **WebRTC DataChannels** (ultra-low latency, zero intermediary game server bandwidth).
  - Shareable **6-letter room codes** (e.g. `XY94TQ`) and direct join links (`?room=XY94TQ`).
  - Automatic NAT traversal via Google STUN servers.
  - Sub-second room handshake with fast 250ms polling and early message queueing.
  - Built-in local mock signaling server in Vite dev mode so you can test two tabs locally out-of-the-box.

- **Intelligent AI Bots**:
  - Available across all games with customizable difficulty (Easy, Medium, Hard, Extreme).

- **Zero Asset Dependencies**:
  - Procedural Web Audio API sound synthesis (retro blips, hard drop hits, cue strikes, dice rolls, fanfares).
  - SVG and Canvas rendering for lightweight, instant bundle loading.

---

## 🚀 Quick Start (Local Development)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the local development server**:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser.
   - To test multiplayer locally, open two browser windows (or one regular and one incognito tab).
   - In window 1, choose a game, select **1v1 Online**, click **Host New Match**, and copy the room code or link.
   - In window 2, enter the code or paste the URL and click **Join**.
   - Both browsers will connect directly via WebRTC!

---

## 📦 Build & Deployment

### Build for Production
```bash
npm run build
```
This runs TypeScript checking (`tsc`) and bundles optimized static assets into the `dist/` directory via Vite.

### Cloudflare Pages Deployment
- Designed for Cloudflare Pages with Serverless Functions (`functions/api/room/[[path]].ts`).
- Set build command: `npm run build`
- Set build output directory: `dist`
- *Note on Signaling*: Vite dev mode includes a built-in single-process mock signaling server. For production deployment with players connecting across different geographic edge regions, bind a shared storage provider (such as Cloudflare KV or Durable Objects) to `functions/api/room` to synchronize room states across distributed edge isolates.

---

## ⌨️ Controls Reference

### Tetris
| Key / Input | Action |
| --- | --- |
| `←` / `A` | Move Left |
| `→` / `D` | Move Right |
| `↓` / `S` | Soft Drop |
| `Space` | Hard Drop (Instant drop & lock) |
| `↑` / `X` / `W` | Rotate Clockwise |
| `Z` / `Ctrl` | Rotate Counter-Clockwise |
| `C` / `Shift` | Hold Piece |
| `Esc` / `P` | Pause / Exit |
| Touch Controls | On-screen virtual buttons |

### Pool (Billiards)
| Input | Action |
| --- | --- |
| Mouse / Touch Drag | Aim cue stick around cue ball |
| Cue Stick Drag | Click and drag cue stick directly to rotate angle |
| Fine Angle Slider | Precise degree adjustments |
| Power Meter / Drag | Adjust shot power and release to shoot |
| Click Board | Place cue ball during Ball-in-Hand phase |

### Othello
| Input | Action |
| --- | --- |
| Click Tile | Place disc on highlighted valid squares |

### Snakes & Ladders
| Input | Action |
| --- | --- |
| Click "Roll Dice" | Roll pair of dice on your turn |
