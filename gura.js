// gura.js - Endpoint ảnh Gura từ Pinterest

const KEYWORDS_GURA = [
  "gawr gura",
  "gawr gura cute",
  "gura hololive",
  "hololive gura",
  "gawr gura art",
  "gura fanart",
  "gura shark",
  "gura cute",
  "gawr gura cosplay",
  "hololive en gura",
  "gawr gura wallpaper",
  "gura chibi",
  "gawr gura icon",
  "hololive en shark"
];

/**
 * Handler cho endpoint /gura
 */
async function handleGura(req, res, cache, searchFunction) {
  try {
    // Kiểm tra cache riêng cho gura
    if (!cache.gura) {
      cache.gura = { images: [], lastFetch: 0 };
    }
    
    const cacheData = cache.gura;
    const randomKeyword = KEYWORDS_GURA[Math.floor(Math.random() * KEYWORDS_GURA.length)];
    
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
          endpoint: "/gura",
          category: "image",
          source: "pinterest",
          character: "Gawr Gura",
          cached: true,
          total: cacheData.images.length,
          timestamp: Date.now(),
          version: "1.2.8"
        }
      });
    }

    // Cache miss - fetch từ Pinterest
    console.log(`🦈 Đang tìm ảnh Gura với keyword: ${randomKeyword}`);
    const images = await searchFunction(randomKeyword, 50);

    if (images.length > 0) {
      cacheData.images = images;
      cacheData.lastFetch = Date.now();
      const random = images[Math.floor(Math.random() * images.length)];
      
      return res.json({
        success: true,
        data: {
          url: random,
          id: Math.random().toString(36).substring(7),
          keyword: randomKeyword
        },
        meta: {
          endpoint: "/gura",
          category: "image",
          source: "pinterest",
          character: "Gawr Gura",
          cached: false,
          total: images.length,
          timestamp: Date.now(),
          version: "1.2.8"
        }
      });
    } else {
      // Fallback
      return res.json({
        success: true,
        data: {
          url: "https://i.imgur.com/8QqZqZq.jpg",
          id: "fallback",
          keyword: randomKeyword
        },
        meta: {
          endpoint: "/gura",
          category: "image",
          source: "fallback",
          character: "Gawr Gura",
          total: 1,
          timestamp: Date.now(),
          version: "1.2.8"
        }
      });
    }
  } catch (err) {
    console.error("Lỗi Gura:", err);
    return res.json({
      success: true,
      data: {
        url: "https://i.imgur.com/8QqZqZq.jpg",
        id: "error",
        keyword: "error"
      },
      meta: {
        endpoint: "/gura",
        category: "image",
        source: "error",
        timestamp: Date.now(),
        version: "1.2.8"
      }
    });
  }
}

module.exports = {
  handleGura,
  KEYWORDS_GURA
};