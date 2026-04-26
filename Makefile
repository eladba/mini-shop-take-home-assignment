.PHONY: up down logs logs-api logs-db logs-proxy logs-frontend shell-api shell-db clean rebuild build help security ps config test-health test-db

# Default target
help:
	@echo "Mini-Shop Development Commands"
	@echo "=============================="
	@echo ""
	@echo "  make up           - Start all services (auto-creates .env)"
	@echo "  make down         - Stop all services"
	@echo "  make build        - Build all images"
	@echo "  make rebuild      - Clean rebuild everything"
	@echo "  make clean        - Remove containers, volumes, images"
	@echo ""
	@echo "  make logs         - View all logs"
	@echo "  make logs-api     - View API logs"
	@echo "  make logs-db      - View database logs"
	@echo "  make logs-proxy   - View proxy logs"
	@echo "  make logs-frontend - View frontend logs"
	@echo ""
	@echo "  make shell-api    - Shell into API container"
	@echo "  make shell-db     - Shell into DB container"
	@echo "  make shell-proxy  - Shell into proxy container"
	@echo ""
	@echo "  make ps           - Show container status"
	@echo "  make config       - Show resolved compose config"
	@echo ""
	@echo "  make security     - Run full Trivy security scan"
	@echo ""

# Start all services
up:
	@if [ ! -f .env ]; then \
		echo "Creating .env from .env.example..."; \
		cp .env.example .env; \
	fi
	docker-compose up --build -d
	@echo ""
	@echo "Services starting... Check status with: make ps"
	@echo "View logs with: make logs"
	@echo "Access the app at: http://localhost:8080"

# Stop all services
down:
	docker-compose down

# Build images without starting
build:
	docker-compose build

# View all logs
logs:
	docker-compose logs -f

# View specific service logs
logs-api:
	docker-compose logs -f api

logs-db:
	docker-compose logs -f db

logs-proxy:
	docker-compose logs -f proxy

logs-frontend:
	docker-compose logs -f frontend

logs-cache:
	docker-compose logs -f cache

# Shell into containers
shell-api:
	docker-compose exec api sh

shell-db:
	docker-compose exec db psql -U minishop -d minishop

shell-proxy:
	docker-compose exec proxy sh

shell-frontend:
	docker-compose exec frontend sh

# Show container status
ps:
	docker-compose ps

# Show resolved config
config:
	docker-compose config

# Clean everything
clean:
	docker-compose down -v --rmi all --remove-orphans
	@echo "Cleaned up all containers, volumes, and images"

# Rebuild from scratch
rebuild: clean
	@if [ ! -f .env ]; then cp .env.example .env; fi
	docker-compose build --no-cache
	docker-compose up -d
	@echo ""
	@echo "Rebuilt and started all services"
	@echo "Access the app at: http://localhost:8080"

# Test API health
test-health:
	@echo "Testing API health..."
	@curl -s http://localhost:8080/api/health || echo "API not responding"

# Test database connection
test-db:
	docker-compose exec db pg_isready -U minishop -d minishop

# Full security scan
security:
	@echo "=========================================="
	@echo "        FULL SECURITY SCAN"
	@echo "=========================================="
	@echo ""
	@echo "1. Scanning for secrets in code..."
	docker run --rm \
		-v $(PWD):/scan \
		aquasec/trivy:latest \
		fs \
		--scanners secret \
		--format table \
		/scan
	@echo ""
	@echo "2. Scanning API image for vulnerabilities..."
	docker run --rm \
		-v /var/run/docker.sock:/var/run/docker.sock \
		aquasec/trivy:latest \
		image \
		--severity HIGH,CRITICAL \
		mini-shop-take-home-assignment-api
	@echo ""
	@echo "3. Scanning Frontend image for vulnerabilities..."
	docker run --rm \
		-v /var/run/docker.sock:/var/run/docker.sock \
		aquasec/trivy:latest \
		image \
		--severity HIGH,CRITICAL \
		mini-shop-take-home-assignment-frontend
	@echo ""
	@echo "4. Scanning Proxy image for vulnerabilities..."
	docker run --rm \
		-v /var/run/docker.sock:/var/run/docker.sock \
		aquasec/trivy:latest \
		image \
		--severity HIGH,CRITICAL \
		mini-shop-take-home-assignment-proxy
	@echo ""
	@echo "5. Scanning npm dependencies..."
	docker run --rm \
		-v $(PWD)/api:/scan \
		aquasec/trivy:latest \
		fs \
		--scanners vuln \
		--format table \
		/scan
	@echo ""
	@echo "=========================================="
	@echo "        SCAN COMPLETE"
	@echo "=========================================="
