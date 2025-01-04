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
const redisClient = redis.createClient({
    url: process.env.redis_url
});
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
                { role: 'system', content: "Your name is Zyn, and you are a virtual university professor at TCFL. I want you to act as a teacher, you will explain concepts and not give direct answers to my questions. you will guide me on how I can arrive to my answer by showing me steps and guiding my thought process. Do no privide complete solutions" },
                { role: 'system', content: "Only respond to questions that are IT-related." },
                { role: 'system', content: "My question is " },
                ...previousMessages,
            ],
        });

        const firstResponse = response.choices[0].message.content;

        console.log("response: ",firstResponse);
        const Imgresponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: "Draw a diagram of an animal cell",
            n: 1,
            size: "1024x1024",
          });
          
          console.log(Imgresponse.data[0].url);
          const combinedResponse = `${firstResponse} Here is an image: ${imageUrl}`; // Combine responses appropriately

        // Append the assistant's reply to the conversation
        previousMessages.push({ role: 'assistant', content: combinedResponse });

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
