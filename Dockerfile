# Frontend Dockerfile for Kiplombe Medical Centre HMIS (Next.js)
# Using regular node image instead of alpine for SWC binary compatibility
FROM node:18

# Set working directory
WORKDIR /app

# Copy application code. Dependencies are installed by the entrypoint at
# container startup because docker-compose mounts node_modules as a volume.
COPY . .

# Create a non-root user for Next.js. npm needs a writable home/cache
# when dependencies are installed by the runtime entrypoint.
RUN groupadd -r appuser && useradd -m -d /home/appuser -r -g appuser -u 1001 appuser
ENV HOME=/home/appuser
ENV NPM_CONFIG_CACHE=/home/appuser/.npm

# Copy entrypoint script (for development hot-reload support)
COPY docker-entrypoint-frontend.sh /usr/local/bin/docker-entrypoint-frontend.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-frontend.sh

# Create a wrapper script that fixes mounted volume permissions before switching users
RUN echo '#!/bin/sh\n\
mkdir -p /app/node_modules /app/.next\n\
mkdir -p /home/appuser/.npm\n\
chown -R appuser:appuser /app/node_modules /app/.next /home/appuser 2>/dev/null || true\n\
exec gosu appuser /usr/local/bin/docker-entrypoint-frontend.sh "$@"' > /usr/local/bin/entrypoint-wrapper.sh && \
    chmod +x /usr/local/bin/entrypoint-wrapper.sh

# Install gosu for user switching
RUN apt-get update && apt-get install -y gosu && rm -rf /var/lib/apt/lists/*

# Change ownership of app directory to non-root user
RUN chown -R appuser:appuser /app

# Keep as root for entrypoint wrapper to fix permissions
# The wrapper will switch to appuser

# Expose Next.js port
EXPOSE 3000

# Use wrapper entrypoint that fixes permissions before switching users
ENTRYPOINT ["/usr/local/bin/entrypoint-wrapper.sh"]

# Start Next.js on the container port that docker-compose publishes.
CMD ["npx", "next", "dev", "--turbo", "-H", "0.0.0.0", "-p", "3000"]
