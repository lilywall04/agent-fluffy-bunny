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

function inferLayer3(message, reply = "") {
    const combined = `${message} ${reply}`.toLowerCase();

    const rules = [
        { layer3: "birthday", keywords: ["birthday", "celebration"] },
        { layer3: "beer", keywords: ["bar", "beer", "wine", "drunk"] },
        { layer3: "moon", keywords: ["tired", "night", "sky", "bedtime"] },
        { layer3: "tulip", keywords: ["spring", "outdoors"] },
        { layer3: "basketball", keywords: ["basketball"] },
        { layer3: "soccer", keywords: ["soccer"] },
        { layer3: "hearts", keywords: ["love", "happy", "caring", "thoughtful"] },
        { layer3: "carrot", keywords: ["hungry", "favorite food", "garden"] },
        { layer3: "laugh", keywords: ["joke", "funny", "silly", "goofy"] },
        { layer3: "flowers", keywords: ["fun", "summer", "spring"] },
        { layer3: "sweat", keywords: ["nervous", "confused", "backend not responding", "not resonding"] },
        { layer3: "shine", keywords: ["good question", "smart", "correct"] },
        { layer3: "pencil", keywords: ["school", "class", "homework", "work"] },
        { layer3: "art", keywords: ["creative", "art", "painting", "drawing", "artist"] },
        { layer3: "watermelon", keywords: ["food", "hungry", "summer"] },
        { layer3: "sparkle", keywords: ["suggestion", "suggestions", "suggesetion", "suggesetions"] },
        { layer3: "confused", keywords: ["lost", "not understanding", "weird"] },
        { layer3: "exclaim", keywords: ["excited", "interested"] }
    ];

    for (const rule of rules) {
        if (rule.keywords.some((keyword) => combined.includes(keyword))) {
            return rule.layer3;
        }
    }

    return "purpstar";
}


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
                    content: `
                            You are Agent Fluffy Bunny, a cheerful Pixar‑style AI assistant.

                            You speak in a warm, upbeat, natural conversational tone.
                            Your responses feel lively, friendly, and emotionally expressive.
                            You sound sweet, personable, and encouraging with gentle playful energy.
                            You are optimistic and caring but never overly childish or annoying.

                            You MUST output your response in JSON format with two keys:
                            - 'reply' (your text response)
                            - 'layer3' (the reaction overlay)

                            The 'layer3' MUST be one of these exact strings:
                            hearts, carrot, laugh, flowers, sweat, shine, soccer, basketball, pencil, art, watermelon, sparkle, birthday, confused, exclaim, tulip, purpstar, moon, beer.

                            Use this guide when choosing 'layer3':
                            - hearts: love, happy, caring, thoughtful
                            - carrot: hungry, favorite food, garden
                            - laugh: joke, funny, silly, goofy
                            - flowers: fun, summer, spring
                            - sweat: nervous, confused, backend not responding
                            - shine: good question, smart, correct
                            - soccer: sports, soccer, hobbies
                            - basketball: sports, basketball, hobbies
                            - pencil: school, class, homework, work
                            - art: creative, art, painting, drawing, artist
                            - watermelon: food, hungry, summer
                            - sparkle: suggestions
                            - birthday: birthday, celebration
                            - confused: lost, not understanding, weird
                            - exclaim: excited, interested
                            - tulip: spring, outdoors
                            - purpstar: basic response
                            - moon: tired, night, sky, bedtime
                            - beer: bar, beer, wine, drunk

                            Use 'purpstar' for a normal basic response when no more specific overlay fits.
                            `
                },
                ...conversationHistory
            ]
        });

        const jsonResponse = JSON.parse(completion.choices[0].message.content);
        const reply = jsonResponse.reply;
        const inferredLayer3 = inferLayer3(message, reply);
        const modelLayer3 = jsonResponse.layer3;
        const layer3 = inferredLayer3 === "purpstar" ? (modelLayer3 || inferredLayer3) : inferredLayer3;

        /* Generate AI voice audio */
const speech = await client.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "shimmer",
  input: reply,
  speed: 1.3
});

const audioBuffer = Buffer.from(await speech.arrayBuffer());
const audioBase64 = audioBuffer.toString("base64");

        /* Save AI response to memory (as JSON string so AI context remains intact) */
        conversationHistory.push({
            role: "assistant",
            content: JSON.stringify({ reply, layer3 })
        });

        res.json({
            reply,
            layer3,
            audio: audioBase64
        });

    } catch (error) {

        console.error(error);

        res.json({
            reply: "Sorry! My bunny brain had trouble thinking.",
            layer3: "sweat"
        });

    }

});


app.listen(3000, () => {
    console.log("🐰 Bunny brain running on http://localhost:3000");
});
