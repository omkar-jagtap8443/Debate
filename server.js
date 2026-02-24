const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Groq with latest API
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// File to store custom topics
const CUSTOM_TOPICS_FILE = 'custom-topics.json';

// Initialize custom topics file
function initializeCustomTopics() {
    if (!fs.existsSync(CUSTOM_TOPICS_FILE)) {
        fs.writeFileSync(CUSTOM_TOPICS_FILE, JSON.stringify([], null, 2));
    }
}

// Load custom topics
function loadCustomTopics() {
    try {
        const data = fs.readFileSync(CUSTOM_TOPICS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save custom topic
function saveCustomTopic(topic) {
    try {
        const topics = loadCustomTopics();
        
        // Check if topic already exists
        if (!topics.some(t => t.toLowerCase() === topic.toLowerCase())) {
            topics.push(topic);
            fs.writeFileSync(CUSTOM_TOPICS_FILE, JSON.stringify(topics, null, 2));
            console.log(`✅ Saved new topic: "${topic}"`);
        }
        
        return topics;
    } catch (error) {
        console.error('Error saving topic:', error);
        return [];
    }
}

// Character configurations with CURRENT PRODUCTION MODELS from Groq console
// Character configurations with PROPER DIFFICULTY SCALING
const CHARACTER_CONFIGS = {
    'luna': {
        id: 'luna',
        name: 'LUNA',
        level: 'beginner',
        model: 'llama-3.1-8b-instant', // Keep same model but modify behavior
        description: 'friendly, encouraging beginner debater who makes simple points',
        systemPrompt: `You are LUNA, a BEGINNER level debater who is still learning.
        
KEY BEHAVIORS:
- Make simple, straightforward points (1-2 sentences)
- Sometimes miss counter-arguments
- Be easily convinced by good reasoning
- Use phrases like "Oh, I hadn't thought of that!" or "That's a good point!"
- Don't challenge too aggressively
- Occasionally concede points when user makes strong arguments`,
        
        voiceConfig: {
            type: 'female',
            speed: 1.1,
            pitch: 1.2,
            emotion: 'friendly'
        },
        basePoints: 5, // Lower base points
        levelMultiplier: 0.8, // Lower multiplier
        winProbability: 0.4 // 40% chance to win against good player
    },
    
    'leo': {
        id: 'leo',
        name: 'LEO',
        level: 'beginner',
        model: 'llama-3.1-8b-instant',
        description: 'energetic but simple beginner debater',
        systemPrompt: `You are LEO, an enthusiastic BEGINNER level debater.
        
KEY BEHAVIORS:
- Get excited but make simple points
- Use exclamations but keep arguments basic
- Can be distracted from main argument
- Say things like "WOW! That's so smart!" when user makes good points
- Don't have deep reasoning
- Sometimes forget your own argument`,
        
        voiceConfig: {
            type: 'male',
            speed: 1.3,
            pitch: 1.0,
            emotion: 'excited'
        },
        basePoints: 5,
        levelMultiplier: 0.8,
        winProbability: 0.4
    },
    
    'athena': {
        id: 'athena',
        name: 'ATHENA',
        level: 'intermediate',
        model: 'llama-3.3-70b-versatile',
        description: 'strategic, analytical debater',
        systemPrompt: `You are ATHENA, an INTERMEDIATE level debater.
        
KEY BEHAVIORS:
- Make logical, structured arguments
- Challenge user's points reasonably
- Acknowledge good counter-arguments
- Use balanced reasoning
- Win about half the time against average players`,
        
        voiceConfig: {
            type: 'female',
            speed: 1.0,
            pitch: 1.0,
            emotion: 'analytical'
        },
        basePoints: 6,
        levelMultiplier: 1.0,
        winProbability: 0.5
    },
    
    'titan': {
        id: 'titan',
        name: 'TITAN',
        level: 'expert',
        model: 'llama-3.3-70b-versatile',
        description: 'challenging, authoritative expert',
        systemPrompt: `You are TITAN, an EXPERT level debater.
        
KEY BEHAVIORS:
- Make sophisticated, challenging arguments
- Rarely concede points
- Find flaws in user's reasoning
- Use complex vocabulary
- Win most debates unless user is exceptional`,
        
        voiceConfig: {
            type: 'male',
            speed: 0.9,
            pitch: 0.9,
            emotion: 'authoritative'
        },
        basePoints: 10,
        levelMultiplier: 1.3,
        winProbability: 0.8
    }
};

// Alternative models from your screenshot (commented for reference)
/*
Available Production Models:
- llama-3.1-8b-instant (560 T/sec, $0.05 input, $0.08 output)
- llama-3.3-70b-versatile (280 T/sec, $0.59 input, $0.79 output)
- qwen/qwen3-32b (400 T/sec, $0.29 input, $0.59 output)
- meta-llama/llama-4-scout-17b-16e-instruct (750 T/sec, $0.11 input, $0.34 output)
*/

// Initialize custom topics
initializeCustomTopics();

// ========== SCORING ENDPOINT ==========
app.post('/api/score-response', async (req, res) => {
    try {
        const { response, topic, characterLevel } = req.body;
        
        if (!response || !topic) {
            return res.json({ 
                relevance: 5, 
                finalScore: 5, 
                multiplier: 1,
                message: 'Default score applied' 
            });
        }
        
        // Calculate relevance score using Groq
        const scorePrompt = `You are a debate judge. Rate how relevant this response is to the debate topic "${topic}" on a scale of 1-10.

Response to evaluate: "${response}"

Scoring criteria:
- 10: Directly addresses the topic with strong, relevant points and specific references
- 7-9: Good relevance, clearly connected to topic with some specific references
- 4-6: Somewhat relevant, mentions topic but lacks depth or specific connection
- 1-3: Not relevant to the topic or barely mentions it

Return ONLY a single number between 1-10:`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: scorePrompt }],
            model: 'llama-3.1-8b-instant',
            temperature: 0.3,
            max_tokens: 5
        });

        let relevance = parseInt(completion.choices[0]?.message?.content || '5');
        
        // Validate score
        if (isNaN(relevance) || relevance < 1) relevance = 5;
        if (relevance > 10) relevance = 10;
        
        // Apply level multiplier
        const levelMultipliers = {
            'beginner': 1.0,
            'intermediate': 1.2,
            'expert': 1.5
        };
        
        const multiplier = levelMultipliers[characterLevel] || 1.0;
        const finalScore = Math.round(relevance * multiplier);
        
        console.log(`📊 Score: ${relevance} x ${multiplier} = ${finalScore} for ${characterLevel} level`);
        
        res.json({ 
            relevance: relevance,
            finalScore: finalScore,
            multiplier: multiplier,
            level: characterLevel
        });
        
    } catch (error) {
        console.error('Scoring error:', error);
        res.json({ 
            relevance: 5, 
            finalScore: 5, 
            multiplier: 1,
            error: 'Scoring failed, default applied'
        });
    }
});

