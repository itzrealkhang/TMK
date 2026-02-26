const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

// Serve static files (bao gồm cả font)
app.use(express.static(__dirname));

// Route đặc biệt cho font (nếu cần)
app.use('/font', express.static(path.join(__dirname, 'font')));

// Trang docs chính
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API gái có dấu - vào thẳng là ra ảnh
app.get("/gái", async (req, res) => {
  try {
    const sources = [
      "https://www.pinterest.com/search/pins/?q=ph%E1%BB%A5%20n%E1%BB%AF%20xinh%20%C4%91%E1%BA%B9p",
      "https://www.pinterest.com/search/pins/?q=g%C3%A1i%20xinh%20vi%E1%BB%87t%20nam",
      "https://www.pinterest.com/search/pins/?q=hot%20girl%20ch%C3%A2u%20%C3%A1"
    ];
    
    const randomSource = sources[Math.floor(Math.random() * sources.length)];
    
    const { data } = await axios.get(randomSource, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    let images = [];
    
    $("img[src*='pinimg.com'], img[src*='i.pinimg.com']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar")) {
        const highQuality = src.replace(/\/\d+x\d+\//, "/originals/");
        images.push(highQuality);
      }
    });

    if (images.length === 0) {
      return res.redirect("https://i.pinimg.com/736x/8b/4a/9c/8b4a9c1b2e3f4a5b6c7d8e9f0a1b2c3d.jpg");
    }

    const uniqueImages = [...new Set(images)];
    const randomImage = uniqueImages[Math.floor(Math.random() * uniqueImages.length)];
    
    res.redirect(randomImage);
    
  } catch (err) {
    console.error("Lỗi:", err.message);
    res.redirect("https://i.pinimg.com/736x/ae/9a/72/ae9a72c1db1e8e4e2c8b4c7d9e4a5b6c.jpg");
  }
});

// API không dấu - trả JSON
app.get("/gai", async (req, res) => {
  try {
    const sources = [
      "https://www.pinterest.com/search/pins/?q=ph%E1%BB%A5%20n%E1%BB%AF%20xinh%20%C4%91%E1%BA%B9p",
      "https://www.pinterest.com/search/pins/?q=g%C3%A1i%20xinh%20vi%E1%BB%87t%20nam"
    ];
    
    const { data } = await axios.get(sources[Math.floor(Math.random() * sources.length)], {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(data);
    let images = [];
    
    $("img[src*='pinimg']").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("avatar")) {
        images.push(src.replace(/\/\d+x\d+\//, "/originals/"));
      }
    });

    if (images.length === 0) {
      return res.json({ 
        status: false, 
        message: "Không tìm thấy ảnh"
      });
    }

    const uniqueImages = [...new Set(images)];
    const random = uniqueImages[Math.floor(Math.random() * uniqueImages.length)];
    
    res.json({
      status: true,
      endpoint: "/gai",
      image: random,
      total_images: uniqueImages.length,
      timestamp: Date.now()
    });

  } catch (err) {
    res.status(500).json({ 
      status: false, 
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy trên port ${PORT}`);
});