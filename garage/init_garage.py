"""Prépare Garage au premier démarrage : disposition du cluster, clé d'accès, bucket.

Contrairement à MinIO, Garage ne fait rien tout seul au démarrage. Un nœud
neuf n'a pas de rôle (« layout »), aucune clé d'accès et aucun bucket. Ce
script s'en charge via l'API d'administration v2 de Garage. Il est lancé par
le service `garage_init` de docker-compose.yml, avant le backend et le seeder.

Il est **idempotent** : relancé sur un Garage déjà prêt, il ne change rien.

Bibliothèque standard uniquement : il tourne dans une image `python` nue.

Variables d'environnement :

* GARAGE_ADMIN_URL    adresse de l'API d'administration (http://garage:3903)
* GARAGE_ADMIN_TOKEN  jeton d'administration (le même que celui de Garage)
* S3_ACCESS_KEY       identifiant de la clé à créer (format GK + 24 hexa)
* S3_SECRET_KEY       secret de la clé (64 hexa)
* S3_BUCKET           nom du bucket (biopsie)
* GARAGE_CAPACITY     capacité annoncée pour le nœud, en octets (défaut 10 Go)
* GARAGE_ZONE         zone du nœud (défaut dc1)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ADMIN_URL = os.getenv("GARAGE_ADMIN_URL", "http://garage:3903").rstrip("/")
ADMIN_TOKEN = os.environ["GARAGE_ADMIN_TOKEN"]
ACCESS_KEY = os.environ["S3_ACCESS_KEY"]
SECRET_KEY = os.environ["S3_SECRET_KEY"]
BUCKET = os.getenv("S3_BUCKET", "biopsie")
CAPACITY = int(os.getenv("GARAGE_CAPACITY", str(10 * 1024**3)))
ZONE = os.getenv("GARAGE_ZONE", "dc1")


class AdminError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status} : {body}")
        self.status = status


def call(endpoint: str, body=None, query=None):
    """Appelle un point de l'API d'administration v2 (GET sans corps, POST sinon)."""
    url = f"{ADMIN_URL}/v2/{endpoint}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        url,
        data=data,
        method="GET" if body is None else "POST",
        headers={
            "Authorization": f"Bearer {ADMIN_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise AdminError(error.code, error.read().decode(errors="replace")) from None


def wait_for_garage(attempts: int = 60, delay: float = 2.0) -> dict:
    """Attend que l'API d'administration réponde, puis renvoie l'état du cluster."""
    for attempt in range(1, attempts + 1):
        try:
            return call("GetClusterStatus")
        except (urllib.error.URLError, ConnectionError, AdminError) as error:
            if attempt == attempts:
                raise SystemExit(f"[echec] Garage injoignable : {error}")
            time.sleep(delay)
    raise SystemExit("[echec] Garage injoignable")


def ensure_layout(status: dict) -> None:
    """Donne un rôle de stockage à chaque nœud qui n'en a pas, puis applique."""
    sans_role = [node for node in status["nodes"] if not node.get("role")]
    if not sans_role:
        print(f"[=] disposition deja en place (version {status['layoutVersion']})")
        return

    call(
        "UpdateClusterLayout",
        {
            "roles": [
                {"id": node["id"], "zone": ZONE, "capacity": CAPACITY, "tags": []}
                for node in sans_role
            ]
        },
    )
    version = call("GetClusterLayout")["version"] + 1
    call("ApplyClusterLayout", {"version": version})
    print(f"[+] disposition appliquee (version {version}, {len(sans_role)} noeud(s))")


def ensure_key() -> None:
    """Importe la clé d'accès fixe utilisée par le backend et le seeder."""
    try:
        call("GetKeyInfo", query={"id": ACCESS_KEY})
        print(f"[=] cle {ACCESS_KEY} deja presente")
    except AdminError as error:
        if error.status != 404:
            raise
        call(
            "ImportKey",
            {"accessKeyId": ACCESS_KEY, "secretAccessKey": SECRET_KEY, "name": "chiron-backend"},
        )
        print(f"[+] cle {ACCESS_KEY} importee")


def ensure_bucket() -> None:
    """Crée le bucket s'il manque, et donne tous les droits à la clé."""
    try:
        bucket = call("GetBucketInfo", query={"globalAlias": BUCKET})
        print(f"[=] bucket '{BUCKET}' deja present")
    except AdminError as error:
        if error.status != 404:
            raise
        bucket = call("CreateBucket", {"globalAlias": BUCKET})
        print(f"[+] bucket '{BUCKET}' cree")

    call(
        "AllowBucketKey",
        {
            "bucketId": bucket["id"],
            "accessKeyId": ACCESS_KEY,
            "permissions": {"read": True, "write": True, "owner": True},
        },
    )
    print(f"[=] cle autorisee en lecture/ecriture sur '{BUCKET}'")


def main() -> None:
    status = wait_for_garage()
    ensure_layout(status)
    ensure_key()
    ensure_bucket()
    print("Garage pret.")


if __name__ == "__main__":
    try:
        main()
    except AdminError as error:
        sys.exit(f"[echec] API d'administration Garage : {error}")
