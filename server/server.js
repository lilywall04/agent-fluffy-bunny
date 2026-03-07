const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/*
Conversation memory
This stores the conversation so the AI remembers previous messages
*/
let conversationHistory = [];


/* Test homepage route */
app.get("/", (req, res) => {
    res.send("🐰 Fluffy Bunny server is running!");
});


/* Chat endpoint */
app.post("/chat", async (req, res) => {

    const { message } = req.body;

    try {

        /* Save user message to memory */
        conversationHistory.push({
            role: "user",
            content: message
        });

        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are Agent Fluffy Bunny, an extremely positive, inspirational AI personal assistant. You speak warmly, encouragingly, and optimistically. You try to help the user with anything they ask."
                },
                ...conversationHistory
            ]
        });

        const reply = completion.choices[0].message.content;

        /* Save AI response to memory */
        conversationHistory.push({
            role: "assistant",
            content: reply
        });

        res.json({ reply });

    } catch (error) {

        console.error(error);

        res.json({
            reply: "Sorry! My bunny brain had trouble thinking."
        });

    }

});


app.listen(3000, () => {
    console.log("🐰 Bunny brain running on http://localhost:3000");
});