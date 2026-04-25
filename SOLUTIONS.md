# Mini-Shop Take-Home Assessment - Solutions

## Overview

This document outlines the debugging process and solutions implemented to fix
the Mini-Shop application. The application is a multi-container e-commerce
platform built with React, Node.js/Express, PostgreSQL, and Redis, orchestrated
using Docker Compose.

## Troubleshooting Flow

My troubleshooting approach was iterative and systematic. I started the application
with `make up` and used `make logs` to identify failures one at a time. Each issue
was fixed and verified before moving to the next, creating a clear chain of
diagnosis → root cause → fix → verification.

The general flow for each bug:
1. Run `make up` to start all services
2. Run `make logs` to identify which service was failing and why
3. Analyze the error message to find the root cause
4. Apply the fix
5. Restart with `make up` and confirm the issue was resolved
6. Move to the next failure

After resolving all 4 bugs and confirming the application worked end-to-end,
I implemented Redis caching as the 2nd goal, followed by security and
architectural improvements as bonus work.

### Summary of changes
- Fixed 4 bugs preventing the application from starting
- Implemented Redis caching for the items API
- Added nginx-level rate limiting
- Improved health check to monitor DB and Redis
- Moved credentials to `.env` file
- Added automated security scanning with Trivy

---

## Bug #1: Frontend Build Failing

### Command used to identify
```bash
make up
```

### Log output
```
#13 0.678 error during build:
#13 0.678 [vite]: Rollup failed to resolve import "/src/main.js" from "/app/index.html".
#13 0.678 This is most likely unintended because it can break your application at runtime.
target frontend: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
```

### Root cause
`frontend/index.html` was referencing `main.js` but the actual file was `main.jsx`.
When Docker builds the frontend, Vite tries to compile all the code. It read `index.html`, looked for `main.js`, couldn't find it, and crashed.

### Fix
Changed in `frontend/index.html`:
```html
<!-- Before -->
<script type="module" src="/src/main.js"></script>

<!-- After -->
<script type="module" src="/src/main.jsx"></script>
```

---

## Bug #2: Proxy nginx Misconfiguration

### Command used to identify
```bash
make up
make logs
```

### Log output
```
proxy-1 | [emerg] 1#1: host not found in upstream "backend:8080" in /etc/nginx/nginx.conf:11
proxy-1 | nginx: [emerg] host not found in upstream "backend:8080" in /etc/nginx/nginx.conf:11
```

### Root cause
The upstream `api` was pointing to `backend:8080` instead of `api:3000`.
In Docker, containers communicate using the **service name** as the hostname. There was no service called `backend` in `docker-compose.yml` — the correct name was `api` running on port `3000`.

### Fix
Changed in `proxy/nginx.conf`:
```nginx
# Before
upstream api {
    server backend:8080;
}

# After
upstream api {
    server api:3000;
}
```

---

## Bug #3: Proxy Could Not Reach API Container

### Command used to identify
```bash
make up
make logs
```

### Log output
```
proxy-1    | [emerg] 1#1: host not found in upstream "backend:8080" in /etc/nginx/nginx.conf:11
api-1      | Database connection attempt 1/5 failed: getaddrinfo ENOTFOUND postgres
frontend-1 | [emerg] 1#1: host not found in upstream "api" in /etc/nginx/conf.d/default.conf:16
```

### Root cause
The proxy service was only connected to `frontend-network`, but the `api` service was on `backend-network`. In Docker, containers can only communicate if they share the same network.

### Fix
Changed in `docker-compose.yml`:
```yaml
# Before
proxy:
  networks:
    - frontend-network

# After
proxy:
  networks:
    - frontend-network
    - backend-network
```

---

## Bug #4: API Could Not Connect to Database

### Command used to identify
```bash
make up
make logs
```

### Log output
```
api-1 | Database connection attempt 1/5 failed: getaddrinfo ENOTFOUND postgres
api-1 | Database connection attempt 2/5 failed: getaddrinfo ENOTFOUND postgres
api-1 | Database connection attempt 3/5 failed: getaddrinfo ENOTFOUND postgres
api-1 | Database connection attempt 4/5 failed: getaddrinfo ENOTFOUND postgres
api-1 | Database connection attempt 5/5 failed: getaddrinfo ENOTFOUND postgres
api-1 | Failed to start server: Error: Could not connect to database after maximum retries
```

### Root cause
The `DATABASE_URL` was using `postgres` as the hostname, but in `docker-compose.yml` the database service is named `db`. In Docker, containers communicate using the service name as the hostname — there was no service called `postgres`.

### Fix
Changed in `docker-compose.yml`:
```yaml
# Before
- DATABASE_URL=postgres://minishop:mini$hop_s3cret@postgres:5432/minishop

# After
- DATABASE_URL=postgres://minishop:mini$hop_s3cret@db:5432/minishop
```

---

## Bugs Verification

```bash
make up
make logs
```
```
api-1      | Successfully connected to database
api-1      | API server running on port 3000
proxy-1    | Configuration complete; ready for start up
frontend-1 | Configuration complete; ready for start up
```

1. Navigate to `http://localhost:8080` — Mini-Shop frontend loads ✅
2. Product list loads from the API ✅
3. Add items to cart and place an order ✅
4. Order appears as Completed in Your Orders ✅

---

## 2nd Goal: Redis Caching

### What I implemented
- Connected the API to Redis using the `REDIS_URL` environment variable
- Added caching to `GET /api/items` with a TTL of 60 seconds
- Cache is invalidated when a new order is placed (`POST /api/orders`)
- Redis failures are handled gracefully — the API continues to work even if Redis is unavailable

