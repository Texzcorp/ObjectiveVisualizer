// Initialize canvas and audio elements
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const audioFileInput = document.getElementById('audioFile');
const controls = document.querySelector('.controls');

// Initialize variables
let audioContext;
let analyser;
let dataArray;
let bufferLength;
let audioBuffer = null;
let audioSource = null;

// Canvas dimensions
let centerX;
let centerY;
let maxRadius;

// Update canvas dimensions
function updateCanvasDimensions() {
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
}

// Resize canvas to full window size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    updateCanvasDimensions();
}

// Handle window resize
window.addEventListener('resize', resizeCanvas);

// Initial resize
resizeCanvas();

// Animation state
let state = {
    intensity: 0,
    frequencies: [],
    tunnelRotation: 0,
    targetTunnelRotation: 0,
    particlePositions: [],
    tunnelRadius: 0,
    targetTunnelRadius: 0,
    glowIntensity: 0,
    targetGlowIntensity: 0,
    waveOffsets: [],
    frequencyIntensities: [], // Intensités spécifiques par bande de fréquence
    hueRotation: 0,
    evolutionTime: 0,
    circleScale: 1,
    targetCircleScale: 1,
    circleScales: [],
    targetCircleScales: []
};

// Initialize Audio Context and Analyser
function initAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Augmentation de la résolution FFT
    analyser.smoothingTimeConstant = 0.85; // Légèrement plus réactif
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    // Initialize animation state
    state.frequencies = new Array(bufferLength).fill(0);
    state.waveOffsets = new Array(bufferLength).fill(0);
    state.frequencyIntensities = new Array(bufferLength).fill(0);
    
    // Initialize circle scales
    const numCircles = 15;
    state.circleScales = new Array(numCircles).fill(1);
    state.targetCircleScales = new Array(numCircles).fill(1);
    
    updateCanvasDimensions();
    initializeParticles();
}

// Fonction pour calculer l'intensité d'une bande de fréquence spécifique
function getFrequencyIntensity(frequencies, startIndex, endIndex) {
    let sum = 0;
    for (let i = startIndex; i < endIndex; i++) {
        sum += frequencies[i];
    }
    return sum / (endIndex - startIndex) / 255;
}

// Initialize particles
function initializeParticles() {
    state.particlePositions = Array(100).fill(0).map(() => ({
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        radius: 0,
        targetRadius: 0,
        angle: Math.random() * Math.PI * 2,
        speed: 0.1 + Math.random() * 0.2
    }));
}

// Smooth value with configurable easing
function smoothValue(current, target, factor = 0.1, threshold = 0.001) {
    if (Math.abs(current - target) < threshold) return target;
    return current + (target - current) * factor;
}

