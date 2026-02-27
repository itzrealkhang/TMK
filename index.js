const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

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
 * Hàm Pinterest CHUẨN - Copy từ code mới nhất của bạn
 */
async function searchPinterestImages(query, limit = 30) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/`;

    const data = {
      options: {
        applied_unified_filters: null,
        appliedProductFilters: "---",
        article: null,
        auto_correction_disabled: false,
        corpus: null,
        customized_rerank_type: null,
        domains: null,
        dynamicPageSizeExpGroup: null,
        filters: null,
        journey_depth: null,
        page_size: limit,
        price_max: null,
        price_min: null,
        query_pin_sigs: null,
        query: query,
        redux_normalize_feed: true,
        request_params: null,
        rs: "typed",
        scope: "pins",
        selected_one_bar_modules: null,
        seoDrawerEnabled: false,
        source_id: null,
        source_module_id: null,
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
        top_pin_id: null,
        top_pin_ids: null,
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

    if (response.data && response.data.resource_response && response.data.resource_response.data) {
      const results = response.data.resource_response.data.results;

      const imageUrls = results
        .filter((pin) => {
          return (
            pin &&
            pin.images &&
            (pin.images.orig || pin.images["736x"] || pin.images["474x"] || pin.images["1200x"] || pin.images["600x"])
          );
        })
        .map((pin) => {
          return (
            pin.images.orig?.url ||
            pin.images["1200x"]?.url ||
            pin.images["736x"]?.url ||
            pin.images["600x"]?.url ||
            pin.images["474x"]?.url
          );
        })
        .filter((url) => url);

      return imageUrls;
    }

    return [];
  } catch (error) {
    console.error("Lỗi Pinterest:", error.message);
    return [];
  }
}

// API chính - /gai
app.get("/gai", async (req, res) => {
  try {
    // Check cache
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      cache.stats.hits++;
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      
      return res.json({
        success: true,
        data: {
          url: random,
          id: Math.random().toString(36).substring(7),
          title: "gái xinh"
        },
        meta: {
          source: "pinterest",
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    // Gọi hàm Pinterest CHUẨN
    console.log("🔄 Đang tìm ảnh từ Pinterest...");
    const images = await searchPinterestImages("gái xinh", 50);

    if (images.length > 0) {
      cache.images = images;
      cache.lastFetch = Date.now();
      
      const random = images[Math.floor(Math.random() * images.length)];
      
      res.json({
        success: true,
        data: {
          url: random,
          id: Math.random().toString(36).substring(7),
          title: "gái xinh"
        },
        meta: {
          source: "pinterest",
          cached: false,
          total: images.length,
          time: Date.now()
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
          source: "fallback",
          total: 1
        }
      });
    }

  } catch (err) {
    console.error("Lỗi:", err);
    res.json({
      success: true,
      data: {
        url: "https://i.imgur.com/Y8Hp6mJ.jpg",
        id: "error"
      }
    });
  }
});

// Endpoint redirect - /gái
app.get("/gái", async (req, res) => {
  try {
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.redirect(random);
    }
    
    // Nếu chưa có cache
    const images = await searchPinterestImages("gái xinh", 10);
    if (images.length > 0) {
      return res.redirect(images[0]);
    }
    
    res.redirect("https://i.imgur.com/Y8Hp6mJ.jpg");
    
  } catch (err) {
    res.redirect("https://i.imgur.com/Y8Hp6mJ.jpg");
  }
});

// Stats
app.get("/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      requests: cache.stats.requests,
      cacheHits: cache.stats.hits,
      cacheSize: cache.images.length,
      cacheAge: Math.floor((Date.now() - cache.lastFetch) / 1000) + "s",
      uptime: Math.floor(process.uptime()) + "s"
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
╔══════════════════════════╗
║     TMK API v7.0         ║
╠══════════════════════════╣
║  Port: ${PORT}                  ║
║  Source: Pinterest API   ║
║  Method: CHUẨN NHẤT      ║
║  Status: ✅ Running       ║
╚══════════════════════════╝
  `);
});