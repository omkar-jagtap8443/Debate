// LiveKit Configuration
const LIVEKIT_CONFIG = {
    SERVER_URL: 'wss://ai-debate-game-z2u6jisc.livekit.cloud', // Your LiveKit server URL
    API_KEY: 'APIEA7T6Siq2ymc',                   // From LiveKit dashboard
    API_SECRET: 'i5keqpAqIQ3Ssk0X60hiumXeskevV4hsxjSFgpg2BoaA',             // From LiveKit dashboard
    ROOM_NAME_PREFIX: 'debate-room-'
};

// AI Configuration - Now using Gemini
const AI_CONFIG = {
    PROVIDER: 'gemini', // Changed from openai to gemini
    MODEL: 'gemini-pro',
    MAX_TOKENS: 150,
    TEMPERATURE: 0.7
};

// Game Configuration
const GAME_CONFIG = {
    DEBATE_TIME: 5 * 60, // 5 minutes
    MAX_ARGUMENTS: 10,
    SCORING: {
        BEGINNER: { base: 50, max: 100 },
        INTERMEDIATE: { base: 75, max: 150 },
        EXPERT: { base: 100, max: 200 }
    }
};

// Export configurations
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LIVEKIT_CONFIG, AI_CONFIG, GAME_CONFIG };
}