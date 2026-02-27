const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

// Imgur Client ID
const IMGUR_CLIENT_ID = "85a847235508ec9";

// Cache
let cache = {
  images: [],
  lastFetch: 0,
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// Middleware thống kê
app.use((req, res, next) => {
  cache.stats.requests++;
  next();
});

// Trang docs
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API chính - endpoint JSON
app.get("/gai", async (req, res) => {
  try {
    // Headers
    res.setHeader("X-API-Version", "1.0");
    res.setHeader("X-Powered-By", "TMK");

    // Cache hit
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      cache.stats.hits++;
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      
      return res.json({
        success: true,
        data: {
          url: random.link,
          id: random.id,
          title: random.title || "Untitled"
        },
        meta: {
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    console.log("📦 Fetching new images...");

    // Lấy ảnh từ Imgur API
    const response = await axios.get("https://api.imgur.com/3/gallery/hot/viral/0.json", {
      headers: {
        "Authorization": `Client-ID ${IMGUR_CLIENT_ID}`
      },
      timeout: 8000
    });

    let images = [];

    if (response.data?.data) {
      images = response.data.data
        .filter(item => !item.is_album && item.link)
        .map(item => ({
          id: item.id,
          link: item.link,
          title: item.title,
          width: item.width,
          height: item.height
        }))
        .slice(0, 100);
    }

    // Fallback
    if (images.length === 0) {
      images = [
        {
          id: "fallback1",
          link: "https://i.imgur.com/Y8Hp6mJ.jpg",
          title: "Mountain"
        },
        {
          id: "fallback2",
          link: "https://i.imgur.com/7U6V4cK.jpg",
          title: "Ocean"
        }
      ];
    }

    cache.images = images;
    cache.lastFetch = Date.now();

    const random = cache.images[Math.floor(Math.random() * cache.images.length)];

    res.json({
      success: true,
      data: {
        url: random.link,
        id: random.id,
        title: random.title
      },
      meta: {
        cached: false,
        total: cache.images.length,
        time: Date.now()
      }
    });

  } catch (err) {
    console.error("Lỗi:", err.message);

    // Cache fallback
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        success: true,
        data: {
          url: random.link,
          id: random.id,
          title: random.title
        },
        meta: {
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    // Ultimate fallback
    res.json({
      success: true,
      data: {
        url: "https://i.imgur.com/Y8Hp6mJ.jpg",
        id: "fallback",
        title: "TMK Image"
      },
      meta: {
        cached: false,
        total: 1,
        time: Date.now()
      }
    });
  }
});

// Endpoint redirect cho browser (có dấu)
app.get("/gái", (req, res) => {
  res.redirect("/gai");
});

// Stats
app.get("/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      requests: cache.stats.requests,
      cacheHits: cache.stats.hits,
      cacheSize: cache.images.length,
      cacheAge: Date.now() - cache.lastFetch,
      uptime: process.uptime()
    }
  });
});

// Health
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: Date.now()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════╗
║     TMK API v1.0       ║
╠════════════════════════╣
║  Port: ${PORT}               ║
║  Status: ✅ Active      ║
║  Endpoints:             ║
║    • /gai (JSON)       ║
║    • /gái (redirect)   ║
║    • /stats            ║
║    • /health           ║
╚════════════════════════╝
  `);
});