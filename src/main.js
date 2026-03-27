const chatLog = document.getElementById("chatLog");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const bunnyImg = document.getElementById("bunnyImg");
const chatUI = document.getElementById("chatUI");
const matrixCanvas = document.getElementById("matrixCanvas");
const bunnyArea = document.querySelector(".bunny-area");
const appOverlay = document.getElementById("appOverlay");
const costumeModal = document.getElementById("costumeModal");
const costumeImg = document.getElementById("costumeImg");
const layer3Img = document.getElementById("layer3Img");
const costumeOptions = document.getElementById("costumeOptions");
const repickCharacterBtn = document.getElementById("repickCharacterBtn");
const repickCostumeBtn = document.getElementById("repickCostumeBtn");
const characterStep = document.getElementById("characterStep");
const costumeStep = document.getElementById("costumeStep");
const homeScreen = document.getElementById("homeScreen");
const homeCarousel = document.getElementById("homeCarousel");
const enterSelectionBtn = document.getElementById("enterSelectionBtn");

let selectedCharacterSrc = "/src/assets/Basicbunny.png";
let selectedCostumeSrc = null;

const costumeChoices = [
  { label: "None", src: null },
  { label: "Car", src: "/src/assets/car.png" },
  { label: "Sunglasses", src: "/src/assets/sunglasses.png" },
  { label: "Bow", src: "/src/assets/bow.png" },
  { label: "Headset", src: "/src/assets/headset.png" },
  { label: "Crown", src: "/src/assets/%20crown.png" },
  { label: "Tie", src: "/src/assets/tie.png" },
  { label: "Chain", src: "/src/assets/chain.png" },
  { label: "Dress", src: "/src/assets/dress.png" },
  { label: "Shirt", src: "/src/assets/shirt.png" },
  { label: "Tutu", src: "/src/assets/tutu.png" },
  { label: "Basket", src: "/src/assets/basket.png" }
];

const layer3Choices = {
  hearts: "/src/assets/hearts.png",
  carrot: "/src/assets/carrot.png",
  laugh: "/src/assets/laugh.png",
  flowers: "/src/assets/flowers.png",
  sweat: "/src/assets/sweat.png",
  shine: "/src/assets/shine.png",
  soccer: "/src/assets/soccer.png",
  basketball: "/src/assets/Basketball.png",
  pencil: "/src/assets/pencil.png",
  art: "/src/assets/art.png",
  watermelon: "/src/assets/watermelon.png",
  sparkle: "/src/assets/sparkle.png",
  birthday: "/src/assets/birthday.png",
  confused: "/src/assets/confused.png",
  exclaim: "/src/assets/exclaim.png",
  tulip: "/src/assets/tulip.png",
  purpstar: "/src/assets/purpstar.png",
  moon: "/src/assets/moon.png",
  beer: "/src/assets/beer.png"
};

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
let carouselAngle = 0;
let carouselVelocity = 0;
let carouselTilt = 0;
let carouselFrame = null;

function showMainApp() {
  if (appOverlay) {
    appOverlay.classList.remove("overlay-hidden");
  }
}

function hideMainApp() {
  if (appOverlay) {
    appOverlay.classList.add("overlay-hidden");
  }
}

function hideHomeScreen() {
  if (homeScreen) {
    homeScreen.classList.add("hidden");
  }
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
  return div;
}

function showBunnySpeakingUI() {
  isBunnySpeaking = true;
  chatUI.classList.add("chat-hidden");
  bunnyArea.classList.add("bunny-active");
  bunnyImg.classList.add("bunny-speaking");
  if (costumeImg) costumeImg.classList.add("bunny-speaking");
  if (layer3Img) layer3Img.classList.add("bunny-speaking");
}

function hideBunnySpeakingUI() {
  isBunnySpeaking = false;
  chatUI.classList.remove("chat-hidden");
  bunnyArea.classList.remove("bunny-active");
  bunnyImg.classList.remove("bunny-speaking");
  if (costumeImg) costumeImg.classList.remove("bunny-speaking");
  if (layer3Img) layer3Img.classList.remove("bunny-speaking");
}

function selectLayer3(layer3) {
  const src = layer3Choices[layer3];

  if (src && layer3Img) {
    layer3Img.src = src;
    layer3Img.style.display = "block";
    return;
  }

  if (layer3Img) {
    layer3Img.src = "";
    layer3Img.style.display = "none";
  }
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
  const placeholder = addMessage(BUNNY_PREFIX + "...", "bunny");
  placeholder.style.opacity = "0.7";

  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: userText })
    });

    const data = await response.json();

    chatLog.removeChild(placeholder);
    addMessage(BUNNY_PREFIX + data.reply, "bunny");

    selectLayer3(data.layer3);

    playAudio(data.audio);
  } catch (error) {
    if (chatLog.contains(placeholder)) chatLog.removeChild(placeholder);
    addMessage(BUNNY_PREFIX + "Something went wrong talking to my brain 😵", "bunny");
    selectLayer3("sweat");
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

function selectCostume(src, { closeModal = true } = {}) {
  selectedCostumeSrc = src;

  if (src) {
    costumeImg.src = src;
    costumeImg.style.display = "block";
  } else {
    costumeImg.src = "";
    costumeImg.style.display = "none";
  }

  document.querySelectorAll(".costume-btn").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.src === (src || ""));
  });

  if (closeModal) {
    costumeModal.classList.add("hidden");
    showMainApp();
    chatUI.style.display = "flex";
  }
}

