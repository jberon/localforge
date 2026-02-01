import type { DataModel, GeneratedFile } from "@shared/schema";
import { toKebabCase, pluralize } from "./generators/utils";
import { generateDrizzleSchema } from "./generators/schema";
import { generateExpressRoutes } from "./generators/routes";
import { generateReactComponent } from "./generators/frontend";
import { generateDockerfile, generateDockerCompose, generateEnvExample } from "./generators/docker";
import { generatePackageJson, generateReadme } from "./generators/package";

export function generateFullStackProject(projectName: string, dataModel: DataModel): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: 'package.json',
    content: generatePackageJson(projectName),
  });

  files.push({
    path: 'README.md',
    content: generateReadme(projectName, dataModel),
  });

  files.push({
    path: 'shared/schema.ts',
    content: generateDrizzleSchema(dataModel),
  });

  files.push({
    path: 'server/routes.ts',
    content: generateExpressRoutes(dataModel),
  });

  for (const entity of dataModel.entities) {
    files.push({
      path: `client/src/pages/${toKebabCase(pluralize(entity.name))}.tsx`,
      content: generateReactComponent(entity),
    });
  }

  files.push({
    path: '.env.example',
    content: generateEnvExample(projectName),
  });

  files.push({
    path: 'Dockerfile',
    content: generateDockerfile(),
  });

  files.push({
    path: 'docker-compose.yml',
    content: generateDockerCompose(projectName),
  });

  return files;
}
