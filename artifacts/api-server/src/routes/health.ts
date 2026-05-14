import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Public health — include `service` so you can verify Railway DNS points here (not a static SPA). */
router.get(["/healthz", "/health"], (_req, res) => {
  res.json({ status: "ok", service: "@workspace/api-server" });
});

export default router;
