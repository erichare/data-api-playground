import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
const rootDir = process.cwd();
const apiDir = path.join(rootDir, "src", "app", "api");
const openApiPath = path.join(rootDir, "openapi.yaml");

async function findRouteFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findRouteFiles(fullPath)));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function toOpenApiPath(filePath) {
  const relativePath = path
    .relative(apiDir, filePath)
    .split(path.sep)
    .join("/");

  const routePath = relativePath
    .replace(/\/route\.ts$/, "")
    .replace(/\[([^\]]+)\]/g, "{$1}");

  return `/api/${routePath}`;
}

async function getActualRouteMap() {
  const files = await findRouteFiles(apiDir);
  const routeMap = new Map();

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const methods = new Set(
      Array.from(
        source.matchAll(
          /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g
        ),
        (match) => match[1].toLowerCase()
      )
    );

    if (methods.size > 0) {
      routeMap.set(toOpenApiPath(filePath), methods);
    }
  }

  return routeMap;
}

function getDocumentedRouteMap(openApiSource) {
  const routeMap = new Map();
  const lines = openApiSource.split(/\r?\n/);
  let inPaths = false;
  let currentPath = null;

  for (const line of lines) {
    if (!inPaths) {
      if (line.trim() === "paths:") {
        inPaths = true;
      }
      continue;
    }

    const pathMatch = line.match(/^  (\/api\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      routeMap.set(currentPath, new Set());
      continue;
    }

    if (currentPath) {
      const methodMatch = line.match(/^    (get|post|put|patch|delete|options|head):\s*$/);
      if (methodMatch) {
        routeMap.get(currentPath)?.add(methodMatch[1]);
        continue;
      }
    }

    if (/^[A-Za-z]/.test(line)) {
      break;
    }
  }

  return routeMap;
}

function diffRouteMaps(actualRoutes, documentedRoutes) {
  const issues = [];
  const allPaths = [...new Set([...actualRoutes.keys(), ...documentedRoutes.keys()])].sort();

  for (const routePath of allPaths) {
    const actualMethods = actualRoutes.get(routePath);
    const documentedMethods = documentedRoutes.get(routePath);

    if (!actualMethods) {
      issues.push(`Documented route has no implementation: ${routePath}`);
      continue;
    }

    if (!documentedMethods) {
      issues.push(`Implemented route missing from openapi.yaml: ${routePath}`);
      continue;
    }

    const undocumentedMethods = METHODS.filter(
      (method) => actualMethods.has(method) && !documentedMethods.has(method)
    );
    if (undocumentedMethods.length > 0) {
      issues.push(
        `openapi.yaml is missing methods for ${routePath}: ${undocumentedMethods
          .map((method) => method.toUpperCase())
          .join(", ")}`
      );
    }

    const extraDocumentedMethods = METHODS.filter(
      (method) => documentedMethods.has(method) && !actualMethods.has(method)
    );
    if (extraDocumentedMethods.length > 0) {
      issues.push(
        `openapi.yaml documents unsupported methods for ${routePath}: ${extraDocumentedMethods
          .map((method) => method.toUpperCase())
          .join(", ")}`
      );
    }
  }

  return issues;
}

const [actualRoutes, openApiSource] = await Promise.all([
  getActualRouteMap(),
  readFile(openApiPath, "utf8"),
]);
const documentedRoutes = getDocumentedRouteMap(openApiSource);
const issues = diffRouteMaps(actualRoutes, documentedRoutes);

if (issues.length > 0) {
  console.error("OpenAPI route drift detected:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`OpenAPI routes verified: ${actualRoutes.size} paths`);
