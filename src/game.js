import { createRng } from './rng.js';

/**
 * Represents a single checkpoint outcome
 */
export class CheckpointResult {
  constructor({ index, chosenLane, safe, obstacleLane, scoreDelta, totalScore }) {
    this.index = index;
    this.chosenLane = chosenLane; // 0,1,2
    this.safe = safe; // boolean
    this.obstacleLane = obstacleLane; // 0,1,2
    this.scoreDelta = scoreDelta; // number
    this.totalScore = totalScore; // cumulative
  }
}

/**
 * Game configuration defaults
 */
const DEFAULT_CONFIG = {
  lanes: 3,
  maxCheckpoints: 20,
  obstacleProbability: 0.55, // chance that a checkpoint contains an obstacle in exactly one lane
  rewardPerSafe: 10,
  penaltyPerHit: 15,
  seed: null,
};

export class Game {
  constructor(userConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
    this.rng = createRng(this.config.seed);
    this.currentCheckpoint = 0;
    this.score = 0;
    this.history = []; // Array<CheckpointResult>
    this.over = false;
  }

  /**
   * Returns next obstacle lane or null if no obstacle
   */
  generateObstacleLane() {
    const { obstacleProbability, lanes } = this.config;
    if (this.rng() < obstacleProbability) {
      return Math.floor(this.rng() * lanes);
    }
    return null; // no obstacle at this checkpoint
  }

  /**
   * Process a player lane choice.
   * @param {number} lane 0..lanes-1
   * @returns {CheckpointResult}
   */
  chooseLane(lane) {
    if (this.over) throw new Error('Game already over');
    const { lanes, rewardPerSafe, penaltyPerHit, maxCheckpoints } = this.config;
    if (lane < 0 || lane >= lanes) throw new Error('Invalid lane');

    const obstacleLane = this.generateObstacleLane();
    const safe = obstacleLane === null || lane !== obstacleLane;

    const scoreDelta = safe ? rewardPerSafe : -penaltyPerHit;
    this.score += scoreDelta;

    const result = new CheckpointResult({
      index: this.currentCheckpoint,
      chosenLane: lane,
      safe,
      obstacleLane,
      scoreDelta,
      totalScore: this.score,
    });
    this.history.push(result);
    this.currentCheckpoint += 1;
    if (this.currentCheckpoint >= maxCheckpoints) {
      this.over = true;
    }
    return result;
  }

  isOver() {
    return this.over;
  }

  getSummary() {
    return {
      score: this.score,
      checkpoints: this.currentCheckpoint,
      maxCheckpoints: this.config.maxCheckpoints,
      history: this.history,
    };
  }
}
