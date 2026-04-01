const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
];
const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH || 1500);
const JSON_LIMIT = process.env.JSON_LIMIT || "32kb";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const MAX_REQUESTS_PER_WINDOW = Number(process.env.MAX_REQUESTS_PER_WINDOW || 15);
const MAX_DAILY_REQUESTS_PER_IP = Number(process.env.MAX_DAILY_REQUESTS_PER_IP || 15);
const MAX_HISTORY_MESSAGES_PER_SESSION = Number(process.env.MAX_HISTORY_MESSAGES_PER_SESSION || 12);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 6);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const resolvedAllowedOrigins = allowedOrigins.length ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS;
const rateLimitBuckets = new Map();
const conversationHistories = new Map();

function isLocalOrigin(origin = "") {
    if (!origin) return false;

    try {
        const parsed = new URL(origin);
        return ["localhost", "127.0.0.1"].includes(parsed.hostname);
    } catch (error) {
        return false;
    }
}

function getClientIp(req) {
    return req.ip || req.socket?.remoteAddress || "unknown";
}

function isAllowedOrigin(origin = "") {
    if (!origin) return false;
    if (isLocalOrigin(origin)) return true;
    return resolvedAllowedOrigins.includes(origin);
}

function getSessionId(req) {
    const headerValue = req.headers["x-session-id"];
    if (typeof headerValue !== "string") return null;

    const sessionId = headerValue.trim();
    return /^[a-zA-Z0-9_-]{16,128}$/.test(sessionId) ? sessionId : null;
}

function cleanupConversationHistories(currentTime) {
    for (const [sessionId, entry] of conversationHistories.entries()) {
        if (currentTime - entry.updatedAt > SESSION_TTL_MS) {
            conversationHistories.delete(sessionId);
        }
    }
}

function getConversationHistory(sessionId, currentTime) {
    cleanupConversationHistories(currentTime);

    const existingEntry = conversationHistories.get(sessionId);
    if (existingEntry) {
        existingEntry.updatedAt = currentTime;
        return existingEntry.messages;
    }

    const messages = [];
    conversationHistories.set(sessionId, {
        messages,
        updatedAt: currentTime
    });
    return messages;
}

function rememberExchange(history, userMessage, assistantResponse) {
    history.push({
        role: "user",
        content: userMessage
    });

    history.push({
        role: "assistant",
        content: JSON.stringify({
            reply: assistantResponse.reply,
            emotion: assistantResponse.emotion,
            layer3: assistantResponse.layer3
        })
    });

    if (history.length > MAX_HISTORY_MESSAGES_PER_SESSION) {
        history.splice(0, history.length - MAX_HISTORY_MESSAGES_PER_SESSION);
    }
}

function requireAllowedChatOrigin(req, res, next) {
    const origin = req.headers.origin;

    if (!origin || !isAllowedOrigin(origin)) {
        res.status(403).json({
            error: "Origin not allowed."
        });
        return;
    }

    next();
}

function requireSessionId(req, res, next) {
    const sessionId = getSessionId(req);
    if (!sessionId) {
        res.status(400).json({
            error: "A valid session ID is required."
        });
        return;
    }

    req.sessionId = sessionId;
    next();
}

function getDailyKey(now) {
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
}

function cleanupRateLimitBuckets(todayKey, currentTime) {
    for (const [ip, bucket] of rateLimitBuckets.entries()) {
        const isWindowExpired = currentTime - bucket.windowStart >= RATE_LIMIT_WINDOW_MS;
        const isStaleDay = bucket.dayKey !== todayKey && bucket.dailyCount === 0;

        if (isWindowExpired) {
            bucket.windowStart = currentTime;
            bucket.windowCount = 0;
        }

        if (bucket.dayKey !== todayKey) {
            bucket.dayKey = todayKey;
            bucket.dailyCount = 0;
        }

        if (isStaleDay && bucket.windowCount === 0) {
            rateLimitBuckets.delete(ip);
        }
    }
}

function isLocalRequest(req) {
    return isLocalOrigin(req.headers.origin);
}

function applyChatQuota(req, res, next) {
    if (isLocalRequest(req)) {
        next();
        return;
    }

    const now = new Date();
    const currentTime = now.getTime();
    const todayKey = getDailyKey(now);
    const ip = getClientIp(req);

    cleanupRateLimitBuckets(todayKey, currentTime);

    const bucket = rateLimitBuckets.get(ip) || {
        windowStart: currentTime,
        windowCount: 0,
        dayKey: todayKey,
        dailyCount: 0
    };

    if (currentTime - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
        bucket.windowStart = currentTime;
        bucket.windowCount = 0;
    }

    if (bucket.dayKey !== todayKey) {
        bucket.dayKey = todayKey;
        bucket.dailyCount = 0;
    }

    const hitWindowLimit = bucket.windowCount >= MAX_REQUESTS_PER_WINDOW;
    const hitDailyLimit = bucket.dailyCount >= MAX_DAILY_REQUESTS_PER_IP;

    if (hitWindowLimit || hitDailyLimit) {
        const retryAfterSeconds = hitDailyLimit
            ? Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - currentTime) / 1000))
            : Math.max(1, Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - currentTime) / 1000));

        res.set("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
            error: hitDailyLimit
                ? `Daily limit reached. This demo allows ${MAX_DAILY_REQUESTS_PER_IP} questions per IP each day.`
                : "Rate limit exceeded. Please try again later."
        });
        return;
    }

    bucket.windowCount += 1;
    bucket.dailyCount += 1;
    rateLimitBuckets.set(ip, bucket);
    next();
}

