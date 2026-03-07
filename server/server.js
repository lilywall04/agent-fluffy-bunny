const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
    res.send("🐰 Fluffy Bunny server is running!");
});

app.post("/chat", async (req, res) => {
    const { message } = req.body;

    const reply = `Bunny says: I heard you say "${message}" and I believe in you ✨`;

    res.json({ reply });
});

app.listen(3000, () => {
    console.log("🐰 Bunny brain running on http://localhost:3000");
});