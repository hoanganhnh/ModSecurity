INSERT INTO schema_migrations (version)
VALUES ('phase-03-postgresql-schema-v1')
ON CONFLICT (version) DO NOTHING;

INSERT INTO users (username, password_hash, role)
VALUES
  ('demo-user', 'c211974c45eb4055cd5ab82ab12f3b405253e0fa1056ec3708e767cab364ddc6', 'user'),
  ('admin-user', 'c211974c45eb4055cd5ab82ab12f3b405253e0fa1056ec3708e767cab364ddc6', 'admin')
ON CONFLICT (username) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

INSERT INTO products (name, price, description)
VALUES
  ('ModSecurity Handbook', 49.00, 'Practical guide for CRS tuning and safe defaults'),
  ('Secure Gateway Starter', 99.00, 'Nginx + ModSecurity starter kit for demos'),
  ('OWASP Labs Bundle', 79.00, 'Sample payload set for safe security testing')
ON CONFLICT (name) DO UPDATE
SET
  price = EXCLUDED.price,
  description = EXCLUDED.description;
