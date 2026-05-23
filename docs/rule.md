Viewed request-910-app-rules.conf:1-27

## Cách hệ thống hoạt động (End-to-end)

### 1. Viết Rule → ModSecurity

File `request-910-app-rules.conf` chứa các custom rule. Cấu trúc mỗi rule:

```
SecRule <BIẾN_KIỂM_TRA> "<TOÁN_TỬ>" \
  "id:<ID>,phase:<PHASE>,deny,status:403,log,auditlog,msg:'<MÔ_TẢ>',chain"
  SecRule <BIẾN_CHAIN> "<ĐIỀU_KIỆN_THÊM>" "t:none"
```

| Directive         | Ý nghĩa                                                      |
| ----------------- | ------------------------------------------------------------ |
| `id:110010`       | ID duy nhất cho rule (không được trùng)                      |
| `phase:2`         | Kiểm tra sau khi nhận request body (phase:1 = chỉ header)    |
| `deny,status:403` | Block request, trả HTTP 403                                  |
| `log`             | Ghi vào error log của Nginx/ModSecurity                      |
| `auditlog`        | Ghi vào **audit log** (JSON) — đây là nguồn chính cho Kibana |
| `msg:'...'`       | Message mô tả — **đây là text hiển thị trên Kibana**         |
| `chain`           | Kết hợp 2 điều kiện: URI phải match **VÀ** param phải match  |

### 2. Rule được mount vào container WAF

Trong `docker-compose.yml` (line 78):

```yaml
- ./modsecurity/custom/request-910-app-rules.conf:/etc/modsecurity.d/owasp-crs/rules/REQUEST-910-APP-RULES.conf:ro
```

→ File rule được mount **read-only** vào đúng thư mục CRS rules. OWASP CRS image tự động load tất cả file `*.conf` trong `/etc/modsecurity.d/owasp-crs/rules/` theo thứ tự alphabet.

### 3. Log được ghi ra volume

```yaml
# docker-compose.yml
MODSEC_AUDIT_LOG: /var/log/modsecurity/audit.log
MODSEC_AUDIT_LOG_FORMAT: JSON # ← Quan trọng! Format JSON để parse
MODSEC_AUDIT_LOG_TYPE: Serial

volumes:
  - ./logs/modsecurity:/var/log/modsecurity # ← Mount ra host
```

Khi rule match → ModSecurity ghi 1 JSON entry vào `./logs/modsecurity/audit.log` chứa:

- `transaction.messages[].msg` — message từ rule
- `transaction.messages[].ruleId` — ID rule (110010, 110020, ...)
- `transaction.request` — URI, method, headers
- `transaction.response.httpCode` — 403

### 4. Filebeat thu thập log → Elasticsearch

Trong `filebeat/filebeat.yml` (line 40-52):

```yaml
- type: filestream
  id: modsecurity-audit-logs
  paths:
    - /workspace/logs/modsecurity/audit.log # ← Đọc audit log
  parsers:
    - ndjson: # ← Parse JSON
        overwrite_keys: true
  fields:
    serviceName: waf-gateway
    source_type: audit # ← Đánh tag "audit"
```

→ Filebeat đọc file, parse JSON, gửi vào **Elasticsearch** index `modsecurity-demo-YYYY.MM.dd`

### 5. Kibana hiển thị

Trên **Kibana** (`http://localhost:5601`):

1. Vào **Discover**
2. Tạo Data View với pattern `modsecurity-demo-*`
3. Filter `source_type: audit` để xem audit logs
4. Các field quan trọng hiển thị:
   - `transaction.messages.msg` → `"App rule: SQLi pattern in login credentials"`
   - `transaction.messages.ruleId` → `110010`
   - `transaction.request.uri` → `/api/login`
   - `transaction.response.httpCode` → `403`

| Mục đích          | KQL                                                           |
| ----------------- | ------------------------------------------------------------- |
| Tất cả block      | `source_type: "audit" and transaction.response.httpCode: 403` |
| SQLi attacks      | `transaction.messages.msg: "SQLi"`                            |
| XSS attacks       | `transaction.messages.msg: "XSS"`                             |
| LFI attacks       | `transaction.messages.msg: "LFI"`                             |
| Admin violations  | `transaction.request.uri: "/api/admin"`                       |
| Rule cụ thể       | `transaction.messages.details.ruleId: "932260"`               |
| App rules only    | `transaction.messages.msg: "App rule"`                        |
| Exclude CRS noise | `source_type: "audit" and transaction.messages.ruleId: 1100*` |

`MatchedRuleIds : 942*`

## Cách thêm Rule mới

Ví dụ muốn thêm rule chặn upload file nguy hiểm:

```apache
# Thêm vào cuối file request-910-app-rules.conf

SecRule REQUEST_URI "@rx ^/api/upload/?$" \
  "id:110060,phase:2,deny,status:403,log,auditlog,msg:'App rule: dangerous file extension in upload',chain"
  SecRule FILES_NAMES "@rx (?i)\.(php|jsp|exe|sh|bat|cmd)$" "t:none"
```

**Quy tắc khi thêm:**

| Lưu ý              | Chi tiết                                                    |
| ------------------ | ----------------------------------------------------------- |
| **ID phải unique** | Tăng dần từ 110060, 110070...                               |
| **`log,auditlog`** | Bắt buộc phải có để log xuất hiện trên Kibana               |
| **`msg:'...'`**    | Viết rõ ràng vì đây là text hiển thị trên dashboard         |
| **Restart WAF**    | Sau khi sửa file, chạy `docker compose restart waf-gateway` |

## Tóm tắt luồng dữ liệu

```
Request → Nginx+ModSecurity (WAF)
           ↓ rule match
       audit.log (JSON)
           ↓ filebeat đọc
       Elasticsearch (index: modsecurity-demo-*)
           ↓
       Kibana Discover (filter: source_type=audit)
```

Bạn cần mình thêm rule mới cụ thể nào, hay cần hướng dẫn tạo dashboard trên Kibana không?
