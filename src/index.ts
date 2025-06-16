import dotenv from "dotenv";
// Load up env file which contains credentials
// dotenv.config({ path: `.env.${process.env.NODE_ENV}` });
dotenv.config({ path: ".env" });

import { Server } from "./server";

const server = new Server();
server.listen(8000);
