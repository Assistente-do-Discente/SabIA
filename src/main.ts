import app from "./app";
import {initRedis} from "./app/service/redis.service";
import {ENV} from "./app/config/env.config";
import {TelegramService} from "./app/service/telegram.service";

async function bootstrap() {
    await initRedis();
    app.listen(ENV.PORT, () => {
        console.log(`Server running on port ${ENV.PORT}`);
        TelegramService.init();
    });
}

bootstrap();