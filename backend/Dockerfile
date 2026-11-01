# Production Dockerfile with node:alpine base image
FROM node:alpine


# Set application directory
WORKDIR /app

# Copy package manifests first for optimal layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure uploads directory exists and set permissions for node user
RUN mkdir -p uploads && chown -R node:node /app

# Switch to non-root user
USER node

# Expose backend port
EXPOSE 5000

# Start the Express server
CMD ["node", "server.js"]

