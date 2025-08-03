/**
 * StemTubes Mixer - State Persistence
 * Gestion de la sauvegarde et restauration de l'état du mixer
 */

class MixerPersistence {
    constructor(mixer) {
        this.mixer = mixer;
        this.storageKey = 'stemtube_mixer_detailed_state';
        this.autoSaveInterval = 2000; // Auto-save every 2 seconds
        this.autoSaveTimer = null;
        
        // Bind methods
        this.saveState = this.saveState.bind(this);
        this.restoreState = this.restoreState.bind(this);
        this.autoSave = this.autoSave.bind(this);
        
        // Start auto-save
        this.startAutoSave();
    }
    
    /**
     * Sauvegarder l'état complet du mixer
     */
    saveState() {
        try {
            const state = {
                extractionId: this.mixer.extractionId,
                timestamp: Date.now(),
                playback: {
                    currentTime: this.mixer.currentTime,
                    isPlaying: this.mixer.isPlaying,
                    maxDuration: this.mixer.maxDuration
                },
                zoom: {
                    horizontal: this.mixer.zoomLevels.horizontal,
                    vertical: this.mixer.zoomLevels.vertical
                },
                pitchTempo: this.mixer.pitchTempoControl ? this.mixer.pitchTempoControl.getState() : {
                    pitch: 0,
                    tempo: 100
                },
                tracks: {}
            };
            
            // Sauvegarder l'état de chaque piste
            Object.keys(this.mixer.stems).forEach(stemName => {
                const stem = this.mixer.stems[stemName];
                const trackElement = document.querySelector(`[data-stem="${stemName}"]`);
                
                if (stem && trackElement) {
                    state.tracks[stemName] = {
                        volume: this.getTrackVolume(stemName),
                        pan: this.getTrackPan(stemName),
                        muted: this.getTrackMuted(stemName),
                        soloed: this.getTrackSoloed(stemName)
                    };
                }
            });
            
            localStorage.setItem(this.storageKey, JSON.stringify(state));
            console.log('[MixerPersistence] State saved:', state);
            
        } catch (error) {
            console.warn('[MixerPersistence] Could not save mixer state:', error);
        }
    }
    
    /**
     * Restaurer l'état du mixer
     */
    restoreState() {
        try {
            const stateStr = localStorage.getItem(this.storageKey);
            if (!stateStr) return false;
            
            const state = JSON.parse(stateStr);
            
            // Vérifier que c'est la même extraction
            if (state.extractionId !== this.mixer.extractionId) {
                console.log('[MixerPersistence] Different extraction, not restoring state');
                return false;
            }
            
            console.log('[MixerPersistence] Restoring state:', state);
            
            // Restaurer les contrôles de pistes
            if (state.tracks) {
                Object.keys(state.tracks).forEach(stemName => {
                    const trackState = state.tracks[stemName];
                    this.restoreTrackState(stemName, trackState);
                });
            }
            
            // Restaurer le zoom (mais pas la position de lecture pour éviter les sauts)
            if (state.zoom) {
                this.mixer.zoomLevels.horizontal = state.zoom.horizontal || 1.0;
                this.mixer.zoomLevels.vertical = state.zoom.vertical || 1.0;
                
                // Appliquer le zoom si les méthodes existent
                if (this.mixer.waveform && this.mixer.waveform.updateZoom) {
                    this.mixer.waveform.updateZoom();
                }
            }
            
            // Restaurer les réglages pitch/tempo
            if (state.pitchTempo && this.mixer.pitchTempoControl) {
                this.mixer.pitchTempoControl.restoreState(state.pitchTempo);
            }
            
            return true;
            
        } catch (error) {
            console.warn('[MixerPersistence] Could not restore mixer state:', error);
            return false;
        }
    }
    
    /**
     * Restaurer l'état d'une piste spécifique
     */
    restoreTrackState(stemName, trackState) {
        try {
            const trackElement = document.querySelector(`[data-stem="${stemName}"]`);
            if (!trackElement) {
                console.warn(`[MixerPersistence] Track element not found for ${stemName}`);
                return;
            }
            
            console.log(`[MixerPersistence] Restoring track ${stemName}:`, trackState);
            
            // Utiliser setTimeout pour s'assurer que tous les événements sont attachés
            setTimeout(() => {
                // Restaurer le volume
                if (typeof trackState.volume === 'number') {
                    this.setTrackVolume(stemName, trackState.volume);
                    console.log(`[MixerPersistence] Volume restored for ${stemName}: ${trackState.volume}`);
                }
                
                // Restaurer le pan
                if (typeof trackState.pan === 'number') {
                    this.setTrackPan(stemName, trackState.pan);
                    console.log(`[MixerPersistence] Pan restored for ${stemName}: ${trackState.pan}`);
                }
                
                // Restaurer mute
                if (typeof trackState.muted === 'boolean') {
                    this.setTrackMuted(stemName, trackState.muted);
                    console.log(`[MixerPersistence] Mute restored for ${stemName}: ${trackState.muted}`);
                }
                
                // Restaurer solo
                if (typeof trackState.soloed === 'boolean') {
                    this.setTrackSoloed(stemName, trackState.soloed);
                    console.log(`[MixerPersistence] Solo restored for ${stemName}: ${trackState.soloed}`);
                }
            }, 100);
            
        } catch (error) {
            console.warn(`[MixerPersistence] Could not restore track ${stemName}:`, error);
        }
    }
    
    /**
     * Obtenir le volume d'une piste
     */
    getTrackVolume(stemName) {
        const slider = document.querySelector(`[data-stem="${stemName}"] .volume-slider`);
        return slider ? parseFloat(slider.value) : 0.8;
    }
    
