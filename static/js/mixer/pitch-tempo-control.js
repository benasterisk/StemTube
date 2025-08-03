/**
 * StemTubes Mixer - Pitch and Tempo Control
 * Gestion indépendante du pitch et du tempo utilisant Web Audio API
 */

class PitchTempoControl {
    constructor(mixer) {
        this.mixer = mixer;
        
        // États actuels
        this.currentPitch = 0; // en demi-tons (-12 à +12)
        this.currentTempo = 100; // en pourcentage (50% à 200%)
        
        // Limites
        this.minPitch = -12;
        this.maxPitch = 12;
        this.minTempo = 50;
        this.maxTempo = 200;
        this.tempoStep = 5;
        
        // Nodes Web Audio pour chaque stem
        this.stemNodes = {};
        
        // Éléments DOM
        this.elements = {
            pitchValue: document.getElementById('pitch-value'),
            tempoValue: document.getElementById('tempo-value'),
            pitchUp: document.getElementById('pitch-up'),
            pitchDown: document.getElementById('pitch-down'),
            pitchReset: document.getElementById('pitch-reset'),
            tempoUp: document.getElementById('tempo-up'),
            tempoDown: document.getElementById('tempo-down'),
            tempoReset: document.getElementById('tempo-reset')
        };
        
        this.initializeControls();
    }
    
    /**
     * Initialiser les contrôles et événements
     */
    initializeControls() {
        // Événements pitch
        if (this.elements.pitchUp) {
            this.elements.pitchUp.addEventListener('click', () => this.adjustPitch(1));
        }
        if (this.elements.pitchDown) {
            this.elements.pitchDown.addEventListener('click', () => this.adjustPitch(-1));
        }
        if (this.elements.pitchReset) {
            this.elements.pitchReset.addEventListener('click', () => this.resetPitch());
        }
        
        // Événements tempo
        if (this.elements.tempoUp) {
            this.elements.tempoUp.addEventListener('click', () => this.adjustTempo(this.tempoStep));
        }
        if (this.elements.tempoDown) {
            this.elements.tempoDown.addEventListener('click', () => this.adjustTempo(-this.tempoStep));
        }
        if (this.elements.tempoReset) {
            this.elements.tempoReset.addEventListener('click', () => this.resetTempo());
        }
        
        this.updateDisplay();
        
        console.log('[PitchTempoControl] Controls initialized');
    }
    
