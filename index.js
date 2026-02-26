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

// API gái - format JSON mới
app.get("/gai", async (req, res) => {
  try {
    // Kiểm tra cache
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        success: true,
        data: [random],
        count: cache.images.length
      });
    }

    // Dùng API Pinterest thay vì crawl HTML (tránh bị chặn)
    const sources = [
      "https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=phụ nữ xinh đẹp&data=%7B%22options%22%3A%7B%22query%22%3A%22phụ nữ xinh đẹp%22%7D%7D",
      "https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=gái xinh việt nam&data=%7B%22options%22%3A%7B%22query%22%3A%22gái xinh việt nam%22%7D%7D"
    ];
    
    const randomSource = sources[Math.floor(Math.random() * sources.length)];
    
    const response = await axios.get(randomSource, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*"
      },
      timeout: 10000
    });

    let images = [];
    
    // Parse response từ API Pinterest
    if (response.data && response.data.resource_response && response.data.resource_response.data) {
      const pins = response.data.resource_response.data.results || [];
      
      pins.forEach(pin => {
        if (pin.images && pin.images.orig) {
          images.push(pin.images.orig.url);
        } else if (pin.images && pin.images['237x']) {
          images.push(pin.images['237x'].url);
        }
      });
    }

    // Fallback images nếu crawl fail
    if (images.length === 0) {
      images = [
        "https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg",
        "https://i.pinimg.com/736x/bf/8c/4a/bf8c4a7d3e2f1a9b8c7d6e5f4a3b2c1d.jpg",
        "https://i.pinimg.com/736x/8b/4a/9c/8b4a9c1b2e3f4a5b6c7d8e9f0a1b2c3d.jpg"
      ];
    }
    
    cache.images = [...new Set(images)];
    cache.lastFetch = Date.now();
    
    const random = cache.images[Math.floor(Math.random() * cache.images.length)];
    
    res.json({
      success: true,
      data: [random],
      count: cache.images.length
    });

  } catch (err) {
    console.error("Lỗi:", err.message);
    
    // Fallback images
    const fallbacks = [
      "https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg",
      "https://i.pinimg.com/736x/bf/8c/4a/bf8c4a7d3e2f1a9b8c7d6e5f4a3b2c1d.jpg"
    ];
    
    res.json({
      success: true,
      data: [fallbacks[Math.floor(Math.random() * fallbacks.length)]],
      count: fallbacks.length
    });
  }
});

// Endpoint có dấu - redirect thẳng ra ảnh
app.get("/gái", async (req, res) => {
  try {
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.redirect(random);
    }
    
    res.redirect("https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg");
    
  } catch (err) {
    res.redirect("https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));