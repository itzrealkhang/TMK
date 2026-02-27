const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Import handler Gura
const { handleGura } = require("./gura.js");

// Khởi tạo app
const app = express();

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// ==================== KIỂM TRA MÔI TRƯỜNG ====================
const isVercel = process.env.VERCEL === "1";
console.log(`🚀 TMK API v1.2.8 chạy trên: ${isVercel ? 'Vercel' : 'Local'}`);

// ==================== ĐỌC FILE VIDEO ====================

let videoUrls = [];
try {
  const videoData = fs.readFileSync(path.join(__dirname, "vdgai.json"), "utf8");
  videoUrls = JSON.parse(videoData);
  console.log(`✅ Đã load ${videoUrls.length} video từ vdgai.json`);
} catch (err) {
  console.error("❌ Lỗi đọc file vdgai.json:", err.message);
  videoUrls = [];
}

// ==================== CACHE CHO API ====================

let cache = {
  girl: { images: [], lastFetch: 0 },
  boy: { images: [], lastFetch: 0 },
  cosplay: { images: [], lastFetch: 0 },
  anime: { images: [], lastFetch: 0 },
  gura: { images: [], lastFetch: 0 },
  vdgai: { videos: videoUrls, lastFetch: Date.now() },
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// ==================== KEYWORDS ====================

const KEYWORDS = {
  girl: ["gái xinh", "gái cute"],
  boy: ["bot", "trai", "trai đẹp", "trai 6 múi"],
  cosplay: ["cosplay", "cosplay girl", "anime cosplay", "game cosplay", "cosplay vietnam", "cosplay asian"],
  anime: ["anime", "anime girl", "anime boy", "cute anime", "anime art", "manga", "waifu"]
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

// ==================== HÀM PINTEREST ====================

async function searchPinterestImages(query, limit = 50) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/`;

    const data = {
      options: {
        query: query,
        scope: "pins",
        page_size: limit,
        redux_normalize_feed: true,
        rs: "typed",
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
      },
      context: {},
    };

    const headers = {
      Accept: "application/json, text/javascript, */*, q=0.01",
      Referer: `https://www.pinterest.com/`,
      "x-app-version": "9237374",
      "x-pinterest-appstate": "active",
      "x-pinterest-source-url": `/search/pins/?q=${encodedQuery}&rs=typed`,
      "x-requested-with": "XMLHttpRequest",
      "x-pinterest-pws-handler": "www/search/[scope].js",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    };

    const response = await axios({
      method: "get",
      url: searchUrl,
      headers: headers,
      params: {
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
        data: JSON.stringify(data),
        _: Date.now(),
      },
      timeout: 10000,
    });

    if (response.data?.resource_response?.data?.results) {
      const results = response.data.resource_response.data.results;
      const imageUrls = results
        .filter(pin => pin?.images)
        .map(pin => {
          return (
            pin.images.orig?.url ||
            pin.images["1200x"]?.url ||
            pin.images["736x"]?.url ||
            pin.images["600x"]?.url ||
            pin.images["474x"]?.url
          );
        })
        .filter(url => url);

      return imageUrls;
    }
    return [];
  } catch (error) {
    console.error(`Lỗi Pinterest [${query}]:`, error.message);
    return [];
  }
}

// ==================== HANDLER CHO ẢNH ====================

async function handleImageEndpoint(req, res, type, keywordList) {
  try {
    const cacheData = cache[type];
    const randomKeyword = keywordList[Math.floor(Math.random() * keywordList.length)];
    
    // Cache hit
    if (Date.now() - cacheData.lastFetch < cache.ttl && cacheData.images.length > 0) {
      cache.stats.hits++;
      const random = cacheData.images[Math.floor(Math.random() * cacheData.images.length)];
      
      return res.json({
        success: true,
        data: {
          url: random,
          id: Math.random().toString(36).substring(7),
          keyword: randomKeyword
        },
        meta: {
          endpoint: `/${type}`,
          category: "image",
          source: "pinterest",
          cached: true,
          total: cacheData.images.length,
          timestamp: Date.now(),
          version: "1.2.8"
        }
      });
    }

    // Cache miss - fetch từ Pinterest
    console.log(`🔄 Đang tìm ảnh ${type} với keyword: ${randomKeyword}`);
    const images = await searchPinterestImages(randomKeyword, 50);

    if (images.length > 0) {
      cacheData.images = images;
      cacheData.lastFetch = Date.now();
      const random = images[Math.floor(Math.random() * images.length)];
      
      res.json({
        success: true,
        data: {
          url: random,
          id: Math.random().toString(36).substring(7),
          keyword: randomKeyword
        },
        meta: {
          endpoint: `/${type}`,
          category: "image",
          source: "pinterest",
          cached: false,
          total: images.length,
          timestamp: Date.now(),
          version: "1.2.8"
        }
      });
    } else {
      // Fallback
      const fallbackImages = {
        girl: "https://i.imgur.com/Y8Hp6mJ.jpg",
        boy: "https://i.imgur.com/7U6V4cK.jpg",
        cosplay: "https://i.imgur.com/8QqZqZq.jpg",
        anime: "https://i.imgur.com/8QqZqZq.jpg",
        gura: "https://i.imgur.com/8QqZqZq.jpg"
      };
      
      res.json({
        success: true,
        data: {
          url: fallbackImages[type] || "https://i.imgur.com/Y8Hp6mJ.jpg",
          id: "fallback",
          keyword: randomKeyword
        },
        meta: {
          endpoint: `/${type}`,
          category: "image",
          source: "fallback",
          total: 1,
          timestamp: Date.now(),
          version: "1.2.8"
        }
      });
    }
  } catch (err) {
    console.error(`Lỗi ${type}:`, err);
    res.json({
      success: true,
      data: {
        url: "https://i.imgur.com/Y8Hp6mJ.jpg",
        id: "error",
        keyword: "error"
      },
      meta: {
        endpoint: `/${type}`,
        category: "image",
        source: "error",
        timestamp: Date.now(),
        version: "1.2.8"
      }
    });
  }
}

