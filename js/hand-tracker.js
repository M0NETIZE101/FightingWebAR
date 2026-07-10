/* ============================================================
   HAND TRACKER - MediaPipe Integration
   ============================================================ */

export class HandTracker {
    constructor(options = {}) {
        this.onGesture = options.onGesture || (() => {});
        this.onHandPosition = options.onHandPosition || (() => {});
        this.isRunning = false;
        this.landmarks = null;
        this.handHistory = [];
        this.lastGesture = null;
        this.gestureCooldown = 0;
        
        // Gesture detection thresholds
        this.thresholds = {
            punchSpeed: 0.8,
            blockOpenness: 0.6,
            specialSpeed: 1.0,
            minConfidence: 0.7
        };
        
        this.setupHands();
    }
    
    setupHands() {
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });
        
        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        this.hands.onResults((results) => {
            this.processHandResults(results);
        });
    }
    
    processHandResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            this.landmarks = landmarks;
            
            // Store history for gesture detection
            this.handHistory.push({
                landmarks: landmarks,
                timestamp: Date.now()
            });
            
            // Keep last 10 frames
            if (this.handHistory.length > 10) {
                this.handHistory.shift();
            }
            
            // Detect gestures
            const gesture = this.detectGesture(landmarks);
            if (gesture) {
                this.onGesture(gesture);
            }
            
            // Get hand position
            const position = this.getHandPosition(landmarks);
            this.onHandPosition(position);
            
        } else {
            this.landmarks = null;
            this.handHistory = [];
        }
    }
    
    detectGesture(landmarks) {
        if (!landmarks || landmarks.length < 21) return null;
        
        // Check if hand is present
        const wrist = landmarks[0];
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        
        // Calculate finger openness
        const fingersOpen = this.getFingerOpenness(landmarks);
        const isFist = this.isFist(landmarks);
        const isOpen = this.isOpenHand(landmarks);
        const isPointing = this.isPointing(landmarks);
        
        // Check for punch (fast forward motion)
        const punchDetected = this.detectPunch(landmarks);
        if (punchDetected) {
            return { type: 'punch', confidence: punchDetected };
        }
        
        // Check for block (open hand, palm facing camera)
        if (isOpen && this.isPalmFacingCamera(landmarks)) {
            return { type: 'block', confidence: 0.9 };
        }
        
        // Check for special move (two fingers up)
        if (isPointing && !isFist) {
            return { type: 'special', confidence: 0.8 };
        }
        
        // Check for fist (ready state)
        if (isFist) {
            return { type: 'fist', confidence: 0.9 };
        }
        
        // Check for open hand (ready state)
        if (isOpen) {
            return { type: 'open', confidence: 0.8 };
        }
        
        return null;
    }
    
    getFingerOpenness(landmarks) {
        const tips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
        const mcp = [2, 5, 9, 13, 17]; // Base joints
        const pip = [3, 6, 10, 14, 18]; // Middle joints
        
        let openCount = 0;
        for (let i = 0; i < 5; i++) {
            const tip = landmarks[tips[i]];
            const pipJoint = landmarks[pip[i]];
            const mcpJoint = landmarks[mcp[i]];
            
            // Calculate if finger is extended
            const distance = this.distance3D(tip, pipJoint);
            const baseDistance = this.distance3D(pipJoint, mcpJoint);
            
            if (distance > baseDistance * 1.2) {
                openCount++;
            }
        }
        return openCount;
    }
    
    isFist(landmarks) {
        const openCount = this.getFingerOpenness(landmarks);
        return openCount <= 1; // 0 or 1 finger open = fist
    }
    
    isOpenHand(landmarks) {
        const openCount = this.getFingerOpenness(landmarks);
        return openCount >= 4; // 4 or 5 fingers open
    }
    
    isPointing(landmarks) {
        const openCount = this.getFingerOpenness(landmarks);
        const indexTip = landmarks[8];
        const indexMCP = landmarks[5];
        const thumbTip = landmarks[4];
        
        // Index finger extended, others closed
        const indexExtended = this.distance3D(indexTip, indexMCP) > 0.1;
        const thumbExtended = this.distance3D(thumbTip, landmarks[2]) > 0.05;
        
        return openCount === 2 && indexExtended && thumbExtended;
    }
    
    isPalmFacingCamera(landmarks) {
        // Check if palm is facing the camera
        const wrist = landmarks[0];
        const indexMCP = landmarks[5];
        const pinkyMCP = landmarks[17];
        
        // Calculate palm normal
        const v1 = new THREE.Vector3(
            indexMCP.x - wrist.x,
            indexMCP.y - wrist.y,
            indexMCP.z - wrist.z
        );
        const v2 = new THREE.Vector3(
            pinkyMCP.x - wrist.x,
            pinkyMCP.y - wrist.y,
            pinkyMCP.z - wrist.z
        );
        
        const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
        return normal.z < -0.3; // Palm facing camera
    }
    
    detectPunch(landmarks) {
        if (this.handHistory.length < 5) return null;
        
        const wrist = landmarks[0];
        const currentZ = wrist.z;
        
        // Check speed from history
        let speeds = [];
        for (let i = this.handHistory.length - 2; i >= 0; i--) {
            const prev = this.handHistory[i];
            if (!prev) continue;
            
            const prevWrist = prev.landmarks[0];
            const dz = prevWrist.z - currentZ;
            const dt = (Date.now() - prev.timestamp) / 1000;
            const speed = dz / dt;
            speeds.push(speed);
            
            if (speeds.length >= 3) break;
        }
        
        // Average speed
        if (speeds.length === 0) return null;
        const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        
        // Check if it's a punch (fast forward motion)
        if (avgSpeed > this.thresholds.punchSpeed) {
            // Check if hand is in fist
            if (this.isFist(landmarks)) {
                // Check if motion is in a straight line
                const history = this.handHistory.slice(-5);
                const positions = history.map(h => h.landmarks[0]);
                const isStraight = this.isStraightMotion(positions);
                
                if (isStraight) {
                    return avgSpeed;
                }
            }
        }
        
        return null;
    }
    
    isStraightMotion(positions) {
        if (positions.length < 3) return true;
        
        // Calculate variance in x and y
        const xs = positions.map(p => p.x);
        const ys = positions.map(p => p.y);
        
        const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
        
        const xVar = xs.reduce((a, b) => a + Math.pow(b - xMean, 2), 0) / xs.length;
        const yVar = ys.reduce((a, b) => a + Math.pow(b - yMean, 2), 0) / ys.length;
        
        return xVar < 0.001 && yVar < 0.001; // Straight line
    }
    
    getHandPosition(landmarks) {
        if (!landmarks || landmarks.length < 21) return null;
        
        const wrist = landmarks[0];
        const indexMCP = landmarks[5];
        const pinkyMCP = landmarks[17];
        
        // Calculate center of hand
        const center = new THREE.Vector3(
            (wrist.x + indexMCP.x + pinkyMCP.x) / 3,
            (wrist.y + indexMCP.y + pinkyMCP.y) / 3,
            (wrist.z + indexMCP.z + pinkyMCP.z) / 3
        );
        
        // Scale to world coordinates
        center.x = (center.x - 0.5) * 2;
        center.y = (0.5 - center.y) * 2;
        center.z = center.z * 2;
        
        return center;
    }
    
    distance3D(p1, p2) {
        return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) +
            Math.pow(p1.y - p2.y, 2) +
            Math.pow(p1.z - p2.z, 2)
        );
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        const camera = new Camera(document.createElement('video'), {
            onFrame: async () => {
                await this.hands.send({ image: document.createElement('canvas') });
            },
            width: 640,
            height: 480
        });
        
        // Actually start the camera
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.play();
                
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 480;
                const ctx = canvas.getContext('2d');
                
                const processFrame = () => {
                    if (!this.isRunning) return;
                    
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    this.hands.send({ image: canvas });
                    
                    requestAnimationFrame(processFrame);
                };
                
                processFrame();
            })
            .catch(error => {
                console.error('Camera error:', error);
                this.isRunning = false;
            });
    }
    
    stop() {
        this.isRunning = false;
        this.handHistory = [];
        this.landmarks = null;
    }
}