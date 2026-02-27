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

// Hàm lấy ảnh từ API Pinterest - CHỈ GÁI XINH
async function fetchPinterestImages() {
  try {
    const keyword = "gái xinh";
    const encodedKeyword = encodeURIComponent(keyword);
    
    console.log(`🔍 Đang tìm ảnh: ${keyword}`);
    
    // Gọi API Pinterest
    const response = await axios.get(
      `https://subhatde.id.vn/pinterest?search=${encodedKeyword}`,
      { timeout: 10000 }
    );

    let images = [];
    const data = response.data;

    // Xử lý response - API trả về mảng ảnh
    if (Array.isArray(data)) {
      images = data
        .filter(item => item && item.url)
        .map(item => ({
          id: item.id || Math.random().toString(36).substring(7),
          link: item.url,
          title: keyword
        }));
    } 
    // Trường hợp API trả về { data: [...] }
    else if (data && data.data && Array.isArray(data.data)) {
      images = data.data
        .filter(item => item)
        .map(item => {
          if (typeof item === 'string') {
            return {
              id: Math.random().toString(36).substring(7),
              link: item,
              title: keyword
            };
          } else {
            return {
              id: item.id || Math.random().toString(36).substring(7),
              link: item.url || item,
              title: item.title || keyword
            };
          }
        });
    }

    // Lọc ảnh hợp lệ
    images = images.filter(img => img && img.link);

    if (images.length > 0) {
      return { success: true, images };
    } else {
      return { success: false, error: "Không tìm thấy ảnh" };
    }

  } catch (err) {
    console.error("Pinterest API error:", err.message);
    return { success: false, error: err.message };
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
          title: random.title || "Gái xinh"
        },
        meta: {
          source: "pinterest",
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    // Fetch ảnh mới
    const result = await fetchPinterestImages();

    if (result.success) {
      cache.images = result.images;
      cache.lastFetch = Date.now();
      
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      
      res.json({
        success: true,
        data: {
          url: random.link,
          id: random.id,
          title: random.title || "Gái xinh"
        },
        meta: {
          source: "pinterest",
          cached: false,
          total: cache.images.length,
          time: Date.now()
        }
      });
    } else {
      // Fallback nếu lỗi
      const fallbackImages = [
        "https://i.imgur.com/Y8Hp6mJ.jpg",
        "https://i.imgur.com/7U6V4cK.jpg"
      ];
      
      res.json({
        success: true,
        data: {
          url: fallbackImages[Math.floor(Math.random() * fallbackImages.length)],
          id: "fallback",
          title: "Fallback Image"
        },
        meta: {
          source: "fallback",
          total: 2,
          time: Date.now()
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
      },
      meta: {
        source: "error"
      }
    });
  }
});

// Endpoint redirect - /gái
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
║     TMK API v4.0       ║
╠════════════════════════╣
║  Port: ${PORT}               ║
║  Source: Pinterest     ║
║  Keyword: gái xinh     ║
║  Status: ✅ Running     ║
╚════════════════════════╝
  `);
});