# 🗂️ Knowledge Map — Báo Cáo Project: Nginx + ModSecurity + OWASP CRS Demo

> **Mục tiêu project:** Demo stack tự chứa cho thấy WAF (Web Application Firewall) chặn traffic tấn công trước khi đến backend Node.js, đồng thời cung cấp observability qua ELK Stack.

---

## 1. 📦 Tổng Quan Kiến Trúc (System Architecture)

### 1.1 Các thành phần chính

| Component       | Image / Runtime                        | Vai trò                                                   |
| --------------- | -------------------------------------- | --------------------------------------------------------- |
| `waf-gateway`   | `owasp/modsecurity-crs:4.25-nginx-lts` | Public ingress duy nhất — Nginx + ModSecurity + OWASP CRS |
| `demo-app`      | `node:20-alpine` + Express 4           | API backend + phục vụ static UI                           |
| `postgres`      | `postgres:15-alpine`                   | Database lưu trữ dữ liệu demo                             |
| `elasticsearch` | `8.17.3`                               | Lưu và index log từ gateway + app                         |
| `kibana`        | `8.17.3`                               | UI trực quan để phân tích log                             |
| `filebeat`      | `8.17.3`                               | Agent thu thập và chuyển log → Elasticsearch              |

### 1.2 Luồng Request (Request Flow)

```
Browser
  ↓ port 8080
waf-gateway (Nginx + ModSecurity + CRS)
  ↓ nếu PASS → port 3000 (nội bộ Docker)
demo-app (Node.js / Express)
  ↓
PostgreSQL
```

**Luồng Observability:**

```
waf-gateway logs  ──┐
                    ├──→ Filebeat → Elasticsearch → Kibana
demo-app logs     ──┘
```

### 1.3 Security Boundary

- **Chỉ `waf-gateway` mở host port** (`8080`) — `demo-app` không bao giờ public trực tiếp.
- Traffic buộc phải đi qua WAF trước khi chạm đến backend.

---

## 2. 🛡️ ModSecurity & OWASP CRS

### 2.1 ModSecurity là gì?

- **ModSecurity** = Web Application Firewall (WAF) module chạy bên trong Nginx.
- Hoạt động ở tầng HTTP: kiểm tra request/response theo các rule tùy chỉnh.
- Có 2 chế độ: **Blocking** (`On`) và **Detection-Only** (`DetectionOnly`).

### 2.2 OWASP Core Rule Set (CRS)

- Bộ rule chuẩn mở do OWASP duy trì, bảo vệ chống lại top các loại tấn công web.
- Version dùng trong project: **CRS 4.25** (`owasp/modsecurity-crs:4.25-nginx-lts`).
- Phân loại tấn công phát hiện:

| Loại tấn công              | Ví dụ Rule ID | Pattern ví dụ                         |
| -------------------------- | ------------- | ------------------------------------- |
| SQL Injection (SQLi)       | `942100`      | `' OR 1=1`, `UNION SELECT`, `--`      |
| Cross-Site Scripting (XSS) | `941100`      | `<script>`, `onerror=`, `javascript:` |
| Path Traversal / LFI       | `930120`      | `../`, `%2e%2e%2f`, `/etc/passwd`     |

### 2.3 Scoring Anomaly (cơ chế chấm điểm)

- CRS không block ngay từng rule mà **cộng điểm anomaly**.
- Nếu tổng điểm vượt ngưỡng → block request.
- Knobs điều chỉnh:
  - `ANOMALY_INBOUND=5` — ngưỡng block inbound
  - `ANOMALY_OUTBOUND=4` — ngưỡng block outbound
  - `PARANOIA=1` — mức độ nhạy cảm (1 = thấp nhất, 4 = cao nhất)
  - `BLOCKING_PARANOIA=1`

### 2.4 Chế độ hoạt động

| Biến môi trường      | Giá trị         | Ý nghĩa                   |
| -------------------- | --------------- | ------------------------- |
| `MODSEC_RULE_ENGINE` | `On`            | Blocking mode (default)   |
| `MODSEC_RULE_ENGINE` | `DetectionOnly` | Chỉ log, không block      |
| `MANUAL_MODE`        | `0`             | ModSecurity tự động block |
| `MANUAL_MODE`        | `1`             | Chế độ kiểm thử thủ công  |

---

## 3. ⚙️ Custom WAF Rules (App-Level Rules)

