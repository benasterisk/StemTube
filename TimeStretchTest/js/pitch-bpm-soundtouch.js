/**
 * Enhanced BPM & Pitch SoundTouch Implementation
 * Combines BPM detection, pitch detection, and semitone pitch shifting
 * Uses SoundTouch for independent tempo and pitch control
 */

import { BPMDetector } from './bpm-detector.js';
import { PitchDetector } from './pitch-detector.js';

class PitchBPMSoundTouchMixer {
    constructor() {
        this.audioContext = null;
        this.stems = {};
        this.isPlaying = false;
        
        // BPM control
        this.originalBPM = 105; // Will be detected
        this.currentBPM = 105;   // Current target BPM
        
        // Pitch control  
        this.originalKey = { note: 'C', octave: 4, frequency: 261.63 }; // Will be detected
        this.currentPitchShift = 0; // Semitones shift from original
        this.targetKey = { note: 'C', octave: 4 }; // Target key for transposition
        
        // Audio control
        this.masterVolume = 0.5;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.stemNames = ['vocals', 'drums', 'bass', 'other'];
        this.workletLoaded = false;
        this.bpmDetector = null;
        this.pitchDetector = null;
        this.analysisComplete = false;
        
        this.init();
    }
    
    async init() {
        this.log('Initializing Pitch & BPM SoundTouch Mixer...');
        
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext created successfully');
            
            // Initialize detectors
            this.bpmDetector = new BPMDetector(this.audioContext);
            this.pitchDetector = new PitchDetector(this.audioContext);
            
            // Load the SoundTouch AudioWorklet
            await this.loadSoundTouchWorklet();
            
            // Create master gain node
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
            
            // Load stems and analyze
            await this.loadStems();
            
            // Setup UI
            this.setupUI();
            
            this.log('Pitch & BPM SoundTouch Mixer initialized successfully');
        } catch (error) {
            this.log('Initialization error: ' + error.message);
            await this.initFallback();
        }
    }
    
    async loadSoundTouchWorklet() {
        this.log('Loading SoundTouch AudioWorklet...');
        
        try {
            await this.audioContext.audioWorklet.addModule('wasm/soundtouch-worklet.js');
            this.workletLoaded = true;
            this.log('SoundTouch AudioWorklet loaded successfully');
        } catch (error) {
            this.log('Failed to load SoundTouch AudioWorklet: ' + error.message);
            throw error;
        }
    }
    
    async initFallback() {
        this.log('Initializing fallback mode (no SoundTouch)...');
        
        if (!this.masterGainNode) {
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
        }
        
        await this.loadStems();
        this.setupUI();
        
        this.log('Fallback mode initialized (using playbackRate - affects both tempo and pitch)');
    }
    
    async loadStems() {
        this.log('Loading stems and analyzing...');
        
        let firstStemBuffer = null;
        
        for (const stemName of this.stemNames) {
            try {
                const response = await fetch(`stems/${stemName}.mp3`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                this.stems[stemName] = {
                    buffer: audioBuffer,
                    source: null,
                    soundTouchNode: null,
                    gainNode: null,
                    volume: 1.0,
                    muted: false
                };
                
                // Use first stem for analysis
                if (!firstStemBuffer) {
                    firstStemBuffer = audioBuffer;
                }
                
                this.log(`Loaded ${stemName}: ${audioBuffer.duration.toFixed(2)}s`);
            } catch (error) {
                this.log(`Error loading ${stemName}: ${error.message}`);
            }
        }
        
        // Analyze BPM and pitch
        if (firstStemBuffer) {
            await this.analyzeAudio(firstStemBuffer);
        }
        
        this.log(`Loaded ${Object.keys(this.stems).length} stems | BPM: ${this.originalBPM} | Key: ${this.originalKey.note}${this.originalKey.octave}`);
    }
    
    async analyzeAudio(audioBuffer) {
        this.log('Analyzing audio for BPM and pitch...');
        
        try {
            // Detect BPM
            this.originalBPM = await this.bpmDetector.detectBPMFromBuffer(audioBuffer);
            this.currentBPM = this.originalBPM;
            
            // Detect key/pitch
            this.originalKey = await this.pitchDetector.detectKeyFromBuffer(audioBuffer);
            this.targetKey = { ...this.originalKey };
            
            this.analysisComplete = true;
            this.log(`Analysis complete - BPM: ${this.originalBPM}, Key: ${this.originalKey.note}${this.originalKey.octave} (${this.originalKey.frequency.toFixed(1)}Hz)`);
        } catch (error) {
            this.log(`Analysis failed: ${error.message}`);
            // Use fallback values
            this.originalBPM = 105;
            this.currentBPM = 105;
            this.originalKey = { note: 'C', octave: 4, frequency: 261.63 };
            this.targetKey = { ...this.originalKey };
        }
    }
    
    async createStemNodes() {
        const tempoRatio = this.currentBPM / this.originalBPM;
        const pitchRatio = Math.pow(2, this.currentPitchShift / 12); // Convert semitones to frequency ratio
        
        for (const [stemName, stem] of Object.entries(this.stems)) {
            if (!stem.buffer) continue;
            
            // Create new source
            stem.source = this.audioContext.createBufferSource();
            stem.source.buffer = stem.buffer;
            
            // Create gain node
            stem.gainNode = this.audioContext.createGain();
            stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
            
            if (this.workletLoaded) {
                try {
                    // Use SoundTouch for independent tempo and pitch control
                    stem.soundTouchNode = new AudioWorkletNode(this.audioContext, 'soundtouch-processor');
                    
                    // Set parameters for independent control:
                    // - tempo: changes speed without affecting pitch
                    // - pitch: changes pitch without affecting tempo
                    // - rate: should stay at 1.0 for independent control
                    stem.soundTouchNode.parameters.get('tempo').value = tempoRatio;
                    stem.soundTouchNode.parameters.get('pitch').value = pitchRatio;
                    stem.soundTouchNode.parameters.get('pitchSemitones').value = 0; // Don't use this - it adds to pitch
                    stem.soundTouchNode.parameters.get('rate').value = 1.0;
                    
                    // Connect: source -> SoundTouch -> gain -> master
                    stem.source.connect(stem.soundTouchNode);
                    stem.soundTouchNode.connect(stem.gainNode);
                    stem.gainNode.connect(this.masterGainNode);
                    
                    this.log(`Using SoundTouch for ${stemName} (tempo: ${tempoRatio.toFixed(3)}, pitch: ${pitchRatio.toFixed(3)})`);
                } catch (stError) {
                    this.log(`SoundTouch failed for ${stemName}: ${stError.message}, using fallback`);
                    this.connectFallback(stem);
                }
            } else {
                this.connectFallback(stem);
            }
        }
    }
    
    connectFallback(stem) {
        // Fallback: use playbackRate (affects both tempo and pitch)
        const tempoRatio = this.currentBPM / this.originalBPM;
        const pitchRatio = Math.pow(2, this.currentPitchShift / 12);
        const combinedRatio = tempoRatio * pitchRatio;
        
        stem.source.playbackRate.value = combinedRatio;
        
        // Connect: source -> gain -> master
        stem.source.connect(stem.gainNode);
        stem.gainNode.connect(this.masterGainNode);
        
        this.log(`Using playbackRate fallback for ${Object.keys(this.stems).find(k => this.stems[k] === stem)} (${this.currentBPM} BPM, ${this.currentPitchShift >= 0 ? '+' : ''}${this.currentPitchShift} semitones, ratio: ${combinedRatio.toFixed(3)})`);
    }
    
    async play() {
        if (this.isPlaying) return;
        
        this.log(`Starting playback at ${this.currentBPM} BPM, ${this.currentPitchShift >= 0 ? '+' : ''}${this.currentPitchShift} semitones (SoundTouch: ${this.workletLoaded})`);
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Create new nodes
        await this.createStemNodes();
        
        // Calculate start time
        const offset = this.pauseTime || 0;
        this.startTime = this.audioContext.currentTime;
        
        // Start all stems synchronized
        for (const [stemName, stem] of Object.entries(this.stems)) {
            if (stem.source && stem.buffer) {
                stem.source.start(this.startTime, offset);
                this.log(`Started playback for ${stemName}`);
            }
        }
        
        this.isPlaying = true;
        this.updateUI();
    }
    
    pause() {
        if (!this.isPlaying) return;
        
        this.log('Pausing playback');
        
        // Calculate current position
        const elapsed = this.audioContext.currentTime - this.startTime;
        this.pauseTime = (this.pauseTime || 0) + elapsed;
        
        this.stopAllSources();
        this.isPlaying = false;
        this.updateUI();
    }
    
    stop() {
        this.log('Stopping playback');
        this.stopAllSources();
        this.pauseTime = 0;
        this.isPlaying = false;
        this.updateUI();
    }
    
    stopAllSources() {
        for (const stem of Object.values(this.stems)) {
            if (stem.source) {
                try {
                    stem.source.stop();
                } catch (e) {
                    // Source may already be stopped
                }
                stem.source = null;
                stem.soundTouchNode = null;
            }
        }
    }
    
    // BPM Controls
    adjustBPM(deltaBPM) {
        const newBPM = Math.max(50, Math.min(300, this.currentBPM + deltaBPM));
        
        if (newBPM === this.currentBPM) return;
        
        this.log(`Adjusting BPM from ${this.currentBPM} to ${newBPM} (${deltaBPM >= 0 ? '+' : ''}${deltaBPM})`);
        this.currentBPM = newBPM;
        
        // Update SoundTouch parameters in real-time if playing
        if (this.isPlaying && this.workletLoaded) {
            const tempoRatio = this.currentBPM / this.originalBPM;
            for (const [stemName, stem] of Object.entries(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('tempo').value = tempoRatio;
                    this.log(`Updated ${stemName} to ${newBPM} BPM (ratio: ${tempoRatio.toFixed(3)})`);
                }
            }
        } else if (this.isPlaying) {
            // Restart playback for fallback mode
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    resetBPM() {
        this.log(`Resetting BPM to original: ${this.originalBPM}`);
        this.currentBPM = this.originalBPM;
        
        if (this.isPlaying && this.workletLoaded) {
            for (const stem of Object.values(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('tempo').value = 1.0;
                }
            }
        } else if (this.isPlaying) {
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    // Pitch Controls
    adjustPitch(deltaSemitones) {
        const newPitchShift = Math.max(-12, Math.min(12, this.currentPitchShift + deltaSemitones));
        
        if (newPitchShift === this.currentPitchShift) return;
        
        this.log(`Adjusting pitch from ${this.currentPitchShift >= 0 ? '+' : ''}${this.currentPitchShift} to ${newPitchShift >= 0 ? '+' : ''}${newPitchShift} semitones`);
        this.currentPitchShift = newPitchShift;
        
        // Calculate target note
        const targetNote = this.calculateTargetNote(this.currentPitchShift);
        this.targetKey = targetNote;
        
        // Update SoundTouch parameters in real-time if playing
        if (this.isPlaying && this.workletLoaded) {
            const pitchRatio = Math.pow(2, this.currentPitchShift / 12);
            for (const [stemName, stem] of Object.entries(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('pitch').value = pitchRatio;
                    this.log(`Updated ${stemName} pitch to ${newPitchShift >= 0 ? '+' : ''}${newPitchShift} semitones (ratio: ${pitchRatio.toFixed(3)})`);
                }
            }
        } else if (this.isPlaying) {
            // Restart playback for fallback mode
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    resetPitch() {
        this.log('Resetting pitch to original');
        this.currentPitchShift = 0;
        this.targetKey = { ...this.originalKey };
        
        if (this.isPlaying && this.workletLoaded) {
            for (const stem of Object.values(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('pitch').value = 1.0;
                }
            }
        } else if (this.isPlaying) {
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    transposeToKey(targetNote, targetOctave) {
        if (!this.analysisComplete) {
            this.log('Cannot transpose: analysis not complete');
            return;
        }
        
        const semitoneShift = this.pitchDetector.calculateSemitoneShift(
            this.originalKey.note, this.originalKey.octave,
            targetNote, targetOctave
        );
        
        this.log(`Transposing from ${this.originalKey.note}${this.originalKey.octave} to ${targetNote}${targetOctave} (${semitoneShift >= 0 ? '+' : ''}${semitoneShift} semitones)`);
        
        this.currentPitchShift = semitoneShift;
        this.targetKey = { note: targetNote, octave: targetOctave };
        
        if (this.isPlaying && this.workletLoaded) {
            const pitchRatio = Math.pow(2, this.currentPitchShift / 12);
            for (const stem of Object.values(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('pitch').value = pitchRatio;
                }
            }
        } else if (this.isPlaying) {
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    calculateTargetNote(semitoneShift) {
        if (!this.analysisComplete) return { note: 'C', octave: 4 };
        
        const noteNames = this.pitchDetector.noteNames;
        const originalNoteIndex = noteNames.indexOf(this.originalKey.note);
        
        let targetNoteIndex = (originalNoteIndex + semitoneShift) % 12;
        if (targetNoteIndex < 0) targetNoteIndex += 12;
        
        const octaveShift = Math.floor((originalNoteIndex + semitoneShift) / 12);
        const targetOctave = this.originalKey.octave + octaveShift;
        
        return {
            note: noteNames[targetNoteIndex],
            octave: targetOctave
        };
    }
    
    // Volume controls
    setStemVolume(stemName, volume) {
        if (this.stems[stemName]) {
            this.stems[stemName].volume = volume;
            if (this.stems[stemName].gainNode) {
                this.stems[stemName].gainNode.gain.value = this.stems[stemName].muted ? 0 : volume;
            }
        }
    }
    
    toggleStemMute(stemName) {
        if (this.stems[stemName]) {
            this.stems[stemName].muted = !this.stems[stemName].muted;
            if (this.stems[stemName].gainNode) {
                this.stems[stemName].gainNode.gain.value = this.stems[stemName].muted ? 0 : this.stems[stemName].volume;
            }
            this.updateUI();
        }
    }
    
    setMasterVolume(volume) {
        this.masterVolume = volume;
        if (this.masterGainNode) {
            this.masterGainNode.gain.value = volume;
        }
    }
    
    setupUI() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.play());
        document.getElementById('pause-btn').addEventListener('click', () => this.pause());
        document.getElementById('stop-btn').addEventListener('click', () => this.stop());
        
        // BPM controls
        document.getElementById('bpm-up').addEventListener('click', () => this.adjustBPM(1));
        document.getElementById('bpm-down').addEventListener('click', () => this.adjustBPM(-1));
        document.getElementById('bpm-up-5').addEventListener('click', () => this.adjustBPM(5));
        document.getElementById('bpm-down-5').addEventListener('click', () => this.adjustBPM(-5));
        document.getElementById('bpm-reset').addEventListener('click', () => this.resetBPM());
        
        // Pitch controls
        document.getElementById('pitch-up').addEventListener('click', () => this.adjustPitch(1));
        document.getElementById('pitch-down').addEventListener('click', () => this.adjustPitch(-1));
        document.getElementById('pitch-up-octave').addEventListener('click', () => this.adjustPitch(12));
        document.getElementById('pitch-down-octave').addEventListener('click', () => this.adjustPitch(-12));
        document.getElementById('pitch-reset').addEventListener('click', () => this.resetPitch());
        
        // Master volume
        const masterVolumeSlider = document.getElementById('master-volume');
        masterVolumeSlider.addEventListener('input', (e) => {
            this.masterVolume = e.target.value / 100;
            this.setMasterVolume(this.masterVolume);
        });
        
        // Stem controls
        this.stemNames.forEach(stemName => {
            // Volume sliders
            const volumeSlider = document.getElementById(`${stemName}-volume`);
            if (volumeSlider) {
                volumeSlider.addEventListener('input', (e) => {
                    this.setStemVolume(stemName, e.target.value / 100);
                });
            }
            
            // Mute buttons
            const muteBtn = document.getElementById(`${stemName}-mute`);
            if (muteBtn) {
                muteBtn.addEventListener('click', () => this.toggleStemMute(stemName));
            }
        });
        
        this.updateUI();
    }
    
    updateUI() {
        // BPM display
        document.getElementById('current-bpm').textContent = this.currentBPM;
        document.getElementById('original-bpm').textContent = this.originalBPM;
        
        // Calculate and display percentage
        const bpmPercentage = ((this.currentBPM / this.originalBPM) * 100).toFixed(1);
        document.getElementById('bpm-percentage').textContent = `${bpmPercentage}%`;
        
        // Pitch display
        document.getElementById('current-pitch').textContent = `${this.currentPitchShift >= 0 ? '+' : ''}${this.currentPitchShift}`;
        document.getElementById('original-key').textContent = `${this.originalKey.note}${this.originalKey.octave}`;
        document.getElementById('target-key').textContent = `${this.targetKey.note}${this.targetKey.octave}`;
        
        // Update transport buttons
        document.getElementById('play-btn').disabled = this.isPlaying;
        document.getElementById('pause-btn').disabled = !this.isPlaying;
        
        // Update control buttons
        document.getElementById('bpm-up').disabled = this.currentBPM >= 300;
        document.getElementById('bpm-down').disabled = this.currentBPM <= 50;
        document.getElementById('pitch-up').disabled = this.currentPitchShift >= 12;
        document.getElementById('pitch-down').disabled = this.currentPitchShift <= -12;
        
        // Update mute buttons
        document.querySelectorAll('.mute-btn').forEach(btn => {
            const stemName = btn.dataset.stem;
            if (this.stems[stemName]) {
                btn.textContent = this.stems[stemName].muted ? '🔇' : '🔊';
                btn.classList.toggle('muted', this.stems[stemName].muted);
            }
        });
    }
    
    log(message) {
        console.log(`[PitchBPMSoundTouch] ${message}`);
        
        // Also display in UI if status element exists
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
}

export { PitchBPMSoundTouchMixer };