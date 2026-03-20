const chatLog = document.getElementById("chatLog");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const bunnyImg = document.getElementById("bunnyImg");
const chatUI = document.getElementById("chatUI");
const matrixCanvas = document.getElementById("matrixCanvas");
const bunnyArea = document.querySelector(".bunny-area");

const bunnyImages = import.meta.glob("./assets/*bunny.png", {
  eager: true,
  query: "?url",
  import: "default"
});

const WAKE_PHRASE = "come in agent fluffy bunny";
const END_PHRASE = "over and out";
const STOP_PHRASE = "stop";
const BUNNY_PREFIX = "AFB: ";
const CHAT_URL = "http://localhost:3000/chat";

let recognition = null;
let currentAudio = null;
let isRecognitionRunning = false;
let isConversationActive = false;
let isBunnySpeaking = false;
let restartingRecognition = false;
let shouldListen = true;

function getBunnyImageUrl(emotion) {
  const imagePath = `./assets/${emotion}bunny.png`;
  return bunnyImages[imagePath] || bunnyImages["./assets/Basicbunny.png"];
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function addMessage(text, who) {
  const div = document.createElement("div");
  div.classList.add("msg", who === "user" || who === "you" ? "msg-user" : "msg-bunny");
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function showBunnySpeakingUI() {
  isBunnySpeaking = true;
  chatUI.classList.add("chat-hidden");
  bunnyArea.classList.add("bunny-active");
  bunnyImg.classList.add("bunny-speaking");
}

function hideBunnySpeakingUI() {
  isBunnySpeaking = false;
  chatUI.classList.remove("chat-hidden");
  bunnyArea.classList.remove("bunny-active");
  bunnyImg.classList.remove("bunny-speaking");
}

function stopCurrentAudio() {
  if (!currentAudio) return;

  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio = null;
}

function stopBunnySpeech() {
  stopCurrentAudio();
  hideBunnySpeakingUI();
  shouldListen = true;
}

async function askBunny(userText) {
  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: userText })
    });

    const data = await response.json();

    addMessage(BUNNY_PREFIX + data.reply, "bunny");

    if (data.emotion) {
      bunnyImg.src = getBunnyImageUrl(data.emotion);
    }

    playAudio(data.audio);
  } catch (error) {
    addMessage(BUNNY_PREFIX + "Something went wrong talking to my brain 😵", "bunny");
    console.error(error);
  }
}

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  addMessage("You: " + text, "user");
  msgInput.value = "";
  askBunny(text);
}

function restartRecognitionSoon(delay = 250) {
  setTimeout(() => {
    if (!recognition || !shouldListen) return;

    try {
      recognition.start();
    } catch (err) {
      console.log("recognition restart failed:", err);
    }
  }, delay);
}

function playAudio(base64Audio) {
  if (!base64Audio) return;

  stopCurrentAudio();

  currentAudio = new Audio("data:audio/mp3;base64," + base64Audio);

  if (currentAudio.setSinkId) {
    currentAudio.setSinkId("default").catch((err) => {
      console.log("sinkId failed:", err);
    });
  }

  currentAudio.onplay = () => {
    shouldListen = false;
    showBunnySpeakingUI();

    try {
      recognition?.stop();
    } catch (err) {
      console.log("recognition stop failed:", err);
    }
  };

  currentAudio.onended = () => {
    currentAudio = null;
    hideBunnySpeakingUI();
    shouldListen = true;
    restartRecognitionSoon();
  };

  currentAudio.onerror = (err) => {
    console.log("audio error:", err);
    currentAudio = null;
    hideBunnySpeakingUI();
    shouldListen = true;
  };

  currentAudio.play().catch((err) => {
    console.log("audio play failed:", err);
    currentAudio = null;
    hideBunnySpeakingUI();
    shouldListen = true;
  });
}

function handleSpeech(transcript) {
  if (isBunnySpeaking) return;

  const cleaned = normalizeText(transcript);
  if (!cleaned) return;

  console.log("heard:", cleaned);

  if (cleaned.includes(STOP_PHRASE)) {
    addMessage("You: Stop", "user");
    stopBunnySpeech();
    return;
  }

  if (cleaned.includes(END_PHRASE)) {
    addMessage("You: Over and out", "user");
    stopBunnySpeech();
    isConversationActive = false;
    addMessage(BUNNY_PREFIX + "Conversation ended. Waiting for wake phrase.", "bunny");
    return;
  }

  if (!isConversationActive) {
    if (cleaned.includes(WAKE_PHRASE)) {
      addMessage("You: " + transcript, "user");
      isConversationActive = true;
      addMessage(BUNNY_PREFIX + "I'm listening.", "bunny");
    }
    return;
  }

  addMessage("You: " + transcript, "user");
  askBunny(transcript);
}

function startVoiceLoop() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    addMessage(BUNNY_PREFIX + "Your browser does not support speech recognition.", "bunny");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecognitionRunning = true;
    restartingRecognition = false;
    console.log("speech recognition started");
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;
      const transcript = event.results[i][0].transcript.trim();
      handleSpeech(transcript);
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recognition.onend = () => {
    isRecognitionRunning = false;
    console.log("speech recognition ended");

    if (!shouldListen) return;
    if (restartingRecognition) return;

    restartingRecognition = true;

    setTimeout(() => {
      restartingRecognition = false;

      if (!isRecognitionRunning && shouldListen) {
        try {
          recognition.start();
        } catch (error) {
          console.error("Recognition restart failed:", error);
        }
      }
    }, 300);
  };

  try {
    recognition.start();
  } catch (error) {
    console.error("Initial recognition start failed:", error);
  }
}

function startMatrixBackground() {
  if (!matrixCanvas) return;

  const ctx = matrixCanvas.getContext("2d");
  const letters = "01";
  const fontSize = 50;

  let drops = [];

  function resize() {
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;

    const columns = Math.floor(matrixCanvas.width / fontSize);
    drops = Array.from({ length: columns }, () => Math.random() * matrixCanvas.height);
  }

  function draw() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);

    ctx.fillStyle = "#00ff88";
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const text = letters[Math.floor(Math.random() * letters.length)];
      ctx.fillText(text, i * fontSize, drops[i]);

      drops[i] += fontSize * 0.2;

      if (drops[i] > matrixCanvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

addMessage('AFB: Say "Come in Agent Fluffy Bunny" to start hands-free mode 🐰', "bunny");

startMatrixBackground();
startVoiceLoop();