/**
 * Simple BPM & Pitch Controls for StemTube Mixer
 * Intégration simple des contrôles +/- BPM et Key dans la barre de transport
 */

class SimplePitchTempoController {
    constructor() {
        this.originalBPM = 120;
        this.currentBPM = 120;
        this.originalKey = 'C';
        this.currentKey = 'C';
        this.currentPitchShift = 0; // En semitones
        
        this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        this.audioContext = null;
        this.stemNodes = {};
        this.workletLoaded = false;
        
        this.init();
    }
    
    async init() {
        console.log('[SimplePitchTempo] Initializing...');
        
        // Attendre que l'audio context soit disponible
        if (window.audioContext) {
            this.audioContext = window.audioContext;
            await this.loadSoundTouchWorklet();
        } else {
            // Écouter l'événement audio context ready
            window.addEventListener('audioContextReady', async () => {
                this.audioContext = window.audioContext;
                await this.loadSoundTouchWorklet();
            });
        }
        
        this.setupEventListeners();
        this.updateDisplay();
    }
    
    async loadSoundTouchWorklet() {
        try {
            console.log('[SimplePitchTempo] Loading SoundTouch AudioWorklet...');
            await this.audioContext.audioWorklet.addModule('/static/wasm/soundtouch-worklet.js');
            this.workletLoaded = true;
            console.log('[SimplePitchTempo] SoundTouch AudioWorklet loaded successfully');
        } catch (error) {
            console.warn('[SimplePitchTempo] Failed to load SoundTouch AudioWorklet:', error);
            this.workletLoaded = false;
        }
    }
    
    setupEventListeners() {
        // Contrôles BPM
        const bpmUpBtn = document.getElementById('bpm-up');
        const bpmDownBtn = document.getElementById('bpm-down');
        const bpmResetBtn = document.getElementById('bpm-reset');
        
        if (bpmUpBtn) {
            bpmUpBtn.addEventListener('click', () => this.adjustBPM(1));
        }
        if (bpmDownBtn) {
            bpmDownBtn.addEventListener('click', () => this.adjustBPM(-1));
        }
        if (bpmResetBtn) {
            bpmResetBtn.addEventListener('click', () => this.resetBPM());
        }
        
        // Contrôles Key
        const keyUpBtn = document.getElementById('key-up');
        const keyDownBtn = document.getElementById('key-down');
        const keyResetBtn = document.getElementById('key-reset');
        
        if (keyUpBtn) {
            keyUpBtn.addEventListener('click', () => this.adjustKey(1));
        }
        if (keyDownBtn) {
            keyDownBtn.addEventListener('click', () => this.adjustKey(-1));
        }
        if (keyResetBtn) {
            keyResetBtn.addEventListener('click', () => this.resetKey());
        }
        
        // Écouter les événements du mixer
        window.addEventListener('stemLoaded', (event) => {
            console.log('[SimplePitchTempo] Stem loaded:', event.detail);
            this.updateAnalysisFromData(event.detail);
        });
        
        window.addEventListener('playbackStarted', () => {
            console.log('[SimplePitchTempo] Playback started, applying effects...');
            this.applyEffectsToStems();
        });
    }
    
    updateAnalysisFromData(data) {
        console.log('[SimplePitchTempo] Received analysis data:', data);
        
        // Récupérer les données d'analyse BPM/Key si disponibles
        if (data.detected_bpm && data.detected_bpm !== 120) {
            this.originalBPM = data.detected_bpm;
            this.currentBPM = data.detected_bpm;
            console.log(`[SimplePitchTempo] BPM détecté mis à jour: ${this.originalBPM}`);
        }
        
        if (data.detected_key && data.detected_key !== 'C major') {
            // Extraire la note principale (avant le space pour major/minor)
            const keyParts = data.detected_key.split(' ');
            if (keyParts[0] && this.noteNames.includes(keyParts[0])) {
                this.originalKey = keyParts[0];
                this.currentKey = keyParts[0];
                console.log(`[SimplePitchTempo] Tonalité détectée mise à jour: ${this.originalKey}`);
            }
        }
        
        console.log(`[SimplePitchTempo] Final values - BPM: ${this.currentBPM}, Key: ${this.currentKey}`);
        this.updateDisplay();
    }
    
