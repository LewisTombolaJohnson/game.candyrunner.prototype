// UI handling (DOM overlay)
export class UIOverlay {
  constructor() {
    this.root = document.getElementById('ui');
    this.startScreen = this.root.querySelector('#start-screen');
    this.gameScreen = this.root.querySelector('#game-screen');
    this.endScreen = this.root.querySelector('#end-screen');
  this.scoreEl = this.root.querySelector('#score');
    this.cpEl = this.root.querySelector('#checkpoint');
    this.logEl = this.root.querySelector('#log');
    this.finalScoreEl = this.root.querySelector('#final-score');
    this.summaryEl = this.root.querySelector('#summary');

    this.controlsContainer = this.gameScreen.querySelector('.lanes-buttons');
    // Dynamic status line
    if (!this.statusLine) {
      this.statusLine = document.createElement('div');
      this.statusLine.className = 'status-line';
      this.statusLine.style.marginTop = '6px';
      this.gameScreen.insertBefore(this.statusLine, this.controlsContainer);
    }

    this.onStart = null;
    this.onLaneSelect = null;

    this.startScreen.querySelector('button#start-btn').addEventListener('click', () => {
      const name = this.startScreen.querySelector('#player-name').value.trim() || 'Player';
      this.showGame();
      this.onStart && this.onStart({ name });
    });

    this.gameScreen.querySelectorAll('button.lane').forEach(btn => {
      btn.addEventListener('click', () => {
        const lane = Number(btn.dataset.lane);
        this.onLaneSelect && this.onLaneSelect(lane);
      });
    });

    this.endScreen.querySelector('#restart-btn').addEventListener('click', () => {
      window.location.reload();
    });
  }

  showStart() {
    this.startScreen.style.display = 'flex';
    this.gameScreen.style.display = 'none';
    this.endScreen.style.display = 'none';
  }
  showGame() {
    this.startScreen.style.display = 'none';
    this.gameScreen.style.display = 'flex';
    this.endScreen.style.display = 'none';
  }
  showEnd() {
    this.startScreen.style.display = 'none';
    this.gameScreen.style.display = 'none';
    this.endScreen.style.display = 'flex';
  }

  formatPence(p) { return '£' + (p/100).toFixed(2); }

  updateStatus({ prizePence, checkpoint }) {
    this.scoreEl.textContent = this.formatPence(prizePence);
    this.cpEl.textContent = checkpoint + 1; // human friendly
  }

  logResult(result) {
    const div = document.createElement('div');
    const { chosenLane, obstacleLane, safe, totalPrizePence, prizeDeltaPence } = result;
    const deltaStr = prizeDeltaPence ? ` +${this.formatPence(prizeDeltaPence)}` : (safe ? '' : ' (FAILED)');
    div.textContent = `CP ${result.index + 1}: chose ${chosenLane + 1}${obstacleLane !== null ? ` obstacle @ ${obstacleLane + 1}` : ''} => ${safe ? 'SAFE' : 'HIT'}${deltaStr} | Total ${this.formatPence(totalPrizePence)}`;
    this.logEl.prepend(div);
  }

  showSummary(game) {
    this.finalScoreEl.textContent = this.formatPence(game.prizePence);
    this.summaryEl.textContent = `Checkpoints: ${game.currentCheckpoint} | Safe: ${game.history.filter(h=>h.safe).length} | Hits: ${game.history.filter(h=>!h.safe).length}`;
  }

  showControls(msg = 'Choose your lane') {
    this.controlsContainer.style.display = 'flex';
    this.statusLine.textContent = msg;
  }

  hideControls(msg = 'Running...') {
    this.controlsContainer.style.display = 'none';
    this.statusLine.textContent = msg;
  }
}
