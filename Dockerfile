# Use latest LTS
FROM node:8.10.0-alpine

WORKDIR /usr/Spoke

# Cache dependencies
COPY package.json .
RUN npm install

# Configure build environment
ARG PHONE_NUMBER_COUNTRY=US
ENV NODE_ENV="production" \
  OUTPUT_DIR="./build" \
  ASSETS_DIR="./build/client/assets" \
  ASSETS_MAP_FILE="assets.json" \
  PHONE_NUMBER_COUNTRY=$PHONE_NUMBER_COUNTRY

# Copy application codebase
COPY . .
RUN npm run prod-build

# Run the production compiled code
EXPOSE 3000
CMD [ "npm", "run", "start" ]
