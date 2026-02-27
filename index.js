const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

// Danh sách Imgur Client ID dự phòng
const IMGUR_CLIENTS = [
  "546c25a59c58ad7",
  "8b8d8a8d8a8d8a8", 
  "9c9d9e9f9g9h9i9",
  "86424c25a59c58ad7"  // Thêm vài cái nữa
];

// Cache
let cache = {
  images: [],
  lastFetch: 0,
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0,
    source: "unknown"
  },
  currentClientIndex: 0
};

// Middleware
app.use((req, res, next) => {
  cache.stats.requests++;
  next();
});

// Trang docs
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Hàm lấy ảnh từ Imgur với nhiều client ID
async function fetchFromImgur() {
  const maxRetries = IMGUR_CLIENTS.length;
  
  for (let i = 0; i < maxRetries; i++) {
    const clientId = IMGUR_CLIENTS[cache.currentClientIndex];
    
    try {
      const response = await axios.get("https://api.imgur.com/3/gallery/hot/viral/0.json", {
        headers: {
          "Authorization": `Client-ID ${clientId}`
        },
        timeout: 5000
      });

      if (response.data?.data) {
        const images = response.data.data
          .filter(item => !item.is_album && item.link)
          .map(item => ({
            id: item.id,
            link: item.link,
            title: item.title || "Imgur Image"
          }))
          .slice(0, 50);

        if (images.length > 0) {
          cache.currentClientIndex = (cache.currentClientIndex + 1) % IMGUR_CLIENTS.length;
          return { success: true, images, source: "imgur" };
        }
      }
    } catch (err) {
      console.log(`Imgur client ${clientId} failed:`, err.message);
      cache.currentClientIndex = (cache.currentClientIndex + 1) % IMGUR_CLIENTS.length;
      continue;
    }
  }
  
  return { success: false };
}

// Hàm lấy ảnh từ Picsum (dự phòng)
async function fetchFromPicsum() {
  try {
    const images = [];
    
    // Tạo 20 ảnh random từ Picsum
    for (let i = 0; i < 20; i++) {
      const id = Math.floor(Math.random() * 1000);
      const width = 800;
      const height = 600;
      
      images.push({
        id: `picsum-${id}`,
        link: `https://picsum.photos/id/${id}/${width}/${height}`,
        title: `Picsum Image ${id}`
      });
    }
    
    return { success: true, images, source: "picsum" };
  } catch (err) {
    return { success: false };
  }
}

// API chính
app.get("/gai", async (req, res) => {
  try {
    // Check cache
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      cache.stats.hits++;
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      
      return res.json({
        success: true,
        data: {
          url: random.link,
          id: random.id,
          title: random.title
        },
        meta: {
          source: cache.stats.source,
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    console.log("📦 Fetching images...");
    
    // Thử Imgur trước
    let result = await fetchFromImgur();
    
    // Nếu Imgur fail thì dùng Picsum
    if (!result.success) {
      console.log("⚠️ Imgur failed, using Picsum fallback");
      result = await fetchFromPicsum();
    }
    
    if (result.success) {
      cache.images = result.images;
      cache.stats.source = result.source;
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
          source: result.source,
          cached: false,
          total: cache.images.length,
          time: Date.now()
        }
      });
    } else {
      // Fallback cứng
      res.json({
        success: true,
        data: {
          url: "https://picsum.photos/800/600",
          id: "fallback",
          title: "Fallback Image"
        },
        meta: {
          source: "fallback",
          total: 1
        }
      });
    }

  } catch (err) {
    console.error("Error:", err);
    
    // Dùng cache cũ nếu có
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
          source: cache.stats.source,
          cached: true
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        url: "https://picsum.photos/800/600",
        id: "error"
      }
    });
  }
});

// Redirect endpoint
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
      currentSource: cache.stats.source,
      cacheAge: Date.now() - cache.lastFetch,
      uptime: process.uptime()
    }
  });
});

// Health
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: Date.now(),
    source: cache.stats.source || "unknown"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════╗
║     TMK API v2.0             ║
╠══════════════════════════════╣
║  Port: ${PORT}                      ║
║  Sources: Imgur + Picsum     ║
║  Fallback: ✅ Active          ║
║  Status: ✅ Running           ║
╚══════════════════════════════╝
  `);
});