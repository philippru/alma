"""
ALMA Backend — FastAPI entry point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import get_settings
from app.database import create_tables
from app.api.v1 import assessments, integrations, player, studio, tenants

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_tables()
    os.makedirs(settings.upload_dir, exist_ok=True)
    yield
    # Shutdown (nothing to clean up for now)


app = FastAPI(
    title="ALMA API",
    description="AI-based Logic & Medical Assessments — Backend",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ──────────────────────────────────────────
# CORS
# ──────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────
# Routes
# ──────────────────────────────────────────
PREFIX = settings.api_prefix

app.include_router(tenants.router, prefix=PREFIX)
app.include_router(assessments.router, prefix=PREFIX)
app.include_router(player.router, prefix=PREFIX)
app.include_router(studio.router, prefix=PREFIX)
app.include_router(integrations.router, prefix=PREFIX)


# ──────────────────────────────────────────
# Health check
# ──────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "ALMA Backend", "version": "0.1.0"}


@app.get("/", tags=["system"])
async def root():
    return {
        "service": "ALMA API",
        "docs": "/docs",
        "health": "/health",
    }
