const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { exec } = require('child_process');
const crypto = require('crypto');
const multer = require('multer');
const os = require('os');

// Import handler Gura (giữ nguyên)
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
console.log(`🚀 TMK API v2.8.0 chạy trên: ${isRender ? 'Render' : 'Local'}`);

// ==================== CẤU HÌNH THƯ MỤC ====================
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
console.log(`📁 Thư mục uploads: ${UPLOAD_DIR}`);
console.log(`📁 Thư mục downloads: ${DOWNLOAD_DIR}`);

// Giới hạn dung lượng (Render free có 512MB, để an toàn dùng 400MB)
const MAX_DISK_USAGE = 400 * 1024 * 1024; // 400MB
const WARNING_THRESHOLD = 0.8; // 80%

// ==================== HÀM DỌN DẸP FILE ====================
function getFolderSize(folderPath) {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(folderPath);
    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    });
  } catch (err) { }
  return totalSize;
}

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
      console.log(`🧹 Đã xóa file cũ: ${oldest.file}`);
      return true;
    }
  } catch (err) { }
  return false;
}

function checkAndCleanDisk() {
  const totalSize = getFolderSize(UPLOAD_DIR);
  const usagePercent = totalSize / MAX_DISK_USAGE;
  if (usagePercent >= WARNING_THRESHOLD) {
    console.log(`⚠️ Dung lượng upload đạt ${(usagePercent * 100).toFixed(0)}%, bắt đầu dọn dẹp...`);
    let cleaned = 0;
    let currentSize = totalSize;
    while (currentSize > MAX_DISK_USAGE * 0.5) {
      if (!deleteOldestFile()) break;
      currentSize = getFolderSize(UPLOAD_DIR);
      cleaned++;
    }
    console.log(`✅ Đã dọn ${cleaned} file.`);
  }
}
setInterval(checkAndCleanDisk, 10 * 60 * 1000);
setTimeout(checkAndCleanDisk, 5000);

// Dọn dẹp file download cũ (1 giờ)
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
        if (now - stats.mtimeMs > oneHour) fs.unlink(filePath, () => {});
      });
    });
  });
}, 30 * 60 * 1000);

// ==================== CẤU HÌNH MULTER ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const totalSize = getFolderSize(UPLOAD_DIR);
    if (totalSize >= MAX_DISK_USAGE) return cb(new Error('Dung lượng đã đầy (400MB)'));
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 250 * 1024 * 1024 } });

// ==================== ĐỌC FILE VIDEO ====================
let videoUrls = [];
try {
  const videoData = fs.readFileSync(path.join(__dirname, "vdgai.json"), "utf8");
  videoUrls = JSON.parse(videoData);
  console.log(`✅ Đã load ${videoUrls.length} video`);
} catch (err) {
  console.error("❌ Lỗi đọc vdgai.json:", err.message);
}

// ==================== CACHE ====================
let cache = {
  girl: { images: [], lastFetch: 0 },
  boy: { images: [], lastFetch: 0 },
  cosplay: { images: [], lastFetch: 0 },
  anime: { images: [], lastFetch: 0 },
  gura: { images: [], lastFetch: 0 },
  vdgai: { videos: videoUrls, lastFetch: Date.now() },
  ttl: 30 * 60 * 1000,
  stats: { requests: 0, hits: 0 }
};

// ==================== KEYWORDS ====================
const KEYWORDS = {
  girl: ["gái xinh", "gái", "gái cute"],
  boy: ["boy", "trai đẹp", "trai 6 múi"],
  cosplay: ["cosplay", "cosplay girl", "anime cosplay"],
  anime: ["anime", "anime girl", "anime art", "manga", "waifu"]
};

app.use((req, res, next) => {
  cache.stats.requests++;
  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==================== HÀM PINTEREST (GIỮ NGUYÊN CẤU TRÚC) ====================
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
    const response = await axios({ method: "get", url: searchUrl, headers, params: { source_url: `/search/pins/?q=${encodedQuery}&rs=typed`, data: JSON.stringify(data), _: Date.now() }, timeout: 10000 });
    if (response.data?.resource_response?.data?.results) {
      return response.data.resource_response.data.results.filter(pin => pin?.images).map(pin => pin.images.orig?.url || pin.images["1200x"]?.url || pin.images["736x"]?.url || pin.images["474x"]?.url).filter(url => url);
    }
    return [];
  } catch (error) {
    console.error(`Lỗi Pinterest [${query}]:`, error.message);
    return [];
  }
}

// ==================== HANDLER ẢNH ====================
async function handleImageEndpoint(req, res, type, keywordList) {
  try {
    const cacheData = cache[type];
    const randomKeyword = keywordList[Math.floor(Math.random() * keywordList.length)];
    if (Date.now() - cacheData.lastFetch < cache.ttl && cacheData.images.length > 0) {
      cache.stats.hits++;
      const random = cacheData.images[Math.floor(Math.random() * cacheData.images.length)];
      return res.json({ success: true, data: { url: random, id: Math.random().toString(36).substring(7), keyword: randomKeyword }, meta: { endpoint: `/${type}`, cached: true, total: cacheData.images.length, version: "2.8.0" } });
    }
    const images = await searchPinterestImages(randomKeyword, 50);
    if (images.length > 0) {
      cacheData.images = images;
      cacheData.lastFetch = Date.now();
      const random = images[Math.floor(Math.random() * images.length)];
      return res.json({ success: true, data: { url: random, id: Math.random().toString(36).substring(7), keyword: randomKeyword }, meta: { endpoint: `/${type}`, cached: false, total: images.length, version: "2.8.0" } });
    }
    return res.json({ success: true, data: { url: "https://i.imgur.com/Y8Hp6mJ.jpg", id: "fallback", keyword: randomKeyword }, meta: { endpoint: `/${type}`, source: "fallback" } });
  } catch (err) {
    return res.json({ success: true, data: { url: "https://i.imgur.com/Y8Hp6mJ.jpg", id: "error" }, meta: { endpoint: `/${type}` } });
  }
}

