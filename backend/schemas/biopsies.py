"""Schémas des lames de biopsie."""

from typing import Optional

from pydantic import BaseModel, ConfigDict


class BiopsySchema(BaseModel):
    """Lame telle que renvoyée au frontend (`image_url` = chemin du .dzi)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: Optional[str] = None
    status: str
