# Imagem de runtime do Megus AI. Roda via tsx (resolve imports ESM sem extensão,
# o que o tsc puro não faz). Para o piloto é suficiente; bundling fica para depois.
FROM node:22-slim

WORKDIR /app

# Deps primeiro (cache). npm ci SEM NODE_ENV=production para incluir o tsx (devDep).
COPY package.json package-lock.json ./
RUN npm ci

# Código
COPY . .

EXPOSE 3000
CMD ["npx", "tsx", "src/main.ts"]
