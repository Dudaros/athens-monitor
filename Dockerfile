FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY src ./src
COPY sql ./sql

EXPOSE 3000

CMD ["npm", "run", "start:api"]
