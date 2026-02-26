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
    // Kiểm tra cache còn hạn không
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        success: true,
        data: [random],
        count: cache.images.length
      });
    }

    // Dùng nhiều nguồn khác nhau để tránh fail
    const sources = [
      "https://www.pinterest.com/search/pins/?q=ph%E1%BB%A5%20n%E1%BB%AF%20xinh%20%C4%91%E1%BA%B9p",
      "https://www.pinterest.com/search/pins/?q=g%C3%A1i%20xinh%20vi%E1%BB%87t%20nam",
      "https://www.pinterest.com/search/pins/?q=hot%20girl%20ch%C3%A2u%20%C3%A1",
      "https://www.pinterest.com/search/pins/?q=model%20xinh",
      "https://www.pinterest.com/search/pins/?q=girl%20beautiful%20asia"
    ];
    
    const randomSource = sources[Math.floor(Math.random() * sources.length)];
    
    const { data } = await axios.get(randomSource, {
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
    
    // Pinterest dùng nhiều kiểu selector khác nhau
    $("img[src*='pinimg.com'], img[src*='i.pinimg.com']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar") && !src.includes("profile")) {
        // Chuyển sang ảnh kích thước lớn
        const largeSrc = src.replace(/\/\d+x\d+\//, "/originals/");
        images.push(largeSrc);
      }
    });
    
    // Nếu không tìm thấy, thử selector khác
    if (images.length === 0) {
      $("div[data-test-id='pin'] img, div[class*='Pin'] img, div[class*='pin'] img").each((i, el) => {
        const src = $(el).attr("src");
        if (src && src.includes("pinimg")) {
          images.push(src);
        }
      });
    }

    if (images.length === 0) {
      // Fallback images nếu crawl fail
      const fallbacks = [
        "https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg",
        "https://i.pinimg.com/736x/bf/8c/4a/bf8c4a7d3e2f1a9b8c7d6e5f4a3b2c1d.jpg",
        "https://i.pinimg.com/736x/8b/4a/9c/8b4a9c1b2e3f4a5b6c7d8e9f0a1b2c3d.jpg"
      ];
      cache.images = fallbacks;
    } else {
      // Lọc ảnh trùng
      cache.images = [...new Set(images)];
    }
    
    cache.lastFetch = Date.now();
    
    const random = cache.images[Math.floor(Math.random() * cache.images.length)];
    
    res.json({
      success: true,
      data: [random],
      count: cache.images.length
    });

  } catch (err) {
    console.error("Lỗi API /gai:", err.message);
    
    // Nếu lỗi, trả về ảnh mặc định từ cache cũ (nếu có)
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        success: true,
        data: [random],
        count: cache.images.length
      });
    }
    
    // Fallback cuối cùng
    res.json({
      success: true,
      data: ["https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg"],
      count: 1
    });
  }
});

// Endpoint có dấu - redirect thẳng ra ảnh (cho trình duyệt)
app.get("/gái", async (req, res) => {
  try {
    // Dùng cache nếu có
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.redirect(random);
    }
    
    // Nếu cache rỗng thì crawl mới
    const sources = [
      "https://www.pinterest.com/search/pins/?q=ph%E1%BB%A5%20n%E1%BB%AF%20xinh%20%C4%91%E1%BA%B9p",
      "https://www.pinterest.com/search/pins/?q=g%C3%A1i%20xinh%20vi%E1%BB%87t%20nam"
    ];
    
    const { data } = await axios.get(sources[Math.floor(Math.random() * sources.length)], {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    let images = [];
    
    $("img[src*='pinimg']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar")) {
        images.push(src);
      }
    });

    if (images.length === 0) {
      return res.redirect("https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg");
    }

    const random = images[Math.floor(Math.random() * images.length)];
    res.redirect(random);
    
  } catch (err) {
    console.error("Lỗi API /gái:", err.message);
    res.redirect("https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server đang chạy!");
  console.log("📌 Port:", PORT);
  console.log("📚 Docs: http://localhost:" + PORT);
  console.log("🖼️  API (có dấu): http://localhost:" + PORT + "/gái");
  console.log("📦 API (JSON): http://localhost:" + PORT + "/gai");
});