// Update animation state
function updateState(rawData) {
    // Update audio intensity with frequency weighting
    const bassWeight = 1.5;  // Plus d'importance aux basses
    const midWeight = 1.2;   // Importance moyenne aux médiums
    const highWeight = 1.0;  // Importance normale aux aigus
    
    const bassRange = Math.floor(bufferLength * 0.1);  // 0-10% pour les basses
    const midRange = Math.floor(bufferLength * 0.5);   // 10-50% pour les médiums
    
    const bassIntensity = getFrequencyIntensity(rawData, 0, bassRange) * bassWeight;
    const midIntensity = getFrequencyIntensity(rawData, bassRange, midRange) * midWeight;
    const highIntensity = getFrequencyIntensity(rawData, midRange, bufferLength) * highWeight;
    
    state.intensity = (bassIntensity + midIntensity + highIntensity) / 3;

    // Update evolution time
    state.evolutionTime += 0.001 + state.intensity * 0.002;

    // Mise à jour des intensités de fréquence avec plus de précision
    for (let i = 0; i < bufferLength; i++) {
        const freq = rawData[i] / 255;
        // Appliquer des poids différents selon la plage de fréquences
        let weight = 1.0;
        if (i < bassRange) weight = bassWeight;
        else if (i < midRange) weight = midWeight;
        
        const targetIntensity = freq * weight;
        state.frequencyIntensities[i] = smoothValue(
            state.frequencyIntensities[i],
            targetIntensity,
            0.2 + freq * 0.3  // Interpolation plus rapide pour les pics
        );
    }

    // Update circle scale with smooth oscillation
    state.targetCircleScale = 1 + 
        Math.sin(state.evolutionTime * 0.5) * 0.3 + 
        Math.cos(state.evolutionTime * 0.3) * 0.2 +
        state.intensity * 0.4;
    state.circleScale = smoothValue(state.circleScale, state.targetCircleScale, 0.05);

    // Update individual circle scales
    state.circleScales.forEach((scale, i) => {
        // Créer des variations uniques pour chaque cercle
        const uniquePhase = state.evolutionTime * (0.2 + i * 0.1);
        const uniqueFreq = 0.3 + i * 0.15;
        
        // Combiner plusieurs ondes sinusoïdales avec des fréquences différentes
        state.targetCircleScales[i] = 1 + 
            Math.sin(uniquePhase * uniqueFreq) * 0.5 +
            Math.cos(uniquePhase * (uniqueFreq * 0.7)) * 0.3 +
            Math.sin(uniquePhase * (uniqueFreq * 1.3)) * 0.2 +
            state.intensity * (0.3 + Math.sin(i * 0.5) * 0.2);
            
        // Interpoler vers la cible
        state.circleScales[i] = smoothValue(state.circleScales[i], state.targetCircleScales[i], 0.05);
    });

    // Update frequencies with smooth interpolation
    for (let i = 0; i < bufferLength; i++) {
        state.frequencies[i] = smoothValue(state.frequencies[i], rawData[i] / 255, 0.15);
    }

    // Update tunnel rotation with evolution
    state.targetTunnelRotation = state.evolutionTime * (0.1 + state.intensity * 0.2);
    state.tunnelRotation = smoothValue(state.tunnelRotation, state.targetTunnelRotation, 0.1);

    // Update tunnel radius with evolution
    state.targetTunnelRadius = (0.5 + 
        Math.sin(state.evolutionTime * 0.3) * 0.1 + 
        Math.cos(state.evolutionTime * 0.7) * 0.15) * 
        (1 + state.intensity * 0.3);
    state.tunnelRadius = smoothValue(state.tunnelRadius, state.targetTunnelRadius, 0.1);

    // Update glow intensity with evolution
    state.targetGlowIntensity = (0.3 + 
        Math.sin(state.evolutionTime * 0.4) * 0.1) * 
        (1 + state.intensity * 0.5);
    state.glowIntensity = smoothValue(state.glowIntensity, state.targetGlowIntensity, 0.1);

    // Update wave offsets with evolution
    for (let i = 0; i < bufferLength; i++) {
        const phase = state.evolutionTime + i * 0.1;
        const targetOffset = state.frequencies[i] * 
            (Math.sin(phase) * Math.cos(phase * 0.5)) * 
            (30 + Math.sin(state.evolutionTime * 0.2) * 10);
        state.waveOffsets[i] = smoothValue(state.waveOffsets[i], targetOffset, 0.1);
    }

    // Update particle positions with evolution
    state.particlePositions.forEach((particle, i) => {
        const freqIndex = Math.floor((i / state.particlePositions.length) * bufferLength);
        const intensity = state.frequencies[freqIndex];
        
        // Dynamic radius based on evolution
        const radiusFactor = 0.2 + 
            Math.sin(state.evolutionTime * 0.3 + i * 0.1) * 0.1 + 
            Math.cos(state.evolutionTime * 0.5 + i * 0.2) * 0.15;
        particle.targetRadius = (radiusFactor + intensity * 0.5) * maxRadius;
        particle.radius = smoothValue(particle.radius, particle.targetRadius, 0.1);
        
        // Dynamic speed based on evolution and intensity
        const speedFactor = 0.01 + 
            Math.sin(state.evolutionTime * 0.4 + i * 0.3) * 0.005 + 
            state.intensity * 0.02;
        particle.angle += particle.speed * speedFactor;
        
        particle.targetX = centerX + Math.cos(particle.angle) * particle.radius;
        particle.targetY = centerY + Math.sin(particle.angle) * particle.radius;
        
        particle.x = smoothValue(particle.x, particle.targetX, 0.1);
        particle.y = smoothValue(particle.y, particle.targetY, 0.1);
    });

    // Update color rotation with evolution
    state.hueRotation = (state.hueRotation + 0.5 * state.intensity + 
        Math.sin(state.evolutionTime * 0.2) * 2) % 360;
}

