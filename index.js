const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

// Cache cho từng loại
let cache = {
  gai: { images: [], lastFetch: 0 },
  boy: { images: [], lastFetch: 0 },
  cosplay: { images: [], lastFetch: 0 },
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// Keywords cho từng loại
const KEYWORDS = {
  gai: ["gái xinh", "hot girl", "xinh đẹp", "model nữ"],
  boy: ["trai đẹp", "hot boy", "nam thần", "model nam"],
  cosplay: ["cosplay", "cosplay girl", "anime cosplay", "game cosplay"]
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
async function handleImageEndpoint(req, res, type, keywordList) {
  try {
    const cacheData = cache[type];
    
    // Random keyword từ list
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
          source: "pinterest",
          cached: true,
          total: cacheData.images.length,
          timestamp: Date.now(),
          version: "8.0.0"
        }
      });
    }

    // Gọi Pinterest
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
          source: "pinterest",
          cached: false,
          total: images.length,
          timestamp: Date.now(),
          version: "8.0.0"
        }
      });
    } else {
      // Fallback
      res.json({
        success: true,
        data: {
          url: "https://i.imgur.com/Y8Hp6mJ.jpg",
          id: "fallback"
        },
        meta: {
          endpoint: `/${type}`,
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
        id: "error"
      },
      meta: {
        endpoint: `/${type}`,
        source: "error",
        timestamp: Date.now()
      }
    });
  }
}

// Endpoint /gái
app.get("/gái", (req, res) => handleImageEndpoint(req, res, "gai", KEYWORDS.gai));

// Endpoint /gai (không dấu - redirect)
app.get("/gai", (req, res) => res.redirect("/gái"));

// Endpoint /boy
app.get("/boy", (req, res) => handleImageEndpoint(req, res, "boy", KEYWORDS.boy));

// Endpoint /cosplay
app.get("/cosplay", (req, res) => handleImageEndpoint(req, res, "cosplay", KEYWORDS.cosplay));

// Endpoint redirect ảnh trực tiếp
app.get("/image/:type", async (req, res) => {
  const { type } = req.params;
  if (!["gai", "boy", "cosplay"].includes(type)) {
    return res.redirect("/");
  }
  
  const cacheData = cache[type === "gai" ? "gai" : type];
  
  if (cacheData.images.length > 0) {
    const random = cacheData.images[Math.floor(Math.random() * cacheData.images.length)];
    return res.redirect(random);
  }
  
  res.redirect("https://i.imgur.com/Y8Hp6mJ.jpg");
});

// Stats
app.get("/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      requests: cache.stats.requests,
      cacheHits: cache.stats.hits,
      cacheSize: {
        gai: cache.gai.images.length,
        boy: cache.boy.images.length,
        cosplay: cache.cosplay.images.length
      },
      uptime: process.uptime(),
      version: "8.0.0"
    },
    meta: {
      timestamp: Date.now()
    }
  });
});

// Health
app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "8.0.0",
    endpoints: ["/gái", "/boy", "/cosplay", "/stats", "/health"]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║        TMK API v8.0                ║
╠════════════════════════════════════╣
║  🚀 Endpoints:                     ║
║  ├─ /gái   → Gái xinh              ║
║  ├─ /boy   → Trai đẹp              ║
║  ├─ /cosplay → Cosplay              ║
║  ├─ /stats → Thống kê              ║
║  └─ /health → Health check         ║
╠════════════════════════════════════╣
║  📦 Port: ${PORT}                         ║
║  ⚡ Status: ✅ Running              ║
╚════════════════════════════════════╝
  `);
});