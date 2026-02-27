const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cron = require("node-cron");

const app = express();

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CẤU HÌNH ====================

// Thư mục cache
const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log("✅ Đã tạo thư mục cache");
}

// Thư mục uploads (trong cache)
const UPLOAD_DIR = path.join(CACHE_DIR, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log("✅ Đã tạo thư mục uploads");
}

// Cấu hình multer cho upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Tạo tên file: timestamp-random.extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// Filter file - chỉ cho phép video và ảnh
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WEBP) và video (MP4, WEBM, OGG)'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // Giới hạn 100MB
});

// ==================== CACHE CLEANUP ====================

// Hàm xóa file cũ hơn 30 ngày
function cleanOldFiles() {
  console.log("🧹 Đang dọn dẹp cache...");
  const now = Date.now();
  const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      console.error("Lỗi đọc thư mục uploads:", err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(UPLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Lỗi kiểm tra file ${file}:`, err);
          return;
        }

        const fileAge = now - stats.mtimeMs;
        if (fileAge > thirtyDaysInMs) {
          fs.unlink(filePath, err => {
            if (err) {
              console.error(`Lỗi xóa file ${file}:`, err);
            } else {
              console.log(`✅ Đã xóa file cũ: ${file}`);
            }
          });
        }
      });
    });
  });
}

// Chạy dọn dẹp mỗi ngày lúc 3h sáng
cron.schedule('0 3 * * *', () => {
  cleanOldFiles();
});

// Chạy dọn dẹp lần đầu khi khởi động
setTimeout(cleanOldFiles, 5000);

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
  vdgai: { videos: videoUrls, lastFetch: Date.now() },
  uploaded: { files: [], lastFetch: Date.now() }, // Cache cho file upload
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// ==================== KEYWORDS ====================

const KEYWORDS = {
  girl: ["girl", "beautiful girl", "cute girl", "asian girl", "model girl", "pretty woman"],
  boy: ["boy", "handsome boy", "cute boy", "asian boy", "model boy", "handsome man"],
  cosplay: ["cosplay", "cosplay girl", "anime cosplay", "game cosplay", "cosplay vietnam", "cosplay asian"],
  anime: ["anime", "anime girl", "anime boy", "cute anime", "anime art", "manga", "waifu"]
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
          version: "16.0.0"
        }
      });
    }

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
          version: "16.0.0"
        }
      });
    } else {
      const fallbackImages = {
        girl: "https://i.imgur.com/Y8Hp6mJ.jpg",
        boy: "https://i.imgur.com/7U6V4cK.jpg",
        cosplay: "https://i.imgur.com/8QqZqZq.jpg",
        anime: "https://i.imgur.com/8QqZqZq.jpg"
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
          timestamp: Date.now()
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
        timestamp: Date.now()
      }
    });
  }
}

// ==================== HANDLER CHO VIDEO ====================

function handleVideoEndpoint(req, res) {
  try {
    const videoCache = cache.vdgai;
    
    if (videoCache.videos.length === 0) {
      return res.json({
        success: false,
        error: "Không có video nào",
        meta: { endpoint: "/vdgai", timestamp: Date.now() }
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
        version: "16.0.0"
      }
    });
  } catch (err) {
    console.error("Lỗi video:", err);
    res.json({
      success: false,
      error: err.message,
      meta: { endpoint: "/vdgai", timestamp: Date.now() }
    });
  }
}

// ==================== ENDPOINTS CHÍNH ====================

// Image endpoints
app.get("/girl", (req, res) => handleImageEndpoint(req, res, "girl", KEYWORDS.girl));
app.get("/boy", (req, res) => handleImageEndpoint(req, res, "boy", KEYWORDS.boy));
app.get("/cosplay", (req, res) => handleImageEndpoint(req, res, "cosplay", KEYWORDS.cosplay));
app.get("/anime", (req, res) => handleImageEndpoint(req, res, "anime", KEYWORDS.anime));

// Video endpoints
app.get("/vdgai", handleVideoEndpoint);
app.get("/vdgai/redirect", (req, res) => {
  if (cache.vdgai.videos.length > 0) {
    const randomVideo = cache.vdgai.videos[Math.floor(Math.random() * cache.vdgai.videos.length)];
    return res.redirect(randomVideo);
  }
  res.redirect("https://i.imgur.com/Y8Hp6mJ.jpg");
});
app.get("/vdgai/list", (req, res) => {
  res.json({
    success: true,
    data: cache.vdgai.videos.slice(0, 20),
    total: cache.vdgai.videos.length,
    meta: { endpoint: "/vdgai/list", timestamp: Date.now() }
  });
});

// ==================== UPLOAD ENDPOINTS ====================

// Endpoint upload file
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Không có file nào được upload"
      });
    }

    // Tạo URL cho file đã upload
    const fileUrl = `${req.protocol}://${req.get("host")}/cache/uploads/${req.file.filename}`;
    
    // Thêm vào cache
    cache.uploaded.files.push({
      filename: req.file.filename,
      originalname: req.file.originalname,
      url: fileUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: Date.now()
    });

    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      meta: {
        endpoint: "/upload",
        expiresIn: "30 days",
        timestamp: Date.now()
      }
    });

  } catch (err) {
    console.error("Lỗi upload:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Endpoint upload nhiều file
app.post("/upload/multiple", upload.array("files", 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Không có file nào được upload"
      });
    }

    const uploadedFiles = req.files.map(file => {
      const fileUrl = `${req.protocol}://${req.get("host")}/cache/uploads/${file.filename}`;
      
      // Thêm vào cache
      cache.uploaded.files.push({
        filename: file.filename,
        originalname: file.originalname,
        url: fileUrl,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: Date.now()
      });

      return {
        url: fileUrl,
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      };
    });

    res.json({
      success: true,
      data: uploadedFiles,
      meta: {
        endpoint: "/upload/multiple",
        count: uploadedFiles.length,
        expiresIn: "30 days",
        timestamp: Date.now()
      }
    });

  } catch (err) {
    console.error("Lỗi upload nhiều file:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Endpoint lấy danh sách file đã upload
app.get("/upload/list", (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "Không thể đọc thư mục uploads"
      });
    }

    // Lấy thông tin chi tiết từng file
    const fileDetails = files.map(filename => {
      const filePath = path.join(UPLOAD_DIR, filename);
      const stats = fs.statSync(filePath);
      return {
        filename: filename,
        url: `${req.protocol}://${req.get("host")}/cache/uploads/${filename}`,
        size: stats.size,
        created: stats.birthtime,
        expiresIn: Math.max(0, 30 - Math.floor((Date.now() - stats.birthtimeMs) / (24 * 60 * 60 * 1000))) + " days"
      };
    });

    res.json({
      success: true,
      data: fileDetails,
      total: fileDetails.length,
      meta: {
        endpoint: "/upload/list",
        timestamp: Date.now()
      }
    });
  });
});

