import { useEffect, useRef, useState } from "react";
import {
  BUNNY_PREFIX,
  BUTTON_CLICK_SRC,
  CHAT_URL,
  CHARACTER_CHOICES,
  COSTUME_CHOICES,
  DEFAULT_CHARACTER_SRC,
  END_PHRASE,
  INITIAL_MESSAGES,
  LAYER3_CHOICES,
  LOGO_SRC,
  STOP_PHRASE,
  WAKE_PHRASE
} from "./data";

const START_NOTES_PHRASE = "start taking notes for me";
const STOP_NOTES_PHRASE = "stop taking notes for me";
const START_NOTES_PATTERNS = [
  /\bstart\s+taking\s+notes?\s+for\s+me\b/,
  /\bbegin\s+taking\s+notes?\s+for\s+me\b/,
  /\bstart\s+taking\s+notes?\b/,
  /\bbegin\s+taking\s+notes?\b/
];
const STOP_NOTES_PATTERNS = [
  /\bstop\s+taking\s+notes?\s+for\s+me\b/,
  /\bfinish\s+taking\s+notes?\s+for\s+me\b/,
  /\bstop\s+taking\s+notes?\b/,
  /\bfinish\s+taking\s+notes?\b/
];

let pendingAction = null;
let isTakingNotes = false;
let notesBuffer = [];