// Get custom topics endpoint
app.get('/api/custom-topics', (req, res) => {
    try {
        const topics = loadCustomTopics();
        res.json({ topics });
    } catch (error) {
        console.error('Error loading topics:', error);
        res.status(500).json({ error: 'Failed to load topics' });
    }
});

// Save custom topic endpoint
app.post('/api/save-topic', (req, res) => {
    try {
        const { topic } = req.body;
        
        if (!topic || topic.trim().length < 10) {
            return res.status(400).json({ error: 'Topic must be at least 10 characters' });
        }
        
        const topics = saveCustomTopic(topic.trim());
        res.json({ 
            success: true, 
            topics: topics,
            message: 'Topic saved successfully!' 
        });
    } catch (error) {
        console.error('Error saving topic:', error);
        res.status(500).json({ error: 'Failed to save topic' });
    }
});

// MAIN AI RESPONSE ENDPOINT - FULLY DYNAMIC
app.post('/api/ai-response', async (req, res) => {
    try {
        const { 
            userMessage, 
            characterId = 'luna', 
            topic = '', 
            userSide = 'pro', 
            aiSide = 'con',
            conversationHistory = [] 
        } = req.body;
        
        if (!userMessage || userMessage.trim().length < 3) {
            return res.status(400).json({ error: 'User message too short' });
        }
        
        if (!topic || topic.trim().length < 5) {
            return res.status(400).json({ error: 'Topic is required' });
        }
        
        // Get character config
        const character = CHARACTER_CONFIGS[characterId] || CHARACTER_CONFIGS['luna'];
        
        console.log(`🤖 ${character.name} (${character.level}) debating: "${topic}"`);
        console.log(`📝 User said: "${userMessage}"`);
        console.log(`🎯 Position: ${aiSide.toUpperCase()}`);
        
        try {
            // Generate dynamic response using Groq
            const response = await generateDynamicResponse(userMessage, topic, aiSide, userSide, character, conversationHistory);
            res.json(response);
        } catch (primaryError) {
            console.log(`🔄 Primary model failed, trying fallback model...`);
            
            // Try with a different model as fallback
            const fallbackResponse = await generateFallbackResponse(userMessage, topic, aiSide, userSide, character);
            res.json(fallbackResponse);
        }
        
    } catch (error) {
        console.error('AI response error:', error.message);
        
        // Ultimate intelligent fallback
        const character = CHARACTER_CONFIGS[req.body.characterId || 'luna'];
        const fallback = generateContextualFallback(
            character, 
            req.body.topic, 
            req.body.aiSide,
            req.body.userMessage,
            req.body.userSide
        );
        
        res.json({
            response: fallback,
            character: character.id,
            characterName: character.name,
            level: character.level,
            voiceConfig: character.voiceConfig,
            basePoints: character.basePoints,
            levelMultiplier: character.levelMultiplier,
            fallback: true,
            success: true,
            timestamp: new Date().toISOString()
        });
    }
});

