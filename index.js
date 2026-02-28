const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { exec } = require('child_process');
const crypto = require('crypto');

// Import handler Gura (nếu có)
let handleGura = (req, res) => res.json({ success: false, message: "Gura module not loaded" });
try {
  const gura = require("./gura.js");
  handleGura = gura.handleGura;
  console.log("✅ Đã load module Gura");
} catch (err) {
  console.log("ℹ️ Không tìm thấy module Gura, bỏ qua");
}

// Khởi tạo app
const app = express();

// Middleware
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== KIỂM TRA MÔI TRƯỜNG ====================
const isRender = process.env.RENDER === "true" || process.env.RENDER === "1";
console.log(`🚀 TMK API v2.1.0 chạy trên: ${isRender ? 'Render' : 'Local'}`);

// ==================== CẤU HÌNH DOWNLOAD ====================

// Thư mục downloads
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`📁 Đã tạo thư mục downloads`);
}

// Dọn dẹp file cũ mỗi 30 phút
setInterval(() => {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  
  fs.readdir(DOWNLOAD_DIR, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        // Xóa file cũ hơn 30 phút
        if (now - stats.mtimeMs > thirtyMinutes) {
          fs.unlink(filePath, () => {
            console.log(`🧹 Đã xóa file cũ: ${file}`);
          });
        }
      });
    });
  });
}, 30 * 60 * 1000);

// ==================== ĐỌC FILE VIDEO ====================

let videoUrls = [];
try {
  const videoData = fs.readFileSync(path.join(__dirname, "vdgai.json"), "utf8");
  videoUrls = JSON.parse(videoData);
  console.log(`✅ Đã load ${videoUrls.length} video từ vdgai.json`);
} catch (err) {
  console.error("❌ Lỗi đọc file vdgai.json:", err.message);
  videoUrls = [];
}

// ==================== CACHE CHO API ====================

let cache = {
  girl: { images: [], lastFetch: 0 },
  boy: { images: [], lastFetch: 0 },
  cosplay: { images: [], lastFetch: 0 },
  anime: { images: [], lastFetch: 0 },
  gura: { images: [], lastFetch: 0 },
  vdgai: { videos: videoUrls, lastFetch: Date.now() },
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// ==================== KEYWORDS ====================

const KEYWORDS = {
  girl: ["gái xinh", "gái cute"],
  boy: ["bot", "trai", "trai đẹp", "trai 6 múi"],
  cosplay: ["cosplay", "cosplay girl", "anime cosplay", "game cosplay", "cosplay vietnam", "cosplay asian"],
  anime: ["anime", "anime girl", "anime boy", "cute anime", "anime art", "manga", "waifu"]
};

// Middleware thống kê
app.use((req, res, next) => {
  cache.stats.requests++;
  next();
});

// Trang docs
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==================== HÀM PINTEREST ====================

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

// ==================== HANDLER CHO ẢNH ====================

async function handleImageEndpoint(req, res, type, keywordList) {
  try {
    const cacheData = cache[type];
    const randomKeyword = keywordList[Math.floor(Math.random() * keywordList.length)];
    
    // Cache hit
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
          category: "image",
          source: "pinterest",
          cached: true,
          total: cacheData.images.length,
          timestamp: Date.now(),
          version: "2.1.0"
        }
      });
    }

    // Cache miss - fetch từ Pinterest
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
          category: "image",
          source: "pinterest",
          cached: false,
          total: images.length,
          timestamp: Date.now(),
          version: "2.1.0"
        }
      });
    } else {
      // Fallback
      const fallbackImages = {
        girl: "https://i.imgur.com/Y8Hp6mJ.jpg",
        boy: "https://i.imgur.com/7U6V4cK.jpg",
        cosplay: "https://i.imgur.com/8QqZqZq.jpg",
        anime: "https://i.imgur.com/8QqZqZq.jpg",
        gura: "https://i.imgur.com/8QqZqZq.jpg"
      };
      
      res.json({
        success: true,
        data: {
          url: fallbackImages[type] || "https://i.imgur.com/Y8Hp6mJ.jpg",
          id: "fallback",
          keyword: randomKeyword
        },
        meta: {
          endpoint: `/${type}`,
          category: "image",
          source: "fallback",
          total: 1,
          timestamp: Date.now(),
          version: "2.1.0"
        }
      });
    }
  } catch (err) {
    console.error(`Lỗi ${type}:`, err);
    res.json({
      success: true,
      data: {
        url: "https://i.imgur.com/Y8Hp6mJ.jpg",
        id: "error",
        keyword: "error"
      },
      meta: {
        endpoint: `/${type}`,
        category: "image",
        source: "error",
        timestamp: Date.now(),
        version: "2.1.0"
      }
    });
  }
}

