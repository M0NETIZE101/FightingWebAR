/* ============================================================
   MAIN - AR Fighting Game Application
   ============================================================ */

import * as THREE from 'three';
import { HandTracker } from './hand-tracker.js';
import { FightingGame } from './game.js';

// ============================================================
// DOM REFS
// ============================================================
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const statusText = document.getElementById('status-text');
const message = document.getElementById('message');
const container = document.getElementById('ar-container');
const gameUI = document.getElementById('game-ui');
const playerHealthFill = document.getElementById('player-health-fill');
const enemyHealthFill = document.getElementById('enemy-health-fill');
const scoreText = document.getElementById('score-text');
const comboText = document.getElementById('combo-text');
const comboCount = document.getElementById('combo-count');
const gestureText = document.getElementById('gesture-text');
const enemyState = document.getElementById('enemy-state');
const gameOver = document.getElementById('game-over');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverScore = document.getElementById('game-over-score');
const restartBtn = document.getElementById('restart-btn');
const shareResultBtn = document.getElementById('share-result-btn');

// ============================================================
// STATE
// ============================================================
let scene, camera, renderer;
let game = null;
let handTracker = null;
let isArRunning = false;
let hasPermission = false;
let messageTimeout = null;
let enemySprites = [];

// ============================================================
// HELPERS
// ============================================================
function showMessage(text, type = '') {
    message.textContent = text;
    message.className = 'show ' + type;
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
        message.className = '';
    }, 1500);
}

function updateStatus(text) {
    statusText.textContent = text;
}

function debug(text) {
    console.log('🔍', text);
}

// ============================================================
// SETUP THREE.JS
// ============================================================
function setupThreeScene() {
    debug('Setting up scene...');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 0);
    
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    
    container.appendChild(renderer.domElement);
    
    // Lights
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambient);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(0, 5, 5);
    scene.add(dirLight);
    
    const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
    fill.position.set(-5, 0, 5);
    scene.add(fill);
    
    const back = new THREE.DirectionalLight(0xff8844, 0.2);
    back.position.set(0, 0, -5);
    scene.add(back);
    
    // Create simple arena
    createArena();
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    debug('✅ Scene setup complete');
}

function createArena() {
    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 3),
        new THREE.MeshStandardMaterial({ 
            color: 0x1a1a2e,
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);
    
    // Grid
    const grid = new THREE.GridHelper(3, 10, 0xff6b6b, 0x444466);
    grid.position.y = -0.05;
    scene.add(grid);
    
    // Ring
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.02, 16, 32),
        new THREE.MeshStandardMaterial({
            color: 0xff6b6b,
            emissive: 0xff6b6b,
            emissiveIntensity: 0.3
        })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
}

// ============================================================
// REQUEST CAMERA PERMISSION
// ============================================================
async function requestCameraPermission() {
    debug('📷 Requesting camera permission...');
    updateStatus('📷 Requesting camera...');
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Requesting...';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        hasPermission = true;
        stream.getTracks().forEach(track => track.stop());
        
        debug('✅ Camera permission granted');
        updateStatus('✅ Camera ready');
        startBtn.textContent = '⚔️ Start Battle';
        startBtn.disabled = false;
        return true;
        
    } catch (error) {
        debug('❌ Camera denied: ' + error.message);
        updateStatus('❌ Camera needed - check settings');
        startBtn.textContent = '🔄 Retry';
        startBtn.disabled = false;
        showMessage('❌ Camera permission required', 'error');
        return false;
    }
}

// ============================================================
// START AR
// ============================================================
async function startAR() {
    debug('🚀 Starting AR...');
    showMessage('📷 Starting AR...', '');
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Starting...';

    try {
        if (!navigator.xr) {
            throw new Error('WebXR not supported');
        }

        let supported = false;
        try {
            supported = await navigator.xr.isSessionSupported('immersive-ar');
        } catch (e) {
            throw new Error('AR not supported');
        }

        if (!supported) {
            throw new Error('AR not supported on this device');
        }

        if (!hasPermission) {
            const granted = await requestCameraPermission();
            if (!granted) {
                throw new Error('Camera permission required');
            }
        }

        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor']
        });

        debug('✅ AR Session created!');
        await renderer.xr.setSession(session);

        // Hide start screen, show game UI
        startScreen.classList.add('hidden');
        gameUI.style.display = 'block';
        isArRunning = true;
        
        // Initialize game
        initGame();
        
        // Start hand tracking
        startHandTracking();
        
        showMessage('🥊 Fight!', '');

        // Animation loop
        renderer.setAnimationLoop(() => {
            // Update game
            if (game) {
                game.update();
            }
            renderer.render(scene, camera);
        });

        session.addEventListener('end', () => {
            debug('⏹️ AR Session ended');
            isArRunning = false;
            renderer.setAnimationLoop(null);
            gameUI.style.display = 'none';
            startScreen.classList.remove('hidden');
            startBtn.textContent = '⚔️ Restart Battle';
            startBtn.disabled = false;
            if (handTracker) handTracker.stop();
            showMessage('Session ended', '');
        });

    } catch (error) {
        debug('❌ AR start failed: ' + error.message);
        showMessage('❌ ' + error.message, 'error');
        startBtn.textContent = '🔄 Retry';
        startBtn.disabled = false;
    }
}

