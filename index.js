const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { exec } = require('child_process');
const crypto = require('crypto');
const multer = require('multer');
const os = require('os');
const v8 = require('v8');

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
const isPxxl = process.env.PXXL === "true" || process.env.PXXL === "1";
console.log(`🚀 TMK API v2.6.0 chạy trên: ${isPxxl ? 'Pxxl' : 'Local'}`);

// ==================== CẤU HÌNH UPLOAD ====================

// Thư mục uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Đã tạo thư mục uploads`);
}

// Giới hạn dung lượng (mặc định 1GB, Pxxl có thể cao hơn)
const MAX_DISK_USAGE = 1024 * 1024 * 1024; // 1GB
const WARNING_THRESHOLD = 0.8; // 80%

// ==================== HÀM KIỂM TRA DUNG LƯỢNG ====================

/**
 * Tính tổng dung lượng thư mục
 */
function getFolderSize(folderPath) {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(folderPath);
    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    });
  } catch (err) {
    console.error('Lỗi tính dung lượng:', err);
  }
  return totalSize;
}

/**
 * Xóa file cũ nhất
 */
function deleteOldestFile() {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .map(file => {
        const filePath = path.join(UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        return { file, filePath, mtime: stats.mtimeMs, size: stats.size };
      })
      .sort((a, b) => a.mtime - b.mtime);

    if (files.length > 0) {
      const oldest = files[0];
      fs.unlinkSync(oldest.filePath);
      console.log(`🧹 Đã xóa file cũ: ${oldest.file} (${(oldest.size / 1024 / 1024).toFixed(2)} MB)`);
      return true;
    }
  } catch (err) {
    console.error('Lỗi xóa file cũ:', err);
  }
  return false;
}

/**
 * Kiểm tra và dọn dẹp nếu gần đầy
 */
function checkAndCleanDisk() {
  const totalSize = getFolderSize(UPLOAD_DIR);
  const usagePercent = totalSize / MAX_DISK_USAGE;
  
  console.log(`📊 Uploads: ${(totalSize / 1024 / 1024).toFixed(2)}MB / 1GB (${Math.round(usagePercent * 100)}%)`);
  
  if (usagePercent >= WARNING_THRESHOLD) {
    console.log(`⚠️ Dung lượng gần đầy, tự động dọn dẹp...`);
    
    let cleaned = 0;
    let currentSize = totalSize;
    
    while (currentSize > MAX_DISK_USAGE * 0.5) {
      if (!deleteOldestFile()) break;
      currentSize = getFolderSize(UPLOAD_DIR);
      cleaned++;
    }
    
    console.log(`✅ Đã dọn ${cleaned} file. Còn: ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
  }
}

// Chạy kiểm tra mỗi 10 phút
setInterval(checkAndCleanDisk, 10 * 60 * 1000);
setTimeout(checkAndCleanDisk, 5000);

// ==================== CẤU HÌNH MULTER ====================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const totalSize = getFolderSize(UPLOAD_DIR);
    if (totalSize >= MAX_DISK_USAGE) {
      return cb(new Error('Dung lượng upload đã đầy (1GB)'));
    }
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// Hỗ trợ tất cả các loại file
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 250 * 1024 * 1024 // 250MB
  }
});

// ==================== CẤU HÌNH DOWNLOAD ====================

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`📁 Đã tạo thư mục downloads`);
}

// Dọn dẹp file download cũ
setInterval(() => {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  fs.readdir(DOWNLOAD_DIR, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > oneHour) {
          fs.unlink(filePath, () => {});
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
  downloads: {},
  ttl: 30 * 60 * 1000, // 30 phút
  stats: {
    requests: 0,
    hits: 0
  }
};

// ==================== KEYWORDS ====================

const KEYWORDS = {
  girl: ["gái xinh", "gái", "gái cute"],
  boy: ["boy", "trai đẹp", "trai 6 múi"],
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
          version: "2.6.0"
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
          version: "2.6.0"
        }
      });
    } else {
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
          version: "2.6.0"
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
        version: "2.6.0"
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
          version: "2.6.0" 
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
        version: "2.6.0"
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
        version: "2.6.0" 
      }
    });
  }
});

// ==================== KIỂM TRA YT-DLP ====================

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

// ==================== DOWNLOAD ENDPOINT ====================

app.get("/download", async (req, res) => {
  let outputPath = null;
  
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu URL video. Vui lòng thêm ?url=link_video'
      });
    }

    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'URL không hợp lệ'
      });
    }

    const ytVersion = await checkYtDlp();
    console.log(`✅ yt-dlp version: ${ytVersion}`);

    const fileId = crypto.randomBytes(8).toString('hex');
    const filename = `video_${fileId}.mp4`;
    outputPath = path.join(DOWNLOAD_DIR, filename);

    const infoCommand = `yt-dlp -f "best" -j --no-playlist "${url}"`;
    
    console.log(`📋 Đang lấy thông tin video từ: ${new URL(url).hostname}`);
    
    const info = await new Promise((resolve, reject) => {
      exec(infoCommand, { timeout: 30000 }, (error, stdout) => {
        if (error) {
          console.error('Info command error:', error.message);
          reject(error);
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(e);
          }
        }
      });
    });

    console.log(`📥 Đang tải video: ${info.title}`);
    
    const downloadCommand = `yt-dlp -f "best" -o "${outputPath}" "${url}"`;
    
    await new Promise((resolve, reject) => {
      exec(downloadCommand, { timeout: 120000 }, (error) => {
        if (error) {
          console.error('Download command error:', error.message);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('File không được tạo');
    }

    const stats = fs.statSync(outputPath);
    
    const urlObj = new URL(url);
    let platform = urlObj.hostname.replace('www.', '');
    if (platform.includes('youtube.com') || platform.includes('youtu.be')) platform = 'youtube';
    if (platform.includes('facebook.com') || platform.includes('fb.com')) platform = 'facebook';
    if (platform.includes('tiktok.com')) platform = 'tiktok';
    if (platform.includes('instagram.com')) platform = 'instagram';
    if (platform.includes('twitter.com') || platform.includes('x.com')) platform = 'twitter';

    res.json({
      success: true,
      data: {
        video: {
          title: info.title || 'Không có tiêu đề',
          duration: info.duration || 0,
          uploader: info.uploader || info.uploader_id || 'Không rõ',
          views: info.view_count || 0,
          thumbnail: info.thumbnail || '',
          description: info.description ? (info.description.substring(0, 200) + (info.description.length > 200 ? '...' : '')) : '',
          platform: platform
        },
        download: {
          url: `${req.protocol}://${req.get("host")}/downloads/${filename}`,
          filename: filename,
          size: stats.size,
          size_mb: (stats.size / 1024 / 1024).toFixed(2),
          expires_in: "1 giờ"
        }
      },
      meta: {
        endpoint: "/download",
        timestamp: Date.now(),
        version: "2.6.0"
      }
    });

    cache.downloads[filename] = {
      path: outputPath,
      info: info,
      expires: Date.now() + 60 * 60 * 1000
    };

  } catch (err) {
    console.error('❌ Lỗi chi tiết:', err.message);
    
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    let errorMessage = err.message;
    let errorDetails = '';
    
    if (err.message.includes('Requested format is not available')) {
      errorMessage = 'Định dạng video không khả dụng.';
    } else if (err.message.includes('Sign in to confirm') || err.message.includes('bot')) {
      errorMessage = 'YouTube yêu cầu xác thực.';
    } else if (err.message.includes('Video unavailable')) {
      errorMessage = 'Video không khả dụng.';
    } else if (err.message.includes('timed out')) {
      errorMessage = 'Quá thời gian xử lý.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails || err.message,
      meta: {
        timestamp: Date.now(),
        version: "2.6.0"
      }
    });
  }
});