// ==================== HANDLER CHO VIDEO ====================

app.get("/vdgai", (req, res) => {
  try {
    const videoCache = cache.vdgai;
    
    if (videoCache.videos.length === 0) {
      return res.json({
        success: false,
        error: "Không có video nào",
        meta: { 
          endpoint: "/vdgai", 
          timestamp: Date.now(), 
          version: "2.1.0" 
        }
      });
    }

    cache.stats.hits++;
    const randomVideo = videoCache.videos[Math.floor(Math.random() * videoCache.videos.length)];
    
    res.json({
      success: true,
      data: {
        url: randomVideo,
        id: Math.random().toString(36).substring(7),
        title: "Video gái xinh"
      },
      meta: {
        endpoint: "/vdgai",
        category: "video",
        source: "json",
        total: videoCache.videos.length,
        timestamp: Date.now(),
        version: "2.1.0"
      }
    });
  } catch (err) {
    console.error("Lỗi video:", err);
    res.json({
      success: false,
      error: err.message,
      meta: { 
        endpoint: "/vdgai", 
        timestamp: Date.now(), 
        version: "2.1.0" 
      }
    });
  }
});

// ==================== DOWNLOAD VIDEO ENDPOINTS ====================

/**
 * Kiểm tra yt-dlp đã được cài đặt chưa
 */
