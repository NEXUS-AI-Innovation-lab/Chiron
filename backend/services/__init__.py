"""Logique métier de l'API, un module par domaine.

Un service ne connaît ni FastAPI ni HTTP : il reçoit une session de base de
données et des données déjà validées, et signale un problème en levant une
`ServiceError` (voir `services/errors.py`). C'est `main.py` qui traduit ces
erreurs en réponses HTTP.
"""