### 3.1 File cấu hình custom

| File                                                             | Mục đích                                   |
| ---------------------------------------------------------------- | ------------------------------------------ |
| `modsecurity/custom/request-900-exclusion-rules-before-crs.conf` | Loại trừ false-positive TRƯỚC khi CRS chạy |
| `modsecurity/custom/request-910-app-rules.conf`                  | Rule WAF riêng cho từng endpoint API       |
| `modsecurity/custom/request-920-rate-limit-rules.conf`           | Rate limit rules                           |
| `modsecurity/custom/response-999-exclusion-rules-after-crs.conf` | Loại trừ false-positive SAU khi CRS chạy   |

### 3.2 App-specific Rules (Request-910)

Rule được scope theo endpoint, không áp dụng chung:

| Rule ID  | Endpoint       | Bảo vệ chống                          |
| -------- | -------------- | ------------------------------------- |
| `110010` | `/api/login`   | SQLi trong credentials                |
| `110020` | `/api/search`  | SQLi + XSS trong query param `?q=`    |
| `110030` | `/api/comment` | XSS + SQLi trong `content` body       |
| `110040` | `/api/files`   | LFI/Path traversal trong param `file` |
| `110050` | `/api/admin`   | Missing `x-admin-token` header        |
| `110051` | `/api/admin`   | Malformed admin token                 |

### 3.3 False-Positive Handling — Exclusion Rules (Request-900)

**Vấn đề:** Cookie xác thực Supabase (`sb-*-auth-token`) có entropy cao, khớp nhầm rule `932260`.

**Giải pháp:** Tạo exclusion scoped hẹp:

```
Nếu URI là /, /favicon.ico, /api/* VÀ cookie có pattern sb-*-auth-token
→ Tắt rule 932260 cho request đó
```

> ⚠️ Nguyên tắc: **Chỉ thêm exclusion sau khi đo đạc false positive cụ thể — không thêm rộng.**

---

## 4. 🖥️ Backend Application (Node.js / Express)

### 4.1 Cấu trúc thư mục

```
src/
├── server.js                    # Entry point — khởi tạo Express app
├── routes/
│   ├── demo-routes.js           # GET /health
│   └── api-routes.js            # /api/* routes
├── controllers/
│   ├── search-controller.js     # POST /api/search
│   ├── login-controller.js      # POST /api/login
│   ├── comment-controller.js    # POST /api/comment
│   ├── files-controller.js      # GET /api/files
│   ├── admin-controller.js      # GET /api/admin
│   ├── logs-controller.js       # GET /api/logs/preview
│   ├── stats-controller.js      # GET /api/stats/security
│   └── security-response-utils.js  # Shared security logic
├── middleware/
│   └── request-id-middleware.js # x-request-id propagation
├── services/
│   └── security-events-store.js # In-memory event store
├── logging/
│   └── application-logger.js    # Structured JSON logger
└── database/
    ├── postgres-client.js
    ├── bootstrap-database.js
    ├── schema.sql
    └── seed.sql
```

### 4.2 API Endpoints

| Method     | Path                  | Mô tả                              |
| ---------- | --------------------- | ---------------------------------- |
| `GET`      | `/health`             | Health check — luôn trả `200`      |
| `GET/POST` | `/api/search`         | Tìm kiếm — demo SQLi/XSS detection |
| `POST`     | `/api/login`          | Đăng nhập — demo SQLi detection    |
| `POST`     | `/api/comment`        | Bình luận — demo XSS detection     |
| `GET`      | `/api/files`          | File listing — demo Path Traversal |
| `GET`      | `/api/admin`          | Admin — demo header authentication |
| `GET`      | `/api/stats/security` | Security stats + ELK status        |
| `GET`      | `/api/logs/preview`   | Preview audit/access logs          |

### 4.3 Cấu trúc Response

Mọi response đều bao gồm:

```json
{
	"requestId": "uuid-...",
	"timestamp": "ISO-8601",
	"endpoint": "/api/search",
	"decision": "BLOCK | ALLOW",
	"matchedRuleIds": ["942100"],
	"reason": "SQL injection pattern",
	"timeline": [
		"Request sent to Nginx",
		"...",
		"Request marked as blocked"
	],
	"logs": {
		"audit": ["[audit] id=\"942100\" msg=\"...\" action=\"block\""],
		"access": ["[access] 403 POST /api/search"]
	}
}
```

