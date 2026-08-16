// sw.js — Service Worker cho POS Pro
// Nhiệm vụ: lưu lại (cache) các file mà app đã từng tải thành công (HTML, CSS, JS, icon...),
// để lần sau mở app khi KHÔNG có mạng, trình duyệt vẫn hiển thị được giao diện
// (lấy từ bản đã lưu trong máy) thay vì màn hình trắng / lỗi "không có kết nối".
//
// Cách hoạt động: "Network first, fallback to Cache"
//   - Có mạng: luôn ưu tiên tải bản MỚI NHẤT từ server (đảm bảo không dùng bản cũ nếu bạn
//     vừa cập nhật code), đồng thời lưu lại 1 bản sao vào cache để dùng dự phòng.
//   - Mất mạng: dùng lại bản đã lưu trong cache lần gần nhất.

const CACHE_NAME = 'pos-pro-cache-v1';

// Khi Service Worker được cài đặt lần đầu
self.addEventListener('install', (event) => {
    // Kích hoạt ngay, không cần đợi user đóng hết các tab cũ
    self.skipWaiting();
});

// Khi Service Worker được kích hoạt (sau khi cài xong)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        // Dọn các cache phiên bản cũ (nếu sau này bạn đổi CACHE_NAME để "làm mới" cache)
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Mỗi khi trang gọi 1 request (tải HTML, CSS, JS, ảnh, font...)
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Chỉ can thiệp vào các request GET (không đụng vào request ghi dữ liệu lên Firestore
    // - những request đó đi qua kết nối riêng của Firebase SDK, không qua fetch() của trang,
    // nên thực tế không bị ảnh hưởng, nhưng vẫn chặn rõ ràng cho an toàn).
    if (req.method !== 'GET') return;

    event.respondWith(
        fetch(req)
            .then((networkResponse) => {
                // Tải mạng thành công -> lưu 1 bản sao vào cache để dùng khi mất mạng sau này
                const resClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                return networkResponse;
            })
            .catch(() => {
                // Mất mạng / tải lỗi -> lấy lại bản đã lưu trong cache (nếu có)
                return caches.match(req);
            })
    );
});
