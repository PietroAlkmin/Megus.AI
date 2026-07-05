# Imagem de runtime do Megus AI. Roda via tsx (resolve imports ESM sem extensão,
# o que o tsc puro não faz). Para o piloto é suficiente; bundling fica para depois.
FROM node:22-slim

# openssl + ca-certificates: o node:22-slim não os traz, e o Prisma precisa deles
# para (a) escolher o engine certo e (b) fazer TLS com o Azure SQL — sem isso o boot
# falha com "certificate verify failed / unable to get local issuer certificate".
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Deps primeiro (cache). npm ci SEM NODE_ENV=production para incluir o tsx (devDep).
COPY package.json package-lock.json ./
RUN npm ci

# Código
COPY . .

# Gera o client do Prisma DEPOIS de copiar o schema. Se ficasse só no postinstall do
# npm ci (que roda antes do COPY), o schema não estaria presente e o client sairia
# como stub → "@prisma/client did not initialize yet".
RUN npx prisma generate

EXPOSE 3000
CMD ["npx", "tsx", "src/main.ts"]
