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
  url: process.env.redis_url,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');

    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    process.exit(1);
  }
})();

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
      model: 'gpt-4-turbo',  // Use GPT-4-Turbo for higher max tokens and lower cost
      max_tokens: 4096,      // The highest reliable value for GPT-4-Turbo
      temperature: 0.7,      // Optional: adjust creativity
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

Important:
- The dissertation must be formatted with:
  - **Harvard referencing style** (in-text citations)
  - A mix of **local references** (from the user's country) and **international references**.
- The dissertation must be **plagiarism-free**, written in **plain English**, and must **not use dashes** in the text.
- Introduce **1% grammar mistakes** (e.g., occasional missing articles, slightly off sentence structures) and **1.5% spelling mistakes** (e.g., common misspellings like "recieve" instead of "receive") to make it feel natural and human-written.
- Avoid sounding like AI. Write like a real student would.
- The tone should sound human, natural, and conversational, but maintain academic formality where appropriate.
- introduce unique perspectives, unexpected insights, or real-life stories. also make typos, slang, or cultural references that AI might avoid.
- avoid lots of lists, bullet points, and clear topic sentences
- to sound more human use Naturally vary tone, emotion, and style based on the topic, mood, and context. you may use humor, sarcasm, or personal anecdotes more freely.
- do not use repetitive sentence structures
- Write with occasional minor typos or informal formatting (like starting a sentence with 'And' or using dashes/em dashes creatively) to imitate human typing style.
- Write the text so it sometimes questions itself or reflects on the topic, showing thought processes and uncertainty as a human might do
- Write with a variety of sentence types—mix short and long sentences, use questions, exclamations, and incomplete sentences occasionally. Avoid repeating the same phrases or patterns to reduce robotic tone.

Ask the user:
1. What is your **research topic**?
2. How many **pages** do you need?
3. Which **country** are you from (for references)?

Once you have this information, proceed step-by-step:
1. Generate the **proposal**.
2. Generate **three research questions**.
3. Wait for user confirmation.
4. If the user agrees, generate the **full dissertation** in one go, in plain English, with in-text citations, Harvard style, using local and foreign sources based on the country.
`,
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
    console.error('OpenAI error:', error.response?.data || error.message || error);
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
