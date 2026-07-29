FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .
RUN bun build src/index.ts --outdir dist --target bun

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["bun", "run", "dist/index.js"]
