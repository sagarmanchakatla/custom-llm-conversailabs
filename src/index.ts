import dotenv from "dotenv";

dotenv.config({ path: ".env" });

import { Server } from "./server";

const server = new Server();
server.listen(8000);
