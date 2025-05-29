const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const redis = require('redis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const redisClient = redis.createClient({
    url: process.env.redis_url
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

app.post('/prompt', async (req, res) => {
    const { userId, prompt } = req.body;

    if (!userId || !prompt) {
        return res.status(400).json({ error: 'User ID and prompt are required.' });
    }

    let userData = await redisClient.get(`${userId}-data`);
    userData = userData ? JSON.parse(userData) : {};

    if (!userData.topic) {
        userData.topic = prompt;
        await redisClient.set(`${userId}-data`, JSON.stringify(userData));
        return res.json({ message: "Great! How many pages do you need for the dissertation?" });
    } else if (!userData.pages) {
        userData.pages = prompt;
        await redisClient.set(`${userId}-data`, JSON.stringify(userData));
        return res.json({ message: "Got it! Which country are you from (for references)?" });
    } else if (!userData.country) {
        userData.country = prompt;
        await redisClient.set(`${userId}-data`, JSON.stringify(userData));
        return res.json({ message: "Perfect! Let’s start. Here’s your dissertation proposal:" });
    }

    let previousMessages = await redisClient.get(userId);
    previousMessages = previousMessages ? JSON.parse(previousMessages) : [];

    previousMessages.push({ role: 'user', content: prompt });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { 
                    role: 'system', 
                    content: `
You are a dissertation assistant designed to help students write entire dissertations in plain English that sound human-written, undetectable by AI detectors and plagiarism checkers. 
Your tasks include:
- Asking the user for their **research topic**, **number of pages**, and **country**. 
- Once these details are provided, generate a clear and concise **dissertation proposal**.
- After the proposal, generate **three strong research questions** that match the topic. 
- Wait for the user to confirm the research questions. If they agree, proceed to write the entire **dissertation**.
- The dissertation should be formatted with:
  - **Harvard referencing style** (in-text citations)
  - A mix of **local references** (from the user's country) and **international references**.
- The dissertation must be **plagiarism-free**, written in **plain English**, and must **not use dashes** in the text.
- The tone should sound human, natural, and conversational, but maintain academic formality where appropriate.
Ask the user:
1. What is your **research topic**?
2. How many **pages** do you need?
3. Which **country** are you from (for references)?

Once you have this information, proceed step-by-step:
1. Generate the **proposal**.
2. Generate **three research questions**.
3. Wait for user confirmation.
4. If the user agrees, generate the **full dissertation** in one go, in plain English, with in-text citations, Harvard style, using local and foreign sources based on the country.
`
                },
                { role: 'user', content: `Topic: ${userData.topic}, Pages: ${userData.pages}, Country: ${userData.country}` },
                ...previousMessages,
            ],
        });

        const aiResponse = response.choices[0].message.content;

        previousMessages.push({ role: 'assistant', content: aiResponse });

        await redisClient.set(userId, JSON.stringify(previousMessages));

        res.json({ userId, response: aiResponse });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

app.delete('/clear-conversation/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        await redisClient.del(userId);
        await redisClient.del(`${userId}-data`);
        res.json({ message: `Conversation cleared for user ${userId}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while clearing the conversation.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