    adjustBPM(delta) {
        // Calculate what the new BPM would be
        const targetBPM = this.currentBPM + delta;
        
        // Apply smart limits based on original BPM to prevent artifacts
        const maxSafeBPM = Math.min(300, this.originalBPM * 2.0);  // Max 2x increase
        const minSafeBPM = Math.max(50, this.originalBPM * 0.5);   // Min 0.5x decrease
        
        const newBPM = Math.max(minSafeBPM, Math.min(maxSafeBPM, targetBPM));
        
        if (newBPM === this.currentBPM) {
            // Check if we hit a limit and warn user
            if (targetBPM > maxSafeBPM) {
                console.warn(`[SimplePitchTempo] BPM limited to ${maxSafeBPM} to prevent artifacts (attempted ${targetBPM})`);
            } else if (targetBPM < minSafeBPM) {
                console.warn(`[SimplePitchTempo] BPM limited to ${minSafeBPM} to prevent artifacts (attempted ${targetBPM})`);
            }
            return;
        }
        
        // Calculate tempo ratio to check for artifacts threshold
        const tempoRatio = newBPM / this.originalBPM;
        
        // Warn user about potential artifacts at high tempo increases
        if (tempoRatio > 1.5) {
            console.warn(`[SimplePitchTempo] High tempo ratio ${tempoRatio.toFixed(2)}x may cause artifacts`);
        }
        
        console.log(`[SimplePitchTempo] BPM: ${this.currentBPM} → ${newBPM} (ratio: ${tempoRatio.toFixed(2)}x)`);
        this.currentBPM = newBPM;
        
        this.applyEffectsToStems();
        this.updateDisplay();
    }
    
    adjustKey(delta) {
        const currentIndex = this.noteNames.indexOf(this.currentKey);
        if (currentIndex === -1) return;
        
        let newIndex = (currentIndex + delta) % 12;
        if (newIndex < 0) newIndex += 12;
        
        const oldKey = this.currentKey;
        this.currentKey = this.noteNames[newIndex];
        
        // Calculer le shift en semitones
        this.currentPitchShift = (newIndex - this.noteNames.indexOf(this.originalKey)) % 12;
        if (this.currentPitchShift > 6) this.currentPitchShift -= 12;
        if (this.currentPitchShift < -6) this.currentPitchShift += 12;
        
        console.log(`[SimplePitchTempo] Key: ${oldKey} → ${this.currentKey} (${this.currentPitchShift >= 0 ? '+' : ''}${this.currentPitchShift} semitones)`);
        
        this.applyEffectsToStems();
        this.updateDisplay();
    }
    
    async applyEffectsToStems() {
        if (!this.audioContext || !this.workletLoaded) {
            console.warn('[SimplePitchTempo] Cannot apply effects: AudioContext or SoundTouch not ready');
            return;
        }
        
        const tempoRatio = this.currentBPM / this.originalBPM;
        const pitchRatio = Math.pow(2, this.currentPitchShift / 12);
        
        // Apply smart limits to reduce artifacts
        const safeTempoRatio = this.applySafeLimits(tempoRatio);
        const safePitchRatio = this.applySafeLimits(pitchRatio);
        
        // Warn if we had to limit the values
        if (Math.abs(safeTempoRatio - tempoRatio) > 0.01) {
            console.warn(`[SimplePitchTempo] Tempo limited from ${tempoRatio.toFixed(3)} to ${safeTempoRatio.toFixed(3)} to reduce artifacts`);
        }
        if (Math.abs(safePitchRatio - pitchRatio) > 0.01) {
            console.warn(`[SimplePitchTempo] Pitch limited from ${pitchRatio.toFixed(3)} to ${safePitchRatio.toFixed(3)} to reduce artifacts`);
        }
        
        // console.log(`[SimplePitchTempo] Applying effects - Tempo: ${safeTempoRatio.toFixed(3)}, Pitch: ${safePitchRatio.toFixed(3)}`);
        
        // Accéder aux stems du mixer principal si disponible
        if (window.mixer && window.mixer.stems) {
            for (const [stemName, stemData] of Object.entries(window.mixer.stems)) {
                if (stemData.soundTouchNode) {
                    try {
                        stemData.soundTouchNode.parameters.get('tempo').value = safeTempoRatio;
                        stemData.soundTouchNode.parameters.get('pitch').value = safePitchRatio;
                        stemData.soundTouchNode.parameters.get('rate').value = 1.0;
                        // console.log(`[SimplePitchTempo] Updated ${stemName}: tempo=${safeTempoRatio.toFixed(3)}, pitch=${safePitchRatio.toFixed(3)}`);
                    } catch (error) {
                        console.warn(`[SimplePitchTempo] Failed to update ${stemName}:`, error);
                    }
                }
            }
        }
        
        // Exposer l'instance globalement pour l'audio-engine
        window.mixer = window.mixer || {};
        window.mixer.stems = window.mixer.stems || {};
    }
    
