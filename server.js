// Local development: API + Vite dev server on one port (http://localhost:3000)
// On Vercel, api/index.js runs as a serverless function instead.
import { createServer as createViteServer } from "vite";
import app from "./api/index.js";

const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
app.use(vite.middlewares);
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Service Tracker running on http://localhost:${port}`));
