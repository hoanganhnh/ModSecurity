# ModSecurity Demo Presentation Guide

## Overview

Project mô phỏng một hệ thống web có WAF đứng trước ứng dụng Node.js:

```text
Browser
  -> waf-gateway: Nginx + ModSecurity + OWASP CRS
  -> demo-app: Express API + static UI
  -> postgres

Logs
  -> logs/*
  -> filebeat
  -> elasticsearch
  -> kibana
```

Mục tiêu demo:

- Cho request bình thường đi qua.
- Chặn payload giống tấn công SQLi, XSS, LFI/path traversal, thiếu admin token.
- Ghi log ở gateway, app, ModSecurity audit log.
- Đẩy log vào Elasticsearch và xem bằng Kibana.
- Dùng `requestId` để trace một request xuyên qua gateway, app, và log.

## Main Services

| Service | Vai trò | Port host |
| --- | --- | --- |
| `waf-gateway` | Nginx + ModSecurity + OWASP CRS, nhận traffic chính | `8080` hoặc `DEMO_PORT` |
| `demo-app` | Node.js Express API + static UI | `3000` |
| `postgres` | Database demo | internal `5432` |
| `adminer` | DB manager cho Postgres | `8081` hoặc `ADMINER_PORT` |
| `elasticsearch` | Lưu log đã ingest | `9200` |
| `kibana` | Giao diện phân tích log | `5601` |
| `filebeat` | Đọc log file và gửi vào Elasticsearch | internal |

Các endpoint cần nhớ:

| URL | Mục đích |
| --- | --- |
| `http://localhost:3000` | Demo UI đi qua WAF |
| `http://localhost:8080/health` | Health check qua gateway |
| `http://localhost:5601/app/discover` | Kibana Discover |
| `http://localhost:8081` | Adminer |
| `http://localhost:9200` | Elasticsearch API |

Adminer login mặc định:

| Field | Value |
| --- | --- |
| System | `PostgreSQL` |
| Server | `postgres` |
| Username | `modsecurity` |
| Password | `modsecurity` |
| Database | `modsecurity` |

## How To Run Demo

Prepare environment as described in `README.md`, then start stack:

```bash
docker compose up -d --build
```

Check service status:

```bash
docker compose ps
```

Health check qua WAF:

```bash
curl -i http://localhost:${DEMO_PORT:-8080}/health
```

Smoke test:

```bash
npm run smoke
```

Smoke test kiểm tra 3 điểm:

1. `/health` trả `200`.
2. Request bình thường vào `/api/search` trả `200`.
3. Payload SQLi-like vào `/api/search` bị gateway chặn `403`.

## Request Flow

### Normal Request

```text
1. Browser gửi request tới localhost:3000.
2. Docker forward traffic vào waf-gateway:3000.
3. Nginx nhận request.
4. ModSecurity + OWASP CRS inspect request.
5. Không match rule block.
6. Nginx proxy request tới demo-app:3000.
7. Express handler xử lý nghiệp vụ.
8. App ghi application log.
9. Nginx ghi access log.
10. Filebeat ship log vào Elasticsearch.
11. Kibana đọc log từ Elasticsearch.
```

### Blocked Request

```text
1. Browser gửi payload giống tấn công.
2. Nginx nhận request tại waf-gateway.
3. ModSecurity inspect URI, query, body, headers.
4. CRS hoặc custom rule match payload.
5. Gateway trả 403 hoặc 429.
6. Request không tới backend trong trường hợp bị gateway chặn thật.
7. ModSecurity ghi audit log.
8. Nginx ghi access log với status block.
9. Filebeat ship log vào Elasticsearch.
10. Kibana dùng requestId, rule id, status để phân tích.
```

## Gateway Configuration

Gateway được khai báo trong `docker-compose.yml`:

```yaml
waf-gateway:
  image: owasp/modsecurity-crs:4.25-nginx-lts
  environment:
    BACKEND: ${BACKEND:-http://demo-app:3000}
    MODSEC_RULE_ENGINE: ${MODSEC_RULE_ENGINE:-On}
    PARANOIA: ${PARANOIA:-1}
    BLOCKING_PARANOIA: ${BLOCKING_PARANOIA:-1}
    ANOMALY_INBOUND: ${ANOMALY_INBOUND:-5}
    ANOMALY_OUTBOUND: ${ANOMALY_OUTBOUND:-4}
```

Các biến quan trọng:

