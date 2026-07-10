/* ============================================================
   FIGHTING GAME - Core Game Logic
   ============================================================ */

export class FightingGame {
    constructor() {
        this.playerHealth = 100;
        this.enemyHealth = 100;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.isGameOver = false;
        this.isPaused = false;
        
        this.playerState = 'idle';
        this.enemyState = 'idle';
        this.lastPlayerGesture = null;
        this.enemyAction = null;
        
        // Timing
        this.lastActionTime = 0;
        this.actionCooldown = 500; // ms
        this.enemyAttackInterval = 2000; // ms
        this.lastEnemyAttack = 0;
        
        // Callbacks
        this.onHealthUpdate = null;
        this.onScoreUpdate = null;
        this.onComboUpdate = null;
        this.onMessage = null;
        this.onGameOver = null;
        this.onEnemyAction = null;
        this.onPlayerAction = null;
        
        // Enemy AI states
        this.enemyAI = {
            thinking: true,
            nextAction: null,
            actionTimer: 0
        };
    }
    
    // ===== PLAYER ACTIONS =====
    playerAction(gesture) {
        if (this.isGameOver || this.isPaused) return;
        
        const now = Date.now();
        if (now - this.lastActionTime < this.actionCooldown) return;
        
        this.lastActionTime = now;
        this.playerState = gesture.type;
        this.lastPlayerGesture = gesture;
        
        // Execute action
        switch(gesture.type) {
            case 'punch':
                this.playerPunch(gesture.confidence);
                break;
            case 'block':
                this.playerBlock();
                break;
            case 'special':
                this.playerSpecial();
                break;
            case 'fist':
                this.playerReady();
                break;
            case 'open':
                this.playerReady();
                break;
        }
        
        // Notify UI
        if (this.onPlayerAction) {
            this.onPlayerAction(gesture);
        }
    }
    
    playerPunch(confidence) {
        // Check if enemy is blocking
        if (this.enemyState === 'block') {
            this.showMessage('🛡️ Blocked!', 'block');
            this.combo = 0;
            this.updateCombo();
            return;
        }
        
        // Calculate damage based on confidence
        const damage = 10 + Math.floor(confidence * 15);
        this.enemyHealth = Math.max(0, this.enemyHealth - damage);
        
        // Combo
        this.combo++;
        if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
        }
        this.score += 10 * this.combo;
        
        // Effects
        this.showMessage(`💥 Hit! -${damage} HP`, 'hit');
        this.updateHealth();
        this.updateScore();
        this.updateCombo();
        
        // Enemy reaction
        this.enemyReaction('hit');
        
