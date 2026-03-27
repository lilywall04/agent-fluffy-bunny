import { useEffect, useRef, useState } from "react";
import {
  BUNNY_PREFIX,
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

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function HomeScreen({ onStart, onQuickSelect }) {
  const containerRef = useRef(null);
  const cardRefs = useRef([]);

  useEffect(() => {
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
  }, []);

  return (
    <section className="home-screen">
      <div className="home-panel">
        <img className="home-logo" src={LOGO_SRC} alt="Agent Fluffy Bunny" />
        <div className="home-title" aria-label="Agent Fluffy Bunny">
          Agent Fluffy Bunny
        </div>
        <div
          ref={containerRef}
          id="homeCarousel"
          className="home-carousel"
          aria-label="Character bunny carousel"
        >
          {CHARACTER_CHOICES.map((character, index) => (
            <button
              key={character.label}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              type="button"
              className="home-bunny-card"
              aria-label={`Choose ${character.label}`}
              onClick={() => onQuickSelect(character.src)}
            >
              <img className="home-bunny-image" src={character.src} alt={character.label} />
            </button>
          ))}
        </div>
        <button className="home-cta" type="button" onClick={onStart}>
          Go To Character Selection
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
  onPickCostume
}) {
  if (!isOpen) return null;

  return (
    <div className="costume-modal">
      {step === "character" ? (
        <div className="costume-modal-content max-w-2xl">
          <h2>Select a Character!</h2>
          <div className="character-grid">
            {CHARACTER_CHOICES.map((character) => (
              <button
                key={character.label}
                type="button"
                className="char-btn"
                onClick={() => onPickCharacter(character.src)}
              >
                <img src={character.src} alt={character.label} />
                <span>{character.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="costume-modal-content max-w-2xl">
          <h2>Select a Costume!</h2>
          <div className="costume-options costume-options-modal">
            {COSTUME_CHOICES.map((costume) => (
              <button
                key={costume.label}
                type="button"
                className={`costume-btn${(costume.src || "") === (selectedCostumeSrc || "") ? " is-selected" : ""}`}
                onClick={() => onPickCostume(costume.src)}
              >
                <div className="costume-preview">
                  <img src={selectedCharacterSrc} alt="Bunny" className="preview-base" />
                  {costume.src ? (
                    <img src={costume.src} alt={costume.label} className="preview-overlay" />
                  ) : null}
                </div>
                <span>{costume.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatScreen({
  messages,
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
      <button className="utility-btn utility-btn-page" type="button" onClick={onReturnHome}>
        Return Home
      </button>

      <div className={`chat-ui${isBunnySpeaking ? " chat-hidden" : ""}`} id="chatUI">
        <div ref={chatLogRef} className="chat-log">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`msg ${message.who === "user" ? "msg-user" : "msg-bunny"}`}
              style={message.pending ? { opacity: 0.7 } : undefined}
            >
              {message.text}
            </div>
          ))}
        </div>

        <div className="input-bar">
          <button className="icon-btn" type="button" title="Change Character" onClick={onRepickCharacter}>
            🐰
          </button>
          <button className="icon-btn" type="button" title="Change Costume" onClick={onRepickCostume}>
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
          <button type="button" onClick={onSend}>
            Over
          </button>
        </div>
      </div>

      <div className="bunny-area">
        <img
          src={selectedCharacterSrc}
          alt="Agent Fluffy Bunny"
          className={`bunny-img${isBunnySpeaking ? " bunny-speaking" : ""}`}
        />
        {selectedCostumeSrc ? (
          <img
            src={selectedCostumeSrc}
            alt="Costume"
            className={`costume-img${isBunnySpeaking ? " bunny-speaking" : ""}`}
          />
        ) : null}
        {layer3Src ? (
          <img
            src={layer3Src}
            alt="Reaction overlay"
            className={`layer3-img${isBunnySpeaking ? " bunny-speaking" : ""}`}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [pickerStep, setPickerStep] = useState("character");
  const [selectedCharacterSrc, setSelectedCharacterSrc] = useState(DEFAULT_CHARACTER_SRC);
  const [selectedCostumeSrc, setSelectedCostumeSrc] = useState(null);
  const [layer3Src, setLayer3Src] = useState(null);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [isBunnySpeaking, setIsBunnySpeaking] = useState(false);

  const matrixCanvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentAudioRef = useRef(null);
  const shouldListenRef = useRef(true);
  const isConversationActiveRef = useRef(false);
  const isBunnySpeakingRef = useRef(false);
  const isRecognitionRunningRef = useRef(false);
  const restartingRecognitionRef = useRef(false);

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

  const askBunny = async (userText) => {
    const placeholderId = appendMessage(`${BUNNY_PREFIX}...`, "bunny", { pending: true });

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: userText })
      });

      const data = await response.json();

      setMessages((current) =>
        current.map((message) =>
          message.id === placeholderId
            ? { ...message, text: `${BUNNY_PREFIX}${data.reply}`, pending: false }
            : message
        )
      );

      setLayer3Src(data.layer3 ? LAYER3_CHOICES[data.layer3] || null : null);
      playAudio(data.audio);
    } catch (error) {
      console.error(error);

      setMessages((current) =>
        current.map((message) =>
          message.id === placeholderId
            ? {
                ...message,
                text: `${BUNNY_PREFIX}Something went wrong talking to my brain 😵`,
                pending: false
              }
            : message
        )
      );

      setLayer3Src(LAYER3_CHOICES.sweat);
    }
  };

  const sendMessage = () => {
    const text = inputValue.trim();
    if (!text) return;

    appendMessage(`You: ${text}`, "user");
    setInputValue("");
    askBunny(text);
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
        if (!cleaned || isBunnySpeakingRef.current) continue;

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

        if (!isConversationActiveRef.current) {
          if (cleaned.includes(WAKE_PHRASE)) {
            appendMessage(`You: ${transcript}`, "user");
            setIsConversationActive(true);
            appendMessage(`${BUNNY_PREFIX}I'm listening.`, "bunny");
          }
          continue;
        }

        appendMessage(`You: ${transcript}`, "user");
        askBunny(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;

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

  const openCharacterPicker = () => {
    setView("picker");
    setPickerStep("character");
  };

  const openCostumePicker = () => {
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
    setView("picker");
    setPickerStep("costume");
  };

  const returnHome = () => {
    stopBunnySpeech();
    setIsConversationActive(false);
    setView("home");
  };

  return (
    <div className="app-shell">
      <canvas ref={matrixCanvasRef} id="matrixCanvas" />

      {view === "home" ? (
        <HomeScreen onStart={openCharacterPicker} onQuickSelect={quickSelectCharacter} />
      ) : null}

      <CharacterPickerModal
        isOpen={view === "picker"}
        step={pickerStep}
        selectedCharacterSrc={selectedCharacterSrc}
        selectedCostumeSrc={selectedCostumeSrc}
        onPickCharacter={handlePickCharacter}
        onPickCostume={handlePickCostume}
      />

      {view === "chat" ? (
        <ChatScreen
          messages={messages}
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
