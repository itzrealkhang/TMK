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
 * Hàm Pinterest CHUẨN - Copy từ code của bạn
 */
async function pinterest_search(query, limit = 35) {
  const encoded_q = encodeURIComponent(query);
  const url = "https://www.pinterest.com/Resource/BaseSearchResource/get/";

  const headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "cookie": "csrftoken=22b8f678dd2406e520f5e71295d8ec01; _auth=1; _pinterest_sess=deocock",  
    "origin": "https://www.pinterest.com",
    "referer": `https://www.pinterest.com/search/pins/?q=${encoded_q}`,
    "user-agent": "Mozilla/5.0",
    "x-app-version": "d8c18cb",
    "x-csrftoken": "22b8f678dd2406e520f5e71295d8ec01",
    "x-requested-with": "XMLHttpRequest"
  };

  const image_urls = [];
  let bookmark = null;
  let total = 0;
  let page = 1;

  while (total < limit) {
    console.log(`📥 Đang tải trang ${page}...`);

    const payload = new URLSearchParams({
      source_url: `/search/pins/?q=${encoded_q}&rs=typed`,
      data: JSON.stringify({
        options: {
          query: query,
          scope: "pins",
          bookmarks: bookmark ? [bookmark] : [],
          redux_normalize_feed: true
        },
        context: {}
      }),
      _: Date.now()
    });

    try {
      const res = await axios.post(url, payload, { headers, timeout: 15000 });
      const json_data = res.data;

      const results = json_data?.resource_response?.data?.results || [];
      
      if (results.length === 0) {
        console.log("⏹️ Không còn kết quả.");
        break;
      }

      for (const pin of results) {
        if (total >= limit) break;
        
        const image_url = pin?.images?.orig?.url;
        if (image_url && image_url.startsWith("http")) {
          image_urls.push(image_url);
          total++;
        }
      }

      bookmark = json_data?.resource?.options?.bookmarks?.[0];
      if (!bookmark || bookmark === "-end-") break;

      page++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1s

    } catch (err) {
      console.error(`❌ Lỗi trang ${page}:`, err.message);
      break;
    }
  }

  console.log(`✅ Tổng cộng: ${image_urls.length} ảnh`);
  return image_urls;
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
          source: "pinterest (official API)",
          cached: true,
          total: cache.images.length,
          time: Date.now()
        }
      });
    }

    // Gọi hàm Pinterest CHUẨN
    console.log("🔄 Đang tìm ảnh từ Pinterest...");
    const images = await pinterest_search("gái xinh", 30);

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
          source: "pinterest (official API)",
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
    const images = await pinterest_search("gái xinh", 5);
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
╔════════════════════════════╗
║     TMK API v6.0           ║
╠════════════════════════════╣
║  Port: ${PORT}                   ║
║  Source: Pinterest OFFICIAL ║
║  Status: ✅ Running         ║
║  Endpoints:                 ║
║    • /gai (JSON)           ║
║    • /gái (redirect)       ║
║    • /stats                ║
║    • /health               ║
╚════════════════════════════╝
  `);
});