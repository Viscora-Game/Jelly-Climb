# Jelly Climb

Mobile-first (9:16) vertical HTML5 Canvas slingshot arcade game with procedural levels, dual-mode MongoDB leaderboard, interactive character-guided opening tutorial, and Web Audio sound/music synthesis.

## Features

- **Core Slingshot Physics:** Wall-to-wall sticky slingshot controls, volume-preserving squash & stretch, smart wall landing reticle, Close Call slow-motion rewards, and Tempo speed multipliers (`x1`–`x5`).
- **Obstacles & Tactile Surfaces:** Spikes, Flames, Arrow Shooters (with telegraph warnings), Ice Walls, Bounce Pads, Cracked Stones, and Bubble Shield pickups.
- **2 Core Game Modes:**
  - **Classic:** Endless vertical climb across altitude themes (`Cavern`, `Valley`, `Clouds`, `Frost`, `Cosmos`).
  - **Rising Floor:** Fast-paced escape from rising molten magma.
- **Opening Tutorial:** Interactive 5-step onboarding led directly by your Jelly character (with Skip option).
- **Customization:** 5 bioluminescent jelly color palettes and 6 unlockable accessories.
- **Dual-Mode Leaderboard (MongoDB):** Separate rankings for `classic` and `rising` modes with custom nickname editor and automatic local JSON fallback (`data/leaderboard.json`).
- **Play Store Ready & Bilingual (`EN` / `TR`):** Includes in-game Privacy & Terms modal, full data deletion (`Reset Data`), `manifest.json`, and `privacy-policy.html`.

## Getting Started

```bash
npm install
cp .env.example .env   # Optional: set your MONGODB_URI
npm start
```

Open `http://127.0.0.1:8123/` in your browser or mobile WebView.