| Variable | Ý nghĩa | Default |
| --- | --- | --- |
| `BACKEND` | Upstream app mà Nginx proxy tới | `http://demo-app:3000` |
| `MODSEC_RULE_ENGINE` | `On` để block, `DetectionOnly` để chỉ ghi nhận | `On` |
| `PARANOIA` | Độ nhạy detection của CRS | `1` |
| `BLOCKING_PARANOIA` | Độ nhạy khi block | `1` |
| `ANOMALY_INBOUND` | Ngưỡng điểm inbound để block | `5` |
| `ANOMALY_OUTBOUND` | Ngưỡng điểm outbound để block | `4` |
| `REPORTING_LEVEL` | Mức report của CRS | `2` |
| `ELK_PROXY_TOKEN` | Token để app tin requestId từ gateway | `local-elk-proxy-token` |

Nginx template nằm ở `nginx/conf.d/default.conf.template`.

Các điểm cần giải thích:

- `log_format elk_json` ghi access log dạng JSON để Filebeat parse dễ.
- `resolver 127.0.0.11` dùng Docker DNS.
- `set $backend "${BACKEND}"` giúp Nginx resolve backend runtime.
- `proxy_set_header X-Request-ID $request_id` truyền request id xuống app.
- `proxy_set_header X-ELK-Proxy-Token ${ELK_PROXY_TOKEN}` giúp app xác nhận request đi qua gateway tin cậy.

## Rule Files

Custom rules được mount vào image CRS:

| File | Mục đích |
| --- | --- |
| `modsecurity/custom/request-900-exclusion-rules-before-crs.conf` | Exclusion trước CRS, dùng để giảm false positive |
| `modsecurity/custom/request-910-app-rules.conf` | Rule ứng dụng: login, search, comment, file, admin |
| `modsecurity/custom/request-920-rate-limit-rules.conf` | Rate limit nhẹ cho `/api/login` |
| `modsecurity/custom/response-999-exclusion-rules-after-crs.conf` | Exclusion sau CRS, hiện để trống |

### Rule Syntax Basics

Ví dụ rule block SQLi trên search:

```apache
SecRule REQUEST_URI "@rx ^/api/search/?$" \
  "id:110020,phase:2,deny,status:403,log,auditlog,msg:'App rule: SQLi/XSS pattern in search query',chain"
  SecRule ARGS:q "@rx (?i)(?:'\s*or\s+1=1|union\s+select|<script|javascript:|onerror=)" "t:none"
```

Cách đọc:

| Thành phần | Ý nghĩa |
| --- | --- |
| `SecRule REQUEST_URI` | Điều kiện đầu tiên: chỉ áp dụng cho endpoint cụ thể |
| `@rx` | Match bằng regex |
| `id:110020` | Rule id, phải unique |
| `phase:2` | Inspect sau khi request body/args đã sẵn sàng |
| `deny` | Chặn request |
| `status:403` | HTTP status khi chặn |
| `log,auditlog` | Ghi log thường và audit log |
| `msg` | Message xuất hiện trong log |
| `chain` | Rule con bên dưới cũng phải match |
| `ARGS:q` | Chỉ kiểm tra query/body arg tên `q` |
| `t:none` | Không áp dụng transformation bổ sung |

### Rule Phases

| Phase | Khi nào chạy | Dùng cho |
| --- | --- | --- |
| `phase:1` | Sớm, sau khi đọc request headers | Header, URI, missing token, init collection |
| `phase:2` | Sau khi đọc request body/args | SQLi, XSS, file path, form data |
| `phase:3-5` | Response/log phases | Ít dùng trong demo này |

### Current Custom Rules

| Rule id | Endpoint | Điều kiện | Action |
| --- | --- | --- | --- |
| `100900` | `/api/*` | Supabase auth cookie false positive | Remove CRS rule `932260` |
| `100901` | `/` | Supabase auth cookie false positive | Remove CRS rule `932260` |
| `100902` | `/favicon.ico` | Supabase auth cookie false positive | Remove CRS rule `932260` |
| `110010` | `/api/login` | SQLi pattern trong credentials | `403` |
| `110020` | `/api/search` | SQLi/XSS pattern trong `q` | `403` |
| `110030` | `/api/comment` | XSS/SQLi trong `content` | `403` |
| `110040` | `/api/files` | LFI/path traversal trong `file` | `403` |
| `110050` | `/api/admin` | Thiếu `x-admin-token` | `403` |
| `110051` | `/api/admin` | Token sai format | `403` |
| `120000` | all | Init IP collection | pass |
| `120010` | `/api/login` | Tăng counter login | pass |
| `120020` | `/api/login` | Counter > 20 trong 60s | `429` |

