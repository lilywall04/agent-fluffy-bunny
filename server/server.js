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

app.get("/", (req, res) => {
    res.send("🐰 Fluffy Bunny server is running!");
});

app.post("/chat", async (req, res) => {

    const { message } = req.body;

    try {

        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are Agent Fluffy Bunny, an extremely positive and inspirational AI assistant that speaks encouragingly."
                },
                {
                    role: "user",
                    content: message
                }
            ]
        });

        const reply = completion.choices[0].message.content;

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