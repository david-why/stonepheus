FROM oven/bun:latest

WORKDIR /app

# Copy lockfile and package.json first for cached installs
COPY bun.lock package.json ./

# Install production dependencies
RUN bun install --production

# Copy the rest of the app
COPY . .

# Expose the port used by the app (default in .env.local)
EXPOSE 48492

# Start the Bun server using the project's prod script
CMD ["bun", "prod"]
