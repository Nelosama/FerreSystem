#!/usr/bin/env bash

# Script para levantar Backend y Frontend simultáneamente
echo "🚀 Iniciando FerreSystem en modo desarrollo..."

trap 'kill 0' EXIT

echo "📦 Iniciando Backend (NestJS)..."
(cd backend && npm run start:dev) &

echo "💻 Iniciando Frontend (React/Vite)..."
(cd frontend && npm run dev) &

wait
