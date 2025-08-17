/**
 * TimeStretch AudioWorklet using SoundTouch
 * Simple implementation for testing time-stretching without pitch change
 */

// Import SoundTouch if available
let SoundTouch, SimpleFilter;

class TimeStretchProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'tempo',
                defaultValue: 1.0,
                minValue: 0.25,
                maxValue: 4.0,
                automationRate: 'k-rate'
            }
        ];
    }

    constructor() {
        super();
        
        this.soundTouch = null;
        this.simpleFilter = null;
        this.initialized = false;
        this.inputBuffer = [];
        this.outputBuffer = [];
        this.currentTempo = 1.0;
        
        // Buffer sizes
        this.bufferSize = 4096;
        this.inputSamples = new Float32Array(this.bufferSize);
        this.outputSamples = new Float32Array(this.bufferSize);
        
        this.port.onmessage = (event) => {
            if (event.data.type === 'init') {
                this.initSoundTouch();
            }
        };
        
        this.log('TimeStretchProcessor created');
    }

    async initSoundTouch() {
        try {
            // Try to load SoundTouch from global scope
            if (typeof globalThis.SoundTouch !== 'undefined') {
                SoundTouch = globalThis.SoundTouch;
                SimpleFilter = globalThis.SimpleFilter;
                
                this.soundTouch = new SoundTouch();
                this.simpleFilter = new SimpleFilter(this.soundTouch, globalThis.currentSampleRate || 44100);
                
                // Configure SoundTouch
                this.soundTouch.setTempo(this.currentTempo);
                this.soundTouch.setPitch(1.0); // Keep pitch unchanged
                this.soundTouch.setRate(1.0);
                
                this.initialized = true;
                this.log('SoundTouch initialized successfully');
                
                this.port.postMessage({ type: 'initialized', success: true });
            } else {
                throw new Error('SoundTouch not available in global scope');
            }
        } catch (error) {
            this.log('SoundTouch initialization failed: ' + error.message);
            this.port.postMessage({ type: 'initialized', success: false, error: error.message });
        }
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        if (!input || !output || input.length === 0 || output.length === 0) {
            return true;
        }
        
        const inputChannel = input[0];
        const outputChannel = output[0];
        
        if (!inputChannel || !outputChannel) {
            return true;
        }
        
        // Update tempo if changed
        const newTempo = parameters.tempo[0];
        if (Math.abs(newTempo - this.currentTempo) > 0.001) {
            this.currentTempo = newTempo;
            if (this.soundTouch) {
                this.soundTouch.setTempo(newTempo);
                this.log(`Tempo changed to: ${newTempo}`);
            }
        }
        
        if (!this.initialized || !this.soundTouch) {
            // Bypass mode - direct copy
            outputChannel.set(inputChannel);
            return true;
        }
        
        try {
            // Process with SoundTouch
            const processed = this.processSoundTouch(inputChannel);
            
            if (processed && processed.length > 0) {
                // Copy processed samples to output
                const copyLength = Math.min(processed.length, outputChannel.length);
                for (let i = 0; i < copyLength; i++) {
                    outputChannel[i] = processed[i];
                }
                
                // Fill remaining with zeros if needed
                for (let i = copyLength; i < outputChannel.length; i++) {
                    outputChannel[i] = 0;
                }
            } else {
                // No output available, fill with silence
                outputChannel.fill(0);
            }
        } catch (error) {
            this.log('Processing error: ' + error.message);
            // Fallback to bypass
            outputChannel.set(inputChannel);
        }
        
        return true;
    }
    
    processSoundTouch(inputSamples) {
        if (!this.simpleFilter) {
            return inputSamples;
        }
        
        try {
            // Feed input samples to SoundTouch
            this.simpleFilter.putSamples(inputSamples, 0, inputSamples.length);
            
            // Try to receive processed samples
            const receivedLength = this.simpleFilter.receiveSamples(this.outputSamples, 0, this.outputSamples.length);
            
            if (receivedLength > 0) {
                return this.outputSamples.slice(0, receivedLength);
            }
            
            return null;
        } catch (error) {
            this.log('SoundTouch processing error: ' + error.message);
            return inputSamples; // Fallback
        }
    }
    
    log(message) {
        this.port.postMessage({ type: 'log', message: message });
    }
}

registerProcessor('timestretch-processor', TimeStretchProcessor);