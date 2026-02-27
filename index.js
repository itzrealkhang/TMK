const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.static(__dirname));

// Đọc file JSON video
let videoUrls = [];
try {
  const videoData = fs.readFileSync(path.join(__dirname, "vdgai.json"), "utf8");
  videoUrls = JSON.parse(videoData);
  console.log(`✅ Đã load ${videoUrls.length} video từ vdgai.json`);
} catch (err) {
  console.error("❌ Lỗi đọc file vdgai.json:", err.message);
  videoUrls = [];
}

// Cache cho từng loại
let cache = {
  girl: { images: [], lastFetch: 0 },
  boy: { images: [], lastFetch: 0 },
  cosplay: { images: [], lastFetch: 0 },
  anime: { images: [], lastFetch: 0 },
  vdgai: { videos: videoUrls, lastFetch: Date.now() },
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// Keywords cho từng loại
const KEYWORDS = {
  girl: ["gái xinh", "gái cute"],
  boy: ["boy", "trai đẹp", "boy", "trai 6 múi"],
  cosplay: ["cosplay", "cosplay girl", "anime cosplay", "game cosplay", "cosplay vietnam", "cosplay asian"],
  anime: ["anime", "anime girl", "anime boy", "cute anime", "anime art", "manga", "waifu"]
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

/**
 * Hàm Pinterest CHUẨN - Tìm ảnh theo keyword
 */
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

/**
 * Hàm xử lý chung cho các endpoint
 */
async function handleEndpoint(req, res, type, keywordList, category) {
  try {
    const cacheData = cache[type];
    
    const randomKeyword = keywordList[Math.floor(Math.random() * keywordList.length)];
    
    // Check cache
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
          category: category,
          source: "pinterest",
          cached: true,
          total: cacheData.images.length,
          timestamp: Date.now(),
          version: "15.0.0"
        }
      });
    }

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
          category: category,
          source: "pinterest",
          cached: false,
          total: images.length,
          timestamp: Date.now(),
          version: "15.0.0"
        }
      });
    } else {
      const fallbackImages = {
        girl: "https://i.imgur.com/Y8Hp6mJ.jpg",
        boy: "https://i.imgur.com/7U6V4cK.jpg",
        cosplay: "https://i.imgur.com/8QqZqZq.jpg",
        anime: "https://i.imgur.com/8QqZqZq.jpg"
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
          category: category,
          source: "fallback",
          total: 1,
          timestamp: Date.now()
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
        category: category,
        source: "error",
        timestamp: Date.now()
      }
    });
  }
}

// Hàm xử lý video
function handleVideoEndpoint(req, res) {
  try {
    const videoCache = cache.vdgai;
    
    if (videoCache.videos.length === 0) {
      return res.json({
        success: false,
        error: "Không có video nào",
        meta: {
          endpoint: "/vdgai",
          timestamp: Date.now()
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
        version: "15.0.0"
      }
    });

  } catch (err) {
    console.error("Lỗi video:", err);
    res.json({
      success: false,
      error: err.message,
      meta: {
        endpoint: "/vdgai",
        timestamp: Date.now()
      }
    });
  }
}

// ==================== ENDPOINTS CHÍNH (GIỮ TÊN NGẮN) ====================

// Image endpoints - vẫn giữ tên ngắn gọn
app.get("/girl", (req, res) => handleEndpoint(req, res, "girl", KEYWORDS.girl, "image"));
app.get("/boy", (req, res) => handleEndpoint(req, res, "boy", KEYWORDS.boy, "image"));
app.get("/cosplay", (req, res) => handleEndpoint(req, res, "cosplay", KEYWORDS.cosplay, "image"));
app.get("/anime", (req, res) => handleEndpoint(req, res, "anime", KEYWORDS.anime, "image"));

// Video endpoint
app.get("/vdgai", handleVideoEndpoint);

// Endpoint redirect video trực tiếp
app.get("/vdgai/redirect", (req, res) => {
  if (cache.vdgai.videos.length > 0) {
    const randomVideo = cache.vdgai.videos[Math.floor(Math.random() * cache.vdgai.videos.length)];
    return res.redirect(randomVideo);
  }
  res.redirect("https://i.imgur.com/Y8Hp6mJ.jpg");
});

// Endpoint danh sách video
app.get("/vdgai/list", (req, res) => {
  res.json({
    success: true,
    data: cache.vdgai.videos.slice(0, 20),
    total: cache.vdgai.videos.length,
    meta: {
      endpoint: "/vdgai/list",
      timestamp: Date.now()
    }
  });
});

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
        vdgai: cache.vdgai.videos.length
      },
      uptime: process.uptime(),
      version: "15.0.0"
    },
    meta: {
      timestamp: Date.now()
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "15.0.0",
    endpoints: ["/girl", "/boy", "/cosplay", "/anime", "/vdgai", "/vdgai/redirect", "/vdgai/list", "/stats", "/health"]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║        TMK API v15.0               ║
╠════════════════════════════════════╣
║  📸 Image Endpoints:               ║
║  ├─ /girl     → Girl images        ║
║  ├─ /boy      → Boy images         ║
║  ├─ /cosplay  → Cosplay images     ║
║  └─ /anime    → Anime images       ║
╠════════════════════════════════════╣
║  🎬 Video Endpoints:               ║
║  ├─ /vdgai         → Random video  ║
║  ├─ /vdgai/redirect→ Direct video  ║
║  └─ /vdgai/list    → Video list    ║
╠════════════════════════════════════╣
║  📦 Total videos: ${cache.vdgai.videos.length}               ║
║  ⚡ Status: ✅ Running              ║
╚════════════════════════════════════╝
  `);
});