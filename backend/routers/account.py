"""Route du compte de l'utilisateur connecté."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from routers.dependencies import require_user
from services.auth import CurrentUser

router = APIRouter(tags=["account"])


class MeSchema(BaseModel):
    id: str
    email: str
    full_name: str
    display_name: str
    profession: Optional[str] = None


@router.get("/me", response_model=MeSchema)
def get_me(user: CurrentUser = Depends(require_user)):
    """Identité lue dans le jeton : sert au frontend à vérifier la session."""
    return MeSchema(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        display_name=user.display_name,
        profession=user.profession,
    )
