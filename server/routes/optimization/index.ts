import { Router } from "express";
import selfTestingRoutes from "./self-testing.routes";
import imageImportRoutes from "./image-import.routes";
import templatesRoutes from "./templates.routes";
import modelRouterRoutes from "./model-router.routes";
import visualEditorRoutes from "./visual-editor.routes";
import codeQualityRoutes from "./code-quality.routes";
import staticDeployRoutes from "./static-deploy.routes";

const router = Router();

router.use("/self-testing", selfTestingRoutes);
router.use("/image-import", imageImportRoutes);
router.use("/templates", templatesRoutes);
router.use("/model-router", modelRouterRoutes);
router.use("/visual-editor", visualEditorRoutes);
router.use("/code-quality", codeQualityRoutes);
router.use("/static-deploy", staticDeployRoutes);

export default router;
