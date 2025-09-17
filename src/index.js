import readline from 'node:readline';
import { Game } from './game.js';
import { Runner } from './runner.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('=== 3 Lane Runner ===');
  const name = (await ask('Enter runner name (blank for Player): ')).trim() || 'Player';
  const seedInput = (await ask('Optional seed for deterministic run (blank = random): ')).trim();
  const seed = seedInput.length ? seedInput : null;

  const game = new Game({ seed });
  const runner = new Runner(name);

  console.log(`Welcome ${runner.name}! You will face up to ${game.config.maxCheckpoints} checkpoints.`);
  console.log('At each checkpoint choose a lane: 1, 2, or 3. Avoid the obstacle lane!');
  console.log('Scoring: +10 safe, -15 if you hit an obstacle.\n');

  while (!game.isOver()) {
    const laneStr = (await ask(`Checkpoint ${game.currentCheckpoint + 1}: Choose lane (1-3) or q to quit: `)).trim().toLowerCase();
    if (laneStr === 'q') {
      console.log('You quit early.');
      break;
    }
    const lane = Number(laneStr) - 1;
    if (!Number.isInteger(lane) || lane < 0 || lane >= game.config.lanes) {
      console.log('Invalid lane. Please enter 1, 2, or 3.');
      continue;
    }
    const result = game.chooseLane(lane);
    const symbolLanes = Array.from({ length: game.config.lanes }, (_, i) => {
      if (result.obstacleLane === i) return 'X';
      if (result.chosenLane === i) return result.safe ? 'O' : '!';
      return '-';
    });
    console.log(` Lanes: [${symbolLanes.join(' ')}]  => ${result.safe ? 'SAFE' : 'HIT!'}  Score: ${result.totalScore}`);
  }

  const summary = game.getSummary();
  console.log('\n=== Game Over ===');
  console.log(`Checkpoints traversed: ${summary.checkpoints}`);
  console.log(`Final Score: ${summary.score}`);
  const safeCount = summary.history.filter(h => h.safe).length;
  const hitCount = summary.history.length - safeCount;
  console.log(`Safe: ${safeCount}, Hits: ${hitCount}`);

  rl.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  rl.close();
});
