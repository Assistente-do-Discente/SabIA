# Etapa 1: Build da aplicação
FROM node:20-alpine as builder

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de definição do projeto
COPY package*.json ./

# Instala apenas as dependências de produção e desenvolvimento
RUN npm install

# Copia o restante da aplicação
COPY . .

# Compila o projeto NestJS (assumindo que usa TypeScript)
RUN npm run build

# Etapa 2: Imagem final para produção
FROM node:20-alpine

# Define o diretório de trabalho na imagem final
WORKDIR /app

# Copia apenas os arquivos necessários da imagem de build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Expõe a porta que o NestJS usa (geralmente 3000)
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["node", "dist/main"]
