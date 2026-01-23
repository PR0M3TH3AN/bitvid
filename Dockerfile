# Base image matching the Playwright version in package.json
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
# We use npm ci for a clean, deterministic install
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Default command
CMD ["npm", "run", "test:visual"]
