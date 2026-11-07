"""Clients des services externes au backend (MinIO, Orthanc, InstanSeg).

Chaque module crée UN client partagé par toute l'application. Aucune règle
métier ici : seulement « comment parler à ce service ».
"""
