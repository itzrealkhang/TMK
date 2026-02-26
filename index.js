const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

// ===== Trang chủ =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== API gái =====
app.get("/gai", async (req, res) => {
  try {

    const url = "https://www.pinterest.com/search/pins/?q=gai%20xinh";

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(data);

    let images = [];

    $("img").each((i, el) => {
      const src = $(el).attr("src");
      if (src && src.includes("pinimg")) {
        images.push(src);
      }
    });

    if (!images.length) {
      return res.json({
        status: false,
        message: "Không tìm thấy ảnh"
      });
    }

    const random =
      images[Math.floor(Math.random() * images.length)];

    res.json({
      status: true,
      endpoint: "/gai",
      image: random,
      source: "pinterest",
      timestamp: Date.now()
    });

  } catch (err) {
    res.json({
      status: false,
      error: err.message
    });
  }
});

// ===== PORT =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});