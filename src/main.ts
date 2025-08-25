import app from "./app";
import {initRedis} from "./app/service/redis.service";
import {ENV} from "./app/config/env.config";

async function bootstrap() {
    await initRedis();
    const main = app.listen(ENV.PORT);
    main.on("listening", () => console.log(`Server running on ${ENV.PORT}`));
}

bootstrap();