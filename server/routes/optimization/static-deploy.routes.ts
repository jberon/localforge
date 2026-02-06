import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";

const router = Router();

router.post("/build", asyncHandler(async (req, res) => {
  const { projectId, code, files } = req.body;
  const deployableHtml = generateStaticDeployBundle(code, files);
  res.json({ html: deployableHtml, size: deployableHtml.length });
}));

function generateStaticDeployBundle(code: string, files?: Array<{path: string; content: string}>): string {
  if (files && files.length > 0) {
    const mainFile = files.find(f => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx") || f.path.endsWith("index.tsx"));
    const cssFiles = files.filter(f => f.path.endsWith(".css"));
    const cssContent = cssFiles.map(f => f.content).join("\n");
    const jsContent = files.filter(f => !f.path.endsWith(".css")).map(f => `// ${f.path}\n${f.content}`).join("\n\n");
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deployed App</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css">
  <style>${cssContent}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
${jsContent}
  </script>
</body>
</html>`;
  }
  
  return code || "<!DOCTYPE html><html><body><p>No content to deploy</p></body></html>";
}

export default router;
