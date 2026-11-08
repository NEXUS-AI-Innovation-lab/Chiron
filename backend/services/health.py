"""État réel des dépendances du backend (base de données, InstanSeg)."""

from typing import Tuple

from sqlalchemy import text

import database
from clients.instanseg import instanseg_client


async def check() -> Tuple[bool, dict]:
    """Interroge réellement la base et InstanSeg.

    :returns: (tout va bien ?, détail par dépendance)
    """
    database_state = {"status": "connected"}
    try:
        with database.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as error:
        database_state = {"status": "disconnected", "error": str(error)}

    instanseg_state = {}
    try:
        instanseg_state = await instanseg_client.health()
    except Exception as error:
        instanseg_state = {"status": "disconnected", "error": str(error)}

    healthy = (
        database_state["status"] == "connected"
        and instanseg_state.get("status") != "disconnected"
    )
    payload = {
        "status": "ok" if healthy else "degraded",
        "backend": "connected",
        "instanseg": instanseg_state,
        "database": database_state,
    }
    return healthy, payload
