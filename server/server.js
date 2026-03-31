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

const WEBSITE_MAP = {
    youtube: {
        name: "YouTube",
        url: "https://youtube.com",
        description: "a video streaming and content platform",
        domain: "youtube.com",
        buildSearchUrl: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    },
    tiktok: {
        name: "TikTok",
        url: "https://tiktok.com",
        description: "a short-form video and social media platform",
        domain: "tiktok.com"
    },
    substack: {
        name: "Substack",
        url: "https://substack.com",
        description: "a platform for newsletters and independent writing",
        domain: "substack.com"
    },
    google: {
        name: "Google",
        url: "https://google.com",
        description: "a search engine for finding information online",
        domain: "google.com",
        buildSearchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    },
    spotify: {
        name: "Spotify",
        url: "https://open.spotify.com",
        description: "a music streaming service",
        domain: "open.spotify.com",
        buildSearchUrl: (query) => `https://open.spotify.com/search/${encodeURIComponent(query)}`
    },
    netflix: {
        name: "Netflix",
        url: "https://netflix.com",
        description: "a streaming service for movies and shows",
        domain: "netflix.com"
    },
    hulu: {
        name: "Hulu",
        url: "https://hulu.com",
        description: "a TV and movie streaming platform",
        domain: "hulu.com"
    },
    amazon: {
        name: "Amazon",
        url: "https://amazon.com",
        description: "an online shopping and services platform",
        domain: "amazon.com",
        buildSearchUrl: (query) => `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
    },
    instagram: {
        name: "Instagram",
        url: "https://instagram.com",
        description: "a photo and video sharing social platform",
        domain: "instagram.com"
    },
    twitter: {
        name: "Twitter",
        url: "https://twitter.com",
        description: "a real-time social media and news platform",
        domain: "twitter.com"
    },
    x: {
        name: "X",
        url: "https://twitter.com",
        description: "a real-time social media platform",
        domain: "twitter.com"
    },
    reddit: {
        name: "Reddit",
        url: "https://reddit.com",
        description: "a community discussion and forum platform",
        domain: "reddit.com",
        buildSearchUrl: (query) => `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`
    },
    facebook: {
        name: "Facebook",
        url: "https://facebook.com",
        description: "a social networking platform",
        domain: "facebook.com"
    },
    linkedin: {
        name: "LinkedIn",
        url: "https://linkedin.com",
        description: "a professional networking platform",
        domain: "linkedin.com"
    },
    github: {
        name: "GitHub",
        url: "https://github.com",
        description: "a platform for code hosting and collaboration",
        domain: "github.com"
    },
    pinterest: {
        name: "Pinterest",
        url: "https://pinterest.com",
        description: "a visual discovery and inspiration platform",
        domain: "pinterest.com"
    },
    discord: {
        name: "Discord",
        url: "https://discord.com",
        description: "a chat and community communication platform",
        domain: "discord.com"
    },
    twitch: {
        name: "Twitch",
        url: "https://twitch.tv",
        description: "a live streaming platform for gaming and content",
        domain: "twitch.tv"
    },
    "apple music": {
        name: "Apple Music",
        url: "https://music.apple.com",
        description: "a music streaming platform",
        domain: "music.apple.com"
    },
    "youtube music": {
        name: "YouTube Music",
        url: "https://music.youtube.com",
        description: "a music streaming service by YouTube",
        domain: "music.youtube.com"
    },
    gmail: {
        name: "Gmail",
        url: "https://mail.google.com",
        description: "Google's email service",
        domain: "mail.google.com"
    },
    "google docs": {
        name: "Google Docs",
        url: "https://docs.google.com",
        description: "an online document editing platform",
        domain: "docs.google.com"
    },
    "google drive": {
        name: "Google Drive",
        url: "https://drive.google.com",
        description: "a cloud storage platform",
        domain: "drive.google.com"
    },
    "google maps": {
        name: "Google Maps",
        url: "https://maps.google.com",
        description: "a navigation and maps service",
        domain: "maps.google.com"
    },
    ebay: {
        name: "eBay",
        url: "https://ebay.com",
        description: "an online marketplace for buying and selling",
        domain: "ebay.com"
    },
    etsy: {
        name: "Etsy",
        url: "https://etsy.com",
        description: "a marketplace for handmade and creative goods",
        domain: "etsy.com"
    },
    cnn: {
        name: "CNN",
        url: "https://cnn.com",
        description: "a news website",
        domain: "cnn.com"
    },
    bbc: {
        name: "BBC",
        url: "https://bbc.com",
        description: "an international news and media site",
        domain: "bbc.com"
    },
    nytimes: {
        name: "NYTimes",
        url: "https://nytimes.com",
        description: "a major news publication",
        domain: "nytimes.com"
    },
    weather: {
        name: "Weather",
        url: "https://weather.com",
        description: "a weather forecasting website",
        domain: "weather.com"
    },
    yahoo: {
        name: "Yahoo",
        url: "https://yahoo.com",
        description: "a web portal and news site",
        domain: "yahoo.com"
    }
};

const LAYER3_TO_EMOTION = {
    hearts: "caring",
    carrot: "curious",
    laugh: "playful",
    flowers: "happy",
    sweat: "concerned",
    shine: "confident",
    soccer: "energetic",
    basketball: "energetic",
    pencil: "focused",
    art: "creative",
    watermelon: "cheerful",
    sparkle: "hopeful",
    birthday: "celebratory",
    confused: "uncertain",
    exclaim: "excited",
    tulip: "bright",
    purpstar: "friendly",
    moon: "calm",
    beer: "relaxed"
};

function normalizeLookupValue(value = "") {
    return value.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanSiteRequest(value = "") {
    return value
        .trim()
        .replace(/^[\s"'`]+|[\s"'`?!,.]+$/g, "")
        .replace(/\s+please$/i, "")
        .replace(/^(?:the\s+)/i, "")
        .replace(/\s+(?:website|site|page)$/i, "")
        .replace(/^www\./i, "")
        .trim();
}

function cleanQuery(value = "") {
    return value
        .trim()
        .replace(/^[\s"'`]+|[\s"'`?!,.]+$/g, "")
        .replace(/\s+please$/i, "")
        .replace(/\s+/g, " ");
}

function formatSiteName(siteRequest = "") {
    return cleanSiteRequest(siteRequest).replace(/\s+/g, " ");
}

function getWebsiteMatch(siteRequest = "") {
    const cleanedSite = formatSiteName(siteRequest);
    if (!cleanedSite) return null;

    const normalizedSite = normalizeLookupValue(cleanedSite).replace(/\.(?:com|tv|org|net)$/, "");
    return WEBSITE_MAP[normalizedSite] || null;
}

function looksLikeDomain(value = "") {
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim());
}

function guessSiteDescription(siteName = "") {
    const normalizedSite = normalizeLookupValue(siteName);

    if (!normalizedSite) return "a website or online platform";
    if (/(music|radio|sound|playlist|podcast)/.test(normalizedSite)) return "a music or audio platform";
    if (/(shop|store|market|buy|sale|deal)/.test(normalizedSite)) return "an online shopping website";
    if (/(news|times|post|journal|daily)/.test(normalizedSite)) return "a news or media website";
    if (/(chat|talk|forum|community|social)/.test(normalizedSite)) return "a community or communication website";
    if (/(video|tube|stream|tv)/.test(normalizedSite)) return "a video or streaming website";
    if (/(mail|docs|drive|calendar|notes)/.test(normalizedSite)) return "a productivity or web service";

    return "a website or online platform";
}

function buildGoogleSearchUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildFallbackSearchUrl(query, siteRequest, site = null) {
    if (site) {
        return buildGoogleSearchUrl(`${query} site:${site.domain}`);
    }

    const siteName = formatSiteName(siteRequest);
    if (!siteName) {
        return buildGoogleSearchUrl(query);
    }

    const fallbackQuery = looksLikeDomain(siteName)
        ? `${query} site:${siteName.replace(/^www\./i, "")}`
        : `${query} ${siteName}`;

    return buildGoogleSearchUrl(fallbackQuery);
}

function buildOpenWebsiteResponse(siteRequest) {
    const site = getWebsiteMatch(siteRequest);

    if (site) {
        return {
            reply: `Alright, opening ${site.name} - ${site.description}.`,
            emotion: "hopeful",
            layer3: "sparkle",
            action: "open_url",
            data: {
                url: site.url,
                siteName: site.name,
                description: site.description
            },
            needsConfirmation: false
        };
    }

    const siteName = formatSiteName(siteRequest);
    if (!siteName) return null;

    const description = guessSiteDescription(siteName);

    return {
        reply: `I think I found '${siteName}'. Before I open it, does this match what you're looking for: ${description}?`,
        emotion: "uncertain",
        layer3: "confused",
        action: "open_url",
        data: {
            url: buildGoogleSearchUrl(siteName),
            siteName,
            description
        },
        needsConfirmation: true
    };
}

function buildSearchWebsiteResponse(queryRequest, siteRequest) {
    const query = cleanQuery(queryRequest);
    if (!query) return null;

    const site = getWebsiteMatch(siteRequest);

    if (site?.buildSearchUrl) {
        return {
            reply: `Alright, opening ${site.name} - ${site.description}. I am searching for "${query}" there now.`,
            emotion: "helpful",
            layer3: "shine",
            action: "open_url",
            data: {
                url: site.buildSearchUrl(query),
                siteName: site.name,
                description: site.description
            },
            needsConfirmation: false
        };
    }

    const googleSite = WEBSITE_MAP.google;

    if (site) {
        return {
            reply: `Alright, opening ${googleSite.name} - ${googleSite.description}. I could not find a direct search for ${site.name} - ${site.description} - so I am searching for "${query}" there instead.`,
            emotion: "helpful",
            layer3: "shine",
            action: "open_url",
            data: {
                url: buildFallbackSearchUrl(query, siteRequest, site),
                siteName: googleSite.name,
                description: googleSite.description
            },
            needsConfirmation: false
        };
    }

    const siteName = formatSiteName(siteRequest);
    const description = guessSiteDescription(siteName);

    return {
        reply: `Alright, opening ${googleSite.name} - ${googleSite.description}. I could not find a direct search for ${siteName} - ${description} - so I am searching for "${query}" there instead.`,
        emotion: "helpful",
        layer3: "shine",
        action: "open_url",
        data: {
            url: buildFallbackSearchUrl(query, siteRequest),
            siteName: googleSite.name,
            description: googleSite.description
        },
        needsConfirmation: false
    };
}

function detectWebsiteAction(message = "") {
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    if (!trimmedMessage) return null;

    const searchMatch = trimmedMessage.match(/^(?:please\s+)?search(?:\s+for)?\s+(.+?)\s+on\s+(.+)$/i);
    if (searchMatch) {
        return buildSearchWebsiteResponse(searchMatch[1], searchMatch[2]);
    }

    const openMatch = trimmedMessage.match(/^(?:please\s+)?(?:open|go to|launch|visit|take me to|bring up)\s+(.+)$/i);
    if (openMatch) {
        return buildOpenWebsiteResponse(openMatch[1]);
    }

    return null;
}

function inferEmotion(layer3, modelEmotion = "") {
    if (typeof modelEmotion === "string" && modelEmotion.trim()) {
        return modelEmotion.trim();
    }

    return LAYER3_TO_EMOTION[layer3] || "friendly";
}

function rememberExchange(userMessage, assistantResponse) {
    conversationHistory.push({
        role: "user",
        content: userMessage
    });

    conversationHistory.push({
        role: "assistant",
        content: JSON.stringify({
            reply: assistantResponse.reply,
            emotion: assistantResponse.emotion,
            layer3: assistantResponse.layer3
        })
    });
}

async function synthesizeAudio(text) {
    const speech = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "shimmer",
        input: text,
        speed: 1.3
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    return audioBuffer.toString("base64");
}

async function finalizeResponse(payload) {
    const audio = payload.reply ? await synthesizeAudio(payload.reply) : null;
    return audio ? { ...payload, audio } : payload;
}

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
        const websiteAction = detectWebsiteAction(message);
        if (websiteAction) {
            rememberExchange(message, websiteAction);
            res.json(await finalizeResponse(websiteAction));
            return;
        }

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

                            You MUST output your response in JSON format with three keys:
                            - 'reply' (your text response)
                            - 'emotion' (a short emotion word like "friendly" or "excited")
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
        const emotion = inferEmotion(layer3, jsonResponse.emotion);
        const responsePayload = await finalizeResponse({
            reply,
            emotion,
            layer3
        });

        /* Save AI response to memory (as JSON string so AI context remains intact) */
        conversationHistory.push({
            role: "assistant",
            content: JSON.stringify({ reply, emotion, layer3 })
        });

        res.json(responsePayload);

    } catch (error) {

        console.error(error);

        res.json({
            reply: "Sorry! My bunny brain had trouble thinking.",
            emotion: "concerned",
            layer3: "sweat"
        });

    }

});


app.listen(3000, () => {
    console.log("🐰 Bunny brain running on http://localhost:3000");
});