function checkYtDlp() {
  return new Promise((resolve, reject) => {
    exec('yt-dlp --version', (error, stdout) => {
      if (error) {
        reject('yt-dlp chưa được cài đặt');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Endpoint 1: Lấy link tải trực tiếp (không lưu trên server)
 * GET /download?url=VIDEO_URL
 */
app.get("/download", async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu URL video. Vui lòng thêm ?url=link_video'
      });
    }

    // Kiểm tra URL
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'URL không hợp lệ'
      });
    }

    // Kiểm tra yt-dlp
    const version = await checkYtDlp();
    console.log(`✅ yt-dlp version: ${version}`);

    // Lấy link tải trực tiếp
    const command = `yt-dlp -g -f "best[ext=mp4]" "${url}"`;
    
    exec(command, { timeout: 30000 }, (error, stdout) => {
      if (error) {
        return res.status(500).json({
          success: false,
          error: 'Không thể lấy link tải',
          details: error.message
        });
      }

      const directUrl = stdout.trim();
      
      res.json({
        success: true,
        data: {
          download_url: directUrl,
          title: "Video từ URL",
          note: "Copy link này và dùng trình duyệt để tải"
        },
        meta: {
          endpoint: "/download",
          timestamp: Date.now(),
          version: "2.1.0"
        }
      });
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Endpoint 2: Tải video về server và gửi về client
 * GET /download/file?url=VIDEO_URL
 */
app.get("/download/file", async (req, res) => {
  let outputPath = null;
  
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu URL video'
      });
    }

    // Kiểm tra URL
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'URL không hợp lệ'
      });
    }

    // Kiểm tra yt-dlp
    await checkYtDlp();

    // Tạo tên file ngẫu nhiên
    const fileId = crypto.randomBytes(8).toString('hex');
    const filename = `video_${fileId}.mp4`;
    outputPath = path.join(DOWNLOAD_DIR, filename);

    // Tải video chất lượng thấp để nhanh
    const command = `yt-dlp -f "worst[ext=mp4]" -o "${outputPath}" "${url}"`;
    
    console.log(`📥 Đang tải video: ${url}`);
    
    exec(command, { timeout: 120000 }, (error) => {
      if (error) {
        console.error('❌ Lỗi tải video:', error);
        if (outputPath && fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        return res.status(500).json({
          success: false,
          error: 'Tải video thất bại'
        });
      }

      // Kiểm tra file đã tồn tại
      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({
          success: false,
          error: 'File không được tạo'
        });
      }

      // Gửi file về client
      res.download(outputPath, filename, (err) => {
        if (err) {
          console.error('❌ Lỗi gửi file:', err);
        }
        
        // Xóa file sau 1 phút
        setTimeout(() => {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
            console.log(`🧹 Đã xóa file: ${filename}`);
          }
        }, 60000);
      });
    });

  } catch (err) {
    console.error('❌ Lỗi:', err);
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Endpoint 3: Thông tin video
 * GET /info?url=VIDEO_URL
 */
app.get("/info", async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu URL video'
      });
    }

    await checkYtDlp();

    const command = `yt-dlp -j --no-playlist "${url}"`;
    
    exec(command, { timeout: 30000 }, (error, stdout) => {
      if (error) {
        return res.status(500).json({
          success: false,
          error: 'Không thể lấy thông tin video'
        });
      }

      try {
        const info = JSON.parse(stdout);
        
        res.json({
          success: true,
          data: {
            title: info.title,
            duration: info.duration,
            uploader: info.uploader,
            views: info.view_count,
            thumbnail: info.thumbnail
          },
          meta: {
            endpoint: "/info",
            timestamp: Date.now(),
            version: "2.1.0"
          }
        });
      } catch (parseErr) {
        res.status(500).json({
          success: false,
          error: 'Lỗi parse thông tin video'
        });
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Endpoint 4: Kiểm tra trạng thái yt-dlp
 */
app.get("/download/status", async (req, res) => {
  try {
    const version = await checkYtDlp();
    
    // Đếm file trong thư mục downloads
    let files = [];
    try {
      files = fs.readdirSync(DOWNLOAD_DIR);
    } catch (err) {}

    res.json({
      success: true,
      data: {
        yt_dlp_version: version,
        download_dir: DOWNLOAD_DIR,
        files_count: files.length,
        files: files.slice(0, 10)
      },
      meta: {
        endpoint: "/download/status",
        timestamp: Date.now(),
        version: "2.1.0"
      }
    });

  } catch (err) {
    res.json({
      success: false,
      error: 'yt-dlp chưa được cài đặt',
      solution: 'Vui lòng cài đặt: pip install yt-dlp'
    });
  }
});

// ==================== ENDPOINTS CHÍNH ====================

// Image endpoints
app.get("/girl", (req, res) => handleImageEndpoint(req, res, "girl", KEYWORDS.girl));
app.get("/boy", (req, res) => handleImageEndpoint(req, res, "boy", KEYWORDS.boy));
app.get("/cosplay", (req, res) => handleImageEndpoint(req, res, "cosplay", KEYWORDS.cosplay));
app.get("/anime", (req, res) => handleImageEndpoint(req, res, "anime", KEYWORDS.anime));

// Endpoint GURA
app.get("/gura", (req, res) => handleGura(req, res, cache, searchPinterestImages));

// ==================== UTILITY ENDPOINTS ====================

app.get("/stats", (req, res) => {
  // Đếm file downloads
  let downloadCount = 0;
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR);
    downloadCount = files.length;
  } catch (err) {}

  res.json({
    success: true,
    data: {
      requests: cache.stats.requests,
      cacheHits: cache.stats.hits,
      cacheSize: {
        girl: cache.girl.images.length,
        boy: cache.boy.images.length,
        cosplay: cache.cosplay.images.length,
        anime: cache.anime.images.length,
        gura: cache.gura?.images.length || 0,
        vdgai: cache.vdgai.videos.length,
        downloads: downloadCount
      },
      uptime: process.uptime(),
      version: "2.1.0",
      environment: isRender ? "render" : "local"
    },
    meta: { 
      timestamp: Date.now(), 
      version: "2.1.0" 
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "2.1.0",
    environment: isRender ? "render" : "local",
    endpoints: [
      "/girl", "/boy", "/cosplay", "/anime", "/gura", 
      "/vdgai", "/download", "/download/file", "/info", "/download/status",
      "/stats", "/health"
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║           TMK API v2.1.0                 ║
║        Professional Image & Video        ║
╠══════════════════════════════════════════╣
║  📸 Image Endpoints:                      ║
║  ├─ /girl     → Beautiful girls          ║
║  ├─ /boy      → Handsome boys            ║
║  ├─ /cosplay  → Cosplay characters       ║
║  ├─ /anime    → Anime & manga            ║
║  └─ /gura     🦈 Gawr Gura images        ║
╠══════════════════════════════════════════╣
║  🎬 Video Endpoints:                      ║
║  └─ /vdgai    → Video collection         ║
╠══════════════════════════════════════════╣
║  📥 Download Endpoints:                   ║
║  ├─ /download?url=...  → Get direct link ║
║  ├─ /download/file?url=... → Download    ║
║  ├─ /info?url=...      → Video info      ║
║  └─ /download/status   → yt-dlp status   ║
╠══════════════════════════════════════════╣
║  ⚡ Status: ✅ Running                     ║
║  🌐 Environment: ${isRender ? 'Render' : 'Local'}                   ║
╚══════════════════════════════════════════╝
  `);
});