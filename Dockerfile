FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm@9

# Layer caching: deps before source
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build SvelteKit (node adapter → ./build)
RUN pnpm run build

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "build"]
