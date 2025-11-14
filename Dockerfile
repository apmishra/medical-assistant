# Multi-stage build for Medical Assistant with Backend Proxy

FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build React app
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./

# Install only production dependencies + server dependencies
RUN npm install --production && \
    npm install express cors

# Copy built React app from builder
COPY --from=builder /app/build ./build

# Copy server file
COPY server.js ./

# Expose port
EXPOSE 3000

# Start the Express server
CMD ["node", "server.js"]