const KNOWN_WEBSITE_KEYS = new Set([
  "youtube",
  "tiktok",
  "substack",
  "google",
  "spotify",
  "netflix",
  "hulu",
  "amazon",
  "instagram",
  "twitter",
  "x",
  "reddit",
  "facebook",
  "linkedin",
  "github",
  "pinterest",
  "discord",
  "twitch",
  "apple music",
  "youtube music",
  "gmail",
  "google docs",
  "google drive",
  "google maps",
  "ebay",
  "etsy",
  "cnn",
  "bbc",
  "nytimes",
  "weather",
  "yahoo"
]);

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClientSessionId() {
  const storageKey = "agent-fluffy-bunny-session-id";

  try {
    const existingId = window.localStorage.getItem(storageKey);
    if (existingId) {
      return existingId;
    }

    const nextId = createId().replace(/[^a-zA-Z0-9_-]/g, "");
    window.localStorage.setItem(storageKey, nextId);
    return nextId;
  } catch (error) {
    console.log("session storage unavailable:", error);
    return createId().replace(/[^a-zA-Z0-9_-]/g, "");
  }
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesCommand(text, phrase) {
  return normalizeText(text).includes(phrase);
}

function isStartNotesCommand(text) {
  const normalized = normalizeText(text);
  return includesCommand(normalized, START_NOTES_PHRASE)
    || START_NOTES_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isStopNotesCommand(text) {
  const normalized = normalizeText(text);
  return includesCommand(normalized, STOP_NOTES_PHRASE)
    || STOP_NOTES_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripStopNotesPhrase(text = "") {
  return text
    .replace(/\b(?:stop|finish)\s+taking\s+notes?(?:\s+for\s+me)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAffirmative(text) {
  return /^(yes|yeah|yep|sure|ok|okay|do it|open it|sounds good|that works|correct)(\s+please)?$/.test(
    normalizeText(text)
  );
}

function isNegative(text) {
  return /^(no|nope|nah|cancel|dont|do not|not now)(\s+thanks)?$/.test(normalizeText(text));
}

function wantsMoreDetails(text) {
  return /^(yes|yeah|yep|sure|ok|okay|show more|details|more detail|more details|tell me more)(\s+please)?$/.test(
    normalizeText(text)
  );
}

function normalizeSiteLookup(siteName = "") {
  return siteName
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.(?:com|tv|org|net)$/, "");
}

function parseWebsiteIntent(text = "") {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const searchMatch = trimmed.match(/^(?:please\s+)?search(?:\s+for)?\s+(.+?)\s+on\s+(.+)$/i);
  if (searchMatch) {
    return {
      type: "search",
      query: searchMatch[1].trim(),
      siteName: searchMatch[2].trim()
    };
  }

  const openMatch = trimmed.match(/^(?:please\s+)?(?:open|go to|launch|visit|take me to|bring up)\s+(.+)$/i);
  if (openMatch) {
    return {
      type: "open",
      siteName: openMatch[1].trim()
    };
  }

  return null;
}

function looksLikeMusicRequest(text = "") {
  return /^(?:please\s+)?play\s+.+$/i.test(text.trim());
}

function extractPostWakeCommand(text = "") {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const wakePattern = new RegExp(`${escapeRegExp(WAKE_PHRASE)}[\\s,:-]*(.*)$`, "i");
  const match = trimmed.match(wakePattern);
  return match?.[1]?.trim() || "";
}

function shouldPrimeActionWindow(text) {
  if (looksLikeMusicRequest(text)) {
    return true;
  }

  const intent = parseWebsiteIntent(text);
  if (!intent) return false;

  if (intent.type === "search") {
    return true;
  }

  return KNOWN_WEBSITE_KEYS.has(normalizeSiteLookup(intent.siteName));
}

function buildSmartUrl(siteName = "") {
  const normalized = siteName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized ? `https://${normalized}.com/` : null;
}

function buildGoogleSearchUrl(query = "") {
  const trimmed = query.trim();
  return trimmed
    ? `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
    : "https://www.google.com/";
}

function buildResolverUrl(query = "") {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL("/open-site", CHAT_URL);
  url.searchParams.set("query", trimmed);
  return url.toString();
}

function resolvePendingActionUrl(data) {
  if (data?.url) return data.url;
  if (data?.query) return buildResolverUrl(data.query);
  if (data?.siteName) return buildSmartUrl(data.siteName) || buildGoogleSearchUrl(data.siteName);
  return null;
}

function createPrimedActionWindow(text) {
  if (!shouldPrimeActionWindow(text)) return null;

  const primedWindow = window.open("", "_blank");
  if (!primedWindow) return null;

  try {
    primedWindow.document.title = "Agent Fluffy Bunny";
    primedWindow.document.body.textContent = "Opening your request...";
  } catch (error) {
    console.log("primed window setup failed:", error);
  }

  return primedWindow;
}

function closePrimedActionWindow(primedWindow) {
  if (!primedWindow || primedWindow.closed) return;

  try {
    primedWindow.close();
  } catch (error) {
    console.log("primed window close failed:", error);
  }
}

function executeAction(action, data, primedWindow = null) {
  if (action === "open_url" && data?.url) {
    if (primedWindow && !primedWindow.closed) {
      primedWindow.location.href = data.url;
      primedWindow.focus?.();
      return true;
    }

    const openedWindow = window.open(data.url, "_blank");
    if (openedWindow) {
      openedWindow.focus?.();
      return true;
    }
  }

  return false;
}

function buildActionReply(data) {
  const siteName = data?.siteName || "that website";
  const description = data?.description ? ` - ${data.description}` : "";
  return `${BUNNY_PREFIX}Alright, opening ${siteName}${description}.`;
}

async function copyTextToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.log("clipboard write failed:", error);
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch (error) {
    console.log("clipboard fallback failed:", error);
    return false;
  }
}

function CharacterOptionButton({ character, onSelect, buttonRef = null }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="char-btn"
      onClick={onSelect}
    >
      <img src={character.src} alt={character.label} />
      <span>{character.label}</span>
    </button>
  );
}

function HomeCarouselButton({ character, buttonRef = null, onSelect, className = "", style = undefined }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`home-bunny-card${className ? ` ${className}` : ""}`}
      aria-label={`Choose ${character.label}`}
      onClick={onSelect}
      style={style}
    >
      <img className="home-bunny-image" src={character.src} alt={character.label} />
    </button>
  );
}

function CostumeOptionButton({ costume, selectedCharacterSrc, isSelected, onSelect }) {
  return (
    <button
      type="button"
      className={`costume-btn${isSelected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      <div className="costume-preview">
        <img src={selectedCharacterSrc} alt="Bunny" className="preview-base" />
        {costume.src ? (
          <img src={costume.src} alt={costume.label} className="preview-overlay" />
        ) : null}
      </div>
      <span>{costume.label}</span>
    </button>
  );
}

function MessageBubble({ message }) {
  return (
    <div
      className={`msg ${message.who === "user" ? "msg-user" : "msg-bunny"}`}
      style={message.pending ? { opacity: 0.7 } : undefined}
    >
      {message.text}
    </div>
  );
}

function BunnyDisplay({ selectedCharacterSrc, selectedCostumeSrc, layer3Src, isBunnySpeaking }) {
  const speakingClassName = isBunnySpeaking ? " bunny-speaking" : "";

  return (
    <div className="bunny-area">
      <img
        src={selectedCharacterSrc}
        alt="Agent Fluffy Bunny"
        className={`bunny-img${speakingClassName}`}
      />
      {selectedCostumeSrc ? (
        <img
          src={selectedCostumeSrc}
          alt="Costume"
          className={`costume-img${speakingClassName}`}
        />
      ) : null}
      {layer3Src ? (
        <img
          src={layer3Src}
          alt="Reaction overlay"
          className={`layer3-img${speakingClassName}`}
        />
      ) : null}
    </div>
  );
}

function HomeScreen({ onStart, onQuickSelect, onButtonClickSound }) {
  const containerRef = useRef(null);
  const cardRefs = useRef([]);
  const [isCompactLayout, setIsCompactLayout] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const syncCompactLayout = () => {
      setIsCompactLayout(mediaQuery.matches);
    };

    syncCompactLayout();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncCompactLayout);
      return () => mediaQuery.removeEventListener("change", syncCompactLayout);
    }

    mediaQuery.addListener(syncCompactLayout);
    return () => mediaQuery.removeListener(syncCompactLayout);
  }, []);

  useEffect(() => {
    if (isCompactLayout) return undefined;

    const container = containerRef.current;
    const cards = cardRefs.current.filter(Boolean);

    if (!container || !cards.length) return undefined;

    let angle = 0;
    let velocity = 0;
    let tilt = 0;
    let frameId = 0;
    let lastX = null;

    const positionCards = () => {
      const radius = Math.max(220, Math.min(window.innerWidth * 0.28, 430));
      const step = (Math.PI * 2) / cards.length;

      cards.forEach((card, index) => {
        const cardAngle = angle + index * step;
        const x = Math.sin(cardAngle) * radius;
        const z = Math.cos(cardAngle) * radius;
        const depth = (z + radius) / (2 * radius);
        const scale = 0.62 + depth * 0.58;
        const opacity = 0.3 + depth * 0.75;
        const y = Math.sin(tilt) * 18;

        card.style.transform =
          `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = String(Math.round(depth * 100));
      });
    };

    const animate = () => {
      angle += velocity;
      velocity *= 0.96;
      tilt *= 0.9;

      if (Math.abs(velocity) < 0.00008) {
        velocity = 0;
      }

      positionCards();
      frameId = window.requestAnimationFrame(animate);
    };

    const handleMouseMove = (event) => {
      const rect = container.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left) / rect.width - 0.5;
      const mouseY = (event.clientY - rect.top) / rect.height - 0.5;

      if (lastX !== null) {
        velocity += (mouseX - lastX) * 0.16;
      } else {
        velocity += mouseX * 0.012;
      }

      tilt = mouseY;
      lastX = mouseX;
    };

    const handleMouseLeave = () => {
      lastX = null;
      velocity += velocity >= 0 ? 0.003 : -0.003;
      tilt = 0;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", positionCards);

    positionCards();
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", positionCards);
    };
  }, [isCompactLayout]);

  return (
    <section className="home-screen">
      <div className="home-panel">
        <img className="home-logo" src={LOGO_SRC} alt="Agent Fluffy Bunny" />
        <div className="home-title" aria-label="Agent Fluffy Bunny">
          Agent Fluffy Bunny
        </div>
        {isCompactLayout ? (
          <div className="home-carousel-mobile-wrap">
            <div
              id="homeCarousel"
              className="home-carousel home-carousel-mobile"
              aria-label="Character bunny carousel"
            >
              {CHARACTER_CHOICES.map((character) => (
                <HomeCarouselButton
                  key={character.label}
                  character={character}
                  className="home-bunny-card-mobile"
                  onSelect={(event) => {
                    onButtonClickSound(event, () => onQuickSelect(character.src));
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            id="homeCarousel"
            className="home-carousel"
            aria-label="Character bunny carousel"
          >
            {CHARACTER_CHOICES.map((character, index) => (
              <HomeCarouselButton
                key={character.label}
                character={character}
                buttonRef={(node) => {
                  cardRefs.current[index] = node;
                }}
                onSelect={(event) => {
                  onButtonClickSound(event, () => onQuickSelect(character.src));
                }}
              />
            ))}
          </div>
        )}
        <button
          className="home-cta"
          type="button"
          onClick={(event) => {
            onButtonClickSound(event, onStart);
          }}
        >
          Start
        </button>
      </div>
    </section>
  );
}

function CharacterPickerModal({
  isOpen,
  step,
  selectedCharacterSrc,
  selectedCostumeSrc,
  onPickCharacter,
  onPickCostume,
  onBack,
  onButtonClickSound
}) {
  if (!isOpen) return null;

  return (
    <div className="costume-modal">
      <button
        className="utility-btn picker-overlay-back"
        type="button"
        onClick={onBack}
      >
        Back
      </button>
      {step === "character" ? (
        <div className="costume-modal-content max-w-2xl">
          <h2>Select a Character!</h2>
          <div className="character-grid">
            {CHARACTER_CHOICES.map((character) => (
              <CharacterOptionButton
                key={character.label}
                character={character}
                onSelect={(event) => {
                  onButtonClickSound(event, () => onPickCharacter(character.src));
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="costume-modal-content max-w-2xl">
          <h2>Select a Costume!</h2>
          <div className="costume-options costume-options-modal">
            {COSTUME_CHOICES.map((costume) => (
              <CostumeOptionButton
                key={costume.label}
                costume={costume}
                selectedCharacterSrc={selectedCharacterSrc}
                isSelected={(costume.src || "") === (selectedCostumeSrc || "")}
                onSelect={(event) => {
                  onButtonClickSound(event, () => onPickCostume(costume.src));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatScreen({
  messages,
  pendingFollowUp,
  inputValue,
  onInputChange,
  onSend,
  onReturnHome,
  onRepickCharacter,
  onRepickCostume,
  selectedCharacterSrc,
  selectedCostumeSrc,
  layer3Src,
  isBunnySpeaking
}) {
  const chatLogRef = useRef(null);

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="overlay" id="appOverlay">
      <button
        className="utility-btn utility-btn-page"
        type="button"
        onClick={onReturnHome}
      >
        Return Home
      </button>

      <div className={`chat-ui${isBunnySpeaking ? " chat-hidden" : ""}`} id="chatUI">
        <div ref={chatLogRef} className="chat-log">
          {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          {pendingFollowUp ? (
            <div className="msg msg-bunny">
              {`${BUNNY_PREFIX}I’m ready with more weather detail if you want it. Reply with yes or no.`}
            </div>
          ) : null}
        </div>

        <div className="input-bar">
          <button
            className="icon-btn"
            type="button"
            title="Change Character"
            onClick={onRepickCharacter}
          >
            🐰
          </button>
          <button
            className="icon-btn"
            type="button"
            title="Change Costume"
            onClick={onRepickCostume}
          >
            👕
          </button>
          <input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSend();
            }}
            type="text"
            placeholder="Come in Agent Fluffy Bunny..."
          />
          <button
            type="button"
            onClick={onSend}
          >
            Over
          </button>
        </div>
      </div>

      <BunnyDisplay
        selectedCharacterSrc={selectedCharacterSrc}
        selectedCostumeSrc={selectedCostumeSrc}
        layer3Src={layer3Src}
        isBunnySpeaking={isBunnySpeaking}
      />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [pickerStep, setPickerStep] = useState("character");
  const [selectedCharacterSrc, setSelectedCharacterSrc] = useState(DEFAULT_CHARACTER_SRC);
  const [selectedCostumeSrc, setSelectedCostumeSrc] = useState(null);
  const [layer3Src, setLayer3Src] = useState(null);
  const [pickerOrigin, setPickerOrigin] = useState("home");
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [pendingFollowUp, setPendingFollowUp] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [isBunnySpeaking, setIsBunnySpeaking] = useState(false);

  const matrixCanvasRef = useRef(null);
  const sessionIdRef = useRef(getClientSessionId());
  const lastButtonClickTimeRef = useRef(0);
  const recognitionRef = useRef(null);
  const currentAudioRef = useRef(null);
  const shouldListenRef = useRef(true);
  const isConversationActiveRef = useRef(false);
  const isBunnySpeakingRef = useRef(false);
  const isRecognitionRunningRef = useRef(false);
  const restartingRecognitionRef = useRef(false);

  useEffect(() => {
    const warmupUrl = new URL("/", CHAT_URL).toString();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    fetch(warmupUrl, {
      method: "GET",
      signal: controller.signal
    }).catch((error) => {
      console.log("backend warmup skipped:", error);
    }).finally(() => {
      window.clearTimeout(timeoutId);
    });

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    isConversationActiveRef.current = isConversationActive;
  }, [isConversationActive]);

  useEffect(() => {
    isBunnySpeakingRef.current = isBunnySpeaking;
  }, [isBunnySpeaking]);

  useEffect(() => {
    const canvas = matrixCanvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    const letters = "01";
    const fontSize = 50;
    let drops = [];
    let frameId = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const columns = Math.floor(canvas.width / fontSize);
      drops = Array.from({ length: columns }, () => Math.random() * canvas.height);
    };

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00ff88";
      ctx.font = `${fontSize}px monospace`;

      for (let index = 0; index < drops.length; index += 1) {
        const text = letters[Math.floor(Math.random() * letters.length)];
        ctx.fillText(text, index * fontSize, drops[index]);

        drops[index] += fontSize * 0.2;

        if (drops[index] > canvas.height && Math.random() > 0.975) {
          drops[index] = 0;
        }
      }

      frameId = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const appendMessage = (text, who, options = {}) => {
    const message = { id: createId(), text, who, pending: options.pending || false };
    setMessages((current) => [...current, message]);
    return message.id;
  };

  const updateMessageById = (messageId, updater) => {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? updater(message) : message))
    );
  };

  const stopCurrentAudio = () => {
    if (!currentAudioRef.current) return;
    currentAudioRef.current.pause();
    currentAudioRef.current.currentTime = 0;
    currentAudioRef.current = null;
  };

  const stopBunnySpeech = () => {
    stopCurrentAudio();
    setIsBunnySpeaking(false);
    shouldListenRef.current = true;
  };

  const restartRecognitionSoon = (delay = 250) => {
    window.setTimeout(() => {
      if (!recognitionRef.current || !shouldListenRef.current) return;

      try {
        recognitionRef.current.start();
      } catch (error) {
        console.log("recognition restart failed:", error);
      }
    }, delay);
  };

  const playAudio = (base64Audio) => {
    if (!base64Audio) return;

    stopCurrentAudio();

    const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
    currentAudioRef.current = audio;

    if (audio.setSinkId) {
      audio.setSinkId("default").catch((error) => {
        console.log("sinkId failed:", error);
      });
    }

    audio.onplay = () => {
      shouldListenRef.current = false;
      setIsBunnySpeaking(true);

      try {
        recognitionRef.current?.stop();
      } catch (error) {
        console.log("recognition stop failed:", error);
      }
    };

    audio.onended = () => {
      currentAudioRef.current = null;
      setIsBunnySpeaking(false);
      shouldListenRef.current = true;
      restartRecognitionSoon();
    };

    audio.onerror = (error) => {
      console.log("audio error:", error);
      currentAudioRef.current = null;
      setIsBunnySpeaking(false);
      shouldListenRef.current = true;
    };

    audio.play().catch((error) => {
      console.log("audio play failed:", error);
      currentAudioRef.current = null;
      setIsBunnySpeaking(false);
      shouldListenRef.current = true;
    });
  };

  const pushNoteSegment = (text) => {
    const segment = text.trim();
    if (!segment) return;

    const previousSegment = notesBuffer[notesBuffer.length - 1];
    if (previousSegment && normalizeText(previousSegment) === normalizeText(segment)) {
      return;
    }

    notesBuffer.push(segment);
  };

  const beginNoteMode = (transcript = START_NOTES_PHRASE) => {
    stopBunnySpeech();
    pendingAction = null;
    setPendingFollowUp(null);
    isTakingNotes = true;
    notesBuffer = [];
    appendMessage(`You: ${transcript}`, "user");
    appendMessage(
      `${BUNNY_PREFIX}Currently taking verbal notes. Say 'stop taking notes for me' to finish 📝`,
      "bunny"
    );
    setLayer3Src(LAYER3_CHOICES.pencil);
  };

  const sendNotesForOrganization = async (notesText) => {
    const placeholderId = appendMessage(`${BUNNY_PREFIX}Organizing your notes...`, "bunny", {
      pending: true
    });

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionIdRef.current
        },
        body: JSON.stringify({
          type: "notes",
          content: notesText
        })
      });

      const data = await response.json();

      updateMessageById(placeholderId, (message) => ({
        ...message,
        text: `${BUNNY_PREFIX}${data.reply}`,
        pending: false
      }));

      const copied = await copyTextToClipboard(data.reply);
      const docsWindow = window.open("https://docs.google.com/document/create", "_blank");

      if (docsWindow) {
        docsWindow.focus?.();
      }

      if (copied && docsWindow) {
        appendMessage(
          `${BUNNY_PREFIX}I've organized your notes, copied them, and opened a document for you 📝`,
          "bunny"
        );
      } else if (copied) {
        appendMessage(
          `${BUNNY_PREFIX}I've organized your notes and copied them for you 📝 If Google Docs did not open, your browser may have blocked the new tab.`,
          "bunny"
        );
      } else if (docsWindow) {
        appendMessage(
          `${BUNNY_PREFIX}I've organized your notes and opened a document for you 📝 If the copy did not go through automatically, you can grab the notes right here in chat.`,
          "bunny"
        );
      } else {
        appendMessage(
          `${BUNNY_PREFIX}I've organized your notes for you 📝 If Google Docs did not open automatically, your browser may have blocked the new tab.`,
          "bunny"
        );
      }

      setLayer3Src(data.layer3 ? LAYER3_CHOICES[data.layer3] || null : LAYER3_CHOICES.pencil);
      playAudio(data.audio);
    } catch (error) {
      console.error(error);

      updateMessageById(placeholderId, (message) => ({
        ...message,
        text: `${BUNNY_PREFIX}I had trouble organizing those notes just now. Please try again in a moment.`,
        pending: false
      }));

      setLayer3Src(LAYER3_CHOICES.sweat);
    }
  };

  const finishNoteMode = async (transcript = STOP_NOTES_PHRASE) => {
    const finalSegment = stripStopNotesPhrase(transcript);
    if (finalSegment) {
      pushNoteSegment(finalSegment);
    }

    appendMessage(`You: ${transcript}`, "user");

    isTakingNotes = false;
    shouldListenRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch (error) {
      console.log("recognition stop for notes failed:", error);
    }

    const notesText = notesBuffer.join(" ").replace(/\s+/g, " ").trim();
    notesBuffer = [];

    if (!notesText) {
      appendMessage(
        `${BUNNY_PREFIX}I didn't catch any note content yet. Say 'start taking notes for me' when you want to try again.`,
        "bunny"
      );
      setLayer3Src(LAYER3_CHOICES.confused);
      shouldListenRef.current = true;
      restartRecognitionSoon(0);
      return;
    }

    await sendNotesForOrganization(notesText);
    shouldListenRef.current = true;
    restartRecognitionSoon(0);
  };

  const askBunny = async (userText, primedWindow = null, followUpContext = null) => {
    const placeholderId = appendMessage(`${BUNNY_PREFIX}...`, "bunny", { pending: true });

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionIdRef.current
        },
        body: JSON.stringify(
          followUpContext
            ? { message: userText, followUpContext }
            : { message: userText }
        )
      });

      const data = await response.json();

      updateMessageById(placeholderId, (message) => ({
        ...message,
        text: `${BUNNY_PREFIX}${data.reply}`,
        pending: false
      }));

      if (data.needsConfirmation && data.action && data.data) {
        closePrimedActionWindow(primedWindow);
        pendingAction = {
          action: data.action,
          data: data.data
        };
        setPendingFollowUp(null);
      } else {
        pendingAction = null;
        setPendingFollowUp(
          data.needsFollowUp && data.followUpType
            ? {
                followUpType: data.followUpType,
                weatherCache: data.weatherCache
              }
            : null
        );

        if (data.action && data.data) {
          if (!executeAction(data.action, data.data, primedWindow)) {
            closePrimedActionWindow(primedWindow);
          }
        } else {
          closePrimedActionWindow(primedWindow);
        }
      }

      setLayer3Src(data.layer3 ? LAYER3_CHOICES[data.layer3] || null : null);
      playAudio(data.audio);
    } catch (error) {
      console.error(error);

      updateMessageById(placeholderId, (message) => ({
        ...message,
        text: `${BUNNY_PREFIX}Something went wrong talking to my brain 😵`,
        pending: false
      }));

      closePrimedActionWindow(primedWindow);
      setPendingFollowUp(null);
      setLayer3Src(LAYER3_CHOICES.sweat);
    }
  };

  const handlePendingActionResponse = (userText) => {
    if (!pendingAction) return false;

    if (isAffirmative(userText)) {
      const actionToRun = pendingAction;
      pendingAction = null;
      const confirmedUrl = resolvePendingActionUrl(actionToRun.data);
      const actionData = confirmedUrl
        ? { ...actionToRun.data, url: confirmedUrl }
        : actionToRun.data;

      appendMessage(`You: ${userText}`, "user");
      executeAction(actionToRun.action, actionData);
      appendMessage(buildActionReply(actionData), "bunny");
      setLayer3Src(LAYER3_CHOICES.sparkle);
      return true;
    }

    if (isNegative(userText)) {
      pendingAction = null;

      appendMessage(`You: ${userText}`, "user");
      appendMessage(`${BUNNY_PREFIX}Okay, I will leave it closed.`, "bunny");
      setLayer3Src(LAYER3_CHOICES.confused);
      return true;
    }

    return false;
  };

  const handlePendingFollowUpResponse = (userText) => {
    if (!pendingFollowUp) return false;

    if (wantsMoreDetails(userText)) {
      const followUpToRun = pendingFollowUp;
      setPendingFollowUp(null);

      appendMessage(`You: ${userText}`, "user");
      askBunny(userText, null, followUpToRun);
      return true;
    }

    if (isNegative(userText)) {
      setPendingFollowUp(null);

      appendMessage(`You: ${userText}`, "user");
      appendMessage(`${BUNNY_PREFIX}Okay, we can leave the weather snapshot there.`, "bunny");
      setLayer3Src(LAYER3_CHOICES.shine);
      return true;
    }

    return false;
  };

  const submitUserText = (text, options = {}) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const shouldEchoUser = options.skipUserEcho !== true;

    if (isStartNotesCommand(trimmedText)) {
      if (!shouldEchoUser) {
        isTakingNotes = true;
        notesBuffer = [];
        stopBunnySpeech();
        pendingAction = null;
        setPendingFollowUp(null);
        appendMessage(
          `${BUNNY_PREFIX}Currently taking verbal notes. Say 'stop taking notes for me' to finish 📝`,
          "bunny"
        );
        setLayer3Src(LAYER3_CHOICES.pencil);
        return;
      }

      beginNoteMode(trimmedText);
      return;
    }

    if (isTakingNotes) {
      if (isStopNotesCommand(trimmedText)) {
        void finishNoteMode(trimmedText);
        return;
      }

      pushNoteSegment(trimmedText);
      if (shouldEchoUser) {
        appendMessage(`You: ${trimmedText}`, "user");
      }
      appendMessage(
        `${BUNNY_PREFIX}Still taking notes for you. Say 'stop taking notes for me' whenever you want me to organize them.`,
        "bunny"
      );
      setLayer3Src(LAYER3_CHOICES.pencil);
      return;
    }

    if (handlePendingActionResponse(trimmedText)) {
      return;
    }

    if (handlePendingFollowUpResponse(trimmedText)) {
      return;
    }

    if (pendingFollowUp) {
      setPendingFollowUp(null);
    }

    if (shouldEchoUser) {
      appendMessage(`You: ${trimmedText}`, "user");
    }
    const primedWindow = options.userInitiated ? createPrimedActionWindow(trimmedText) : null;
    askBunny(trimmedText, primedWindow);
  };

  const sendMessage = () => {
    const text = inputValue.trim();
    if (!text) return;

    setInputValue("");
    submitUserText(text, { userInitiated: true });
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      appendMessage(`${BUNNY_PREFIX}Your browser does not support speech recognition.`, "bunny");
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isRecognitionRunningRef.current = true;
      restartingRecognitionRef.current = false;
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (!event.results[index].isFinal) continue;

        const transcript = event.results[index][0].transcript.trim();
        const cleaned = normalizeText(transcript);
        if (!cleaned) continue;

        if (isTakingNotes) {
          if (isStopNotesCommand(transcript)) {
            void finishNoteMode(transcript);
            continue;
          }

          pushNoteSegment(transcript);
          continue;
        }

        if (isStartNotesCommand(transcript)) {
          beginNoteMode(transcript);
          continue;
        }

        if (cleaned.includes(STOP_PHRASE)) {
          appendMessage("You: Stop", "user");
          stopBunnySpeech();
          continue;
        }

        if (cleaned.includes(END_PHRASE)) {
          appendMessage("You: Over and out", "user");
          stopBunnySpeech();
          setIsConversationActive(false);
          appendMessage(`${BUNNY_PREFIX}Conversation ended. Waiting for wake phrase.`, "bunny");
          continue;
        }

        if (isBunnySpeakingRef.current) continue;

        if (!isConversationActiveRef.current) {
          if (cleaned.includes(WAKE_PHRASE)) {
            appendMessage(`You: ${transcript}`, "user");
            setIsConversationActive(true);
            appendMessage(`${BUNNY_PREFIX}I'm listening.`, "bunny");

            const wakeCommand = extractPostWakeCommand(transcript);
            if (wakeCommand) {
              submitUserText(wakeCommand, { userInitiated: true, skipUserEcho: true });
            }
          }
          continue;
        }

        submitUserText(transcript, { userInitiated: true });
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;

      if (isTakingNotes) {
        try {
          recognition.start();
        } catch (error) {
          console.error("Recognition note-mode restart failed:", error);
        }
        return;
      }

      if (!shouldListenRef.current || restartingRecognitionRef.current) return;

      restartingRecognitionRef.current = true;

      window.setTimeout(() => {
        restartingRecognitionRef.current = false;

        if (!isRecognitionRunningRef.current && shouldListenRef.current) {
          try {
            recognition.start();
          } catch (error) {
            console.error("Recognition restart failed:", error);
          }
        }
      }, 300);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error("Initial recognition start failed:", error);
    }

    return () => {
      try {
        recognition.stop();
      } catch (error) {
        console.log("recognition stop cleanup failed:", error);
      }
    };
  }, []);

  useEffect(() => () => stopCurrentAudio(), []);

  const playButtonClick = (event) => {
    if (!event || event.type !== "click" || !event.isTrusted) return;
    if (event.timeStamp - lastButtonClickTimeRef.current < 150) return;

    lastButtonClickTimeRef.current = event.timeStamp;

    const audio = new Audio(BUTTON_CLICK_SRC);
    audio.preload = "auto";
    audio.loop = false;
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.log("button click audio failed:", error);
    });
  };

  useEffect(() => {
    if (!isBunnySpeaking) return undefined;

    const handlePointerDown = () => {
      if (!currentAudioRef.current) return;
      stopBunnySpeech();
      restartRecognitionSoon(0);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isBunnySpeaking]);

  const openCharacterPicker = () => {
    setPickerOrigin(view === "chat" ? "chat" : "home");
    setView("picker");
    setPickerStep("character");
  };

  const openCostumePicker = () => {
    setPickerOrigin(view === "chat" ? "chat" : "home");
    setView("picker");
    setPickerStep("costume");
  };

  const handlePickCharacter = (src) => {
    setSelectedCharacterSrc(src);
    setPickerStep("costume");
  };

  const handlePickCostume = (src) => {
    setSelectedCostumeSrc(src);
    setView("chat");
  };

  const quickSelectCharacter = (src) => {
    setSelectedCharacterSrc(src);
    setPickerOrigin("home");
    setView("picker");
    setPickerStep("costume");
  };

  const handlePickerBack = () => {
    if (pickerOrigin === "chat") {
      setView("chat");
      return;
    }

    if (pickerStep === "costume") {
      setPickerStep("character");
      return;
    }

    returnHome();
  };

  const runButtonAction = (event, action) => {
    playButtonClick(event);
    action();
  };

  const returnHome = () => {
    stopBunnySpeech();
    pendingAction = null;
    isTakingNotes = false;
    notesBuffer = [];
    setPendingFollowUp(null);
    setIsConversationActive(false);
    setView("home");
  };

  return (
    <div className="app-shell">
      <canvas ref={matrixCanvasRef} id="matrixCanvas" />

      {view === "home" ? (
        <HomeScreen
          onStart={openCharacterPicker}
          onQuickSelect={quickSelectCharacter}
          onButtonClickSound={runButtonAction}
        />
      ) : null}

      <CharacterPickerModal
        isOpen={view === "picker"}
        step={pickerStep}
        selectedCharacterSrc={selectedCharacterSrc}
        selectedCostumeSrc={selectedCostumeSrc}
        onPickCharacter={handlePickCharacter}
        onPickCostume={handlePickCostume}
        onBack={handlePickerBack}
        onButtonClickSound={runButtonAction}
      />

      {view === "chat" ? (
        <ChatScreen
          messages={messages}
          pendingFollowUp={pendingFollowUp}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={sendMessage}
          onReturnHome={returnHome}
          onRepickCharacter={openCharacterPicker}
          onRepickCostume={openCostumePicker}
          selectedCharacterSrc={selectedCharacterSrc}
          selectedCostumeSrc={selectedCostumeSrc}
          layer3Src={layer3Src}
          isBunnySpeaking={isBunnySpeaking}
        />
      ) : null}

      <a className="info-link app-info-link" href="/about.html">
        INFO
      </a>
    </div>
  );
}
