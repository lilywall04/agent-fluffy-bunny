const bunnyFace = document.getElementById("bunnyFace");
const bunnyStatus = document.getElementById("bunnyStatus");
const chatLog = document.getElementById("chatLog");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const wakeBtn = document.getElementById("wakeBtn");
const costumeBtn = document.getElementById("costumeBtn");
const micBtn = document.getElementById("micBtn");

const responses = [
  "You've got this! ✨",
  "Believe in yourself! 🐰",
  "Keep going, you're doing great! 🥕",
  "I'm rooting for you!",
  "Hop to it! 🐇"
];

const costumes = ["🐰", "🎩", "🕶️", "🦸", "🧚"];
let costumeIndex = 0;

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function handleSend() {
  const text = msgInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  msgInput.value = "";

  // Simulate bunny thinking
  bunnyStatus.textContent = "Thinking...";
  setTimeout(() => {
    const reply = responses[Math.floor(Math.random() * responses.length)];
    addMessage(reply, "bot");
    bunnyStatus.textContent = "Idle";
  }, 1000);
}

sendBtn.addEventListener("click", handleSend);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

wakeBtn.addEventListener("click", () => {
  bunnyStatus.textContent = "Awake & Happy!";
  bunnyFace.style.animation = "none";
  // Trigger reflow
  void bunnyFace.offsetWidth;
  bunnyFace.style.animation = "float 0.5s ease-in-out infinite";
  setTimeout(() => {
    bunnyFace.style.animation = "float 3s ease-in-out infinite";
    bunnyStatus.textContent = "Idle";
  }, 2000);
});

costumeBtn.addEventListener("click", () => {
  costumeIndex = (costumeIndex + 1) % costumes.length;
  bunnyFace.textContent = costumes[costumeIndex];
});

micBtn.addEventListener("click", () => {
  bunnyStatus.textContent = "Listening...";
  setTimeout(() => {
    bunnyStatus.textContent = "Idle";
    addMessage("I can't hear you yet, but I'm listening with my heart! ❤️", "bot");
  }, 1500);
});

// Initial welcome
addMessage("Hi! I'm Fluffy Bunny. How can I help you today?", "bot");

