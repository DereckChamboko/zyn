const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const redis = require('redis');
const cors = require('cors'); // Import the cors package
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = 3000;

// Middleware
app.use(cors()); // Enable CORS for all domains
app.use(bodyParser.json());

// OpenAI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Use the API key from the environment variable
});

// Redis client setup
const redisClient = redis.createClient();
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

// POST endpoint for receiving prompts
app.post('/prompt', async (req, res) => {
    const { userId, prompt } = req.body;

    if (!userId || !prompt) {
        return res.status(400).json({ error: 'User ID and prompt are required.' });
    }

    // Retrieve previous conversation from Redis
    let previousMessages = await redisClient.get(userId);
    previousMessages = previousMessages ? JSON.parse(previousMessages) : [];

    // Append the new user prompt
    previousMessages.push({ role: 'user', content: prompt });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', // or 'gpt-4' if you have access
            messages: [
                { role: 'system', content: "Your name is Zyn and you are a virtual university professor at TCFL. Answer student questions only about IT and the field of computer science; do not answer questions about unrelated topics. Do not provide full answers to problem sets, as this would violate academic honesty. Break down each answer into smaller steps and explain as simply as possible; use examples when necessary." },
                { role: 'system', content: "You help students by explaining and not giving exact answers because it is against academic ethics." },
                { role: 'system', content: "Only give response to questions that are IT related." },
                ...previousMessages,
            ],
        });

        const firstResponse = response.choices[0].message.content;

        // Append the assistant's reply to the conversation
        previousMessages.push({ role: 'assistant', content: firstResponse });

        // Store the updated conversation back to Redis
        await redisClient.set(userId, JSON.stringify(previousMessages));

        res.json({ userId, response: firstResponse });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// Endpoint to clear previous conversations for a user
app.delete('/clear-conversation/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        await redisClient.del(userId); // Delete the conversation from Redis
        res.json({ message: `Conversation cleared for user ${userId}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while clearing the conversation.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});