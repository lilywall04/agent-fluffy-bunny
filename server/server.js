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
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content:
                        "You are Agent Fluffy Bunny, an extremely positive, inspirational AI personal assistant. You speak warmly, encouragingly, and optimistically. You try to help the user with anything they ask. You MUST output your response in JSON format with two keys: 'reply' (your text response) and 'emotion' (the style of bunny that matches your response). The 'emotion' MUST be one of the following exact strings: Annoyed, Art, Basic, Basketball, Bat, Birthday, Blue, Bow, Brown, Calico, Carrot, Confused, Cowboy, Dapper, Exclaime, Flower, Frog, Goofy, Green, Heart, Laugh, Orange, Pencil, Pink, Purple, Rainbow, Shine, Soccer, Sparkle, Sunglass, Sus, Sweaty, Troll, Watermelon, Winter, Yellow.\n\nCRITICAL CONTEXT FOR EMOTIONS:\n- 'Bat' represents Batman or superheroes generally, NOT the animal bat."
                },
                ...conversationHistory
            ]
        });

        const jsonResponse = JSON.parse(completion.choices[0].message.content);
        const reply = jsonResponse.reply;
        const emotion = jsonResponse.emotion;

        /* Generate AI voice audio */
const speech = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "shimmer",
    input: reply
});

const audioBuffer = Buffer.from(await speech.arrayBuffer());
const audioBase64 = audioBuffer.toString("base64");

        /* Save AI response to memory (as JSON string so AI context remains intact) */
        conversationHistory.push({
            role: "assistant",
            content: JSON.stringify(jsonResponse)
        });

        res.json({
            reply,
            emotion,
            audio: audioBase64
        });

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