app.get("/downloads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(DOWNLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'File không tồn tại hoặc đã hết hạn'
    });
  }

  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('❌ Lỗi gửi file:', err);
    }
  });
});

app.get("/download/status", async (req, res) => {
  try {
    const version = await checkYtDlp();
    
    let files = [];
    try {
      files = fs.readdirSync(DOWNLOAD_DIR);
    } catch (err) {}

    res.json({
      success: true,
      data: {
        yt_dlp_version: version,
        files_count: files.length
      },
      meta: {
        endpoint: "/download/status",
        timestamp: Date.now(),
        version: "2.6.0"
      }
    });

  } catch (err) {
    res.json({
      success: false,
      error: 'yt-dlp chưa được cài đặt',
      meta: {
        timestamp: Date.now(),
        version: "2.6.0"
      }
    });
  }
});

// ==================== UPLOAD ENDPOINT ====================

app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Không có file nào được upload'
      });
    }

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    
    const totalSize = getFolderSize(UPLOAD_DIR);
    const usagePercent = (totalSize / MAX_DISK_USAGE * 100).toFixed(1);

    res.json({
      success: true,
      data: {
        file: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          size: req.file.size,
          size_mb: (req.file.size / 1024 / 1024).toFixed(2),
          mimetype: req.file.mimetype,
          url: fileUrl,
          uploaded_at: new Date().toISOString()
        },
        storage: {
          used: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
          total: (MAX_DISK_USAGE / 1024 / 1024).toFixed(0) + ' MB',
          usage_percent: usagePercent + '%'
        }
      },
      meta: {
        endpoint: "/upload",
        timestamp: Date.now(),
        version: "2.6.0",
        platform: isPxxl ? "pxxl" : "local"
      }
    });

    checkAndCleanDisk();

  } catch (err) {
    console.error('Lỗi upload:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      meta: {
        timestamp: Date.now(),
        version: "2.6.0"
      }
    });
  }
});

app.use("/uploads", express.static(UPLOAD_DIR));

// ==================== SYSTEM INFO ENDPOINT ====================