function selectCharacter(src) {
  selectedCharacterSrc = src;
  bunnyImg.src = src;
  document.querySelectorAll(".preview-base").forEach((img) => {
    img.src = src;
  });
  characterStep.classList.add("hidden");
  costumeStep.classList.remove("hidden");
  selectCostume(selectedCostumeSrc, { closeModal: false });
}

document.querySelectorAll(".char-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    selectCharacter(e.currentTarget.dataset.src);
  });
});

function renderCostumeOptions() {
  if (!costumeOptions) return;

  costumeOptions.innerHTML = "";

  costumeChoices.forEach(({ label, src }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "costume-btn";
    button.dataset.src = src || "";

    const preview = document.createElement("div");
    preview.className = "costume-preview";

    const base = document.createElement("img");
    base.src = selectedCharacterSrc;
    base.alt = "Bunny";
    base.className = "preview-base";
    preview.appendChild(base);

    if (src) {
      const overlay = document.createElement("img");
      overlay.src = src;
      overlay.alt = label;
      overlay.className = "preview-overlay";
      preview.appendChild(overlay);
    }

    const text = document.createElement("span");
    text.textContent = label;

    button.append(preview, text);
    button.addEventListener("click", () => selectCostume(src));
    costumeOptions.appendChild(button);
  });

  selectCostume(selectedCostumeSrc, { closeModal: false });
}

function openCharacterPicker() {
  hideHomeScreen();
  hideMainApp();
  characterStep.classList.remove("hidden");
  costumeStep.classList.add("hidden");
  costumeModal.classList.remove("hidden");
}

function openCostumePicker() {
  hideHomeScreen();
  hideMainApp();
  characterStep.classList.add("hidden");
  costumeStep.classList.remove("hidden");
  costumeModal.classList.remove("hidden");
}

function renderHomeCarousel() {
  if (!homeCarousel) return;

  const characterButtons = Array.from(document.querySelectorAll(".char-btn"));

  homeCarousel.innerHTML = "";

  characterButtons.forEach((button, index) => {
    const card = document.createElement("button");
    const image = button.querySelector("img");
    const label = button.querySelector("span")?.textContent || "Bunny";

    card.type = "button";
    card.className = "home-bunny-card";
    card.dataset.index = String(index);
    card.dataset.src = button.dataset.src;
    card.setAttribute("aria-label", `Choose ${label}`);

    const bunny = document.createElement("img");
    bunny.className = "home-bunny-image";
    bunny.src = image?.src || button.dataset.src;
    bunny.alt = label;

    card.appendChild(bunny);
    card.addEventListener("click", () => {
      hideHomeScreen();
      hideMainApp();
      selectCharacter(button.dataset.src);
      costumeModal.classList.remove("hidden");
    });

    homeCarousel.appendChild(card);
  });
}

function setupHomeCarouselMotion() {
  if (!homeScreen || !homeCarousel) return;

  const cards = Array.from(homeCarousel.querySelectorAll(".home-bunny-card"));
  if (!cards.length) return;

  const positionCards = () => {
    const radius = Math.max(220, Math.min(window.innerWidth * 0.28, 430));
    const step = (Math.PI * 2) / cards.length;

    cards.forEach((card, index) => {
      const angle = carouselAngle + index * step;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const normalizedDepth = (z + radius) / (2 * radius);
      const scale = 0.62 + normalizedDepth * 0.58;
      const opacity = 0.3 + normalizedDepth * 0.75;
      const y = Math.sin(carouselTilt) * 18;

      card.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`;
      card.style.opacity = opacity.toFixed(3);
      card.style.zIndex = String(Math.round(normalizedDepth * 100));
    });
  };

  const animate = () => {
    carouselAngle += carouselVelocity;
    carouselVelocity *= 0.96;
    carouselTilt *= 0.9;

    if (Math.abs(carouselVelocity) < 0.00008) {
      carouselVelocity = 0;
    }

    positionCards();
    carouselFrame = requestAnimationFrame(animate);
  };

  let lastX = null;

  homeScreen.addEventListener("mousemove", (event) => {
    const rect = homeScreen.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    const mouseY = (event.clientY - rect.top) / rect.height - 0.5;

    if (lastX !== null) {
      carouselVelocity += (mouseX - lastX) * 0.16;
    } else {
      carouselVelocity += mouseX * 0.012;
    }

    carouselTilt = mouseY;
    lastX = mouseX;
  });

  homeScreen.addEventListener("mouseleave", () => {
    lastX = null;
    carouselVelocity += carouselVelocity >= 0 ? 0.003 : -0.003;
    carouselTilt = 0;
  });

  window.addEventListener("resize", positionCards);
  positionCards();
  if (carouselFrame) {
    cancelAnimationFrame(carouselFrame);
  }
  carouselFrame = requestAnimationFrame(animate);
}

addMessage('AFB: Say "Come in Agent Fluffy Bunny" to start hands-free mode 🐰', "bunny");

if (repickCharacterBtn) {
  repickCharacterBtn.addEventListener("click", openCharacterPicker);
}

if (repickCostumeBtn) {
  repickCostumeBtn.addEventListener("click", openCostumePicker);
}

if (enterSelectionBtn) {
  enterSelectionBtn.addEventListener("click", openCharacterPicker);
}

hideMainApp();
renderHomeCarousel();
setupHomeCarouselMotion();
renderCostumeOptions();
startMatrixBackground();
startVoiceLoop();
