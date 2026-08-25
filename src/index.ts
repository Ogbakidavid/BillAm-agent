// Starts the server and loads configuration
import { app } from "./app";
import { env } from "./config/env";

const port = env.port;

app.listen(port, () => {
  console.log(`BillAm agent listening on http://localhost:${port}`);
});