app.get("/system-info", async (req, res) => {
  try {
    // Thử lấy thông tin disk
    let diskInfo = { total: 0, free: 0, used: 0 };
    try {
      const { check } = require('diskusage');
      const disk = await check('/');
      diskInfo = {
        total: disk.total,
        free: disk.free,
        used: disk.total - disk.free
      };
    } catch (diskErr) {
      console.log('Không thể lấy thông tin disk, dùng ước lượng');
      // Ước lượng từ thư mục hiện tại
      const uploadSize = getFolderSize(UPLOAD_DIR);
      const downloadSize = getFolderSize(DOWNLOAD_DIR);
      const totalUsed = uploadSize + downloadSize + 100 * 1024 * 1024; // +100MB cho code
      diskInfo = {
        total: MAX_DISK_USAGE * 2, // Giả sử gấp đôi giới hạn upload
        free: MAX_DISK_USAGE * 2 - totalUsed,
        used: totalUsed
      };
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const cpus = os.cpus();
    
    res.json({
      success: true,
      data: {
        memory: {
          total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          usagePercent: `${((usedMem / totalMem) * 100).toFixed(1)}%`
        },
        cpu: {
          model: cpus[0]?.model || 'Unknown',
          cores: cpus.length,
          speed: cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'Unknown'
        },
        disk: {
          total: `${(diskInfo.total / 1024 / 1024 / 1024).toFixed(2)} GB`,
          free: `${(diskInfo.free / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${(diskInfo.used / 1024 / 1024 / 1024).toFixed(2)} GB`,
          usagePercent: `${((diskInfo.used / diskInfo.total) * 100).toFixed(1)}%`
        },
        nodeVersion: process.version,
        platform: os.platform(),
        uptime: `${Math.floor(process.uptime() / 3600)} hours ${Math.floor((process.uptime() % 3600) / 60)} minutes`,
        uploadStats: {
          files: fs.readdirSync(UPLOAD_DIR).length,
          used: `${(getFolderSize(UPLOAD_DIR) / 1024 / 1024).toFixed(2)} MB`
        },
        downloadStats: {
          files: fs.readdirSync(DOWNLOAD_DIR).length,
          used: `${(getFolderSize(DOWNLOAD_DIR) / 1024 / 1024).toFixed(2)} MB`
        }
      },
      meta: {
        endpoint: "/system-info",
        timestamp: Date.now(),
        version: "2.6.0",
        environment: isPxxl ? "pxxl" : "local"
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      meta: {
        timestamp: Date.now(),
        version: "2.6.0"
      }
    });
  }
});

// ==================== ENDPOINTS CHÍNH ====================

app.get("/girl", (req, res) => handleImageEndpoint(req, res, "girl", KEYWORDS.girl));
app.get("/boy", (req, res) => handleImageEndpoint(req, res, "boy", KEYWORDS.boy));
app.get("/cosplay", (req, res) => handleImageEndpoint(req, res, "cosplay", KEYWORDS.cosplay));
app.get("/anime", (req, res) => handleImageEndpoint(req, res, "anime", KEYWORDS.anime));
app.get("/gura", (req, res) => handleGura(req, res, cache, searchPinterestImages));

// ==================== UTILITY ENDPOINTS ====================

app.get("/stats", (req, res) => {
  const uploadSize = getFolderSize(UPLOAD_DIR);
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
        vdgai: cache.vdgai.videos.length
      },
      uploads: {
        count: fs.readdirSync(UPLOAD_DIR).length,
        size_mb: (uploadSize / 1024 / 1024).toFixed(2),
        limit_mb: (MAX_DISK_USAGE / 1024 / 1024).toFixed(0),
        usage_percent: (uploadSize / MAX_DISK_USAGE * 100).toFixed(1) + '%'
      },
      downloads: {
        count: downloadCount
      },
      uptime: process.uptime(),
      version: "2.6.0",
      environment: isPxxl ? "pxxl" : "local"
    },
    meta: { 
      timestamp: Date.now(), 
      version: "2.6.0" 
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "2.6.0",
    environment: isPxxl ? "pxxl" : "local",
    endpoints: [
      "/girl", "/boy", "/cosplay", "/anime", "/gura", 
      "/vdgai", "/upload", "/download", "/system-info",
      "/stats", "/health"
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║           TMK API v2.6.0                 ║
║        Professional Image & Video        ║
╠══════════════════════════════════════════╣
║  📸 Images: /girl, /boy, /cosplay, /anime, /gura  ║
║  🎬 Videos: /vdgai                                ║
║  📥 Download: /download?url=...                   ║
║  📤 Upload: /upload (max 250MB)                   ║
║  📊 System Info: /system-info                      ║
╠══════════════════════════════════════════╣
║  🚀 Deployed on: ${isPxxl ? 'Pxxl' : 'Local'}                     ║
║  ⚡ Status: ✅ Running                               ║
╚══════════════════════════════════════════╝
  `);
});