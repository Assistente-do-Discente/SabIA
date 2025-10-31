import pino from "pino";
import pinoCaller from "pino-caller";
import path from "path";

const logger = pinoCaller(
    pino({
        level: process.env.LOG_LEVEL || "info",
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
                singleLine: false
            }
        }
    }), { relativeTo: path.resolve("./") }
);

export default logger;
