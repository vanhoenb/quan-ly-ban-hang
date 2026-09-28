// sw.js — Service Worker cho POS Pro
// Nhiệm vụ: lưu lại (cache) các file giao diện mà app đã tải thành công (HTML, CSS, JS, icon...)
// để lần sau mở app khi KHÔNG có mạng vẫn hiển thị được giao diện.
//
// Cách hoạt động: "Network first, fallback to Cache"
//   - Có mạng: ưu tiên bản MỚI NHẤT từ server, đồng thời lưu 1 bản sao vào cache.
//   - Mất mạng: dùng lại bản đã lưu trong cache lần gần nhất.
//
// SỬA (so với v1): 
//   1. KHÔNG can thiệp vào request của Firestore/Firebase/Google (Listen stream dạng GET
//      long-poll, cleardot.gif...) - trước đây SW chặn luôn các request này, khi mất mạng thì
//      trả về undefined -> lỗi "Failed to convert value to 'Response'" tràn Console.
//   2. Chỉ cache response hợp lệ (status 200), và bắt lỗi cache.put (tránh "Cache.put()
//      encountered a network error" gây Uncaught in promise).
//   3. Khi mất mạng mà cache cũng không có -> trả về Response lỗi 503 hợp lệ thay vì undefined.

const CACHE_NAME = 'pos-pro-cache-v2';

// Các domain dữ liệu/realtime tuyệt đối không được SW đụng vào
const BYPASS_HOSTS = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.googleapis.com',
    'www.google.com',
    'www.gstatic.com'
];

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Chỉ xử lý GET qua http/https
    if (req.method !== 'GET') return;
    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Bỏ qua hoàn toàn request tới Firebase/Google: để trình duyệt tự xử lý như bình thường
    if (BYPASS_HOSTS.includes(url.hostname)) return;

    event.respondWith(
        fetch(req)
            .then((networkResponse) => {
                // Chỉ lưu cache khi tải thành công và là response đầy đủ (không lưu 206 từng phần, lỗi...)
                if (networkResponse && networkResponse.status === 200) {
                    const resClone = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(req, resClone))
                        .catch(() => { /* không lưu được cache thì thôi, không ảnh hưởng trang */ });
                }
                return networkResponse;
            })
            .catch(async () => {
                // Mất mạng -> lấy bản đã lưu; nếu không có thì trả Response lỗi hợp lệ
                const cached = await caches.match(req);
                if (cached) return cached;
                return new Response('', { status: 503, statusText: 'Offline' });
            })
    );
});
