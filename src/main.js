const chatLog = document.getElementById("chatLog");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const wakeBtn = document.getElementById("wakeBtn");
const costumeBtn = document.getElementById("costumeBtn");
const bunnyStatus = document.getElementById("bunnyStatus");
const bunnyImg = document.getElementById("bunnyImg");

let awake = false;
let costumeIndex = 0;
const costumes = ["🐰", "🐰🎀", "🐰🕶️", "🐰👑"];

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
  if (bunnyImg) bunnyImg.style.transform = "scale(1.05)";

  setTimeout(() => {
    addMessage("Bunny: You’ve got this ✨ (placeholder reply)", "bunny");
    if (bunnyImg) bunnyImg.style.transform = "scale(1)";
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
  pretendBunnyReply(text);
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

micBtn.addEventListener("click", () => {
  addMessage("Bunny: Mic button works later (Step 6). For now, type and send!", "bunny");
});

setStatus("Idle (asleep)");
addMessage("Bunny: Hi! Press Wake to start 🐰", "bunny");