app.use(cors({
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (isLocalOrigin(origin)) {
            callback(null, true);
            return;
        }

        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error("Origin not allowed by CORS"));
    }
}));
app.use(express.json({ limit: JSON_LIMIT }));

app.set("trust proxy", 1);

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const HOPECORE_QUOTES = [
    {
        text: `You only need 1 hour.

1 hour of building. 1 hour of writing. 1 hour of lifting. 1 hour of studying. 1 hour of anything but distracting yourself from the life you are trying to change.

1 hour feels like nothing until you look back 365 hours later and everything's changed.`,
        author: "dan koe on substack"
    },
    {
        text: `This is the way.

Quit brain rot. Read books. Watch classics. Keep a to-do list. Turn off notifications. Eat without screens. Train your body. Clean your space. Take your work seriously. Eat real food. Help others. Walk more. Create » consume. Spend time with loved ones. Travel to new places. Experience the only life you have.`,
        author: "FRIEND on substack"
    },
    {
        text: `I came across a quote that said:

"You can seem like a millionaire to one person and a homeless person to the next. The ants think you are a giant, and the trees don't even notice you. You think you have a boring life, but the next person might be striving for your lifestyle.

Comparison is the thief of joy, so stay kind and keep loving life. Life is all just a big game of perspective."`,
        author: "little reminder on substack"
    },
    {
        text: `Every time you delay, you reinforce the habit of delay.

Every time you act, you reinforce the habit of action.

You are always solidifying something.

Every action or inaction casts a vote for the person you’re becoming.

Vote wisely.`,
        author: "elevate on substack"
    },
    {
        text: `We were meant to create not to consume. That's why we are sad when we do nothing.`,
        author: "teodoraa on substack"
    },
    {
        text: `At some point you have to tell yourself “this is not an experience I want to keep having” and stop entertaining things that don’t benefit you in any way, shape or form.`,
        author: "pathsofstoicism on substack"
    },
    {
        text: `Make it exist first, make it good later`,
        author: "pearly a on substack"
    },
    {
        text: `You attract what you are and you create what you think about.

Act like the person you want to become. Think like the person you want to become.

Nothing changes in your life unless you make the decision and commitment to change it.

Hold an image in your mind of how you wish to see yourself living.

Visualize it every day and you will unconsciously start to do things that will move you towards that goal.`,
        author: "pathsofstoicism on substack"
    },
    {
        text: `If I am worth anything later, I am worth something now. For wheat is wheat, even if people think it is a grass in the beginning.`,
        author: "Van Gough"
    },
    {
        text: `It always seems impossible until it’s done.`,
        author: "Nelson Mandela"
    },
    {
        text: `You must do the thing you think you cannot do.`,
        author: "Eleanor Roosevelt"
    },
    {
        text: `Act as if what you do makes a difference. It does.`,
        author: "William James"
    },
    {
        text: `Turn your wounds into wisdom.`,
        author: "Oprah Winfrey"
    },
    {
        text: `If you’re going through hell, keep going.`,
        author: "Winston Churchill"
    },
    {
        text: `We are all in the gutter, but some of us are looking at the stars.`,
        author: "Oscar Wilde"
    },
    {
        text: `In the middle of every difficulty lies opportunity.`,
        author: "Albert Einstein"
    },
    {
        text: `You do not find the happy life. You make it.`,
        author: "Camilla Eyring Kimball"
    },
    {
        text: `Nothing will work unless you do.`,
        author: "Maya Angelou"
    },
    {
        text: `The soul becomes dyed with the color of its thoughts.`,
        author: "Marcus Aurelius"
    },
    {
        text: `We are all broken, that’s how the light gets in.`,
        author: "Ernest Hemingway"
    }
];

