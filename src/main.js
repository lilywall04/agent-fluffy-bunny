const chatLog = document.getElementById("chatLog");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const wakeBtn = document.getElementById("wakeBtn");
const costumeBtn = document.getElementById("costumeBtn");
const bunnyStatus = document.getElementById("bunnyStatus");
const bunnyImg = document.getElementById("bunnyImg");

// Dynamically import all bunny images
const bunnyImages = import.meta.glob('./assets/*bunny.png', { eager: true, query: '?url', import: 'default' });

let awake = false;
let costumeIndex = 0;
const costumes = ["🐰", "🐰🎀", "🐰🕶️", "🐰👑"];

function getBunnyImageUrl(emotion) {
  const imagePath = `./assets/${emotion}bunny.png`;
  return bunnyImages[imagePath] || bunnyImages['./assets/Basicbunny.png'];
}

function setStatus(text) {
  bunnyStatus.textContent = text;
}

function addMessage(text, who) {
  const div = document.createElement("div");
  let classes = "max-w-[80%] px-4 py-3 rounded-2xl text-[0.95rem] leading-snug animate-pop-in ";
  if (who === "you" || who === "user") {
    classes += "self-end bg-primary text-white rounded-br-sm";
  } else {
    classes += "self-start bg-[#f1f2f6] text-text-main rounded-bl-sm";
  }
  div.className = classes;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  
}

function pretendBunnyReply(userText) {
  setStatus("Talking");

  setTimeout(() => {
    addMessage("Bunny: You’ve got this ✨ (placeholder reply)", "bunny");
    setStatus("Idle");
  }, 600);
}

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  if (!awake) {
    addMessage("Bunny: (asleep) Press Wake first 💤", "bunny");
    return;
  }

  addMessage("You: " + text, "you");
  msgInput.value = "";
  askBunny(text);
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

wakeBtn.addEventListener("click", () => {
  awake = !awake;
  setStatus(awake ? "Listening" : "Idle (asleep)");
  addMessage(`Bunny: ${awake ? "I’m awake! 😊" : "Going to sleep… 💤"}`, "bunny");
});

costumeBtn.addEventListener("click", () => {
  // costumeIndex = (costumeIndex + 1) % costumes.length;
  // Placeholder since we use an image now
  addMessage("Bunny: I'll wear a costume when you add image assets! 👗", "bunny");
});

micBtn.addEventListener("click", startListening);

setStatus("Idle (asleep)");
addMessage("Bunny: Hi! Press Wake to start 🐰", "bunny");

async function askBunny(userText) {

  setStatus("Thinking...");
  try {

    const response = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: userText
      })
    });

    const data = await response.json();

    addMessage("Bunny: " + data.reply, "bunny");
    
    playAudio(data.audio);

    if (bunnyImg && data.emotion) {
      bunnyImg.src = getBunnyImageUrl(data.emotion);
    }

    setStatus("Listening");


  } catch (error) {

    addMessage("Bunny: Something went wrong talking to my brain 😵", "bunny");

    setStatus("Error");

  }
}

function speak(text) {

  const speech = new SpeechSynthesisUtterance(text);

  function setVoice() {
    const voices = speechSynthesis.getVoices();

    const bunnyVoice =
      voices.find(v => v.name.includes("Samantha")) ||
      voices.find(v => v.name.includes("Google")) ||
      voices.find(v => v.lang === "en-US");

    if (bunnyVoice) {
      speech.voice = bunnyVoice;
    }

    speech.rate = 1.1;
    speech.pitch = 1.6;

    speechSynthesis.speak(speech);
  }

  const voices = speechSynthesis.getVoices();

  if (voices.length) {
    setVoice();
  } else {
    speechSynthesis.onvoiceschanged = setVoice;
  }

}
function startListening() {

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    addMessage("Bunny: Your browser doesn't support speech recognition.", "bunny");
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.interimResults = false;

  setStatus("Listening...");

  recognition.start();

  recognition.onresult = (event) => {

    const transcript = event.results[0][0].transcript;

    addMessage("You: " + transcript, "you");

    askBunny(transcript);

  };

  recognition.onerror = () => {
    setStatus("Idle");
    addMessage("Bunny: I couldn't hear you clearly.", "bunny");
  };

  recognition.onend = () => {
    setStatus("Listening");
  };

}
function playAudio(base64Audio) {

  if (!base64Audio) return;

  const audio = new Audio("data:audio/mp3;base64," + base64Audio);

  audio.onplay = () => {
    if (bunnyImg) bunnyImg.classList.add("bunny-speaking");
  };

  audio.onended = () => {
    if (bunnyImg) bunnyImg.classList.remove("bunny-speaking");
  };

  audio.play();
}
