# EduStore Web (React/Vite SPA → nginx). Контекст сборки = корень монорепо.
#   docker build -f apps/web/Dockerfile -t edustore-web .
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm install
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm --workspace apps/web run build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
