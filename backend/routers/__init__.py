"""Routes HTTP de l'API, un fichier par domaine.

Un routeur ne contient aucune règle métier : il déclare l'URL, valide
l'entrée (schémas Pydantic), appelle le service et renvoie sa réponse. Les
erreurs levées par les services sont converties en HTTP dans `main.py`.
"""
