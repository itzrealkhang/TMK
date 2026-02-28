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
console.log(`🚀 TMK API v2.2.1 chạy trên: ${isRender ? 'Render' : 'Local'}`);

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
  downloads: {},
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
          version: "2.2.1"
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
          version: "2.2.1"
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
          version: "2.2.1"
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
        version: "2.2.1"
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
          version: "2.2.1" 
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
        version: "2.2.1"
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
        version: "2.2.1" 
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

// ==================== DOWNLOAD ENDPOINT (ĐÃ FIX) ====================

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
    const ytVersion = await checkYtDlp();
    console.log(`✅ yt-dlp version: ${ytVersion}`);

    // Tạo tên file ngẫu nhiên
    const fileId = crypto.randomBytes(8).toString('hex');
    const filename = `video_${fileId}.mp4`;
    outputPath = path.join(DOWNLOAD_DIR, filename);

    // ===== BƯỚC 1: LẤY THÔNG TIN VIDEO =====
    // Sử dụng format "best" để lấy thông tin từ format tốt nhất
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

    // ===== BƯỚC 2: TẢI VIDEO =====
    // Sử dụng format "best" - yt-dlp tự chọn format tốt nhất có sẵn
    // Không ép buộc mp4 hay độ phân giải cụ thể để tránh lỗi Facebook
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

    // Kiểm tra file đã tồn tại
    if (!fs.existsSync(outputPath)) {
      throw new Error('File không được tạo');
    }

    const stats = fs.statSync(outputPath);
    
    // Xác định nền tảng
    const urlObj = new URL(url);
    let platform = urlObj.hostname.replace('www.', '');
    if (platform.includes('youtube.com') || platform.includes('youtu.be')) platform = 'youtube';
    if (platform.includes('facebook.com') || platform.includes('fb.com')) platform = 'facebook';
    if (platform.includes('tiktok.com')) platform = 'tiktok';
    if (platform.includes('instagram.com')) platform = 'instagram';
    if (platform.includes('twitter.com') || platform.includes('x.com')) platform = 'twitter';

    // Trả về đầy đủ thông tin + link download
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
          expires_in: "30 phút"
        }
      },
      meta: {
        endpoint: "/download",
        timestamp: Date.now(),
        version: "2.2.1"
      }
    });

    // Lưu thông tin vào cache
    cache.downloads[filename] = {
      path: outputPath,
      info: info,
      expires: Date.now() + 30 * 60 * 1000
    };

  } catch (err) {
    console.error('❌ Lỗi chi tiết:', err.message);
    
    // Xóa file nếu có lỗi
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    // Phân tích lỗi để đưa ra thông báo phù hợp
    let errorMessage = err.message;
    let errorDetails = '';
    
    if (err.message.includes('Requested format is not available')) {
      errorMessage = 'Định dạng video không khả dụng. Vui lòng thử lại với URL khác.';
      errorDetails = 'Facebook thường có nhiều định dạng, thử lại lần nữa có thể thành công.';
    } else if (err.message.includes('Sign in to confirm') || err.message.includes('bot')) {
      errorMessage = 'YouTube yêu cầu xác thực chống bot.';
      errorDetails = 'Vui lòng thử với video TikTok hoặc nền tảng khác.';
    } else if (err.message.includes('Video unavailable')) {
      errorMessage = 'Video không khả dụng hoặc đã bị xóa.';
    } else if (err.message.includes('timed out')) {
      errorMessage = 'Quá thời gian xử lý. Video có thể quá dài hoặc server đang quá tải.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails || err.message,
      meta: {
        timestamp: Date.now(),
        version: "2.2.1"
      }
    });
  }
});

/**
 * Serve file đã download
 */
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

/**
 * Endpoint kiểm tra trạng thái yt-dlp
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
        version: "2.2.1"
      }
    });

  } catch (err) {
    res.json({
      success: false,
      error: 'yt-dlp chưa được cài đặt',
      solution: 'Vui lòng cài đặt: pip install yt-dlp',
      meta: {
        timestamp: Date.now(),
        version: "2.2.1"
      }
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
      version: "2.2.1",
      environment: isRender ? "render" : "local"
    },
    meta: { 
      timestamp: Date.now(), 
      version: "2.2.1" 
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    timestamp: Date.now(),
    version: "2.2.1",
    environment: isRender ? "render" : "local",
    endpoints: [
      "/girl", "/boy", "/cosplay", "/anime", "/gura", 
      "/vdgai", "/download", "/download/status", "/stats", "/health"
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║           TMK API v2.2.1                 ║
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
║  📥 Download Endpoint (Đã fix):           ║
║  └─ /download?url=...  → Tự động chọn    ║
║                     format tốt nhất      ║
╠══════════════════════════════════════════╣
║  ✅ Hỗ trợ: YouTube, Facebook, TikTok    ║
║  ⚡ Status: ✅ Running                     ║
║  🌐 Environment: ${isRender ? 'Render' : 'Local'}                   ║
╚══════════════════════════════════════════╝
  `);
});