// ==================== ENDPOINTS ẢNH ====================
app.get("/girl", (req, res) => handleImageEndpoint(req, res, "girl", KEYWORDS.girl));
app.get("/boy", (req, res) => handleImageEndpoint(req, res, "boy", KEYWORDS.boy));
app.get("/cosplay", (req, res) => handleImageEndpoint(req, res, "cosplay", KEYWORDS.cosplay));
app.get("/anime", (req, res) => handleImageEndpoint(req, res, "anime", KEYWORDS.anime));
app.get("/gura", (req, res) => handleGura(req, res, cache, searchPinterestImages));

// ==================== ENDPOINT VIDEO ====================
app.get("/vdgai", (req, res) => {
  if (cache.vdgai.videos.length === 0) return res.json({ success: false, error: "Không có video" });
  const randomVideo = cache.vdgai.videos[Math.floor(Math.random() * cache.vdgai.videos.length)];
  res.json({ success: true, data: { url: randomVideo, id: Math.random().toString(36).substring(7), title: "Video gái xinh" }, meta: { total: cache.vdgai.videos.length } });
});

// ==================== DOWNLOAD ENDPOINT DÙNG YT-DLP ====================
function checkYtDlp() {
  return new Promise((resolve, reject) => {
    exec('yt-dlp --version', (error, stdout) => {
      if (error) reject('yt-dlp chưa được cài đặt');
      else resolve(stdout.trim());
    });
  });
}

app.get("/download", async (req, res) => {
  let outputPath = null;
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'Thiếu URL video' });
    new URL(url);
    
    const ytVersion = await checkYtDlp();
    console.log(`✅ yt-dlp version: ${ytVersion}`);

    const fileId = crypto.randomBytes(8).toString('hex');
    const filename = `video_${fileId}.mp4`;
    outputPath = path.join(DOWNLOAD_DIR, filename);

    // Lấy thông tin video
    const infoCommand = `yt-dlp -j --no-playlist "${url}"`;
    const info = await new Promise((resolve, reject) => {
      exec(infoCommand, { timeout: 30000 }, (error, stdout) => {
        if (error) reject(error);
        else try { resolve(JSON.parse(stdout)); } catch(e) { reject(e); }
      });
    });

    // Tải video
    const downloadCommand = `yt-dlp -f "best" -o "${outputPath}" "${url}"`;
    await new Promise((resolve, reject) => {
      exec(downloadCommand, { timeout: 120000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (!fs.existsSync(outputPath)) throw new Error('File không được tạo');
    const stats = fs.statSync(outputPath);
    
    const urlObj = new URL(url);
    let platform = urlObj.hostname.replace('www.', '');
    if (platform.includes('youtube.com')) platform = 'youtube';
    if (platform.includes('facebook.com')) platform = 'facebook';
    if (platform.includes('tiktok.com')) platform = 'tiktok';

    res.json({
      success: true,
      data: {
        video: {
          title: info.title || 'Video',
          duration: info.duration || 0,
          uploader: info.uploader || 'Unknown',
          views: info.view_count || 0,
          platform: platform
        },
        download: {
          url: `${req.protocol}://${req.get("host")}/downloads/${filename}`,
          filename: filename,
          size_mb: (stats.size / 1024 / 1024).toFixed(2),
          expires_in: "1 giờ"
        }
      }
    });
  } catch (err) {
    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/downloads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(DOWNLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File không tồn tại' });
  res.download(filePath, filename);
});

app.get("/download/status", async (req, res) => {
  try {
    const version = await checkYtDlp();
    res.json({ success: true, data: { yt_dlp_version: version } });
  } catch (err) {
    res.json({ success: false, error: 'yt-dlp chưa được cài đặt' });
  }
});

// ==================== UPLOAD ENDPOINT ====================
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Không có file' });
  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  const totalSize = getFolderSize(UPLOAD_DIR);
  res.json({
    success: true,
    data: {
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size_mb: (req.file.size / 1024 / 1024).toFixed(2),
        url: fileUrl
      },
      storage: {
        used: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
        total: (MAX_DISK_USAGE / 1024 / 1024).toFixed(0) + ' MB'
      }
    }
  });
});
app.use("/uploads", express.static(UPLOAD_DIR));

// ==================== UTILITY ENDPOINTS ====================
app.get("/stats", (req, res) => {
  const uploadSize = getFolderSize(UPLOAD_DIR);
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
      uploads: { size_mb: (uploadSize / 1024 / 1024).toFixed(2) },
      uptime: process.uptime(),
      version: "2.8.0"
    }
  });
});

app.get("/health", (req, res) => res.json({ status: "operational", version: "2.8.0" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 TMK API v2.8.0 chạy trên port ${PORT}`));