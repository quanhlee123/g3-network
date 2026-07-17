-- Bật extension theo kiến trúc đã chốt (CLAUDE.md):
-- TimescaleDB cho dữ liệu time-series (telemetry), PostGIS cho dữ liệu không gian (vị trí xe).
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
