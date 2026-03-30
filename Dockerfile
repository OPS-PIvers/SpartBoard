# Stage 1: Build
FROM node:20.18.0-alpine@sha256:b1e0880c3af955867bc2f1944b49d20187beb7afa3f30173e15a97149ab7f5f1 AS builder

WORKDIR /app

# Install pnpm securely
RUN npm install -g pnpm@10.30.2

COPY package.json pnpm-lock.yaml ./
# Install dependencies including devDependencies (needed for build)
RUN pnpm install --frozen-lockfile

COPY . .

# Define build arguments for VITE environment variables
# These must be passed via --build-arg during docker build
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_GEMINI_API_KEY
ARG VITE_OPENWEATHER_API_KEY
ARG VITE_GOOGLE_CLIENT_ID

# Set environment variables from build arguments so Vite can see them
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Build the application
RUN pnpm run build

# Stage 2: Serve
FROM nginx:1.26.2-alpine@sha256:b9e1705b69f778dca93cbbbe97d2c2562fb26cac1079cdea4e40d1dad98f14fe

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]