const WEBSITE_MAP = {
    youtube: {
        name: "YouTube",
        url: "https://www.youtube.com/",
        description: "a video streaming and content platform",
        domain: "youtube.com",
        buildSearchUrl: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    },
    tiktok: {
        name: "TikTok",
        url: "https://www.tiktok.com/",
        description: "a short-form video and social media platform",
        domain: "tiktok.com"
    },
    substack: {
        name: "Substack",
        url: "https://substack.com/",
        description: "a platform for newsletters and independent writing",
        domain: "substack.com"
    },
    google: {
        name: "Google",
        url: "https://www.google.com/",
        description: "a search engine for finding information online",
        domain: "google.com",
        buildSearchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    },
    spotify: {
        name: "Spotify",
        url: "https://open.spotify.com/",
        description: "a music streaming service",
        domain: "open.spotify.com",
        buildSearchUrl: (query) => `https://open.spotify.com/search/${encodeURIComponent(query)}`
    },
    netflix: {
        name: "Netflix",
        url: "https://www.netflix.com/",
        description: "a streaming service for movies and shows",
        domain: "netflix.com"
    },
    hulu: {
        name: "Hulu",
        url: "https://www.hulu.com/",
        description: "a TV and movie streaming platform",
        domain: "hulu.com"
    },
    amazon: {
        name: "Amazon",
        url: "https://www.amazon.com/",
        description: "an online shopping and services platform",
        domain: "amazon.com",
        buildSearchUrl: (query) => `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
    },
    instagram: {
        name: "Instagram",
        url: "https://www.instagram.com/",
        description: "a photo and video sharing social platform",
        domain: "instagram.com"
    },
    twitter: {
        name: "Twitter",
        url: "https://twitter.com/",
        description: "a real-time social media and news platform",
        domain: "twitter.com"
    },
    x: {
        name: "X",
        url: "https://twitter.com/",
        description: "a real-time social media platform",
        domain: "twitter.com"
    },
    reddit: {
        name: "Reddit",
        url: "https://www.reddit.com/",
        description: "a community discussion and forum platform",
        domain: "reddit.com",
        buildSearchUrl: (query) => `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`
    },
    facebook: {
        name: "Facebook",
        url: "https://www.facebook.com/",
        description: "a social networking platform",
        domain: "facebook.com"
    },
    linkedin: {
        name: "LinkedIn",
        url: "https://www.linkedin.com/",
        description: "a professional networking platform",
        domain: "linkedin.com"
    },
    github: {
        name: "GitHub",
        url: "https://github.com/",
        description: "a platform for code hosting and collaboration",
        domain: "github.com"
    },
    pinterest: {
        name: "Pinterest",
        url: "https://www.pinterest.com/",
        description: "a visual discovery and inspiration platform",
        domain: "pinterest.com"
    },
    discord: {
        name: "Discord",
        url: "https://discord.com/",
        description: "a chat and community communication platform",
        domain: "discord.com"
    },
    twitch: {
        name: "Twitch",
        url: "https://www.twitch.tv/",
        description: "a live streaming platform for gaming and content",
        domain: "twitch.tv"
    },
    "apple music": {
        name: "Apple Music",
        url: "https://music.apple.com/",
        description: "a music streaming platform",
        domain: "music.apple.com"
    },
    "youtube music": {
        name: "YouTube Music",
        url: "https://music.youtube.com/",
        description: "a music streaming service by YouTube",
        domain: "music.youtube.com"
    },
    gmail: {
        name: "Gmail",
        url: "https://mail.google.com/",
        description: "Google's email service",
        domain: "mail.google.com"
    },
    "google docs": {
        name: "Google Docs",
        url: "https://docs.google.com/",
        description: "an online document editing platform",
        domain: "docs.google.com"
    },
    "google drive": {
        name: "Google Drive",
        url: "https://drive.google.com/",
        description: "a cloud storage platform",
        domain: "drive.google.com"
    },
    "google maps": {
        name: "Google Maps",
        url: "https://maps.google.com/",
        description: "a navigation and maps service",
        domain: "maps.google.com"
    },
    ebay: {
        name: "eBay",
        url: "https://www.ebay.com/",
        description: "an online marketplace for buying and selling",
        domain: "ebay.com"
    },
    etsy: {
        name: "Etsy",
        url: "https://www.etsy.com/",
        description: "a marketplace for handmade and creative goods",
        domain: "etsy.com"
    },
    cnn: {
        name: "CNN",
        url: "https://www.cnn.com/",
        description: "a news website",
        domain: "cnn.com"
    },
    bbc: {
        name: "BBC",
        url: "https://www.bbc.com/",
        description: "an international news and media site",
        domain: "bbc.com"
    },
    nytimes: {
        name: "NYTimes",
        url: "https://www.nytimes.com/",
        description: "a major news publication",
        domain: "nytimes.com"
    },
    weather: {
        name: "Weather",
        url: "https://weather.com/",
        description: "a weather forecasting website",
        domain: "weather.com"
    },
    yahoo: {
        name: "Yahoo",
        url: "https://www.yahoo.com/",
        description: "a web portal and news site",
        domain: "yahoo.com"
    }
};

const unknownSiteCache = new Map();

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

function formatDisplaySiteName(siteRequest = "") {
    const siteName = formatSiteName(siteRequest);
    return siteName.replace(/\b[a-z]/g, (character) => character.toUpperCase());
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

function normalizeSmartSiteName(siteName = "") {
    return cleanSiteRequest(siteName).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeDescriptionSentence(text = "", siteName = "") {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) {
        const displayName = formatSiteName(siteName) || "This website";
        return `${displayName} appears to be an online website or service.`;
    }

    const singleSentence = cleaned.split(/(?<=[.!?])\s+/)[0].trim();
    return /[.!?]$/.test(singleSentence) ? singleSentence : `${singleSentence}.`;
}

async function generateWebsiteDescription(siteName = "") {
    const displayName = formatSiteName(siteName);
    if (!displayName) {
        return "It appears to be an online website or service.";
    }

    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You write one-sentence website descriptions. Be accurate, concise, and avoid speculation when uncertain."
                },
                {
                    role: "user",
                    content: `Give a one-sentence description of the website called '${displayName}'. Be accurate and concise.`
                }
            ]
        });

        return sanitizeDescriptionSentence(completion.choices[0]?.message?.content, displayName);
    } catch (error) {
        console.error("generateWebsiteDescription failed:", error);
        return sanitizeDescriptionSentence("", displayName);
    }
}

function buildSmartUrl(siteName = "") {
    const normalizedSite = normalizeSmartSiteName(siteName);
    if (!normalizedSite) return null;

    return `https://${normalizedSite}.com/`;
}

async function canResolveUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "user-agent": "Mozilla/5.0 Agent Fluffy Bunny"
            }
        });

        return response.status < 500 ? response.url || url : null;
    } catch (error) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function resolveSmartUrl(siteName = "") {
    const directUrl = buildSmartUrl(siteName);
    if (!directUrl) return null;

    const normalizedSite = normalizeSmartSiteName(siteName);
    const candidates = [
        directUrl,
        `https://www.${normalizedSite}.com/`
    ];

    for (const candidate of candidates) {
        const resolvedUrl = await canResolveUrl(candidate);
        if (resolvedUrl) {
            return resolvedUrl;
        }
    }

    return null;
}

