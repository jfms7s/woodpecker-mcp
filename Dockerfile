FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Numeric, not `USER node`: a Kubernetes runAsNonRoot check can't resolve a
# user name to a uid. 1000:1000 is node:22-alpine's `node` user.
USER 1000:1000
EXPOSE 3000
ENV WOODPECKER_MCP_TRANSPORT=http
CMD ["node", "dist/index.js"]
