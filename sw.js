var CACHE_NAME = 'iceland-trip-v1';

var PRECACHE_URLS = [
  '/Iceland/',
  '/Iceland/index.html',
  '/Iceland/map.html',
  '/Iceland/itinerary.html',
  '/Iceland/cheatsheet.html',
  '/Iceland/phrases.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
];

var TILE_HOSTS = [
  'services.arcgisonline.com',
  'server.arcgisonline.com'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_URLS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Precache failed for ' + url + ':', err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Cache-first for ArcGIS map tiles (large, rarely change)
  var isTile = TILE_HOSTS.some(function(h) { return url.hostname.includes(h); });
  if (isTile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return new Response('', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // Cache-first for Leaflet CDN assets
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Network-first for HTML pages (stay fresh, fall back to cache)
  if (event.request.mode === 'navigate' ||
      (event.request.method === 'GET' && event.request.headers.get('accept') &&
       event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/Iceland/index.html');
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for everything else (CSS, JS, images)
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function() { return null; });

        return cached || fetchPromise;
      });
    })
  );
});