async function getUnknownSiteDetails(siteName = "") {
    const queryName = formatSiteName(siteName);
    const displayName = formatDisplaySiteName(siteName);
    if (!queryName || !displayName) return null;

    const cacheKey = normalizeLookupValue(queryName);
    if (unknownSiteCache.has(cacheKey)) {
        return unknownSiteCache.get(cacheKey);
    }

    const [description, resolvedUrl] = await Promise.all([
        generateWebsiteDescription(displayName),
        resolveSmartUrl(displayName)
    ]);

    const details = {
        siteName: displayName,
        query: queryName.toLowerCase(),
        description,
        directUrl: buildSmartUrl(displayName),
        resolvedUrl,
        fallbackUrl: buildGoogleSearchUrl(queryName)
    };

    unknownSiteCache.set(cacheKey, details);
    return details;
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

function detectWeatherIntent(message = "") {
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    if (!trimmedMessage) return null;

    const normalizedMessage = normalizeLookupValue(trimmedMessage)
        .replace(/\bwhat s\b/g, "whats")
        .replace(/\bhow s\b/g, "hows");
    const patterns = [
        /^(?:what(?:s| is)\s+)?(?:the\s+)?weather(?:\s+(?:today|like))?\s+(?:in|for)\s+(.+)$/i,
        /^(?:how(?:s| is)\s+the\s+weather)\s+(?:in|for)\s+(.+)$/i,
        /^(?:weather|forecast)(?:\s+today)?\s+(?:in|for)\s+(.+)$/i,
        /^(?:what(?:s| is)\s+)?(?:the\s+)?(?:temperature|forecast)(?:\s+today)?\s+(?:in|for)\s+(.+)$/i,
        /^(?:temperature|forecast)(?:\s+today)?\s+(?:in|for)\s+(.+)$/i,
        /^(?:how\s+hot\s+is\s+it)\s+(?:in|for)\s+(.+)$/i
    ];

    for (const pattern of patterns) {
        const match = normalizedMessage.match(pattern);
        if (match) {
            const location = cleanQuery(match[1]);
            return location || null;
        }
    }

    return null;
}

const US_STATE_NAMES = {
    al: "Alabama",
    ak: "Alaska",
    az: "Arizona",
    ar: "Arkansas",
    ca: "California",
    co: "Colorado",
    ct: "Connecticut",
    de: "Delaware",
    fl: "Florida",
    ga: "Georgia",
    hi: "Hawaii",
    id: "Idaho",
    il: "Illinois",
    in: "Indiana",
    ia: "Iowa",
    ks: "Kansas",
    ky: "Kentucky",
    la: "Louisiana",
    me: "Maine",
    md: "Maryland",
    ma: "Massachusetts",
    mi: "Michigan",
    mn: "Minnesota",
    ms: "Mississippi",
    mo: "Missouri",
    mt: "Montana",
    ne: "Nebraska",
    nv: "Nevada",
    nh: "New Hampshire",
    nj: "New Jersey",
    nm: "New Mexico",
    ny: "New York",
    nc: "North Carolina",
    nd: "North Dakota",
    oh: "Ohio",
    ok: "Oklahoma",
    or: "Oregon",
    pa: "Pennsylvania",
    ri: "Rhode Island",
    sc: "South Carolina",
    sd: "South Dakota",
    tn: "Tennessee",
    tx: "Texas",
    ut: "Utah",
    vt: "Vermont",
    va: "Virginia",
    wa: "Washington",
    wv: "West Virginia",
    wi: "Wisconsin",
    wy: "Wyoming",
    dc: "District of Columbia"
};

const UNIQUE_US_STATE_NAMES = [...new Set(Object.values(US_STATE_NAMES))].sort((left, right) => right.length - left.length);

function cleanWeatherLocation(value = "") {
    return cleanQuery(value)
        .replace(/\b(?:right now|today|tonight|this morning|this afternoon|this evening|tomorrow)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildWeatherLocationCandidates(location = "") {
    const cleanedLocation = cleanWeatherLocation(location);
    if (!cleanedLocation) return [];

    const seenCandidates = new Set();
    const candidates = [];
    const addCandidate = (query, options = {}) => {
        const normalizedQuery = cleanQuery(query).replace(/\s+/g, " ").trim();
        if (!normalizedQuery) return;

        const key = `${normalizedQuery}::${options.preferredAdmin1 || ""}::${options.preferredCountryCode || ""}`;
        if (seenCandidates.has(key)) return;

        seenCandidates.add(key);
        candidates.push({
            query: normalizedQuery,
            ...options
        });
    };

    addCandidate(cleanedLocation);
    const hasCountry = /\b(united states|usa|us)\b/i.test(cleanedLocation);
    if (!hasCountry) {
        addCandidate(`${cleanedLocation}, United States`, {
            preferredCountryCode: "US"
        });
    }

    const stateMatch = cleanedLocation.match(/^(.*?)(?:,\s*|\s+)([a-z]{2})$/i);
    if (stateMatch) {
        const city = stateMatch[1].trim();
        const stateCode = stateMatch[2].toLowerCase();
        const stateName = US_STATE_NAMES[stateCode];

        if (city && stateName) {
            addCandidate(city, {
                preferredAdmin1: stateName,
                preferredCountryCode: "US"
            });
            addCandidate(`${city}, United States`, {
                preferredAdmin1: stateName,
                preferredCountryCode: "US"
            });
        }
    }

    const normalizedLocation = normalizeLookupValue(cleanedLocation);
    for (const stateName of UNIQUE_US_STATE_NAMES) {
        const normalizedStateName = normalizeLookupValue(stateName);
        if (!normalizedLocation.endsWith(` ${normalizedStateName}`)) {
            continue;
        }

        const city = cleanedLocation.slice(0, cleanedLocation.length - stateName.length).replace(/[,\s]+$/g, "").trim();
        if (!city) {
            continue;
        }

        addCandidate(`${city}, ${stateName}`, {
            preferredAdmin1: stateName,
            preferredCountryCode: "US"
        });
        addCandidate(city, {
            preferredAdmin1: stateName,
            preferredCountryCode: "US"
        });
    }

    return candidates;
}

function formatGeocodedLocation(result = {}) {
    const nameParts = [result.name];
    if (result.admin1) {
        nameParts.push(result.admin1);
    } else if (result.country_code) {
        nameParts.push(result.country_code);
    }

    return {
        name: nameParts.filter(Boolean).join(", "),
        latitude: result.latitude,
        longitude: result.longitude
    };
}

async function getCoordinates(location) {
    const candidates = buildWeatherLocationCandidates(location);

    for (const candidate of candidates) {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate.query)}&count=20&language=en&format=json`);
        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];

        if (!results.length) {
            continue;
        }

        const preferredAdmin1 = candidate.preferredAdmin1 ? normalizeLookupValue(candidate.preferredAdmin1) : null;
        const preferredCountryCode = candidate.preferredCountryCode || null;
        const preferredResult = results.find((result) => {
            const matchesCountry = !preferredCountryCode || result.country_code === preferredCountryCode;
            const matchesAdmin1 = !preferredAdmin1 || normalizeLookupValue(result.admin1) === preferredAdmin1;
            return matchesCountry && matchesAdmin1;
        }) || results.find((result) => !preferredCountryCode || result.country_code === preferredCountryCode) || results[0];

        if (preferredResult) {
            return formatGeocodedLocation(preferredResult);
        }
    }

    return null;
}

async function getWeather(lat, lon) {
    const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=2`
    );

    const data = await response.json();
    return {
        ...data,
        current_weather: data.current
            ? {
                temperature: data.current.temperature_2m,
                windspeed: data.current.wind_speed_10m,
                weathercode: data.current.weather_code,
                time: data.current.time
            }
            : data.current_weather,
        hourly: data.hourly
            ? {
                ...data.hourly,
                windspeed_10m: data.hourly.wind_speed_10m || data.hourly.windspeed_10m
            }
            : data.hourly
    };
}

function isWeatherDetailsRequest(message = "") {
    return /^(yes|yeah|yep|sure|ok|okay|show more|details|more detail|more details|tell me more)(\s+please)?$/i.test(
        normalizeLookupValue(message)
    );
}

function describeWeatherCode(weatherCode) {
    const code = Number(weatherCode);

    if (code === 0) return "clear";
    if (code === 1) return "mostly clear";
    if (code === 2) return "partly cloudy";
    if (code === 3) return "overcast";
    if (code === 45 || code === 48) return "foggy";
    if ([51, 53, 55, 56, 57].includes(code)) return "drizzly";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rainy";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snowy";
    if ([95, 96, 99].includes(code)) return "stormy";

    return "mild";
}

function describeShortWeatherCode(weatherCode, precipitationProbability = null) {
    const code = Number(weatherCode);

    if (precipitationProbability !== null && precipitationProbability >= 55) {
        return "rain likely";
    }

    if (code === 0 || code === 1) return "sunny";
    if (code === 2) return "partly cloudy";
    if (code === 3) return "cloudy";
    if (code === 45 || code === 48) return "foggy";
    if ([51, 53, 55, 56, 57].includes(code)) return "drizzly";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "showery";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snowy";
    if ([95, 96, 99].includes(code)) return "stormy";

    return "steady";
}

function getHourlySnapshot(weatherData, itemCount = 3) {
    const hourly = weatherData?.hourly;
    if (!hourly?.time?.length) return [];

    const currentTime = weatherData?.current_weather?.time || hourly.time[0];
    const startIndex = Math.max(hourly.time.findIndex((time) => time >= currentTime), 0);
    const snapshots = [];

    for (let step = 0; snapshots.length < itemCount; step += 2) {
        const index = startIndex + step;
        if (index >= hourly.time.length) break;

        snapshots.push({
            time: hourly.time[index],
            temperature: hourly.temperature_2m?.[index],
            precipitationProbability: hourly.precipitation_probability?.[index],
            windspeed: hourly.windspeed_10m?.[index],
            weathercode: hourly.weather_code?.[index]
        });
    }

    return snapshots;
}

function formatHourLabel(timestamp = "") {
    const hourPortion = timestamp.split("T")[1]?.slice(0, 2);
    const hour = Number(hourPortion);

    if (Number.isNaN(hour)) {
        return timestamp;
    }

    const suffix = hour >= 12 ? "PM" : "AM";
    const normalizedHour = hour % 12 || 12;
    return `${normalizedHour} ${suffix}`;
}

function formatWeatherSummary(locationName, weatherData) {
    const currentWeather = weatherData?.current_weather;
    if (!currentWeather) {
        return `I checked ${locationName}, but I couldn't pull together a clean weather snapshot just yet. Want to try again in a moment?`;
    }

    const temperature = Math.round(currentWeather.temperature);
    const windspeed = Math.round(currentWeather.windspeed);
    const condition = describeWeatherCode(currentWeather.weathercode);
    const hourlySnapshots = getHourlySnapshot(weatherData, 4);
    const maxRainChance = hourlySnapshots.reduce((highest, snapshot) => {
        const rainChance = Number(snapshot.precipitationProbability);
        return Number.isNaN(rainChance) ? highest : Math.max(highest, rainChance);
    }, 0);

    let overallLine = "It looks pretty steady overall today with easygoing conditions 🌤️";
    if (maxRainChance >= 60) {
        overallLine = "There is a decent chance of rain later on, so it may be smart to keep an umbrella nearby ☔";
    } else if (windspeed >= 18) {
        overallLine = "It is feeling a bit breezy today, so hold onto your hoodie if you head outside 🍃";
    } else if (condition === "clear" || condition === "mostly clear") {
        overallLine = "It looks pretty calm overall today with mild conditions 🌤️";
    }

    return `Right now in ${locationName}, it's ${temperature}°F and ${condition} with winds around ${windspeed} mph. ${overallLine} Want a more detailed breakdown?`;
}

function formatWeatherDetails(locationName, weatherData) {
    const snapshots = getHourlySnapshot(weatherData, 3);
    if (!snapshots.length) {
        return `I don't have enough hourly detail for ${locationName} yet, but we can try checking again in a moment.`;
    }

    const detailLines = snapshots.map((snapshot) => {
        const temperature = Number.isFinite(snapshot.temperature) ? `${Math.round(snapshot.temperature)}°F` : "temperature unavailable";
        const condition = describeShortWeatherCode(snapshot.weathercode, snapshot.precipitationProbability);
        const rainChance = Number.isFinite(snapshot.precipitationProbability)
            ? `${Math.round(snapshot.precipitationProbability)}% chance of rain`
            : "rain chance unavailable";

        return `• ${formatHourLabel(snapshot.time)}: ${temperature}, ${condition}, ${rainChance}`;
    });

    return `Here's a closer look in ${locationName}:\n\n${detailLines.join("\n")}\n\nLooks like a pretty manageable day overall 🌇`;
}

function buildYouTubeSearch(query) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function enhanceMusicQuery(query, type) {
    const q = query.toLowerCase();

    if (type !== "general") return query;

    if (q.includes("study") || q.includes("focus")) {
        return "lofi study music playlist";
    }

    if (q.includes("chill") || q.includes("relax")) {
        return "chill lofi music playlist";
    }

    if (q.includes("sleep")) {
        return "ambient sleep music";
    }

    if (q.includes("workout") || q.includes("gym")) {
        return "high energy workout music playlist";
    }

    if (q.includes("sad") || q.includes("cry")) {
        return "sad emotional songs playlist";
    }

    if (q.includes("happy")) {
        return "happy upbeat music playlist";
    }

    if (q.includes("party")) {
        return "party hits playlist";
    }

    if (q.includes("hype")) {
        return "hype music playlist";
    }

    if (q.includes("jazz")) {
        return "smooth jazz music";
    }

    if (q.includes("rap") || q.includes("hip hop")) {
        return "rap music playlist";
    }

    return query;
}

function isGeneralMusicRequest(query = "") {
    return /\b(music|song|songs|playlist|playlists|mix|beats|lofi|jazz|rap|hip hop|study|focus|chill|relax|sleep|workout|gym|sad|cry|happy|party|hype|ambient)\b/i.test(query);
}

function buildGeneralMusicReply(query = "") {
    const normalizedQuery = query.toLowerCase();

    if (normalizedQuery.includes("study") || normalizedQuery.includes("focus")) {
        return "Got it - here's some study music to help you lock in 📚🎧";
    }

    if (normalizedQuery.includes("workout") || normalizedQuery.includes("gym") || normalizedQuery.includes("hype")) {
        return "Let's get some energy going - playing workout music 💪🔥";
    }

    if (normalizedQuery.includes("sad") || normalizedQuery.includes("cry")) {
        return "I've got you - here's something to match the mood 💙🎶";
    }

    return "Alright, playing some music for you 🎵";
}

function detectMusicAction(message = "") {
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    if (!trimmedMessage) return null;

    const songMatch = trimmedMessage.match(/^(?:please\s+)?play(?:\s+the\s+song)?\s+(.+?)\s+by\s+(.+)$/i);
    if (songMatch) {
        const song = cleanQuery(songMatch[1]);
        const artist = cleanQuery(songMatch[2]);
        if (!song || !artist) return null;

        return {
            reply: `Ooo good choice - playing '${song}' by ${artist} 🎶`,
            emotion: "excited",
            layer3: "sparkle",
            action: "open_url",
            data: {
                url: buildYouTubeSearch(`${song} ${artist}`),
                siteName: "YouTube",
                description: "a video and music streaming platform"
            },
            needsConfirmation: false
        };
    }

    const artistMatch = trimmedMessage.match(/^(?:please\s+)?play\s+the\s+artist\s+(.+)$/i);
    if (artistMatch) {
        const artist = cleanQuery(artistMatch[1]);
        if (!artist) return null;

        return {
            reply: `Alright, playing ${artist} for you 🎵`,
            emotion: "excited",
            layer3: "sparkle",
            action: "open_url",
            data: {
                url: buildYouTubeSearch(artist),
                siteName: "YouTube",
                description: "a video and music streaming platform"
            },
            needsConfirmation: false
        };
    }

    const generalPlayMatch = trimmedMessage.match(/^(?:please\s+)?play\s+(.+)$/i);
    if (!generalPlayMatch) return null;

    const originalQuery = cleanQuery(generalPlayMatch[1]);
    if (!originalQuery) return null;

    const type = isGeneralMusicRequest(originalQuery) ? "general" : "artist";
    const query = enhanceMusicQuery(originalQuery, type);
    const reply = type === "artist"
        ? `Alright, playing ${originalQuery} for you 🎵`
        : buildGeneralMusicReply(originalQuery);

    return {
        reply,
        emotion: "excited",
        layer3: "sparkle",
        action: "open_url",
        data: {
            url: buildYouTubeSearch(query),
            siteName: "YouTube",
            description: "a video and music streaming platform"
        },
        needsConfirmation: false
    };
}

async function buildOpenWebsiteResponse(siteRequest) {
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

    const siteDetails = await getUnknownSiteDetails(siteName);

    return {
        reply: `I think I found '${siteDetails.siteName}'. Before I open it, does this match what you're looking for: ${siteDetails.description}`,
        emotion: "uncertain",
        layer3: "confused",
        action: "open_url",
        data: {
            siteName: siteDetails.siteName,
            query: siteDetails.query,
            description: siteDetails.description
        },
        needsConfirmation: true
    };
}

async function buildSearchWebsiteResponse(queryRequest, siteRequest) {
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
    const siteDetails = siteName ? await getUnknownSiteDetails(siteName) : null;
    const description = siteDetails?.description || "a website or online platform";
    const displaySiteName = siteDetails?.siteName || siteName;

    return {
        reply: `Alright, opening ${googleSite.name} - ${googleSite.description}. I could not find a direct search for ${displaySiteName} - ${description} - so I am searching for "${query}" there instead.`,
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

async function detectWebsiteAction(message = "") {
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

function getRandomHopecoreQuote() {
    const index = Math.floor(Math.random() * HOPECORE_QUOTES.length);
    return HOPECORE_QUOTES[index];
}

function detectHopecoreIntent(message = "") {
    const rawMessage = String(message || "").toLowerCase().trim();
    if (!rawMessage) return false;

    const normalizedMessage = normalizeLookupValue(message);
    return /\bhopecore\b/i.test(rawMessage) || /\bhope\s+core\b/i.test(normalizedMessage);
}

async function generateStructuredNotes(content = "") {
    const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `
                    Turn spoken content into clean, structured notes.
                    Do not transcribe word-for-word.
                    Use short headings and flat bullet points.
                    Pull out key ideas, action items, names, dates, and follow-ups when they are present.
                    Return plain text only.
                `
            },
            {
                role: "user",
                content
            }
        ]
    });

    return completion.choices?.[0]?.message?.content?.trim() || "Summary\n- I organized the notes as best as I could, but there was not much detail to work with.";
}