// Pre-calculate angles and lookup tables
const NUM_POINTS = 360;
const ANGLE_STEP = (2 * Math.PI) / NUM_POINTS;
const cosTable = new Float32Array(NUM_POINTS);
const sinTable = new Float32Array(NUM_POINTS);

for (let i = 0; i < NUM_POINTS; i++) {
    const angle = i * ANGLE_STEP;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
}

// Pre-allocated buffers
const MAX_CIRCLES = 5;
const pointsX = new Float32Array(NUM_POINTS);
const pointsY = new Float32Array(NUM_POINTS);
const frequencies = new Float32Array(3); // [bass, mid, high]
const colorCache = new Array(360).fill(null).map(() => ({}));

// Lookup tables
const offsetTable = new Float32Array(NUM_POINTS * 4); // For different frequency scales

// Initialize lookup tables
(function initLookupTables() {
    for (let i = 0; i < NUM_POINTS; i++) {
        const angle = i * ANGLE_STEP;
        cosTable[i] = Math.cos(angle);
        sinTable[i] = Math.sin(angle);
        
        // Pre-calculate different frequency scales
        for (let scale = 0; scale < 4; scale++) {
            offsetTable[i * 4 + scale] = Math.sin(i * (scale * 0.3));
        }
    }
})();

// Get cached color
function getCachedColor(hue, saturation, lightness) {
    const key = Math.floor(hue);
    const cache = colorCache[key];
    const satKey = Math.floor(saturation);
    const lightKey = Math.floor(lightness);
    
    if (!cache[satKey]) cache[satKey] = {};
    if (!cache[satKey][lightKey]) {
        cache[satKey][lightKey] = `hsl(${key}, ${satKey}%, ${lightKey}%)`;
    }
    
    return cache[satKey][lightKey];
}

// Calculate all frequency bands in one pass
function updateFrequencyBands() {
    let bassSum = 0, midSum = 0, highSum = 0;
    let bassCount = 0, midCount = 0, highCount = 0;
    
    for (let i = 0; i < bufferLength; i++) {
        const frequency = i * audioContext.sampleRate / analyser.fftSize;
        const amplitude = dataArray[i] / 255.0;
        
        if (frequency < 100) {
            bassSum += amplitude;
            bassCount++;
        } else if (frequency < 2000) {
            midSum += amplitude;
            midCount++;
        } else {
            highSum += amplitude;
            highCount++;
        }
    }
    
    frequencies[0] = bassSum / bassCount;
    frequencies[1] = midSum / midCount;
    frequencies[2] = highSum / highCount;
}