// DYNAMIC RESPONSE GENERATOR - Creates unique responses every time
// DYNAMIC RESPONSE GENERATOR - Optimal length (3-4 sentences, 40-60 words)
async function generateDynamicResponse(userMessage, topic, aiSide, userSide, character, conversationHistory) {
    
    // Format conversation history for context
    const recentHistory = conversationHistory.slice(-3);
    const historyText = recentHistory.map(msg => 
        `${msg.role === 'user' ? 'User' : character.name}: ${msg.text}`
    ).join('\n');
    
    // Create a dynamic prompt with optimal length instructions
    const prompt = `You are ${character.name}, a ${character.level} level debater with a ${character.description} personality.

DEBATE CONTEXT:
Topic: "${topic}"
Your position: ${aiSide.toUpperCase()}
User just said: "${userMessage}"

${recentHistory.length > 0 ? `Recent exchange:\n${historyText}\n` : ''}

RESPONSE REQUIREMENTS:
- Length: 3-4 sentences (approximately 40-60 words)
- First sentence: Acknowledge their specific point about "${userMessage}"
- Middle 1-2 sentences: Present your ${aiSide} counter-argument with reasoning
- Final sentence: End with a thoughtful question
- Match ${character.level} level vocabulary
- Be substantive but concise

YOUR BALANCED RESPONSE:`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: 'system', 
                    content: `You are ${character.name}. Give balanced 3-4 sentence responses that directly address the user's point. Aim for 40-60 words.` 
                },
                { role: 'user', content: prompt }
            ],
            model: character.model,
            temperature: 0.8,
            max_tokens: 120, // Sweet spot for 3-4 sentences
            top_p: 0.95,
            stream: false
        });

        let aiResponse = completion.choices[0]?.message?.content || '';
        
        // Clean up
        aiResponse = aiResponse
            .replace(/^(Response:|AI:|Assistant:|Here's my response:|My response:)/i, '')
            .replace(/["']/g, '')
            .trim();
        
        // Count words and sentences
        const words = aiResponse.split(' ').filter(w => w.length > 0);
        const sentences = aiResponse.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const wordCount = words.length;
        const sentenceCount = sentences.length;
        
        // Adjust if needed
        if (wordCount < 30) {
            // Too short - add more substance
            aiResponse += ` This connects to broader questions about ${topic} that deserve consideration. What's your take on that?`;
        } else if (wordCount > 80) {
            // Too long - trim to 4 sentences max
            if (sentences.length > 4) {
                aiResponse = sentences.slice(0, 4).join('. ') + '.';
            } else {
                // Take first 60 words
                aiResponse = words.slice(0, 60).join(' ') + '... What are your thoughts?';
            }
        }
        
        // Ensure it ends with a question
        if (!aiResponse.includes('?')) {
            aiResponse += ' How would you respond to that?';
        }
        
        console.log(`✅ ${character.name} responded (${wordCount} words, ${sentenceCount} sentences): "${aiResponse.substring(0, 100)}..."`);
        
        return {
            response: aiResponse,
            character: character.id,
            characterName: character.name,
            level: character.level,
            voiceConfig: character.voiceConfig,
            basePoints: character.basePoints,
            levelMultiplier: character.levelMultiplier,
            success: true,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Groq API error:', error);
        throw error;
    }
}

// FALLBACK RESPONSE GENERATOR - Concise version
async function generateFallbackResponse(userMessage, topic, aiSide, userSide, character) {
    
    console.log(`🔄 Using fallback model for ${character.name}`);
    
    const fallbackPrompt = `As ${character.name} (${character.level} level), give a 2-sentence response to:

User: "${userMessage}"
Topic: "${topic}"
Your position: ${aiSide.toUpperCase()}

Be concise and address their point directly. Max 30 words.`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'Give concise 2-sentence responses.' },
                { role: 'user', content: fallbackPrompt }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.8,
            max_tokens: 60,
            stream: false
        });

        let aiResponse = completion.choices[0]?.message?.content || '';
        aiResponse = aiResponse.replace(/^(Response:|AI:|Assistant:)/i, '').trim();
        
        return {
            response: aiResponse,
            character: character.id,
            characterName: character.name,
            level: character.level,
            voiceConfig: character.voiceConfig,
            basePoints: character.basePoints,
            levelMultiplier: character.levelMultiplier,
            fallback: true,
            success: true,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Fallback model failed:', error);
        throw error;
    }
}