    /**
     * Ajuster le pitch (en demi-tons)
     */
    adjustPitch(semitones) {
        const newPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.currentPitch + semitones));
        
        if (newPitch !== this.currentPitch) {
            this.currentPitch = newPitch;
            this.applyPitchToAllStems();
            this.updateDisplay();
            
            // Sauvegarder dans la persistance si disponible
            if (this.mixer.persistence) {
                this.mixer.persistence.saveState();
            }
            
            console.log(`[PitchTempoControl] Pitch adjusted to ${this.currentPitch} semitones`);
        }
    }
    
    /**
     * Réinitialiser le pitch
     */
    resetPitch() {
        if (this.currentPitch !== 0) {
            this.currentPitch = 0;
            this.applyPitchToAllStems();
            this.updateDisplay();
            
            // Sauvegarder dans la persistance si disponible
            if (this.mixer.persistence) {
                this.mixer.persistence.saveState();
            }
            
            console.log('[PitchTempoControl] Pitch reset to 0');
        }
    }
    
    /**
     * Ajuster le tempo (en pourcentage)
     */
    adjustTempo(percentage) {
        const newTempo = Math.max(this.minTempo, Math.min(this.maxTempo, this.currentTempo + percentage));
        
        if (newTempo !== this.currentTempo) {
            this.currentTempo = newTempo;
            this.applyTempoToAllStems();
            this.updateDisplay();
            
            // Sauvegarder dans la persistance si disponible
            if (this.mixer.persistence) {
                this.mixer.persistence.saveState();
            }
            
            console.log(`[PitchTempoControl] Tempo adjusted to ${this.currentTempo}%`);
        }
    }
    
    /**
     * Réinitialiser le tempo
     */
    resetTempo() {
        if (this.currentTempo !== 100) {
            this.currentTempo = 100;
            this.applyTempoToAllStems();
            this.updateDisplay();
            
            // Sauvegarder dans la persistance si disponible
            if (this.mixer.persistence) {
                this.mixer.persistence.saveState();
            }
            
            console.log('[PitchTempoControl] Tempo reset to 100%');
        }
    }
    
    /**
     * Mettre à jour l'affichage des valeurs
     */
    updateDisplay() {
        if (this.elements.pitchValue) {
            const sign = this.currentPitch > 0 ? '+' : '';
            this.elements.pitchValue.textContent = `${sign}${this.currentPitch}`;
        }
        
        if (this.elements.tempoValue) {
            this.elements.tempoValue.textContent = `${this.currentTempo}%`;
        }
    }
    
    /**
     * Créer les nodes audio pour un stem
     */
    createAudioNodesForStem(stemName, audioBuffer) {
        if (!this.mixer.audioEngine || !this.mixer.audioEngine.audioContext) {
            console.warn('[PitchTempoControl] Audio context not available');
            return null;
        }
        
        const audioContext = this.mixer.audioEngine.audioContext;
        
        // Créer un buffer source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Créer les nodes pour pitch et tempo
        const gainNode = audioContext.createGain();
        
        // Pour le pitch, nous utiliserons playbackRate (approximation simple)
        // Pour des résultats plus précis, on pourrait utiliser des AudioWorklets
        
        // Connecter: source -> gain -> destination
        source.connect(gainNode);
        
        this.stemNodes[stemName] = {
            source: source,
            gainNode: gainNode,
            audioBuffer: audioBuffer
        };
        
        return this.stemNodes[stemName];
    }
    
    /**
     * Appliquer le pitch à tous les stems
     */
    applyPitchToAllStems() {
        // Les effets pitch/tempo sont maintenant appliqués automatiquement
        // dans audio-engine.js lors de la création des sources audio
        // On force juste un redémarrage si on est en lecture
        if (this.mixer.isPlaying) {
            this.restartPlaybackWithEffects();
        }
    }
    
    /**
     * Appliquer le pitch à un stem spécifique
     */
    applyPitchToStem(stemName) {
        // Les effets sont appliqués automatiquement par l'audio engine
        // Cette méthode est conservée pour compatibilité
    }
    
    /**
     * Appliquer le tempo à tous les stems
     */
    applyTempoToAllStems() {
        // Les effets pitch/tempo sont maintenant appliqués automatiquement
        // dans audio-engine.js lors de la création des sources audio
        // On force juste un redémarrage si on est en lecture
        if (this.mixer.isPlaying) {
            this.restartPlaybackWithEffects();
        }
    }
    
    /**
     * Appliquer le tempo à un stem spécifique
     */
    applyTempoToStem(stemName) {
        // Les effets sont appliqués automatiquement par l'audio engine
        // Cette méthode est conservée pour compatibilité
    }
    
    /**
     * Redémarrer la lecture avec les nouveaux effets
     */
    restartPlaybackWithEffects() {
        if (this.mixer.isPlaying && this.mixer.audioEngine) {
            const currentTime = this.mixer.currentTime;
            this.mixer.audioEngine.pause();
            setTimeout(() => {
                this.mixer.currentTime = currentTime;
                this.mixer.audioEngine.play();
            }, 50);
        }
    }
    
    /**
     * Initialiser un nouveau stem avec les effets actuels
     */
    initializeStem(stemName, stem) {
        // Appliquer les effets actuels au nouveau stem
        this.applyPitchToStem(stemName);
        this.applyTempoToStem(stemName);
    }
    
    /**
     * Restaurer l'état depuis la persistance
     */
    restoreState(pitchTempoState) {
        if (pitchTempoState) {
            if (typeof pitchTempoState.pitch === 'number') {
                this.currentPitch = Math.max(this.minPitch, Math.min(this.maxPitch, pitchTempoState.pitch));
            }
            
            if (typeof pitchTempoState.tempo === 'number') {
                this.currentTempo = Math.max(this.minTempo, Math.min(this.maxTempo, pitchTempoState.tempo));
            }
            
            this.updateDisplay();
            
            // Les effets seront appliqués automatiquement lors du prochain démarrage audio
            
            console.log(`[PitchTempoControl] State restored: pitch=${this.currentPitch}, tempo=${this.currentTempo}%`);
        }
    }
    
    /**
     * Obtenir l'état actuel
     */
    getState() {
        return {
            pitch: this.currentPitch,
            tempo: this.currentTempo
        };
    }
    
    /**
     * Nettoyer les ressources
     */
    destroy() {
        // Nettoyer les nodes audio
        Object.values(this.stemNodes).forEach(nodes => {
            if (nodes.source) {
                try {
                    nodes.source.disconnect();
                } catch (e) {
                    // Node déjà déconnecté
                }
            }
            if (nodes.gainNode) {
                try {
                    nodes.gainNode.disconnect();
                } catch (e) {
                    // Node déjà déconnecté
                }
            }
        });
        
        this.stemNodes = {};
        
        console.log('[PitchTempoControl] Destroyed');
    }
}