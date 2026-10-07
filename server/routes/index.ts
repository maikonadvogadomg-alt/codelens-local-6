import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import importGithubRouter from "./import-github";
import filesRouter from "./files";
import execRouter from "./exec";
import aiRouter from "./ai";
import githubRouter from "./github";
import settingsRouter from "./settings";
import previewRouter from "./preview";
import devServerRouter from "./dev-server";
import snippetsRouter from "./snippets";
import codeRunRouter from "./code-run";
import codeAssistantRouter from "./code-assistant";
import gitRouter from "./git";

const router: IRouter = Router();

router.use(healthRouter);
router.use(importGithubRouter);
router.use(projectsRouter);
router.use(filesRouter);
router.use(execRouter);
router.use(aiRouter);
router.use(githubRouter);
router.use(settingsRouter);
router.use(previewRouter);
router.use(devServerRouter);
router.use(snippetsRouter);
router.use(codeRunRouter);
router.use(codeAssistantRouter);
router.use(gitRouter);

export default router;
