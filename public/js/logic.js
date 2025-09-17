// Core game logic adapted for browser
export class CheckpointResult {
  constructor({ index, chosenLane, safe, obstacleLanes, prizeDeltaPence, totalPrizePence, ended }) {
    Object.assign(this, { index, chosenLane, safe, obstacleLanes, prizeDeltaPence, totalPrizePence, ended });
  }
}

const DEFAULT_CONFIG = {
  lanes: 3,
  maxCheckpoints: 20,
  obstacleProbability: 1.0, // always obstacle
  checkpointPrizePence: 25, // 25p per cleared checkpoint
  coinPrizePence: 10,       // 10p per coin
};

export class Game {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentCheckpoint = 0;
  this.prizePence = 0; // store as integer pence
    this.history = [];
    this.over = false;
  this.pendingObstacleLanes = null; // array of lane indices with obstacles
    this.awaitingChoice = false;
  }

  generateObstacleLanes() {
    // From checkpoint 10 onward, produce two distinct obstacle lanes; earlier produce one
    const lanes = [];
    const count = (this.currentCheckpoint >= 10) ? Math.min(2, this.config.lanes - 1) : 1;
    while (lanes.length < count) {
      const cand = Math.floor(Math.random() * this.config.lanes);
      if (!lanes.includes(cand)) lanes.push(cand);
    }
    return lanes;
  }

  startSegment() {
    if (this.over) return null;
    this.pendingObstacleLanes = this.generateObstacleLanes();
    this.awaitingChoice = true;
    return this.pendingObstacleLanes;
  }

  resolveChoice(chosenLane) {
    if (!this.awaitingChoice || this.over) return null;
    const { lanes, checkpointPrizePence, maxCheckpoints } = this.config;
    if (chosenLane < 0 || chosenLane >= lanes) throw new Error('Invalid lane');
  const obstacleLanes = this.pendingObstacleLanes || [];
  const safe = !obstacleLanes.includes(chosenLane);
    let prizeDeltaPence = 0;
    let ended = false;
    if (safe) {
      prizeDeltaPence = checkpointPrizePence; // award checkpoint value
      this.prizePence += prizeDeltaPence;
    } else {
      // Hit obstacle: game ends immediately, no subtraction
      this.over = true;
      ended = true;
    }
    const result = new CheckpointResult({
      index: this.currentCheckpoint,
      chosenLane,
      safe,
      obstacleLanes,
      prizeDeltaPence,
      totalPrizePence: this.prizePence,
      ended,
    });
    this.history.push(result);
    this.currentCheckpoint++;
    this.awaitingChoice = false;
  this.pendingObstacleLanes = null;
    if (!this.over && this.currentCheckpoint >= maxCheckpoints) this.over = true;
    return result;
  }

  // Legacy single-step API (optional)
  chooseLane(lane) {
    this.startSegment();
    return this.resolveChoice(lane);
  }

  isOver() { return this.over; }
  getSummary() { return { ...this }; }
}