    /**
     * Définir le volume d'une piste
     */
    setTrackVolume(stemName, volume) {
        const slider = document.querySelector(`[data-stem="${stemName}"] .volume-slider`);
        const valueDisplay = document.querySelector(`[data-stem="${stemName}"] .volume-value`);
        
        if (slider) {
            slider.value = volume;
            
            // Déclencher plusieurs événements pour s'assurer que ça marche
            const inputEvent = new Event('input', { bubbles: true });
            const changeEvent = new Event('change', { bubbles: true });
            slider.dispatchEvent(inputEvent);
            slider.dispatchEvent(changeEvent);
        }
        
        if (valueDisplay) {
            valueDisplay.textContent = Math.round(volume * 100) + '%';
        }
    }
    
    /**
     * Obtenir le pan d'une piste
     */
    getTrackPan(stemName) {
        const slider = document.querySelector(`[data-stem="${stemName}"] .pan-knob`);
        return slider ? parseFloat(slider.value) : 0;
    }
    
    /**
     * Définir le pan d'une piste
     */
    setTrackPan(stemName, pan) {
        const slider = document.querySelector(`[data-stem="${stemName}"] .pan-knob`);
        const valueDisplay = document.querySelector(`[data-stem="${stemName}"] .pan-value`);
        
        if (slider) {
            slider.value = pan;
            
            // Déclencher plusieurs événements pour s'assurer que ça marche
            const inputEvent = new Event('input', { bubbles: true });
            const changeEvent = new Event('change', { bubbles: true });
            slider.dispatchEvent(inputEvent);
            slider.dispatchEvent(changeEvent);
        }
        
        if (valueDisplay) {
            if (Math.abs(pan) < 0.01) {
                valueDisplay.textContent = 'C';
            } else if (pan < 0) {
                valueDisplay.textContent = 'L' + Math.abs(Math.round(pan * 100));
            } else {
                valueDisplay.textContent = 'R' + Math.round(pan * 100);
            }
        }
    }
    
    /**
     * Obtenir l'état mute d'une piste
     */
    getTrackMuted(stemName) {
        // Essayer mobile d'abord, puis desktop
        let button = document.querySelector(`[data-stem="${stemName}"] .mute-btn`);
        if (!button) {
            button = document.querySelector(`[data-stem="${stemName}"] .mute`);
        }
        return button ? button.classList.contains('active') : false;
    }
    
    /**
     * Définir l'état mute d'une piste
     */
    setTrackMuted(stemName, muted) {
        // Essayer mobile d'abord, puis desktop
        let button = document.querySelector(`[data-stem="${stemName}"] .mute-btn`);
        if (!button) {
            button = document.querySelector(`[data-stem="${stemName}"] .mute`);
        }
        
        if (button) {
            const currentlyMuted = button.classList.contains('active');
            
            if (currentlyMuted !== muted) {
                // Déclencher le clic pour basculer l'état
                button.click();
            }
        }
    }
    
    /**
     * Obtenir l'état solo d'une piste
     */
    getTrackSoloed(stemName) {
        // Essayer mobile d'abord, puis desktop
        let button = document.querySelector(`[data-stem="${stemName}"] .solo-btn`);
        if (!button) {
            button = document.querySelector(`[data-stem="${stemName}"] .solo`);
        }
        return button ? button.classList.contains('active') : false;
    }
    
    /**
     * Définir l'état solo d'une piste
     */
    setTrackSoloed(stemName, soloed) {
        // Essayer mobile d'abord, puis desktop
        let button = document.querySelector(`[data-stem="${stemName}"] .solo-btn`);
        if (!button) {
            button = document.querySelector(`[data-stem="${stemName}"] .solo`);
        }
        
        if (button) {
            const currentlySoloed = button.classList.contains('active');
            
            if (currentlySoloed !== soloed) {
                // Déclencher le clic pour basculer l'état
                button.click();
            }
        }
    }
    
    /**
     * Démarrer la sauvegarde automatique
     */
    startAutoSave() {
        this.stopAutoSave(); // S'assurer qu'il n'y a pas de timer existant
        
        this.autoSaveTimer = setInterval(() => {
            if (this.mixer.isInitialized && this.mixer.extractionId) {
                this.autoSave();
            }
        }, this.autoSaveInterval);
    }
    
    /**
     * Arrêter la sauvegarde automatique
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
    
    /**
     * Sauvegarde automatique (moins verbose)
     */
    autoSave() {
        try {
            const state = {
                extractionId: this.mixer.extractionId,
                timestamp: Date.now(),
                playback: {
                    currentTime: this.mixer.currentTime,
                    isPlaying: this.mixer.isPlaying
                },
                tracks: {}
            };
            
            // Sauvegarder seulement les contrôles de pistes
            Object.keys(this.mixer.stems).forEach(stemName => {
                const trackElement = document.querySelector(`[data-stem="${stemName}"]`);
                if (trackElement) {
                    state.tracks[stemName] = {
                        volume: this.getTrackVolume(stemName),
                        pan: this.getTrackPan(stemName),
                        muted: this.getTrackMuted(stemName),
                        soloed: this.getTrackSoloed(stemName)
                    };
                }
            });
            
            localStorage.setItem(this.storageKey, JSON.stringify(state));
            
        } catch (error) {
            console.warn('[MixerPersistence] Auto-save failed:', error);
        }
    }
    
    /**
     * Effacer l'état sauvegardé
     */
    clearState() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('[MixerPersistence] State cleared');
        } catch (error) {
            console.warn('[MixerPersistence] Could not clear state:', error);
        }
    }
    
    /**
     * Nettoyer les ressources
     */
    destroy() {
        this.stopAutoSave();
    }
}