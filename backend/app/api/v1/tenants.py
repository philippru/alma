from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.tenant import Tenant

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/")
async def list_tenants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.is_active == True))
    tenants = result.scalars().all()
    return [{"id": t.id, "name": t.name, "slug": t.slug} for t in tenants]


@router.post("/")
async def create_tenant(payload: dict, db: AsyncSession = Depends(get_db)):
    tenant = Tenant(
        name=payload["name"],
        slug=payload["slug"],
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return {"id": tenant.id, "name": tenant.name, "slug": tenant.slug}
