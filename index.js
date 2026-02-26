const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

// Cache để tránh bị block
let cache = {
  images: [],
  lastFetch: 0,
  ttl: 30 * 60 * 1000 // 30 phút
};

// Trang docs
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API gái xịn hơn
app.get("/gai", async (req, res) => {
  try {
    // Kiểm tra cache còn hạn không
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        status: true,
        endpoint: "/gai",
        image: random,
        source: "pinterest (cached)",
        timestamp: Date.now()
      });
    }

    // Dùng nhiều nguồn khác nhau để tránh fail
    const sources = [
      "https://www.pinterest.com/search/pins/?q=ph%E1%BB%A5%20n%E1%BB%AF%20xinh%20%C4%91%E1%BA%B9p",
      "https://www.pinterest.com/search/pins/?q=g%C3%A1i%20xinh%20vi%E1%BB%87t%20nam",
      "https://www.pinterest.com/search/pins/?q=hot%20girl%20ch%C3%A2u%20%C3%A1"
    ];
    
    const randomSource = sources[Math.floor(Math.random() * sources.length)];
    
    const { data } = await axios.get(randomSource, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "DNT": "1"
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    
    let images = [];
    
    // Pinterest dùng nhiều kiểu selector khác nhau
    $("img[src*='pinimg.com'], img[src*='i.pinimg.com']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar") && src.match(/[0-9]x[0-9]/)) {
        // Chỉ lấy ảnh kích thước lớn
        const largeSrc = src.replace(/\/\d+x\d+\//, "/originals/");
        images.push(largeSrc);
      }
    });
    
    // Nếu không tìm thấy, thử selector khác
    if (images.length === 0) {
      $("div[data-test-id='pin'] img, div[class*='Pin'] img").each((i, el) => {
        const src = $(el).attr("src");
        if (src && src.includes("pinimg")) {
          images.push(src);
        }
      });
    }

    if (images.length === 0) {
      // Fallback images nếu crawl fail
      const fallbacks = [
        "https://i.pinimg.com/236x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg",
        "https://i.pinimg.com/236x/bf/8c/4a/bf8c4a7d3e2f1a9b8c7d6e5f4a3b2c1d.jpg"
      ];
      cache.images = fallbacks;
    } else {
      // Lọc ảnh trùng
      cache.images = [...new Set(images)];
    }
    
    cache.lastFetch = Date.now();
    
    const random = cache.images[Math.floor(Math.random() * cache.images.length)];
    
    res.json({
      status: true,
      endpoint: "/gai",
      image: random,
      source: "pinterest",
      total_images: cache.images.length,
      timestamp: Date.now()
    });

  } catch (err) {
    // Nếu lỗi, trả về ảnh mặc định từ cache cũ (nếu có)
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        status: true,
        image: random,
        source: "cache (fallback)",
        timestamp: Date.now()
      });
    }
    
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));