async function synthesizeAudio(text) {
    const speech = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "shimmer",
        input: text,
        speed: 1.5
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    return audioBuffer.toString("base64");
}

async function finalizeResponse(payload) {
    const { skipAudio, ...responsePayload } = payload;

    if (skipAudio || !responsePayload.reply) {
        return responsePayload;
    }

    const audio = await synthesizeAudio(responsePayload.reply);
    return audio ? { ...responsePayload, audio } : responsePayload;
}

function inferLayer3(message, reply = "") {
    const combined = `${message} ${reply}`.toLowerCase();

    const rules = [
        { layer3: "birthday", keywords: ["birthday", "celebration"] },
        { layer3: "beer", keywords: ["bar", "beer", "wine", "drunk"] },
        { layer3: "ramen", keywords: ["ramen", "salty", "noodles"] },
        { layer3: "soda", keywords: ["soda", "pop", "coke"] },
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


app.get("/open-site", async (req, res) => {
    try {
        const siteRequest = typeof req.query.query === "string" ? req.query.query : req.query.siteName;
        const siteName = formatSiteName(siteRequest);

        if (!siteName) {
            res.redirect(buildGoogleSearchUrl("website"));
            return;
        }

        const site = getWebsiteMatch(siteName);
        if (site) {
            res.redirect(site.url);
            return;
        }

        const siteDetails = await getUnknownSiteDetails(siteName);
        const targetUrl = siteDetails?.resolvedUrl || siteDetails?.fallbackUrl || buildGoogleSearchUrl(siteName);
        res.redirect(targetUrl);
    } catch (error) {
        console.error("open-site redirect failed:", error);
        res.redirect(buildGoogleSearchUrl(typeof req.query.query === "string" ? req.query.query : "website"));
    }
});

/* Chat endpoint */
app.post("/chat", requireAllowedChatOrigin, requireSessionId, applyChatQuota, async (req, res) => {

    const { message, followUpContext, type, content } = req.body;
    const currentTime = Date.now();
    const conversationHistory = getConversationHistory(req.sessionId, currentTime);

    try {
        if (!process.env.OPENAI_API_KEY) {
            res.status(500).json({
                error: "Server is missing OPENAI_API_KEY."
            });
            return;
        }

        if (type === "notes") {
            const notesContent = typeof content === "string" ? content.trim() : "";

            if (!notesContent) {
                const emptyNotesResponse = {
                    reply: "I didn't catch any note content to organize yet. Try again whenever you're ready.",
                    emotion: "confused",
                    layer3: "confused"
                };

                rememberExchange(conversationHistory, "Please organize my notes.", emptyNotesResponse);
                res.json(await finalizeResponse(emptyNotesResponse));
                return;
            }

            try {
                const notesResponse = {
                    reply: await generateStructuredNotes(notesContent),
                    emotion: "focused",
                    layer3: "pencil",
                    skipAudio: true
                };

                rememberExchange(conversationHistory, "Please organize my verbal notes.", notesResponse);
                res.json(await finalizeResponse(notesResponse));
                return;
            } catch (error) {
                console.error("note organization failed:", error);

                const notesErrorResponse = {
                    reply: "I had trouble organizing those notes just now. Please try again in a moment.",
                    emotion: "concerned",
                    layer3: "sweat"
                };

                rememberExchange(conversationHistory, "Please organize my verbal notes.", notesErrorResponse);
                res.json(await finalizeResponse(notesErrorResponse));
                return;
            }
        }

        if (typeof message !== "string" || !message.trim()) {
            res.status(400).json({
                error: "A non-empty message string is required."
            });
            return;
        }

        if (message.trim().length > MAX_MESSAGE_LENGTH) {
            res.status(413).json({
                error: `Message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters.`
            });
            return;
        }

        if (detectHopecoreIntent(message)) {
            const quote = getRandomHopecoreQuote();
            const hopecoreResponse = {
                reply: `\u{1F331} Hopecore Drop:\n\n"${quote.text}"\n\n\u2014 ${quote.author}`,
                emotion: "hopeful",
                layer3: "sparkle",
                skipAudio: true
            };

            rememberExchange(conversationHistory, message, hopecoreResponse);
            res.json(await finalizeResponse(hopecoreResponse));
            return;
        }

        if (followUpContext?.followUpType === "weather_details" && isWeatherDetailsRequest(message)) {
            const cachedWeather = followUpContext.weatherCache;
            const weatherData = cachedWeather?.raw || await getWeather(cachedWeather?.lat, cachedWeather?.lon);
            const weatherDetailResponse = {
                reply: formatWeatherDetails(cachedWeather?.location || "that area", weatherData),
                emotion: "friendly",
                layer3: "shine"
            };

            rememberExchange(conversationHistory, message, weatherDetailResponse);
            res.json(await finalizeResponse(weatherDetailResponse));
            return;
        }

        const weatherIntent = detectWeatherIntent(message);
        if (weatherIntent) {
            try {
                const coords = await getCoordinates(weatherIntent);

                if (!coords) {
                    const locationNotFoundResponse = {
                        reply: "I couldn't find that location - can you try it one more time for me?",
                        emotion: "confused",
                        layer3: "confused"
                    };

                    rememberExchange(conversationHistory, message, locationNotFoundResponse);
                    res.json(await finalizeResponse(locationNotFoundResponse));
                    return;
                }

                const weatherData = await getWeather(coords.latitude, coords.longitude);
                const weatherSummaryResponse = {
                    reply: formatWeatherSummary(coords.name, weatherData),
                    emotion: "friendly",
                    layer3: "shine",
                    needsFollowUp: true,
                    followUpType: "weather_details",
                    weatherCache: {
                        location: coords.name,
                        lat: coords.latitude,
                        lon: coords.longitude,
                        raw: weatherData
                    }
                };

                rememberExchange(conversationHistory, message, weatherSummaryResponse);
                res.json(await finalizeResponse(weatherSummaryResponse));
                return;
            } catch (error) {
                console.error("weather lookup failed:", error);

                const weatherErrorResponse = {
                    reply: "I had trouble checking the weather just now. Can you give me one more try in a moment?",
                    emotion: "concerned",
                    layer3: "sweat"
                };

                rememberExchange(conversationHistory, message, weatherErrorResponse);
                res.json(await finalizeResponse(weatherErrorResponse));
                return;
            }
        }

        const musicAction = detectMusicAction(message);
        if (musicAction) {
            rememberExchange(conversationHistory, message, musicAction);
            res.json(await finalizeResponse(musicAction));
            return;
        }

        const websiteAction = await detectWebsiteAction(message);
        if (websiteAction) {
            rememberExchange(conversationHistory, message, websiteAction);
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
                            hearts, carrot, laugh, flowers, sweat, shine, soccer, basketball, pencil, art, watermelon, sparkle, birthday, confused, exclaim, tulip, purpstar, moon, beer, ramen, soda.

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
                            - ramen: ramen, salty, noodles
                            - soda: soda, pop, coke

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

        res.status(500).json({
            reply: "Sorry! My bunny brain had trouble thinking.",
            emotion: "concerned",
            layer3: "sweat"
        });

    }

});


app.use((error, req, res, next) => {
    if (error?.message === "Origin not allowed by CORS") {
        res.status(403).json({ error: error.message });
        return;
    }

    next(error);
});


app.listen(PORT, () => {
    console.log(`🐰 Bunny brain running on http://localhost:${PORT}`);
});