### Changes made

**`api/src/routes/items.js`**
- Added Redis client connection
- On `GET /api/items`: check cache first, return cached data if available (Cache HIT), otherwise fetch from DB and store in cache (Cache MISS)
- Exported `redisClient` for use in other routes

**`api/src/routes/orders.js`**
- Imported `redisClient` from items router
- After a successful order is placed, delete the `items:all` cache key so stock counts are fresh on next request

**`api/src/index.js`**
- Updated import of `itemsRouter` to use named export

### Verification
```bash
make logs-api
```
```
Cache MISS - fetching from database  ← first request, fetched from DB and saved to Redis
Cache HIT - returning cached items   ← second request, returned from Redis
```

---

## Bonus: Security Improvements

### 1. Passwords moved to .env file
Passwords were hardcoded in plain text in `docker-compose.yml`. Moved all sensitive data to `.env` file.

**Before (`docker-compose.yml`):**
```yaml
- DATABASE_URL=postgres://minishop:mini$hop_s3cret@db:5432/minishop
- POSTGRES_PASSWORD=mini$hop_s3cret
```

**After (`docker-compose.yml`):**
```yaml
- DATABASE_URL=${DATABASE_URL}
- POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

**`.env` file (not committed to git):**
```
POSTGRES_USER=minishop
POSTGRES_PASSWORD=mini$$hop_s3cret
POSTGRES_DB=minishop
DATABASE_URL=postgres://minishop:mini$$hop_s3cret@db:5432/minishop
```

### Issue with $ character in passwords
When moving passwords to the `.env` file, the `$` character in `mini$hop_s3cret`
was being interpreted as a shell variable by docker-compose, causing the password
to be read incorrectly.

**Fix:** Escaped the `$` character by doubling it to `$$` in the `.env` file:
```
# Before
POSTGRES_PASSWORD=mini$hop_s3cret

# After
POSTGRES_PASSWORD=mini$$hop_s3cret
```

After fixing this, the old database volume had to be cleared to allow
PostgreSQL to reinitialize with the correct password:
```bash
docker-compose down -v
make up
```

### 2. .dockerignore
Each service already had a `.dockerignore` file that prevents sensitive files from entering Docker images:

`api/.dockerignore` and `frontend/.dockerignore` both include:
```
.env*
node_modules
.git
```

This ensures `.env` files are never copied into any Docker image.

### 3. Rate Limiting at nginx level
Added rate limiting at the nginx proxy level — this is more efficient than application-level rate limiting as it blocks requests before they reach the API.

Added in `proxy/nginx.conf`:
```nginx
http {
    # Allocates 10MB to track binary IP addresses
    # Limits requests to 100 per minute
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;

    upstream frontend {
        server frontend:80;
    }

    upstream api {
        server api:3000;
    }

    server {
        listen 80;

        # API routing with rate limiting
        location /api {
            # Apply rate limiting: allows a burst of 20 requests
            limit_req zone=api_limit burst=20 nodelay;
        }
    }
}
```

### 4. Trivy Security Scan
Added `make security` command to the `Makefile` that runs a full automated security
scan across all services. The scan covers 5 areas:

1. **Secrets in code** — scans the entire codebase for exposed credentials
2. **API image** — scans for HIGH/CRITICAL vulnerabilities in the Node.js image
3. **Frontend image** — scans for vulnerabilities in the nginx/React image
4. **Proxy image** — scans for vulnerabilities in the nginx proxy image
5. **npm dependencies** — scans `api/package-lock.json` for vulnerable packages

```bash
make security
```

**Results:**
```
1. Secrets scan:     PASSED - no secrets found in codebase
2. API image:        11 HIGH vulnerabilities found in Node.js internals
                     (cross-spawn, glob, minimatch, tar)
                     Fix: upgrade Node.js base image to latest LTS
3. Frontend image:   PASSED - 0 vulnerabilities
4. Proxy image:      PASSED - 0 vulnerabilities
5. npm dependencies: PASSED - 0 vulnerabilities
```

The vulnerabilities found in the API image are in Node.js internal packages
(not in the application code itself) and all have available fixes via a
Node.js base image upgrade.

---

## Bonus: Health Check Improvements

The health check endpoint in `api/src/index.js` was only verifying the database connection.
Since Redis is now a critical part of the application (used for caching), it's important
to also verify Redis connectivity. If Redis is down, the health check should reflect that
so that monitoring systems and load balancers can react accordingly.

### Changes made in `api/src/index.js`

**Before:**
```javascript
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy' });
  }
});
```

**After:**
```javascript
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redisClient.ping();
    res.json({
      status: 'healthy',
      db: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### Verification
```bash
curl http://localhost:8080/api/health
```
```json
{
  "status": "healthy",
  "db": "connected",
  "redis": "connected",
  "timestamp": "2026-04-24T..."
}
```

---

## Bonus: Architectural Improvements

- Moved sensitive credentials from `docker-compose.yml` to `.env` file
- Added rate limiting at nginx level to protect API endpoints
- Enhanced health check to monitor all critical dependencies
- Added `make security` command for automated vulnerability scanning
- In production, Trivy JSON output would feed into a dashboard tool like DefectDojo or Grafana for centralized security monitoring

### HTTPS / SSL Termination
Currently the application runs on HTTP. In a production environment, the recommended approach is to add SSL termination at the nginx proxy level using Let's Encrypt and certbot:

```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domain/privkey.pem;
}

# Redirect all HTTP to HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

This ensures all traffic between the browser and the proxy is encrypted, protecting passwords and sensitive data in transit.
