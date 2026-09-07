# 1v1 Battle Tetris (Multiplayer & AI)

A modern, arcade-style competitive 1v1 Tetris web game built with TypeScript, Vite, Tailwind CSS, and HTML5 Canvas. Designed to run **100% on Cloudflare Free Tier** with zero server costs.

![Screenshot](preview.png)

---

## Features

- **1v1 Real-Time Multiplayer**:
  - Direct peer-to-peer connection via **WebRTC DataChannels** (ultra-low latency <20ms, zero server bandwidth costs).
  - Shareable **6-letter room codes** (e.g. `XY94TQ`) and direct join links (`?room=XY94TQ`).
  - Automatic NAT traversal via free Google STUN servers.
  - Serverless signaling API running on Cloudflare Pages Functions (`/api/room/...`).
  - Built-in local mock signaling server in Vite dev mode so you can test 2 browser tabs locally immediately!

- **1v1 vs AI Bot (Single Player)**:
  - 4 AI difficulty levels:
    - **Easy**: Relaxed pace (~1.0s/drop), simple evaluation, leaves occasional openings.
    - **Medium**: Balanced human speed (~0.55s/drop), keeps board flat, avoids holes.
    - **Hard**: Rapid drops (~0.26s/drop), Pierre Dellacherie evaluation, stacks for 4-line Tetrises.
    - **Extreme 🔥**: Grandmaster speed (~0.11s/drop), hold piece analysis, Back-to-Back Tetrises, aggressive garbage defense.

- **Authentic Tetris Guidelines Engine**:
  - Standard 10x20 visible grid with spawn buffer rows.
  - Standard 7-bag tetromino randomizer (balanced piece sequences).
  - Super Rotation System (SRS) with full wall kicks and floor kicks.
  - Ghost piece drop projector.
  - Hold piece mechanic (with 1 hold per drop limit).
  - Next queue showing upcoming 4 tetrominoes.
  - Delayed Auto Shift (DAS) and Auto Repeat Rate (ARR) for smooth responsive keyboard movement.
  - Lock delay (500ms with movement reset).

- **Competitive 1v1 Garbage Attack & Defense**:
  - 2 lines = 1 garbage, 3 lines = 2 garbage, 4 lines (Tetris!) = 4 garbage.
  - Back-to-Back and combo streak attack bonuses.
  - **Garbage Countering**: Clearing lines immediately cancels incoming enemy garbage!
  - Visual garbage warning meter on the side of the board.
  - Garbage rises from the bottom only when you place a piece without clearing lines.

- **Arcade Audio & Aesthetics**:
  - Procedural 8-bit / Synth sound effects generated via Web Audio API (zero external audio files).
  - Cyberpunk dark theme with neon glows, shake on Tetris, floating text announcements, and line clear particle explosions.
  - On-screen touch buttons for mobile devices.

---

## Quick Start (Local Development)

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
   - In window 1, click **Host New Match** and copy the room code or link.
   - In window 2, enter the code or paste the link and click **Join**.
   - Both browsers will instantly connect via WebRTC!

---

## Deploy to Cloudflare Free Tier

This project requires **zero paid services** (no Cloudflare Workers Paid plan or Durable Objects needed).

### Option A: Using Wrangler CLI
1. Log in to Cloudflare:
   ```bash
   npx wrangler login
   ```
2. Build and deploy to Cloudflare Pages:
   ```bash
   npm run deploy
   ```
   Follow the CLI prompt to select or create a Cloudflare Pages project.

### Option B: Using Cloudflare Dashboard (Git Integration)
1. Push this repository to GitHub or GitLab.
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com/):
   - Go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
   - Select your repository.
   - Set **Build command**: `npm run build`
   - Set **Build output directory**: `dist`
   - Framework preset: `Vite` (or None)
3. Click **Save and Deploy**.

The serverless signaling function in `functions/api/room/[[path]].ts` will automatically be deployed as a Cloudflare Pages Function.

---

## Project Structure

```
opentaskbehaviour/
├── functions/
│   └── api/
│       └── room/
│           └── [[path]].ts       # Cloudflare Pages Function (WebRTC signaling)
├── src/
│   ├── ai/
│   │   └── tetris-ai.ts          # Dellacherie evaluation engine (Easy to Extreme)
│   ├── components/
│   │   ├── BoardRenderer.ts      # Canvas renderer (particles, shake, glowing blocks)
│   │   ├── InputController.ts    # Keyboard controls with DAS/ARR repeat
│   │   └── PiecePreview.ts       # Hold box and next queue renderer
│   ├── engine/
│   │   ├── constants.ts          # Tetrominoes, colors, SRS kick tables, damage formulas
│   │   ├── sound.ts              # Web Audio synthesizer (blips, drops, fanfare)
│   │   └── tetris-engine.ts      # Pure game logic, 7-bag, SRS, garbage counter
│   ├── network/
│   │   ├── signaling.ts          # REST/polling signaling client
│   │   └── webrtc-peer.ts        # WebRTC DataChannel connection manager
│   ├── main.ts                   # Game coordinator, lobby & arena UI
│   └── style.css                 # Tailwind & cyberpunk neon styling
├── index.html
├── package.json
├── vite.config.ts                # Vite config + local dev signaling mock
└── wrangler.jsonc                # Cloudflare configuration
```

---

## Keyboard Controls

| Key | Action |
| --- | --- |
| `←` / `A` | Move Left |
| `→` / `D` | Move Right |
| `↓` / `S` | Soft Drop |
| `Space` | Hard Drop (Instant drop & lock) |
| `↑` / `X` / `W` | Rotate Clockwise |
| `Z` / `Ctrl` | Rotate Counter-Clockwise |
| `C` / `Shift` | Hold Piece |
| `Esc` / `P` | Leave / Pause |
