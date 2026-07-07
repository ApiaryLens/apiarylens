# OpenHive Architecture & Design (Living Document)

## Vision
OpenHive is an open-source, self-hosted Apiary Management System designed to scale from a single backyard hive to commercial operations.

## Guiding Principles
- Offline-first PWA
- Self-hosted with Docker
- Open API
- Privacy-first
- AI-assisted, not AI-dependent
- Modular architecture

## Major Modules
- Authentication & Organizations
- Apiaries & Hives
- Boxes, Frames & Equipment
- Queen Management
- Inspections
- Health & Disease
- Varroa Tracking
- Feeding
- Honey & Wax Production
- Inventory
- Weather & Historical Weather
- Bloom Calendar & Forage Database
- Maps & GPS
- Photos & Video Almanac
- AI Image Review
- Sharing & Mentoring
- Reporting
- Public REST API

## Technology (proposed)
Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui + Capacitor
Backend: FastAPI
Database: PostgreSQL
Cache: Redis (optional)
Storage: Local filesystem or S3-compatible
Deployment: Docker Compose / Kubernetes (optional)

## Roadmap
Phase 1: Foundation
Phase 2: Hive Management
Phase 3: Inspection & Health
Phase 4: Weather & Bloom Intelligence
Phase 5: AI Assistant
Phase 6: Native Apps