// ==================== HANDLER CHO VIDEO ====================

app.get("/vdgai", (req, res) => {
  try {
    const videoCache = cache.vdgai;
    
    if (videoCache.videos.length === 0) {
      return res.json({
        success: false,
        error: "Không có video nào",
        meta: { 
          endpoint: "/vdgai", 
          timestamp: Date.now(), 
          version: "1.2.8" 
        }
      });
    }

    cache.stats.hits++;
    const randomVideo = videoCache.videos[Math.floor(Math.random() * videoCache.videos.length)];
    
    res.json({
      success: true,
      data: {
        url: randomVideo,
        id: Math.random().toString(36).substring(7),
        title: "Video gái xinh"
      },
      meta: {
        endpoint: "/vdgai",
        category: "video",
        source: "json",
        total: videoCache.videos.length,
        timestamp: Date.now(),
        version: "1.2.8"
      }
    });
  } catch (err) {
    console.error("Lỗi video:", err);
    res.json({
      success: false,
      error: err.message,
      meta: { 
        endpoint: "/vdgai", 
        timestamp: Date.now(), 
        version: "1.2.8" 
      }
    });
  }
});

// ==================== ENDPOINTS CHÍNH ====================

// Image endpoints
app.get("/girl", (req, res) => handleImageEndpoint(req, res, "girl", KEYWORDS.girl));
app.get("/boy", (req, res) => handleImageEndpoint(req, res, "boy", KEYWORDS.boy));
app.get("/cosplay", (req, res) => handleImageEndpoint(req, res, "cosplay", KEYWORDS.cosplay));
app.get("/anime", (req, res) => handleImageEndpoint(req, res, "anime", KEYWORDS.anime));

// Endpoint GURA mới
app.get("/gura", (req, res) => handleGura(req, res, cache, searchPinterestImages));

// ==================== UTILITY ENDPOINTS ====================

app.get("/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      requests: cache.stats.requests,
      cacheHits: cache.stats.hits,
      cacheSize: {
        girl: cache.girl.images.length,
        boy: cache.boy.images.length,
        cosplay: cache.cosplay.images.length,
        anime: cache.anime.images.length,
        gura: cache.gura?.images.length || 0,
        vdgai: cache.vdgai.videos.length
      },
      uptime: process.uptime(),
      version: "1.2.8",
      environment: isVercel ? "vercel" : "local"
    },
    meta: { 
      timestamp: Date.now(), 
      version: "1.2.8" 
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "1.2.8",
    environment: isVercel ? "vercel" : "local",
    endpoints: ["/girl", "/boy", "/cosplay", "/anime", "/gura", "/vdgai", "/stats", "/health"]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║           TMK API v1.2.8                 ║
║        Professional Image & Video        ║
╠══════════════════════════════════════════╣
║  📸 Image Endpoints:                      ║
║  ├─ /girl     → Beautiful girls          ║
║  ├─ /boy      → Handsome boys            ║
║  ├─ /cosplay  → Cosplay characters       ║
║  ├─ /anime    → Anime & manga            ║
║  └─ /gura     🦈 Gawr Gura images        ║
╠══════════════════════════════════════════╣
║  🎬 Video Endpoints:                      ║
║  └─ /vdgai    → Video collection         ║
╠══════════════════════════════════════════╣
║  📊 Statistics:                           ║
║  ├─ /stats    → API statistics           ║
║  └─ /health   → Health check             ║
╠══════════════════════════════════════════╣
║  ⚡ Status: ✅ Running                     ║
║  🌐 Environment: ${isVercel ? 'Vercel' : 'Local'}                   ║
╚══════════════════════════════════════════╝
  `);
});