// Draw a single circle with pre-allocated buffers
function drawCircle(radius, freqOffset, intensity) {
    const baseOffset = time * 2;
    const intensityFactor = intensity * 50;
    const freqScale = freqOffset * 0.3;
    
    // Reuse existing arrays instead of creating new points
    for (let i = 0; i < NUM_POINTS; i++) {
        const freqIndex = (i + (baseOffset * 10 | 0)) % bufferLength;
        const freqData = dataArray[freqIndex] / 255.0;
        
        const offset = freqData * intensityFactor;
        const r = radius + Math.sin(i * freqScale + baseOffset) * offset;
        
        // Direct array access is faster than push
        pointsX[i] = centerX + r * cosTable[i];
        pointsY[i] = centerY + r * sinTable[i];
    }
    
    // Batch canvas operations
    canvasCtx.beginPath();
    canvasCtx.moveTo(pointsX[0], pointsY[0]);
    
    // Unrolled first iterations for better branch prediction
    canvasCtx.lineTo(pointsX[1], pointsY[1]);
    canvasCtx.lineTo(pointsX[2], pointsY[2]);
    canvasCtx.lineTo(pointsX[3], pointsY[3]);
    
    // Main loop with fewer bounds checks
    for (let i = 4; i < NUM_POINTS - 4; i += 4) {
        canvasCtx.lineTo(pointsX[i], pointsY[i]);
        canvasCtx.lineTo(pointsX[i + 1], pointsY[i + 1]);
        canvasCtx.lineTo(pointsX[i + 2], pointsY[i + 2]);
        canvasCtx.lineTo(pointsX[i + 3], pointsY[i + 3]);
    }
    
    // Handle remaining points
    for (let i = NUM_POINTS - (NUM_POINTS % 4); i < NUM_POINTS; i++) {
        canvasCtx.lineTo(pointsX[i], pointsY[i]);
    }
    
    canvasCtx.closePath();
}

// Draw frame with optimized calculations
function drawFrame() {
    // Use integer division for frequency calculations
    const bassIntensity = getFrequencyIntensity(0, 100) * 1.5;
    const midIntensity = getFrequencyIntensity(100, 2000);
    const highIntensity = getFrequencyIntensity(2000, 16000) * 0.8;
    
    // Clear with minimal state changes
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Optimize loop calculations
    const timeScale = time * 0.5;
    const numCircles = 5;
    const radiusStep = maxRadius / numCircles;
    
    // Cache frequently accessed values
    let currentRadius = radiusStep;
    let currentIntensity;
    
    for (let i = 1; i <= numCircles; i++, currentRadius += radiusStep) {
        currentIntensity = (bassIntensity * (numCircles - i) + midIntensity * i) / numCircles;
        
        // Minimize string concatenations
        const hue = ((timeScale * 20 + i * 30) % 360) | 0;
        const saturation = ((80 + highIntensity * 20) | 0);
        const lightness = ((50 + currentIntensity * 20) | 0);
        
        canvasCtx.strokeStyle = `hsl(${hue},${saturation}%,${lightness}%)`;
        canvasCtx.lineWidth = 2 + currentIntensity * 3;
        
        drawCircle(currentRadius, i, currentIntensity);
    }
}

