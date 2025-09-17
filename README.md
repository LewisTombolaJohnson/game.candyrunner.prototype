# Three Lane Runner (CLI & 3D Web)

A simple interactive command-line 3-lane runner plus a lightweight 3D Three.js browser version. At each checkpoint you pick a lane (1-3). One lane may hide an obstacle. Avoid it to earn points.

## Gameplay
- Up to 20 checkpoints (configurable in code).
- Each checkpoint may (55% default chance) spawn an obstacle in exactly one of the three lanes.
- You choose a lane number (1, 2, or 3).
- Safe choice: +10 points.
- Obstacle hit: -15 points.
- Game ends after max checkpoints or if you quit with `q`.

Symbols shown after each choice:
- `X` = Lane containing the obstacle.
- `O` = Your chosen lane (safe).
- `!` = Your chosen lane (hit obstacle).
- `-` = Other lanes without obstacles.

## Install & Run (CLI)
Requires Node.js >= 18.

```bash
npm install
npm run play
```

You will be asked for:
1. Player name.
2. Optional seed (to replay the same obstacle pattern). Leave blank for randomness.

## Example Round
```
Checkpoint 1: Choose lane (1-3) or q to quit: 2
 Lanes: [- O X]  => SAFE  Score: 10
```

## Deterministic Runs
Enter any string as a seed to reproduce the same sequence of obstacles.

## Project Structure (CLI core)
```
src/
  index.js      # CLI loop & prompts
  game.js       # Game logic, scoring, obstacle generation
  runner.js     # Player model
  rng.js        # Seedable RNG utility
```

## Tweaking Difficulty
Edit `DEFAULT_CONFIG` in `src/game.js`:
- `maxCheckpoints`: Total turns.
- `obstacleProbability`: Chance (0..1) of an obstacle each checkpoint.
- `rewardPerSafe` / `penaltyPerHit`: Scoring values.

## 3D Web Version

An early visual prototype using Three.js.

### Run the Web Version

```bash
npm run serve
```

Open: http://localhost:5173

### Web Controls
- Click lane buttons OR press `1`, `2`, `3`.
- Use `ArrowLeft` / `ArrowRight` to shift lanes.

### Visual Cues
- Blue cube = player.
- Red cube = upcoming obstacle in its lane.
- Lane separators rendered as long thin bars.

### Web Files
```
public/
  index.html       # Main page
  styles.css       # Overlay UI styling
  js/logic.js      # Ported game logic
  js/ui.js         # DOM overlay & events
  js/main.js       # Three.js scene + integration
serve.mjs          # Simple static server
```

### Deploying / Playing on GitHub Pages

This repository includes a `/docs` folder so you can host the browser game directly from GitHub Pages.

Steps:
1. Push the repo to GitHub (already done if you're reading this there).
2. In the repository on GitHub go to: Settings -> Pages.
3. Under "Build and deployment" choose:
  - Source: `Deploy from a branch`
  - Branch: `main` / folder: `/docs`
4. Save. GitHub will publish the site at:
  `https://<your-username>.github.io/<repo-name>/`

For this repo the expected URL is:
`https://lewistombolajohnson.github.io/game.candyrunner.prototype/`

If you change file organization, ensure `docs/index.html` loads assets with relative paths (all current paths are relative and self-contained). A `.nojekyll` file is included to prevent Jekyll from interfering with the module folder paths.

#### Local Preview of the /docs build
You can test the GitHub Pages bundle locally (serves root so relative paths behave) using any static server, e.g.:

```bash
npx serve docs
```

Open the listed localhost URL – the game should start without build tooling.

#### Custom Domain (Optional)
Add a `CNAME` file inside `docs/` with your domain name (e.g. `play.example.com`) and configure DNS (CNAME to `username.github.io`).


## Possible Extensions
- Add hearts/lives instead of score penalties.
- Multiple obstacles or moving obstacles.
- Power-ups (e.g., shield for next checkpoint).
- Persistent high score saved to a JSON file (CLI) or localStorage (web).
- Animated lane shift tween.
- Particle effects / shaders.
- Mobile touch swipe support.

## License
MIT (feel free to adapt).
