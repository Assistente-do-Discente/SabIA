import * as dotenv from "dotenv";
import app from "./app";
import { Pool } from "pg";

dotenv.config();

const pgUser = process.env.PG_USER;
const pgPass = process.env.PG_PASS;
const pgUrl = process.env.PG_URL;
const pgDb = process.env.PG_DB;
const port = process.env.PORT;
const connectionString = `postgresql://${pgUser}:${pgPass}@${pgUrl}/${pgDb}`;
export const pool = new Pool({connectionString: connectionString});

async function testDbConnection() {
    try {
        await pool.query("SELECT 1");
    } catch (error) {
        console.error("Erro ao conectar ao banco de dados:", error);
        process.exit(1);
    }
}

testDbConnection().then(() => {
    const main = app.listen(port);
    main.on("listening", () => console.log(`Server running on ${port}`));
});