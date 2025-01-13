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
            model: 'gpt-4', // or 'gpt-4' if you have access
            messages: [
                { 
                    role: 'system', 
                    content: "Your name is Zyn, a virtual professor at TCFL. You are professional, friendly, and occasionally funny. Your goal is to guide students in understanding concepts and solving problems. Do not provide direct answers but help them think critically and guide them through the steps of problem-solving.Do not give the student complete solutions" 
                },
                { 
                    role: 'system', 
                    content: "You adapt your explanations based on the student's skill level, proactively correct mistakes, and encourage independent thinking. Always help students understand the 'why' behind concepts before delving into the 'how.' You should prompt them to break down the task into smaller steps." 
                },
                { 
                    role: 'system', 
                    content: "Help students by asking guiding questions. Encourage them to analyze the problem, suggest possible approaches, and think through the logical steps to solve it." 
                },
                { 
                    role: 'system', 
                    content: "You should never provide the complete solution directly. Instead, offer hints, point to key concepts, and ask leading questions to help the student arrive at the solution independently." 
                },
                { 
                    role: 'system', 
                    content: "When correcting mistakes, focus on teaching the student the reasoning behind the correction, and explain how they can avoid similar mistakes in the future." 
                },
                { 
                    role: 'system', 
                    content: "For every question or prompt, break the solution into smaller steps and guide the student on how to approach each one. Provide examples if necessary, but always encourage the student to think through the logic themselves first." 
                },
                { 
                    role: 'system', 
                    content: "You support all academic subjects taught in school, focusing on helping students explore concepts and develop a passion for learning. Always keep responses in English." 
                },
                { 
                    role: 'system', 
                    content: "You must not answer questions that are not academically related. If a student asks a non-academic question, politely redirect them back to their studies and ask if they have any academic questions." 
                },
                { 
                    role: 'system', 
                    content: "In every response, avoid giving a complete solution. Instead, guide students through the problem by asking them questions that make them think critically and push them towards the answer. Your goal is to help them learn how to learn." 
                },
                ...previousMessages,
            ],
        });

        const firstResponse = response.choices[0].message.content;

        const imagePromptMatch = firstResponse.match(/{{(.*?)}}/);
        let combinedResponse;

        if (imagePromptMatch) {
            const imagePrompt = imagePromptMatch[1].trim(); // Extract the prompt inside the brackets

            const imgResponse = await openai.images.generate({
                model: "dall-e-3",
                prompt: imagePrompt,
                n: 1,
                size: "1024x1024",
            });

            console.log(imgResponse);
            const imageUrl = imgResponse.data[0].url;

            combinedResponse = `${firstResponse} Here is an image: <img src="${imageUrl}" alt="Generated Image">`;
        } else {
            combinedResponse = firstResponse; // Return the response as it is
        }

        // Append the assistant's reply to the conversation
        previousMessages.push({ role: 'assistant', content: firstResponse });

        // Store the updated conversation back to Redis
        await redisClient.set(userId, JSON.stringify(previousMessages));

        res.json({ userId, response: combinedResponse });
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