## How To Add Or Tune A Rule

Quy trình khuyến nghị:

1. Chạy detection-only trước khi tune:

   ```bash
   bash scripts/rollback-local.sh detection-only
   ```

2. Gửi payload test.
3. Đọc audit log để lấy rule id, field, endpoint.
4. Nếu là attack thật, thêm rule block trong `request-910-app-rules.conf`.
5. Nếu là false positive, thêm exclusion hẹp trong `request-900-exclusion-rules-before-crs.conf`.
6. Quay lại blocking mode:

   ```bash
   bash scripts/rollback-local.sh blocking
   ```

7. Chạy lại smoke test:

   ```bash
   npm run smoke
   ```

Nguyên tắc viết rule:

- Scope càng hẹp càng tốt: endpoint + field + rule id.
- Không disable toàn bộ CRS nếu chỉ một field bị false positive.
- Rule id custom nên nằm trong range riêng của project.
- Mỗi rule cần `msg` rõ để khi đọc log biết lý do block.
- Sau khi sửa rule, recreate gateway:

  ```bash
  docker compose up -d --force-recreate waf-gateway
  ```

## Log Pipeline

### Log Sources

| Source | Path trên host | Nội dung |
| --- | --- | --- |
| App log | `logs/demo-app/application.log` | Security decision, requestId, endpoint, matched rules |
| Nginx access log | `logs/nginx/access.log` | JSON log: status, method, uri, upstream, request time |
| Nginx error log | `logs/nginx/error.log` | Lỗi Nginx, upstream, config |
| ModSecurity audit log | `logs/modsecurity/audit.log` | Rule match, request details, action block/pass |

### Filebeat

`filebeat/filebeat.yml` định nghĩa 4 input:

| Input id | Path | `source_type` |
| --- | --- | --- |
| `demo-app-logs` | `/workspace/logs/demo-app/*.log` | `application` |
| `nginx-access-logs` | `/workspace/logs/nginx/access.log` | `access` |
| `nginx-error-logs` | `/workspace/logs/nginx/error.log` | `error` |
| `modsecurity-audit-logs` | `/workspace/logs/modsecurity/audit.log` | `audit` |

Output index:

```text
modsecurity-demo-%{+yyyy.MM.dd}
```

Kibana index pattern:

```text
modsecurity-demo-*
```

## How To Analyze Logs

### 1. Start From Request ID

Mỗi response có header:

```text
x-request-id: <id>
```

Lấy request id từ browser devtools, UI response, hoặc curl:

```bash
curl -i http://localhost:8080/health
```

Search trong Kibana:

```text
requestId : "<request-id>"
```

Nếu field mapping chưa nhận `requestId`, dùng full text:

```text
"<request-id>"
```

### 2. Filter By Source Type

Tách log theo nguồn:

```text
source_type : "access"
source_type : "audit"
source_type : "application"
source_type : "error"
```

### 3. Find Blocked Requests

Gateway block:

```text
serviceName : "waf-gateway" and status : 403
```

ModSecurity audit:

```text
serviceName : "waf-gateway" and source_type : "audit"
```

Application decision:

```text
eventName : "security.decision" and decision : "BLOCK"
```

### 4. Find A Rule

Search theo custom rule id:

```text
"110020"
```

Search theo CRS rule id:

```text
"942100"
```

Search theo message:

```text
"SQLi/XSS pattern in search query"
```

### 5. Read A Block Event

Khi thấy một request bị block, đọc theo thứ tự:

1. `timestamp` hoặc `@timestamp`: request xảy ra lúc nào.
2. `requestId`: trace id.
3. `serviceName`: log đến từ gateway hay app.
4. `source_type`: access, audit, application, error.
5. `method` + `uri`: endpoint nào.
6. `status`: `403`, `429`, hoặc `200`.
7. Rule id/message trong audit log: rule nào match.
8. `upstreamStatus`: nếu rỗng hoặc `-`, request có thể bị block trước backend.

## Demo Script For Presentation

### Slide 1: Problem

Ứng dụng web thường nhận input từ user. Nếu không có lớp kiểm soát trước app, payload như SQLi/XSS/LFI có thể đi thẳng vào backend.

### Slide 2: Architecture

Giải thích sơ đồ:

