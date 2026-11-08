"""Point d'entrée de l'API Chiron (lancé par `uvicorn main:app`).

Ce fichier ne contient plus aucune route ni règle métier. Il se contente
d'assembler l'application :

1. le cycle de vie (migrations au démarrage, fermeture des clients à l'arrêt) ;
2. les middlewares (CORS) ;
3. la traduction des erreurs métier en réponses HTTP ;
4. les fichiers statiques (tuiles DZI) ;
5. l'inclusion des routeurs, un par domaine.

Pour savoir où se trouve quoi : docs/14-architecture-backend.md.
"""

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import config
from clients.instanseg import instanseg_client
from migrations import apply_migrations_safely
from routers import account, analysis, biopsies, extractions, health, patients, radiology
from routers.dependencies import require_user
from services.errors import ServiceError
from workflow.router import router as workflow_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Démarrage puis arrêt de l'application.

    Remplace `@app.on_event("shutdown")`, déprécié par FastAPI (dette C7).
    """
    apply_migrations_safely()
    yield
    # Le client HTTP d'InstanSeg garde un pool de connexions ouvert.
    await instanseg_client.close()


app = FastAPI(title="Chiron API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def service_error_handler(request: Request, exc: ServiceError) -> JSONResponse:
    """Une erreur métier devient une réponse `{"detail": ...}`, comme une HTTPException."""
    return JSONResponse(
        status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
    )


# Tuiles DZI générées par l'import des lames, lues par OpenSeadragon.
os.makedirs(config.DZI_FOLDER, exist_ok=True)
app.mount("/dzi_data", StaticFiles(directory=config.DZI_FOLDER), name="dzi_data")

# Publique : la supervision doit répondre même sans session.
app.include_router(health.router)

# Toutes les routes métier exigent un utilisateur connecté (jeton Supabase).
# Les tuiles /dzi_data restent publiques : OpenSeadragon les charge sans
# pouvoir y joindre d'en-tête (limite connue, docs/16-supabase.md).
_connecte = [Depends(require_user)]
app.include_router(account.router)  # protège elle-même sa route /me
app.include_router(patients.router, dependencies=_connecte)
app.include_router(biopsies.router, dependencies=_connecte)
app.include_router(radiology.router, dependencies=_connecte)
app.include_router(analysis.router, dependencies=_connecte)
app.include_router(extractions.router, dependencies=_connecte)
app.include_router(workflow_router, dependencies=_connecte)
