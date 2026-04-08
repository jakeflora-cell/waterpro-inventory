FROM node:20-alpine

WORKDIR /app

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

# Seed runs at startup (INSERT OR IGNORE so it's safe to re-run)
CMD ["sh", "-c", "node seed.js && node server.js"]