```text
Browser -> WAF Gateway -> Node API -> PostgreSQL
              |
              v
        logs -> Filebeat -> Elasticsearch -> Kibana
```

### Slide 3: Normal Flow

Chạy:

```bash
curl -i "http://localhost:8080/api/search?q=normal-search"
```

Expected:

- HTTP `200`.
- Decision `ALLOW` trong app response/log.
- Access log có status `200`.

### Slide 4: Attack Flow

Chạy:

```bash
curl -i "http://localhost:8080/api/search?q=' OR 1=1 --"
```

Expected:

- HTTP `403` nếu gateway block.
- Audit log có rule match.
- Access log có status `403`.

### Slide 5: Rule Explanation

Mở file:

```bash
modsecurity/custom/request-910-app-rules.conf
```

Giải thích:

- Endpoint scope: `/api/search`.
- Field scope: `ARGS:q`.
- Pattern: SQLi/XSS.
- Action: `deny,status:403,log,auditlog`.

### Slide 6: Observability

Mở Kibana:

```text
http://localhost:5601/app/discover
```

Query:

```text
source_type : "audit" or source_type : "access"
```

Sau đó filter theo requestId.

### Slide 7: False Positive Tuning

Giải thích file:

```bash
modsecurity/custom/request-900-exclusion-rules-before-crs.conf
```

Điểm chính:

- Chỉ loại trừ đúng endpoint.
- Chỉ loại trừ đúng header/field.
- Chỉ loại trừ đúng rule id.
- Không tắt toàn bộ CRS.

## Common Troubleshooting

### Gateway Exited With `host not found in upstream`

Triệu chứng:

```text
nginx: [emerg] host not found in upstream "demo-app"
```

Nguyên nhân:

- Nginx resolve upstream lúc startup.
- Docker DNS hoặc service backend chưa sẵn sàng tại thời điểm parse config.

Fix trong project:

- Mount template vào đúng path `/etc/nginx/templates/conf.d/default.conf.template`.
- Dùng `resolver 127.0.0.11`.
- Dùng biến `$backend` trong `proxy_pass`.

### No Logs In Kibana

Check:

```bash
docker compose ps filebeat elasticsearch kibana
docker compose logs --tail=100 filebeat
curl http://localhost:9200/_cat/indices?v
```

Nguyên nhân thường gặp:

- Elasticsearch chưa healthy.
- Filebeat chưa đọc được `logs/*`.
- Chưa có request mới sau khi stack start.
- Kibana đang search sai time range.

### Rule Not Blocking

Check:

```bash
docker compose logs --tail=120 waf-gateway
docker compose exec waf-gateway nginx -T | sed -n '1,220p'
```

Nguyên nhân thường gặp:

- Stack đang chạy `MODSEC_RULE_ENGINE=DetectionOnly`.
- Rule file sửa nhưng gateway chưa recreate.
- Regex không match đúng variable.
- Request dùng JSON nhưng rule đang check `ARGS:<name>` không parse như mong đợi.
- Rule phase không phù hợp.

### Port Conflict

Ports mặc định:

| Service | Port |
| --- | --- |
| Gateway | `8080` |
| App direct | `3000` |
| Adminer | `8081` |
| Kibana | `5601` |
| Elasticsearch | `9200` |

Override bằng shell env khi chạy compose:

```bash
DEMO_PORT=18080 APP_PORT=13000 ADMINER_PORT=18081 docker compose up -d
```

## Useful Commands

```bash
# Start all
docker compose up -d --build

# Stop all
docker compose down

# Reset volumes
bash scripts/rollback-local.sh reset

# Detection-only mode
bash scripts/rollback-local.sh detection-only

# Blocking mode
bash scripts/rollback-local.sh blocking

# Recreate gateway after rule/config change
docker compose up -d --force-recreate waf-gateway

# Gateway logs
docker compose logs --tail=120 waf-gateway

# Filebeat logs
docker compose logs --tail=120 filebeat

# Local smoke test
npm run smoke

# Elasticsearch indices
curl http://localhost:9200/_cat/indices?v
```

## References

- `README.md`: quick start.
- `docker-compose.yml`: service topology and environment defaults.
- `nginx/conf.d/default.conf.template`: gateway proxy and access log format.
- `modsecurity/custom/*.conf`: custom rule and exclusion files.
- `filebeat/filebeat.yml`: log ingestion config.
- `docs/system-architecture.md`: architecture details.
- `docs/deployment-guide.md`: operations and validation.

