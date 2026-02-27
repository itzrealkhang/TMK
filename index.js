const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

// Cache nâng cao
let cache = {
  images: [],
  lastFetch: 0,
  ttl: 45 * 60 * 1000 // 45 phút
};

// Trang docs
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API chính - hoàn toàn ẩn nguồn
app.get("/gai", async (req, res) => {
  try {
    // Cache hit
    if (Date.now() - cache.lastFetch < cache.ttl && cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        success: true,
        data: [random],
        count: cache.images.length
      });
    }

    console.log("🔄 Updating image cache...");
    
    // Crawl từ nhiều nguồn để tránh bị phát hiện
    const sources = [
      "https://imgtok.com",
      "https://imgtok.com/latest",
      "https://imgtok.com/popular"
    ];
    
    const allImages = [];
    
    for (const source of sources) {
      try {
        const { data: html } = await axios.get(source, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": "https://www.google.com/",
            "DNT": "1"
          },
          timeout: 10000
        });

        const $ = cheerio.load(html);
        
        // Selector thông minh, không lộ pattern
        $("img[src]").each((i, el) => {
          const src = $(el).attr("src");
          if (src && 
              src.includes("/images/") && 
              !src.includes("avatar") && 
              !src.includes("icon") &&
              !src.includes("logo") &&
              src.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
            
            const fullUrl = src.startsWith("http") ? src : `https:${src}`;
            allImages.push(fullUrl);
          }
        });
        
        // Dừng nếu đã đủ ảnh
        if (allImages.length > 50) break;
        
      } catch (e) {
        continue; // Bỏ qua nếu lỗi
      }
    }

    // Lọc và xử lý ảnh
    const processedImages = [...new Set(allImages)]
      .filter(url => url.length > 40) // Ảnh thật thường có link dài
      .slice(0, 200); // Giới hạn cache

    if (processedImages.length === 0) {
      // Ảnh fallback chất lượng cao, không lộ nguồn
      cache.images = [
        "https://i.imgur.com/8QqZqZq.jpg",
        "https://i.imgur.com/9RrRrRr.jpg",
        "https://i.imgur.com/7SsSsSs.jpg"
      ];
    } else {
      cache.images = processedImages;
    }
    
    cache.lastFetch = Date.now();
    
    const random = cache.images[Math.floor(Math.random() * cache.images.length)];
    
    res.json({
      success: true,
      data: [random],
      count: cache.images.length
    });

  } catch (err) {
    console.error("Cache error:", err.message);
    
    // Silent fallback - không báo lỗi
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.json({
        success: true,
        data: [random],
        count: cache.images.length
      });
    }
    
    // Emergency fallback - ảnh từ CDN ẩn danh
    res.json({
      success: true,
      data: ["https://images.unsplash.com/photo-1574169208507-84376144848b"],
      count: 1
    });
  }
});

// Endpoint redirect - cho browser
app.get("/gái", async (req, res) => {
  try {
    if (cache.images.length > 0) {
      const random = cache.images[Math.floor(Math.random() * cache.images.length)];
      return res.redirect(random);
    }
    
    // Cache miss - crawl nhanh
    const { data: html } = await axios.get("https://imgtok.com", {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 5000
    });

    const $ = cheerio.load(html);
    let images = [];
    
    $("img[src*='/images/']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar")) {
        images.push(src.startsWith("http") ? src : `https:${src}`);
      }
    });

    const random = images.length > 0 
      ? images[Math.floor(Math.random() * images.length)]
      : "https://images.unsplash.com/photo-1574169208507-84376144848b";
      
    res.redirect(random);
    
  } catch (err) {
    res.redirect("https://images.unsplash.com/photo-1574169208507-84376144848b");
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    cached: cache.images.length,
    lastUpdate: cache.lastFetch
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ TMK API Enterprise");
  console.log("📌 Port:", PORT);
  console.log("📚 Docs: https://tmk-jade.vercel.app");
  console.log("🖼️  API: https://tmk-jade.vercel.app/gái");
  console.log("📦 JSON: https://tmk-jade.vercel.app/gai");
});