        // Check for KO
        if (this.enemyHealth <= 0) {
            this.gameOver('win');
        }
    }
    
    playerBlock() {
        this.playerState = 'block';
        this.showMessage('🛡️ Block!', 'block');
        
        // If enemy was attacking, counter
        if (this.enemyState === 'attack') {
            this.showMessage('💥 Counter!', 'hit');
            this.enemyHealth = Math.max(0, this.enemyHealth - 5);
            this.score += 5;
            this.updateHealth();
            this.updateScore();
            
            if (this.enemyHealth <= 0) {
                this.gameOver('win');
            }
        }
    }
    
    playerSpecial() {
        if (this.playerState === 'special') return;
        
        this.showMessage('⚡ SPECIAL MOVE!', 'ko');
        const damage = 25;
        this.enemyHealth = Math.max(0, this.enemyHealth - damage);
        this.score += 30;
        
        this.updateHealth();
        this.updateScore();
        
        if (this.enemyHealth <= 0) {
            this.gameOver('win');
        }
    }
    
    playerReady() {
        // Idle state - no action
    }
    
    // ===== ENEMY AI =====
    updateEnemyAI() {
        if (this.isGameOver || this.isPaused) return;
        
        const now = Date.now();
        
        // Enemy thinking
        if (this.enemyAI.thinking) {
            this.enemyAI.actionTimer -= 16;
            if (this.enemyAI.actionTimer <= 0) {
                this.enemyAI.thinking = false;
                this.chooseEnemyAction();
            }
            return;
        }
        
        // Execute enemy action
        if (this.enemyAI.nextAction) {
            this.enemyAction = this.enemyAI.nextAction;
            this.executeEnemyAction();
            this.enemyAI.nextAction = null;
            this.enemyAI.thinking = true;
            this.enemyAI.actionTimer = 1500 + Math.random() * 1000;
        }
    }
    
    chooseEnemyAction() {
        // Determine enemy behavior based on health
        const healthPercent = this.enemyHealth / 100;
        
        let actions = [];
        
        if (healthPercent > 0.5) {
            // Healthy - mix of attacks and blocks
            actions = ['attack', 'attack', 'block', 'idle'];
        } else if (healthPercent > 0.25) {
            // Wounded - more aggressive
            actions = ['attack', 'attack', 'attack', 'special', 'block'];
        } else {
            // Near death - desperate
            actions = ['attack', 'special', 'special', 'attack'];
        }
        
        this.enemyAI.nextAction = actions[Math.floor(Math.random() * actions.length)];
    }
    
    executeEnemyAction() {
        const action = this.enemyAction;
        this.enemyState = action;
        
        // Notify UI
        if (this.onEnemyAction) {
            this.onEnemyAction(action);
        }
        
        switch(action) {
            case 'attack':
                this.enemyAttack();
                break;
            case 'block':
                this.enemyBlock();
                break;
            case 'special':
                this.enemySpecial();
                break;
            default:
                // Idle
                break;
        }
    }
    
    enemyAttack() {
        // Check if player is blocking
        if (this.playerState === 'block') {
            this.showMessage('🛡️ You blocked!', 'block');
            return;
        }
        
        // Check if player is attacking (trade)
        if (this.playerState === 'punch') {
            this.showMessage('💥 Trade!', 'hit');
            this.playerHealth = Math.max(0, this.playerHealth - 5);
            this.enemyHealth = Math.max(0, this.enemyHealth - 5);
            this.updateHealth();
            
            if (this.playerHealth <= 0) {
                this.gameOver('lose');
            }
            if (this.enemyHealth <= 0) {
                this.gameOver('win');
            }
            return;
        }
        
        // Normal hit
        const damage = 8 + Math.floor(Math.random() * 7);
        this.playerHealth = Math.max(0, this.playerHealth - damage);
        this.showMessage(`💥 Enemy hit! -${damage} HP`, 'hit');
        this.updateHealth();
        
        // Reset combo
        this.combo = 0;
        this.updateCombo();
        
        if (this.playerHealth <= 0) {
            this.gameOver('lose');
        }
    }
    
    enemyBlock() {
        this.showMessage('🛡️ Enemy blocked!', 'block');
    }
    
    enemySpecial() {
        const damage = 15 + Math.floor(Math.random() * 10);
        this.playerHealth = Math.max(0, this.playerHealth - damage);
        this.showMessage(`⚡ Enemy Special! -${damage} HP`, 'ko');
        this.updateHealth();
        
        // Reset combo
        this.combo = 0;
        this.updateCombo();
        
        if (this.playerHealth <= 0) {
            this.gameOver('lose');
        }
    }
    
    enemyReaction(action) {
        // Enemy reaction to being hit
        if (this.onEnemyAction) {
            this.onEnemyAction('reaction');
        }
    }
    
    // ===== UI UPDATES =====
    updateHealth() {
        if (this.onHealthUpdate) {
            this.onHealthUpdate({
                player: this.playerHealth,
                enemy: this.enemyHealth
            });
        }
    }
    
    updateScore() {
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.score);
        }
    }
    
    updateCombo() {
        if (this.onComboUpdate) {
            this.onComboUpdate({
                combo: this.combo,
                maxCombo: this.maxCombo
            });
        }
    }
    
    showMessage(text, type = '') {
        if (this.onMessage) {
            this.onMessage(text, type);
        }
    }
    
    // ===== GAME STATE =====
    gameOver(result) {
        if (this.isGameOver) return;
        this.isGameOver = true;
        
        const title = result === 'win' ? '🏆 YOU WIN!' : '💀 YOU LOSE!';
        this.showMessage(title, 'ko');
        
        if (this.onGameOver) {
            this.onGameOver({
                result: result,
                score: this.score,
                maxCombo: this.maxCombo,
                health: this.playerHealth
            });
        }
    }
    
    reset() {
        this.playerHealth = 100;
        this.enemyHealth = 100;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.playerState = 'idle';
        this.enemyState = 'idle';
        this.enemyAI.thinking = true;
        this.enemyAI.actionTimer = 1000;
        
        this.updateHealth();
        this.updateScore();
        this.updateCombo();
    }
    
    // ===== GAME LOOP =====
    update() {
        if (!this.isGameOver && !this.isPaused) {
            this.updateEnemyAI();
        }
    }
}