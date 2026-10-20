# Flappy Bird

A simple Flappy Bird-style browser game built with HTML5 Canvas and vanilla JavaScript.
There's no build step: just static files. All graphics are drawn in code and all sounds are synthesized with WebAudio, so no external sprites or audio files are used.

**Play it:** https://connect-world-1985-ai.github.io/2026-10-20-flappy-bird/

## Controls

| Action | Input |
| --- | --- |
| Flap / start | Tap, click, `Space`, `↑` (or `W`) |
| Restart after game over | Tap, click, `Space`, `Enter` or `R` |
| Mute / unmute | 🔊 button (top right) or `M` |
| Difficulty | **Easy** / **Normal** buttons (bottom of screen on title) |

## Features

- Gravity, flapping, and pipes that scroll past with random gaps
- Score goes up by one for every pipe passed; best score saved in `localStorage`
- **Easy** and **Normal** difficulty (saved in `localStorage`; Easy is the default for new players)
- Start screen, game over panel with score, best, a "NEW" badge and medals (5 / 10 / 20 / 30)
- Sound effects generated with WebAudio (flap, score, hit, fall), with a saved mute setting
- Parallax clouds, city skyline and bushes; scrolling ground
- Scales to fit any screen (crisp on high-DPI displays), works with mobile touch
- Fixed-step physics with `requestAnimationFrame` rendering for smooth 60 fps

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Or just open `index.html` in a browser.

## Files

- `index.html`: page shell
- `style.css`: layout and scaling
- `game.js`: game logic, rendering and sound