// ============================================================
// INIT GAME
// ============================================================
function initGame() {
    game = new FightingGame();
    
    // Set callbacks
    game.onHealthUpdate = (health) => {
        playerHealthFill.style.width = health.player + '%';
        enemyHealthFill.style.width = health.enemy + '%';
        
        // Color based on health
        if (health.player < 30) {
            playerHealthFill.style.background = 'linear-gradient(90deg, #ff4444, #cc0000)';
        } else if (health.player < 60) {
            playerHealthFill.style.background = 'linear-gradient(90deg, #ffd93d, #f0932b)';
        } else {
            playerHealthFill.style.background = 'linear-gradient(90deg, #ff6b6b, #ee5a24)';
        }
    };
    
    game.onScoreUpdate = (score) => {
        scoreText.textContent = 'Score: ' + score;
    };
    
    game.onComboUpdate = (comboData) => {
        if (comboData.combo > 1) {
            comboText.style.display = 'block';
            comboCount.textContent = comboData.combo;
        } else {
            comboText.style.display = 'none';
        }
    };
    
    game.onMessage = (text, type) => {
        showMessage(text, type);
    };
    
    game.onGameOver = (data) => {
        gameOver.style.display = 'flex';
        gameOverTitle.textContent = data.result === 'win' ? '🏆 YOU WIN!' : '💀 YOU LOSE!';
        gameOverScore.textContent = 'Score: ' + data.score + ' | Max Combo: x' + data.maxCombo;
    };
    
    game.onEnemyAction = (action) => {
        const labels = {
            'attack': '⚔️ Attacking!',
            'block': '🛡️ Blocking!',
            'special': '⚡ Special!',
            'idle': '🧠 Thinking...',
            'reaction': '💥 Stunned!'
        };
        enemyState.textContent = labels[action] || '🧠 Thinking...';
    };
    
    game.onPlayerAction = (gesture) => {
        const labels = {
            'punch': '👊 Punch!',
            'block': '🛡️ Block!',
            'special': '⚡ Special!',
            'fist': '✊ Ready',
            'open': '🖐️ Open'
        };
        gestureText.textContent = labels[gesture.type] || '✊ Ready';
    };
    
    // Reset game
    game.reset();
}

// ============================================================
// HAND TRACKING
// ============================================================
function startHandTracking() {
    handTracker = new HandTracker({
        onGesture: (gesture) => {
            if (game && !game.isGameOver) {
                game.playerAction(gesture);
            }
        },
        onHandPosition: (position) => {
            // Could use for debugging or visual feedback
        }
    });
    
    handTracker.start();
}

// ============================================================
// INITIALIZE
// ============================================================
async function init() {
    debug('🚀 Initializing AR Fighting Game...');
    
    try {
        setupThreeScene();
        
        // Hide loading
        loading.classList.add('hidden');
        
        // Show start screen
        startScreen.classList.remove('hidden');
        updateStatus('⚔️ Tap "Start Battle" to begin');
        
        // Start button
        startBtn.addEventListener('click', async () => {
            if (!hasPermission) {
                const granted = await requestCameraPermission();
                if (granted) {
                    await startAR();
                }
            } else {
                await startAR();
            }
        });
        
        // Restart button
        restartBtn.addEventListener('click', () => {
            gameOver.style.display = 'none';
            if (game) {
                game.reset();
                showMessage('🥊 Fight!', '');
            }
        });
        
        // Share button
        shareResultBtn.addEventListener('click', () => {
            if (navigator.share) {
                navigator.share({
                    title: '🥊 AR Fighting Game',
                    text: `I scored ${game?.score || 0} points in AR Fighting Game! Can you beat me?`,
                    url: window.location.href
                }).catch(() => {});
            } else {
                navigator.clipboard?.writeText('I played AR Fighting Game! 🥊').then(() => {
                    showMessage('📋 Copied!', '');
                });
            }
        });
        
        debug('✅ Ready!');
        
    } catch (error) {
        debug('❌ Init error: ' + error.message);
        loadingText.textContent = '❌ Error loading';
        showMessage('Failed to load: ' + error.message, 'error');
    }
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', init);