// Endpoint xóa file
app.delete("/upload/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_DIR, filename);

  // Kiểm tra file có tồn tại không
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: "File không tồn tại"
    });
  }

  // Xóa file
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "Không thể xóa file"
      });
    }

    res.json({
      success: true,
      message: `Đã xóa file ${filename}`,
      meta: { timestamp: Date.now() }
    });
  });
});

// Serve file từ thư mục cache
app.use("/cache", express.static(CACHE_DIR));

// ==================== UTILITY ENDPOINTS ====================

app.get("/stats", (req, res) => {
  // Đếm số file trong thư mục uploads
  let uploadCount = 0;
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    uploadCount = files.length;
  } catch (err) {
    console.error("Lỗi đọc thư mục uploads:", err);
  }

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
        vdgai: cache.vdgai.videos.length,
        uploaded: uploadCount
      },
      uptime: process.uptime(),
      version: "16.0.0"
    },
    meta: { timestamp: Date.now() }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "16.0.0",
    endpoints: [
      "/girl", "/boy", "/cosplay", "/anime",
      "/vdgai", "/vdgai/redirect", "/vdgai/list",
      "/upload", "/upload/multiple", "/upload/list",
      "/stats", "/health"
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║        TMK API v16.0                     ║
╠══════════════════════════════════════════╣
║  📸 Image Endpoints:                      ║
║  ├─ /girl     → Girl images               ║
║  ├─ /boy      → Boy images                ║
║  ├─ /cosplay  → Cosplay images            ║
║  └─ /anime    → Anime images              ║
╠══════════════════════════════════════════╣
║  🎬 Video Endpoints:                      ║
║  ├─ /vdgai         → Random video         ║
║  ├─ /vdgai/redirect→ Direct video         ║
║  └─ /vdgai/list    → Video list           ║
╠══════════════════════════════════════════╣
║  📤 Upload Endpoints:                     ║
║  ├─ /upload           → Upload single file║
║  ├─ /upload/multiple  → Upload multiple   ║
║  ├─ /upload/list      → List uploaded     ║
║  └─ /upload/:filename → Delete file       ║
╠══════════════════════════════════════════╣
║  📦 Cache: ${CACHE_DIR}                    ║
║  ⏰ Auto-clean: Every 30 days             ║
║  ⚡ Status: ✅ Running                      ║
╚══════════════════════════════════════════╝
  `);
});