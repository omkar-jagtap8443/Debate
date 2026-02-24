import { 
    Room, 
    LocalAudioTrack, 
    RemoteParticipant,
    RoomEvent,
    createLocalAudioTrack 
} from 'https://unpkg.com/livekit-client@1.10.0/dist/livekit-client.esm.js';

class LiveKitDebateClient {
    constructor() {
        this.room = new Room();
        this.localAudioTrack = null;
        this.isConnected = false;
        this.isSpeaking = false;
        this.audioContext = null;
        this.analyser = null;
        this.audioStream = null;
        this.remoteParticipant = null;
        
        // Bind methods
        this.connectToRoom = this.connectToRoom.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.startLocalAudio = this.startLocalAudio.bind(this);
        this.stopLocalAudio = this.stopLocalAudio.bind(this);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Room events
        this.room
            .on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this))
            .on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this))
            .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this))
            .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed.bind(this))
            .on(RoomEvent.Connected, () => {
                console.log('Connected to room');
                this.isConnected = true;
                this.onConnectionStateChange?.(true);
            })
            .on(RoomEvent.Disconnected, () => {
                console.log('Disconnected from room');
                this.isConnected = false;
                this.onConnectionStateChange?.(false);
            })
            .on(RoomEvent.LocalTrackPublished, (publication) => {
                console.log('Local track published:', publication.kind);
            })
            .on(RoomEvent.LocalTrackUnpublished, (publication) => {
                console.log('Local track unpublished:', publication.kind);
            });
    }
    
    async connectToRoom(roomName, participantName, token) {
        try {
            const connectOptions = {
                autoSubscribe: true,
            };
            
            await this.room.connect(`wss://your-project.livekit.cloud`, token, connectOptions);
            
            console.log(`Connected to room ${roomName} as ${participantName}`);
            return true;
        } catch (error) {
            console.error('Failed to connect to room:', error);
            return false;
        }
    }
    
    async generateToken(roomName, participantName) {
        // In production, this should be done on your backend server
        // For demo, we'll use a simple mock
        try {
            const response = await fetch('/api/livekit-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomName: roomName,
                    participantName: participantName
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to generate token');
            }
            
            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error('Error generating token:', error);
            
            // Fallback: Use client-side generation (not recommended for production)
            return this.generateClientSideToken(roomName, participantName);
        }
    }
    
    async generateClientSideToken(roomName, participantName) {
        // Note: This is for demo only. In production, always generate tokens server-side.
        const { AccessToken } = await import('https://unpkg.com/livekit-server-sdk@1.5.0/dist/index.js');
        
        const at = new AccessToken(
            LIVEKIT_CONFIG.API_KEY,
            LIVEKIT_CONFIG.API_SECRET,
            {
                identity: participantName,
                name: participantName,
                ttl: '10m',
            }
        );
        
        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
        return at.toJwt();
    }
    
    async startLocalAudio() {
        try {
            if (this.localAudioTrack) {
                await this.stopLocalAudio();
            }
            
            this.localAudioTrack = await createLocalAudioTrack({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            });
            
            await this.room.localParticipant.publishTrack(this.localAudioTrack);
            
            // Setup audio visualization
            this.setupAudioVisualization(this.localAudioTrack.mediaStreamTrack);
            
            this.isSpeaking = true;
            this.onSpeakingStateChange?.(true);
            
            return true;
        } catch (error) {
            console.error('Failed to start local audio:', error);
            return false;
        }
    }
    
    async stopLocalAudio() {
        if (this.localAudioTrack) {
            await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
            this.localAudioTrack.stop();
            this.localAudioTrack = null;
        }
        
        this.isSpeaking = false;
        this.onSpeakingStateChange?.(false);
    }
    
    setupAudioVisualization(mediaStreamTrack) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        this.audioStream = this.audioContext.createMediaStreamSource(
            new MediaStream([mediaStreamTrack])
        );
        
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        
        this.audioStream.connect(this.analyser);
        
        // Start visualization updates
        this.updateAudioVisualization();
    }
    
    updateAudioVisualization() {
        if (!this.analyser || !this.isSpeaking) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        // Update UI
        this.onAudioLevelChange?.(average);
        
        // Continue updating
        requestAnimationFrame(() => this.updateAudioVisualization());
    }
    
    handleParticipantConnected(participant) {
        console.log('Participant connected:', participant.identity);
        
        if (participant.identity !== this.room.localParticipant.identity) {
            this.remoteParticipant = participant;
            this.onRemoteParticipantConnected?.(participant);
        }
    }
    
    handleParticipantDisconnected(participant) {
        console.log('Participant disconnected:', participant.identity);
        
        if (participant === this.remoteParticipant) {
            this.remoteParticipant = null;
            this.onRemoteParticipantDisconnected?.(participant);
        }
    }
    
    handleTrackSubscribed(track, publication, participant) {
        console.log('Track subscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === 'audio' && participant !== this.room.localParticipant) {
            // Play remote audio
            const audioElement = document.getElementById('remoteAudio');
            if (audioElement) {
                track.attach(audioElement);
            }
            
            this.onRemoteAudioStarted?.(participant);
        }
    }
    
    handleTrackUnsubscribed(track, publication, participant) {
        console.log('Track unsubscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === 'audio' && participant !== this.room.localParticipant) {
            this.onRemoteAudioStopped?.(participant);
        }
    }
    
    async disconnect() {
        await this.stopLocalAudio();
        await this.room.disconnect();
        this.isConnected = false;
        this.onConnectionStateChange?.(false);
    }
    
    // Callbacks
    onConnectionStateChange = null;
    onSpeakingStateChange = null;
    onAudioLevelChange = null;
    onRemoteParticipantConnected = null;
    onRemoteParticipantDisconnected = null;
    onRemoteAudioStarted = null;
    onRemoteAudioStopped = null;
}

// Export singleton instance
const liveKitClient = new LiveKitDebateClient();
export default liveKitClient;