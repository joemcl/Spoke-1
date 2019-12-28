# Use latest LTS
FROM node:12.14.0-alpine

WORKDIR /usr/Spoke

# Cache dependencies
COPY package.json yarn.lock ./
RUN yarn install

# Configure build environment
ARG PHONE_NUMBER_COUNTRY=US
ENV NODE_ENV="production" \
  PORT=3000 \
  OUTPUT_DIR="./build" \
  PUBLIC_DIR="./build/client" \
  ASSETS_DIR="./build/client/assets" \
  ASSETS_MAP_FILE="assets.json" \
  PHONE_NUMBER_COUNTRY=$PHONE_NUMBER_COUNTRY

# Copy application codebase
COPY . .
RUN yarn run prod-build

ARG SPOKE_VERSION="no-version"
ENV SPOKE_VERSION=$SPOKE_VERSION

# Run the production compiled code
EXPOSE 3000
CMD [ "yarn", "run", "start" ]
