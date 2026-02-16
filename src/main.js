const msg = document.getElementById("msg");
const send = document.getElementById("send");
const chat = document.getElementById("chat");
const statusEl = document.getElementById("status");

function addLine(text) {
  const div = document.createElement("div");
  div.textContent = text;
  chat.appendChild(div);
}

send.addEventListener("click", () => {
  const text = msg.value.trim();
  if (!text) return;
  addLine("You: " + text);
  addLine("Bunny: (placeholder reply) You’ve got this ✨");
  msg.value = "";
});

msg.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send.click();
});

statusEl.textContent = "Status: Running locally ✅";
