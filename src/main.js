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

function getBunnyImageUrl(emotion) {
  const imagePath = `./assets/${emotion}bunny.png`;
  return bunnyImages[imagePath] || bunnyImages["./assets/Basicbunny.png"];
}

function addMessage(text, who) {
  const div = document.createElement("div");
  div.classList.add("msg");

  if (who === "you" || who === "user") {
    div.classList.add("msg-user");
  } else {
    div.classList.add("msg-bunny");
  }

  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  addMessage("You: " + text, "user");
  msgInput.value = "";
  askBunny(text);
}

sendBtn.addEventListener("click", sendMessage);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

addMessage("AFB: Agent Fluffy Bunny online. Talk to me anytime 🐰", "bunny");

async function askBunny(userText) {
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

    addMessage("AFB: " + data.reply, "bunny");

    if (data.emotion) {
      bunnyImg.src = getBunnyImageUrl(data.emotion);
    }

    playAudio(data.audio);
  } catch (error) {
    addMessage("AFB: Something went wrong talking to my brain 😵", "bunny");
    console.error(error);
  }
}

function playAudio(base64Audio) {
  if (!base64Audio) return;

  const audio = new Audio("data:audio/mp3;base64," + base64Audio);

  audio.onplay = () => {
    chatUI.classList.add("chat-hidden");
    bunnyArea.classList.add("bunny-active");
    bunnyImg.classList.add("bunny-speaking");
  };

  audio.onended = () => {
    chatUI.classList.remove("chat-hidden");
    bunnyArea.classList.remove("bunny-active");
    bunnyImg.classList.remove("bunny-speaking");
  };

  audio.play().catch((error) => {
    console.error("Audio play failed:", error);
  });
}

function startMatrixBackground() {
  const canvas = matrixCanvas;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const letters = "01";
  const fontSize = 50;

  let columns = 0;
  let drops = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    columns = Math.floor(canvas.width / fontSize);
    drops = [];

    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * canvas.height;
    }
  }

  resize();
  window.addEventListener("resize", resize);

  function draw() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#00ff88";
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const text = letters[Math.floor(Math.random() * letters.length)];

      ctx.fillText(text, i * fontSize, drops[i]);

      drops[i] += fontSize * 0.2;

      if (drops[i] > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
}

startMatrixBackground();