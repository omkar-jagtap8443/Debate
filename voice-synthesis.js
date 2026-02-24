class VoiceSynthesis {
    constructor() {
        this.isSpeaking = false;
        this.speechQueue = [];
        this.currentCharacter = null;
        this.audioContext = null;
        this.useElevenLabs = OPENAI_CONFIG.USE_ELEVENLABS;
    }
    
    async speak(text, character) {
        this.currentCharacter = character;
        
        if (this.useElevenLabs && OPENAI_CONFIG.ELEVENLABS_API_KEY) {
            return this.speakWithElevenLabs(text, character);
        } else {
            return this.speakWithOpenAI(text, character);
        }
    }
    
    async speakWithOpenAI(text, character) {
        return new Promise((resolve, reject) => {
            if (!('speechSynthesis' in window)) {
                reject('Speech synthesis not supported');
                return;
            }
            
            // Create utterance
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Configure voice based on character
            this.configureUtterance(utterance, character);
            
            // Set up event listeners
            utterance.onstart = () => {
                this.isSpeaking = true;
                this.onSpeechStart?.(character);
            };
            
            utterance.onend = () => {
                this.isSpeaking = false;
                this.onSpeechEnd?.(character);
                resolve();
                
                // Speak next in queue
                this.processQueue();
            };
            
            utterance.onerror = (event) => {
                this.isSpeaking = false;
                console.error('Speech synthesis error:', event);
                reject(event.error);
                
                // Try next in queue
                this.processQueue();
            };
            
            // Add to queue
            this.speechQueue.push(utterance);
            
            // If not currently speaking, start
            if (!this.isSpeaking) {
                this.processQueue();
            }
        });
    }
    
    configureUtterance(utterance, character) {
        // Get available voices
        const voices = window.speechSynthesis.getVoices();
        
        // Set voice properties based on character
        utterance.rate = character.voice.speed || 1.0;
        utterance.pitch = character.voice.pitch || 1.0;
        utterance.volume = 1.0;
        
        // Try to find a suitable voice
        if (voices.length > 0) {
            let preferredVoice = null;
            
            // Match voice based on character
            switch (character.id) {
                case 'luna':
                    preferredVoice = voices.find(v => 
                        v.name.includes('Female') || 
                        v.lang.includes('en-US')
                    );
                    break;
                case 'athena':
                    preferredVoice = voices.find(v => 
                        v.name.includes('Female') && 
                        !v.name.includes('Child')
                    );
                    break;
                case 'leo':
                    preferredVoice = voices.find(v => 
                        v.name.includes('Male') || 
                        v.name.includes('Young')
                    );
                    break;
                case 'titan':
                    preferredVoice = voices.find(v => 
                        v.name.includes('Male') && 
                        (v.name.includes('Deep') || v.name.includes('Low'))
                    );
                    break;
            }
            
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
        }
    }
    
    async speakWithElevenLabs(text, character) {
        try {
            const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + character.voice.model, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': OPENAI_CONFIG.ELEVENLABS_API_KEY
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.5,
                        speed: character.voice.speed || 1.0
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error('ElevenLabs API error');
            }
            
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            return this.playAudioUrl(audioUrl, character);
        } catch (error) {
            console.error('ElevenLabs failed, falling back to OpenAI:', error);
            return this.speakWithOpenAI(text, character);
        }
    }
    
    async playAudioUrl(audioUrl, character) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(audioUrl);
            
            audio.onplay = () => {
                this.isSpeaking = true;
                this.onSpeechStart?.(character);
            };
            
            audio.onended = () => {
                this.isSpeaking = false;
                URL.revokeObjectURL(audioUrl);
                this.onSpeechEnd?.(character);
                resolve();
            };
            
            audio.onerror = (error) => {
                this.isSpeaking = false;
                URL.revokeObjectURL(audioUrl);
                reject(error);
            };
            
            audio.play().catch(reject);
        });
    }
    
    processQueue() {
        if (this.speechQueue.length > 0 && !this.isSpeaking) {
            const nextUtterance = this.speechQueue.shift();
            window.speechSynthesis.speak(nextUtterance);
        }
    }
    
    stop() {
        window.speechSynthesis.cancel();
        this.speechQueue = [];
        this.isSpeaking = false;
        this.onSpeechEnd?.(this.currentCharacter);
    }
    
    pause() {
        window.speechSynthesis.pause();
        this.isSpeaking = false;
    }
    
    resume() {
        window.speechSynthesis.resume();
        this.isSpeaking = true;
    }
    
    // Callbacks
    onSpeechStart = null;
    onSpeechEnd = null;
}

// Export singleton instance
const voiceSynthesis = new VoiceSynthesis();
export default voiceSynthesis;