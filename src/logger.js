import winston from "winston";
import expressWinston from "express-winston";
import "winston-mongodb";

import { config } from "./config";

// Winston configuration
const logger = winston.createLogger({
  exitOnError: false,
  transports: [
    new winston.transports.Console({
      level: config.LOG_LEVEL,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

if (config.LOGGING_MONGODB_URI) {
  logger.add(
    new winston.transports.MongoDB({
      db: config.LOGGING_MONGODB_URI,
      level: config.LOG_LEVEL,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );
}

export const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  level: config.REQUEST_LOG_LEVEL,
  meta: true, // optional: control whether you want to log the meta data about the request (default to true)
  msg: "HTTP {{req.method}} {{req.url}}", // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}"
  expressFormat: false, // Use the default Express/morgan request formatting. Enabling this will override any msg if true. Will only output colors with colorize set to true
  colorize: false, // Color the text and status code, using the Express/morgan color palette (text: gray, status: default green, 3XX cyan, 4XX yellow, 5XX red).
  ignoreRoute: (req, res) => false // optional: allows to skip some log messages based on request and/or response
});

export default logger;
