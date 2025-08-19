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
        
        if (bpmUpBtn) {
            bpmUpBtn.addEventListener('click', () => this.adjustBPM(1));
        }
        if (bpmDownBtn) {
            bpmDownBtn.addEventListener('click', () => this.adjustBPM(-1));
        }
        
        // Contrôles Key
        const keyUpBtn = document.getElementById('key-up');
        const keyDownBtn = document.getElementById('key-down');
        
        if (keyUpBtn) {
            keyUpBtn.addEventListener('click', () => this.adjustKey(1));
        }
        if (keyDownBtn) {
            keyDownBtn.addEventListener('click', () => this.adjustKey(-1));
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
        const newBPM = Math.max(50, Math.min(300, this.currentBPM + delta));
        
        if (newBPM === this.currentBPM) return;
        
        console.log(`[SimplePitchTempo] BPM: ${this.currentBPM} → ${newBPM}`);
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
        
        // console.log(`[SimplePitchTempo] Applying effects - Tempo: ${tempoRatio.toFixed(3)}, Pitch: ${pitchRatio.toFixed(3)}`);
        
        // Accéder aux stems du mixer principal si disponible
        if (window.mixer && window.mixer.stems) {
            for (const [stemName, stemData] of Object.entries(window.mixer.stems)) {
                if (stemData.soundTouchNode) {
                    try {
                        stemData.soundTouchNode.parameters.get('tempo').value = tempoRatio;
                        stemData.soundTouchNode.parameters.get('pitch').value = pitchRatio;
                        stemData.soundTouchNode.parameters.get('rate').value = 1.0;
                        // console.log(`[SimplePitchTempo] Updated ${stemName}: tempo=${tempoRatio.toFixed(3)}, pitch=${pitchRatio.toFixed(3)}`);
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
        
        // Activer/désactiver les boutons selon les limites
        const bpmUpBtn = document.getElementById('bpm-up');
        const bpmDownBtn = document.getElementById('bpm-down');
        
        if (bpmUpBtn) bpmUpBtn.disabled = this.currentBPM >= 300;
        if (bpmDownBtn) bpmDownBtn.disabled = this.currentBPM <= 50;
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
    
    reset() {
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