    /**
     * Apply safe limits to prevent severe artifacts
     * Higher ratios (especially tempo increases) cause more artifacts
     */
    applySafeLimits(ratio) {
        // More conservative limits for tempo increases to reduce artifacts
        const minRatio = 0.5;  // 50% minimum (less artifacts when slowing down)
        const maxRatio = 2.0;  // 200% maximum (reduce from 4.0x to prevent artifacts)
        
        // Apply gradual quality degradation warnings
        if (ratio > 1.8) {
            console.warn(`[SimplePitchTempo] Ratio ${ratio.toFixed(2)}x approaching quality limits`);
        }
        
        return Math.max(minRatio, Math.min(maxRatio, ratio));
    }
    
    updateDisplay() {
        // Mettre à jour l'affichage BPM
        const bpmDisplay = document.getElementById('current-bpm');
        if (bpmDisplay) {
            bpmDisplay.textContent = this.currentBPM.toString();
        }
        
        // Mettre à jour l'affichage Key
        const keyDisplay = document.getElementById('current-key');
        if (keyDisplay) {
            keyDisplay.textContent = this.currentKey;
        }
        
        // Calculate smart limits based on original BPM
        const maxSafeBPM = Math.min(300, this.originalBPM * 2.0);
        const minSafeBPM = Math.max(50, this.originalBPM * 0.5);
        
        // Activer/désactiver les boutons selon les limites intelligentes
        const bpmUpBtn = document.getElementById('bpm-up');
        const bpmDownBtn = document.getElementById('bpm-down');
        
        if (bpmUpBtn) {
            bpmUpBtn.disabled = this.currentBPM >= maxSafeBPM;
            // Add visual feedback for limits
            if (this.currentBPM >= maxSafeBPM) {
                bpmUpBtn.title = `Maximum safe BPM (${maxSafeBPM}) reached to prevent artifacts`;
            } else if (this.currentBPM >= this.originalBPM * 1.5) {
                bpmUpBtn.title = 'Warning: High tempo ratios may cause artifacts';
            } else {
                bpmUpBtn.title = 'Increase BPM';
            }
        }
        
        if (bpmDownBtn) {
            bpmDownBtn.disabled = this.currentBPM <= minSafeBPM;
            if (this.currentBPM <= minSafeBPM) {
                bpmDownBtn.title = `Minimum safe BPM (${minSafeBPM}) reached`;
            } else {
                bpmDownBtn.title = 'Decrease BPM';
            }
        }
    }
    
    // Méthodes publiques pour intégration
    setBPM(bpm) {
        this.currentBPM = Math.max(50, Math.min(300, bpm));
        this.applyEffectsToStems();
        this.updateDisplay();
    }
    
    setKey(key) {
        if (this.noteNames.includes(key)) {
            this.currentKey = key;
            this.currentPitchShift = (this.noteNames.indexOf(key) - this.noteNames.indexOf(this.originalKey)) % 12;
            if (this.currentPitchShift > 6) this.currentPitchShift -= 12;
            if (this.currentPitchShift < -6) this.currentPitchShift += 12;
            
            this.applyEffectsToStems();
            this.updateDisplay();
        }
    }
    
    resetBPM() {
        console.log(`[SimplePitchTempo] Resetting BPM from ${this.currentBPM} to ${this.originalBPM}`);
        this.currentBPM = this.originalBPM;
        this.applyEffectsToStems();
        this.updateDisplay();
    }
    
    resetKey() {
        console.log(`[SimplePitchTempo] Resetting Key from ${this.currentKey} to ${this.originalKey}`);
        this.currentKey = this.originalKey;
        this.currentPitchShift = 0;
        this.applyEffectsToStems();
        this.updateDisplay();
    }
    
    reset() {
        console.log(`[SimplePitchTempo] Resetting both BPM and Key to original values`);
        this.currentBPM = this.originalBPM;
        this.currentKey = this.originalKey;
        this.currentPitchShift = 0;
        
        this.applyEffectsToStems();
        this.updateDisplay();
    }
}

// Initialiser automatiquement quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    console.log('[SimplePitchTempo] DOM ready, initializing...');
    window.simplePitchTempo = new SimplePitchTempoController();
});

// Export pour utilisation externe
window.SimplePitchTempoController = SimplePitchTempoController;