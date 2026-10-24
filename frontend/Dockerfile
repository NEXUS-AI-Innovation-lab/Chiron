# Étape 1 : Construction (Build)
FROM node:20-alpine

WORKDIR /app

# Copie des dépendances
COPY package*.json ./
RUN npm install

# Copie du code source
COPY . .

# On expose le port de Vite
EXPOSE 5173

# Lancement en mode développement (pour que ça reste simple et modifiable)
CMD ["npm", "run", "dev", "--", "--host"]