import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Public health — `commit` confirms Railway redeployed latest git push. */
router.get(["/healthz", "/health"], (_req, res) => {
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.GIT_COMMIT?.slice(0, 7) ??
    process.env.BUILD_COMMIT?.slice(0, 7) ??
    null;
  res.json({
    status: "ok",
    service: "@workspace/api-server",
    ...(commit ? { commit } : {}),
  });
});

export default router;