---

## 5. 🔐 Request ID & Proxy Trust

### 5.1 Cơ chế hoạt động

**File:** `src/middleware/request-id-middleware.js`

```
1. Nhận request vào
2. Kiểm tra header x-elk-proxy-token == ELK_PROXY_TOKEN?
   - Có → dùng x-request-id từ gateway (tái sử dụng ID)
   - Không → sinh UUID mới (randomUUID)
3. Gắn requestId vào req.requestId + response header x-request-id
```

### 5.2 Tại sao cần điều này?

- Cho phép **trace** một request từ gateway log → app log → Elasticsearch.
- Bảo vệ: client bên ngoài **không thể giả mạo** request ID nếu không có token đúng.

### 5.3 Token flow

```
Gateway (Nginx)  →  x-request-id: <uuid>  →  Node.js
                    x-elk-proxy-token: <secret>
```

---

## 6. 📊 Observability — ELK Stack

### 6.1 Thành phần

- **Filebeat** → đọc log files từ `./logs/` → gửi đến Elasticsearch
- **Elasticsearch** → index và lưu trữ (index pattern: `modsecurity-demo-*`)
- **Kibana** → UI tìm kiếm và phân tích log

### 6.2 Log sources

| Nguồn        | File path                       | Filebeat field                   |
| ------------ | ------------------------------- | -------------------------------- |
| Node.js app  | `logs/demo-app/application.log` | `service: demo-app`              |
| Nginx access | `logs/nginx/access.log`         | `source_type: nginx-access`      |
| Nginx error  | `logs/nginx/error.log`          | `source_type: nginx-error`       |
| ModSecurity  | `logs/modsecurity/audit.log`    | `source_type: modsecurity-audit` |

### 6.3 Correlation — Tra cứu theo requestId

Dùng `requestId` từ UI response để search trong Kibana:

```
Kibana Discover → filter: requestId: "abc-123-..."
→ Thấy cả gateway log VÀ app log của cùng 1 request
```

### 6.4 Audit Log Format

```
MODSEC_AUDIT_LOG_FORMAT: JSON
MODSEC_AUDIT_ENGINE: RelevantOnly   # Chỉ log request có anomaly
MODSEC_AUDIT_LOG_TYPE: Serial
```

---

## 7. 🐳 Docker Compose & Infrastructure

### 7.1 Dependency chain

```
postgres (healthy)
  → demo-app (starts after DB ready)
    → waf-gateway (starts after demo-app)
elasticsearch (healthy)
  → kibana (starts after ES)
  → filebeat (starts after ES + kibana)
```

### 7.2 Volumes

| Volume / Mount              | Mục đích                                               |
| --------------------------- | ------------------------------------------------------ |
| `./logs` → shared           | Cả gateway và app ghi log vào đây; filebeat đọc từ đây |
| `./nginx/conf.d/`           | Nginx config template                                  |
| `./modsecurity/custom/`     | Custom CRS rules                                       |
| `./src/database/schema.sql` | Auto-initialize DB schema                              |
| `elasticsearch-data`        | Persistent volume cho ES                               |

### 7.3 Environment Variables quan trọng

| Biến                 | Default                 | Ý nghĩa                    |
| -------------------- | ----------------------- | -------------------------- |
| `DEMO_PORT`          | `8080`                  | Host port vào gateway      |
| `MANUAL_MODE`        | `0`                     | 0 = auto-block, 1 = manual |
| `MODSEC_RULE_ENGINE` | `On`                    | WAF mode                   |
| `PARANOIA`           | `1`                     | CRS sensitivity level      |
| `ELK_ENABLED`        | `1`                     | Bật/tắt ELK pipeline       |
| `ELK_PROXY_TOKEN`    | `local-elk-proxy-token` | Secret cho proxy trust     |

---

## 8. 🧪 Testing & Validation

### 8.1 Các lệnh kiểm tra

| Lệnh                                            | Mục đích                                  |
| ----------------------------------------------- | ----------------------------------------- |
| `npm run lint`                                  | Syntax check tất cả JS files              |
| `npm test`                                      | Chạy e2e + security test suites           |
| `npm run smoke`                                 | Kiểm tra allow/block scenario qua gateway |
| `bash scripts/rollback-local.sh reset`          | Reset toàn bộ stack + volumes             |
| `bash scripts/rollback-local.sh detection-only` | Chuyển sang detection-only mode           |