// Main draw frame function
function drawFrameMain() {
    // Update dimensions in case of window resize
    updateCanvasDimensions();

    // Semi-transparent overlay for trail effect
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Get and update audio data
    analyser.getByteFrequencyData(dataArray);
    updateState(dataArray);

    // Set global glow effect
    canvasCtx.shadowBlur = 15 + state.glowIntensity * 10;
    canvasCtx.shadowColor = `hsla(${state.hueRotation}, 70%, 50%, ${state.glowIntensity})`;

    // Draw tunnel
    const numCircles = 15;
    const numPoints = 360; // Doublé pour plus de précision

    for (let i = 0; i < numCircles; i++) {
        const progress = i / numCircles;
        const z = progress * maxRadius;
        const perspective = 1 / (1 + z * 0.001);
        
        const circleScale = state.circleScales[i];
        const baseRadius = maxRadius * state.tunnelRadius * circleScale * perspective;

        canvasCtx.beginPath();
        for (let j = 0; j <= numPoints; j++) {
            const angle = (j / numPoints) * Math.PI * 2 + state.tunnelRotation +
                         Math.sin(state.evolutionTime * (0.2 + i * 0.05)) * 0.2;
            
            // Utilisation plus précise des fréquences
            const freqIndex = Math.floor((j / numPoints) * bufferLength);
            const intensity = state.frequencyIntensities[freqIndex];
            
            // Calcul amélioré des déformations
            const waveIntensity = intensity * (1 + Math.sin(state.evolutionTime * (0.3 + i * 0.1)) * 0.3);
            const frequencyEffect = Math.sin(angle * 3 + state.evolutionTime) * 
                                  Math.cos(angle * 2 - state.evolutionTime) *
                                  (40 + intensity * 60); // Augmentation de l'amplitude
            
            const waveOffset = (waveIntensity * frequencyEffect + 
                              state.waveOffsets[freqIndex]) * perspective;
            
            const r = baseRadius + waveOffset;
            
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            
            if (j === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
        }

        // Variations de couleur basées sur les fréquences
        const freqIndex = Math.floor(i / numCircles * bufferLength);
        const freqIntensity = state.frequencyIntensities[freqIndex];
        
        const hue = (state.hueRotation + z * 0.5 + 
            Math.sin(state.evolutionTime * (0.3 + i * 0.1)) * 20 +
            freqIntensity * 30) % 360;
            
        const sat = 80 + state.intensity * 20;
        const light = Math.max(20, 40 - z * 0.05 + 
            state.intensity * 30 +
            freqIntensity * 20 +
            Math.sin(state.evolutionTime * (0.4 + i * 0.15)) * 10);

        canvasCtx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${0.05 + perspective * 0.2})`;
        canvasCtx.lineWidth = (4 + Math.sin(state.evolutionTime * (1 + i * 0.2)) * 2 + 
            freqIntensity * 3) * perspective;
        canvasCtx.stroke();

        canvasCtx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${0.15 + perspective * 0.3})`;
        canvasCtx.lineWidth = (2 + Math.sin(state.evolutionTime * (1 + i * 0.2)) + 
            freqIntensity * 2) * perspective;
        canvasCtx.stroke();
    }

    // Draw particles
    state.particlePositions.forEach((particle, i) => {
        const freqIndex = Math.floor((i / state.particlePositions.length) * bufferLength);
        const intensity = state.frequencies[freqIndex];
        
        const particleSize = (1 + intensity * 2) * 
            (1 + Math.sin(state.evolutionTime * 0.5 + i * 0.1) * 0.3);
        const particleHue = (state.hueRotation + i * 3 + 
            Math.sin(state.evolutionTime * 0.4 + i * 0.2) * 30) % 360;
        
        canvasCtx.shadowBlur = 10 + intensity * 5;
        canvasCtx.shadowColor = `hsla(${particleHue}, 100%, 70%, ${intensity * 0.8})`;
        
        // Outer glow
        canvasCtx.fillStyle = `hsla(${particleHue}, 100%, 70%, ${intensity * 0.3})`;
        canvasCtx.beginPath();
        canvasCtx.arc(particle.x, particle.y, particleSize * 2, 0, Math.PI * 2);
        canvasCtx.fill();
        
        // Core
        canvasCtx.fillStyle = `hsla(${particleHue}, 100%, 70%, ${intensity * 0.7})`;
        canvasCtx.beginPath();
        canvasCtx.arc(particle.x, particle.y, particleSize, 0, Math.PI * 2);
        canvasCtx.fill();
    });
}

// Visualize the audio
function visualize() {
    // Clear canvas before starting
    canvasCtx.fillStyle = 'black';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    function draw() {
        analyser.getByteFrequencyData(dataArray);
        time += 0.01;
        drawFrameMain();
        requestAnimationFrame(draw);
    }
    draw();
}

// Initialize event listeners
audioFileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            audioContext.decodeAudioData(e.target.result, function(buffer) {
                audioBuffer = buffer;
                startAudioPlayback();
            });
        };
        reader.readAsArrayBuffer(file);
    }
});

function startAudioPlayback() {
    if (audioSource) {
        audioSource.stop();
    }
    
    // Hide controls immediately
    controls.classList.add('hidden');
    
    // Wait for 1 second before starting
    setTimeout(() => {
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(analyser);
        analyser.connect(audioContext.destination);
        audioSource.start();
        time = 0;
        
        // Start visualization
        visualize();
    }, 1000); // 1 second delay
}

// Add key listener to toggle controls visibility
document.addEventListener('keydown', function(event) {
    // Press 'H' to toggle controls
    if (event.key.toLowerCase() === 'h') {
        controls.classList.toggle('hidden');
    }
});

// Initialize audio context
initAudioContext();
