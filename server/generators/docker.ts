import { toKebabCase } from "./utils";

export function generateDockerfile(): string {
  return `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
`;
}

export function generateDockerCompose(projectName: string): string {
  const kebabName = toKebabCase(projectName);
  
  return `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/${kebabName}
      - NODE_ENV=production
    depends_on:
      - db

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${kebabName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
`;
}

export function generateEnvExample(projectName: string): string {
  const kebabName = toKebabCase(projectName);
  
  return `DATABASE_URL=postgresql://user:password@localhost:5432/${kebabName}
PORT=3000
NODE_ENV=development
`;
}