### 8.2 Smoke Test (`scripts/smoke-test.sh`)

Ba kịch bản kiểm tra:

1. **Health check** → `GET /health` phải trả `200`
2. **Allow scenario** → Request bình thường phải trả `200`
3. **Block scenario** → Request có SQLi pattern phải trả `403`

### 8.3 Security Test (`tests/security/waf-blocking.spec.js`)

Kiểm tra tự động các pattern tấn công:

- SQLi: `' OR 1=1`, `UNION SELECT --`
- XSS: `<script>alert(1)</script>`, `onerror=`
- Path Traversal: `../../../etc/passwd`

---

## 9. 🎨 Frontend UI (`public/`)

### 9.1 Tính năng UI

- **Request Tester** — chọn endpoint, HTTP method, điền params và submit
- **Quick Attack Buttons** — SQLi / XSS / Path Traversal pre-filled payload
- **Decision Panel** — hiển thị `ALLOW / BLOCK`, matched rule IDs, reason
- **Timeline** — từng bước xử lý request qua WAF
- **Audit & Access Log panels** — log entries từ WAF
- **ELK Status** — trạng thái pipeline + link đến Kibana Discover

### 9.2 Stats API (`/api/stats/security`)

```json
{
  "totalRequests": 42,
  "blocked": 8,
  "allowed": 34,
  "topEndpoints": [...],
  "elk": {
    "enabled": true,
    "indexPattern": "modsecurity-demo-*",
    "dashboardUrl": "http://localhost:5601/app/discover"
  }
}
```

---

## 10. 🔄 Operational Runbook

### 10.1 Khởi động demo

```bash
cp .env.example .env
docker compose up -d --build
# Chờ ~60s để ELK khởi động
open http://localhost:8080       # Demo UI
open http://localhost:5601       # Kibana
```

### 10.2 Tuning WAF (detection-only)

```bash
# Chuyển sang detection-only để xem log mà không block
bash scripts/rollback-local.sh detection-only

# Xem log để xác nhận false positive trước khi thêm exclusion
# Sau khi tuning xong → restart với blocking mode
docker compose up -d --build
```

### 10.3 Reset hoàn toàn

```bash
bash scripts/rollback-local.sh reset
# Tương đương: docker compose down -v --remove-orphans
```

---

## 11. 📐 Các Khái Niệm Bảo Mật Cần Nắm

### 11.1 Web Application Firewall (WAF)

- Hoạt động ở Layer 7 (Application Layer)
- Khác với firewall thông thường (Layer 3/4): WAF hiểu HTTP, inspect body/headers/URL
- Ingress protection: chặn trước khi request đến application code

### 11.2 Các loại tấn công được demo

| Tấn công                 | Nguyên lý                                               | Ví dụ payload                             |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------- |
| **SQL Injection**        | Chèn SQL vào input để thao túng query DB                | `' OR '1'='1`, `'; DROP TABLE users;--`   |
| **XSS**                  | Chèn script độc vào response, thực thi ở browser victim | `<script>steal(document.cookie)</script>` |
| **Path Traversal / LFI** | Thoát khỏi thư mục cho phép để đọc file hệ thống        | `../../../../etc/passwd`                  |

### 11.3 Defense-in-Depth

Project minh họa nhiều lớp bảo vệ:

1. **WAF (CRS)** — filter ở tầng network/HTTP
2. **Custom App Rules** — filter theo endpoint cụ thể
3. **Exclusion tuning** — giảm false positive, không làm yếu bảo mật
4. **Request ID tracing** — audit trail đầy đủ

---

## 12. 🔑 Điểm Nhấn Khi Báo Cáo

1. **Luồng traffic** — Browser → WAF → Backend → DB, chỉ WAF mở port ngoài
2. **CRS Anomaly Scoring** — không block theo rule đơn lẻ, cộng điểm → ngưỡng
3. **Request ID Propagation** — trace 1 request xuyên suốt gateway → app → log → Kibana
4. **Detection-Only vs Blocking** — công cụ tuning không làm gián đoạn sản xuất
5. **False-Positive Management** — exclusion hẹp, đo trước, tránh tắt rule rộng
6. **Observability** — Filebeat → ES → Kibana correlate bằng requestId

---

_Generated: 2026-04-21 | Project: ModSecurity Demo Stack_
