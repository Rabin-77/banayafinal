# Banaya Enterprises Security Specification

## 1. Data Invariants
1. **Live Catalog (`/products/{productId}`)**: Readable publicly so all storefront visitors view live products, pricing, and images. Only verified administrators (`isAdmin()`) may create, update, or delete products, and every write must enforce bounded string/array lengths, positive pricing (`price > 0`), immutable `createdAt`, and server timestamp `request.time`.
2. **Media Library (`/mediaFolders/{folderId}` & `/mediaFolders/{folderId}/images/{imageId}`)**: Strictly administrator-only (`isAdmin()`). Subcollection image writes verify that the parent folder document exists (`exists(...)`) and validate bounded URL/data strings.
3. **Customer Orders (`/orders/{orderId}`)**: Contains customer PII (`customerName`, `phone`, `email`, `shippingAddress`, `city`, `postalCode`). Reads (`get`, `list`), status updates, and deletes are restricted strictly to verified administrators (`isAdmin()`). Guest checkout creation enforces complete schema, pricing sanity (`totalAmount >= 0`), initial status `'Processing'` or `'Confirmed'`, and server timestamps (`request.time`).
4. **Admin Order Notes (`/adminNotes/{orderId}`), Admin Alerts (`/adminAlerts/{orderId}`), & Admin Registry (`/admins/{userId}`)**: Restricted strictly to verified administrators (`isAdmin()`) for reads/updates/deletes. Checkout batch writes may create an initial unread `/adminAlerts/{orderId}` record only alongside a valid `/orders/{orderId}` document (`existsAfter(...)`), enforcing `alertStatus == 'unread'` and `customerNotified == false`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unverified Email Admin Spoof**: `auth.token.email = 'rabinmass24@gmail.com'`, `auth.token.email_verified = false` updating `/products/pure-honey` -> `PERMISSION_DENIED`.
2. **Non-Admin Authenticated Product Write**: Signed-in standard user updating `/products/pure-honey` -> `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection on Product Create**: Admin creating product with `{ ..., isAdminOverride: true }` -> `PERMISSION_DENIED` (`keys().hasOnly(...)`).
4. **Oversized ID Poisoning**: Creating `/products/<200-char-invalid-id>` -> `PERMISSION_DENIED` (`isValidId()`).
5. **Unbounded Gallery List Poisoning**: Updating product with 12 gallery URLs (> 8 max) -> `PERMISSION_DENIED`.
6. **Negative / Zero Price Tampering**: Updating product with `price: -10` -> `PERMISSION_DENIED`.
7. **Orphaned Media Folder Image**: Creating `/mediaFolders/missing-folder/images/img-1` when parent folder does not exist -> `PERMISSION_DENIED`.
8. **Customer PII Read Leak**: Unauthenticated or non-admin user reading `/orders/STM-84920` -> `PERMISSION_DENIED`.
9. **Blanket Orders List Scrape**: Non-admin listing `/orders` -> `PERMISSION_DENIED`.
10. **Order Status Self-Escalation by Non-Admin**: Guest creating order directly in status `'Delivered'` -> `PERMISSION_DENIED`.
11. **Client Timestamp Backdating**: Creating product with `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
12. **Self-Granted Admin Escalation**: Non-admin writing `/admins/<uid>` -> `PERMISSION_DENIED`.
