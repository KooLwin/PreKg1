// ============================================================
// SERVICE WORKER FOR PRE-KG ENGLISH OFFLINE SUPPORT
// ============================================================

const CACHE_NAME = 'prekg-v2';
const OFFLINE_URL = 'offline.html';

// Files to cache on install
const urlsToCache = [
    '.',
    'index.html',
    'nursery.html',
    'course_files.js',
    'course_files.json',
    'manifest.json',
    'offline.html',
    'icons/icon-72.png',
    'icons/icon-96.png',
    'icons/icon-128.png',
    'icons/icon-144.png',
    'icons/icon-152.png',
    'icons/icon-192.png',
    'icons/icon-256.png',
    'icons/icon-384.png',
    'icons/icon-512.png'
    'data/assets/cursor.cur',
    'data/assets/eraser.cur',
    'data/assets/pointer.cur',
    'data/assets/hand.cur'
];

// ============================================================
// INSTALL EVENT - Cache core files
// ============================================================
self.addEventListener('install', function(event) {
    console.log('[ServiceWorker] Install');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[ServiceWorker] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(function() {
                console.log('[ServiceWorker] Skip waiting');
                return self.skipWaiting();
            })
    );
});

// ============================================================
// ACTIVATE EVENT - Clean up old caches
// ============================================================
self.addEventListener('activate', function(event) {
    console.log('[ServiceWorker] Activate');
    
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then(function(keyList) {
            return Promise.all(keyList.map(function(key) {
                if (cacheWhitelist.indexOf(key) === -1) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
        .then(function() {
            console.log('[ServiceWorker] Claiming clients');
            return self.clients.claim();
        })
    );
});

// ============================================================
// FETCH EVENT - Serve from cache, fallback to network
// ============================================================
self.addEventListener('fetch', function(event) {
    console.log('[ServiceWorker] Fetch', event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Skip chrome-extension requests
    if (event.request.url.startsWith('chrome-extension://')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // For iSpring data files - try cache first, then network
    if (event.request.url.includes('/data/')) {
        event.respondWith(
            caches.match(event.request)
                .then(function(response) {
                    // Cache hit - return response
                    if (response) {
                        console.log('[ServiceWorker] Cache hit for data file', event.request.url);
                        return response;
                    }
                    
                    // Not in cache - fetch from network
                    console.log('[ServiceWorker] Fetching data file from network', event.request.url);
                    return fetch(event.request)
                        .then(function(networkResponse) {
                            // Check if we received a valid response
                            if (!networkResponse || networkResponse.status !== 200) {
                                return networkResponse;
                            }
                            
                            // Clone the response
                            var responseToCache = networkResponse.clone();
                            
                            // Open cache and store the response
                            caches.open(CACHE_NAME)
                                .then(function(cache) {
                                    cache.put(event.request, responseToCache);
                                });
                            
                            return networkResponse;
                        })
                        .catch(function(error) {
                            console.log('[ServiceWorker] Fetch failed for data file', error);
                            // Return a fallback response if available
                            return caches.match('/offline.html');
                        });
                })
        );
        return;
    }
    
    // For HTML pages - network first, fallback to cache
    if (event.request.headers.get('accept').includes('text/html')) {
        event.respondWith(
            fetch(event.request)
                .then(function(response) {
                    // Clone the response
                    var responseToCache = response.clone();
                    
                    // Open cache and store the response
                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                })
                .catch(function() {
                    // If network fails, try cache
                    return caches.match(event.request)
                        .then(function(response) {
                            if (response) {
                                return response;
                            }
                            // If not in cache, return offline page
                            return caches.match('/offline.html');
                        });
                })
        );
        return;
    }
    
    // For all other resources - cache first, fallback to network
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // Cache hit - return response
                if (response) {
                    console.log('[ServiceWorker] Cache hit', event.request.url);
                    return response;
                }
                
                // Not in cache - fetch from network
                console.log('[ServiceWorker] Fetching from network', event.request.url);
                return fetch(event.request)
                    .then(function(networkResponse) {
                        // Check if we received a valid response
                        if (!networkResponse || networkResponse.status !== 200) {
                            return networkResponse;
                        }
                        
                        // Clone the response
                        var responseToCache = networkResponse.clone();
                        
                        // Open cache and store the response
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return networkResponse;
                    })
                    .catch(function(error) {
                        console.log('[ServiceWorker] Fetch failed', error);
                        // For images, return a placeholder
                        if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
                            // You could return a placeholder image here
                        }
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// ============================================================
// MESSAGE EVENT - Handle messages from the client
// ============================================================
self.addEventListener('message', function(event) {
    console.log('[ServiceWorker] Message received', event.data);
    
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data.action === 'cacheCourseFiles') {
        // Cache course files from the client
        const files = event.data.files || [];
        if (files.length > 0) {
            event.waitUntil(
                caches.open(CACHE_NAME)
                    .then(function(cache) {
                        return Promise.all(
                            files.map(function(file) {
                                return fetch(file.path)
                                    .then(function(response) {
                                        if (response.ok) {
                                            return cache.put(file.path, response);
                                        }
                                    })
                                    .catch(function() {
                                        console.log('[ServiceWorker] Failed to cache', file.path);
                                    });
                            })
                        );
                    })
                    .then(function() {
                        console.log('[ServiceWorker] Course files cached');
                        // Send response back to client
                        if (event.ports && event.ports.length > 0) {
                            event.ports[0].postMessage({
                                status: 'success',
                                message: 'Course files cached successfully'
                            });
                        }
                    })
            );
        }
    }
});

// ============================================================
// BACKGROUND SYNC - For retrying failed requests
// ============================================================
self.addEventListener('sync', function(event) {
    console.log('[ServiceWorker] Background sync', event.tag);
    
    if (event.tag === 'sync-cache') {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(function(cache) {
                    // Re-cache essential files
                    return cache.addAll(urlsToCache);
                })
        );
    }
});

// ============================================================
// PERIODIC BACKGROUND SYNC - For refreshing cache
// ============================================================
self.addEventListener('periodicsync', function(event) {
    console.log('[ServiceWorker] Periodic sync', event.tag);
    
    if (event.tag === 'refresh-cache') {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(function(cache) {
                    // Refresh cache with latest files
                    return cache.addAll(urlsToCache);
                })
        );
    }
});

console.log('[ServiceWorker] Service Worker loaded successfully');
