const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
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

// Hàm crawl Pinterest - copy từ pro_pin.py nhưng chỉnh lại
async function crawlPinterest(keyword = "gái xinh", limit = 20) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    // URL tìm kiếm Pinterest
    const url = `https://www.pinterest.com/search/pins/?q=${encodedKeyword}`;
    
    console.log(`🕷️ Đang crawl: ${url}`);
    
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "DNT": "1"
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    let images = [];

    // Tìm tất cả ảnh từ Pinterest
    $("img[src*='pinimg.com']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar") && !src.includes("profile")) {
        // Lấy ảnh gốc (originals)
        const originalSrc = src.replace(/\/\d+x\d+\//, "/originals/");
        images.push(originalSrc);
      }
    });

    // Nếu không tìm thấy, thử selector khác
    if (images.length === 0) {
      $("div[data-test-id='pin'] img").each((i, el) => {
        const src = $(el).attr("src");
        if (src && src.includes("pinimg")) {
          images.push(src);
        }
      });
    }

    // Lọc trùng và lấy đủ số lượng
    const uniqueImages = [...new Set(images)];
    
    if (uniqueImages.length === 0) {
      return { success: false, images: [] };
    }

    // Giới hạn số lượng
    const limitedImages = uniqueImages.slice(0, limit).map(url => ({
      id: Math.random().toString(36).substring(7),
      link: url,
      title: keyword
    }));

    return { success: true, images: limitedImages };

  } catch (err) {
    console.error("Lỗi crawl Pinterest:", err.message);
    return { success: false, images: [] };
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
          url: random.link,
          id: random.id,
          title: random.title
        },
        meta: {
          source: "pinterest (crawled)",
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    // Crawl ảnh mới
    console.log("🔄 Đang crawl Pinterest...");
    const result = await crawlPinterest("gái xinh", 30);

    if (result.success && result.images.length > 0) {
      cache.images = result.images;
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
          source: "pinterest (crawled)",
          cached: false,
          total: cache.images.length,
          time: Date.now()
        }
      });
    } else {
      // Fallback images
      const fallbacks = [
        "https://i.imgur.com/Y8Hp6mJ.jpg",
        "https://i.imgur.com/7U6V4cK.jpg"
      ];
      
      res.json({
        success: true,
        data: {
          url: fallbacks[Math.floor(Math.random() * fallbacks.length)],
          id: "fallback",
          title: "Fallback"
        },
        meta: {
          source: "fallback",
          total: 2
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
    // Nếu có cache thì redirect thẳng đến ảnh
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.redirect(random.link);
    }
    
    // Nếu chưa có cache thì crawl nhanh
    const result = await crawlPinterest("gái xinh", 5);
    if (result.success && result.images.length > 0) {
      return res.redirect(result.images[0].link);
    }
    
    // Fallback
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
╔═══════════════════════════╗
║     TMK API v5.0          ║
╠═══════════════════════════╣
║  Port: ${PORT}                  ║
║  Source: Pinterest (crawl) ║
║  Status: ✅ Running        ║
║  Endpoints:                ║
║    • /gai (JSON)          ║
║    • /gái (redirect)      ║
║    • /stats               ║
║    • /health              ║
╚═══════════════════════════╝
  `);
});