// CONTEXTUAL FALLBACK - Used when API completely fails
// CONTEXTUAL FALLBACK - Concise version
function generateContextualFallback(character, topic, aiSide, userMessage, userSide) {
    
    // Extract key words
    const words = userMessage.toLowerCase().split(' ');
    const stopWords = ['i', 'you', 'the', 'and', 'but', 'for', 'with', 'that', 'this'];
    const keyWords = words.filter(w => w.length > 3 && !stopWords.includes(w)).slice(0, 2);
    const keyPoint = keyWords.length > 0 ? keyWords.join(' ') : 'your point';
    
    // Concise character-specific responses
    if (character.id === 'luna') {
        return `I hear your point about ${keyPoint} regarding "${topic}"! But have you considered the positive aspects too? What do you think?`;
    }
    else if (character.id === 'athena') {
        return `Your point about ${keyPoint} is valid, but from a ${aiSide} perspective, we must consider counter-evidence. How would you address that?`;
    }
    else if (character.id === 'leo') {
        return `WOW! Great point about ${keyPoint}! But from my ${aiSide} view, there's another exciting angle! Don't you think?`;
    }
    else if (character.id === 'titan') {
        return `Your assertion about ${keyPoint} lacks consideration of ${aiSide} counter-arguments. Can you address this logical gap?`;
    }
    
    return `You mentioned ${keyPoint} about "${topic}". From my ${aiSide} perspective, I see it differently. Your thoughts?`;
}

// Character introduction endpoint
app.post('/api/introduction', async (req, res) => {
    try {
        const { characterId = 'luna', topic, aiSide } = req.body;
        const character = CHARACTER_CONFIGS[characterId] || CHARACTER_CONFIGS['luna'];
        
        const introPrompt = `You are ${character.name}, a ${character.level} level debater. Give a friendly 2-3 sentence introduction for a debate about "${topic}". You are arguing the ${aiSide} side. Be ${character.description}. End with a question.`;
        
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: introPrompt }],
            model: 'llama-3.1-8b-instant',
            temperature: 0.8,
            max_tokens: 100
        });
        
        const intro = completion.choices[0]?.message?.content || 
            `Let's debate "${topic}". I'm arguing ${aiSide}. What are your thoughts?`;
        
        res.json({
            introduction: intro,
            character: character.name,
            level: character.level
        });
        
    } catch (error) {
        const character = CHARACTER_CONFIGS[req.body.characterId || 'luna'];
        const intro = `I'm ${character.name}. Let's debate "${req.body.topic}". I'm arguing ${req.body.aiSide}. What's your first point?`;
        res.json({ introduction: intro });
    }
});

// List available models endpoint
app.get('/api/models', (req, res) => {
    res.json({
        available_models: [
            'llama-3.1-8b-instant',
            'llama-3.3-70b-versatile',
            'qwen/qwen3-32b',
            'meta-llama/llama-4-scout-17b-16e-instruct'
        ],
        character_models: {
            luna: 'llama-3.1-8b-instant',
            athena: 'llama-3.3-70b-versatile',
            leo: 'llama-3.1-8b-instant',
            titan: 'llama-3.3-70b-versatile'
        },
        note: "Using production models from Groq. All models are production-ready and supported.",
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const topics = loadCustomTopics();
        
        // Test Groq connection
        let groqStatus = 'unknown';
        try {
            const testResponse = await groq.chat.completions.create({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'llama-3.1-8b-instant',
                max_tokens: 5
            });
            groqStatus = 'connected';
        } catch (error) {
            groqStatus = `error: ${error.message}`;
        }
        
        res.json({
            status: 'healthy',
            service: 'AI Debate Arena Server',
            groq_status: groqStatus,
            custom_topics_count: topics.length,
            characters_available: Object.keys(CHARACTER_CONFIGS).length,
            models_used: {
                luna: 'llama-3.1-8b-instant',
                athena: 'llama-3.3-70b-versatile',
                leo: 'llama-3.1-8b-instant',
                titan: 'llama-3.3-70b-versatile'
            },
            scoring_enabled: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            error: error.message 
        });
    }
});

// Serve static files
app.use(express.static('.'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const topics = loadCustomTopics();
    console.log(`
    🎤  AI DEBATE ARENA SERVER
    🔗  http://localhost:${PORT}
    
    🤖  CHARACTERS (Production Models):
        • LUNA   - Beginner (llama-3.1-8b-instant)
        • ATHENA - Intermediate (llama-3.3-70b-versatile)
        • LEO    - Beginner (llama-3.1-8b-instant)
        • TITAN  - Expert (llama-3.3-70b-versatile)
    
    📊  SCORING: Relevance (1-10) × Level Multiplier
    📁  Custom Topics: ${topics.length}
    🔑  Groq API: ${process.env.GROQ_API_KEY ? '✅ Configured' : '❌ Not configured'}
    
    🎮  Play: http://localhost:${PORT}/index.html
    
    ============================================
    ✅ USING PRODUCTION MODELS
    ✅ FULLY DYNAMIC RESPONSES
    ✅ EACH RESPONSE ADDRESSES USER'S SPECIFIC POINTS
    ============================================
    `);
});