import logger from "../lib/logger";

interface FileInfo {
  path: string;
  content: string;
}

interface ContractValidationResult {
  isValid: boolean;
  mismatches: ContractMismatch[];
  endpoints: EndpointContract[];
  clientCalls: ClientApiCall[];
  suggestions: ContractSuggestion[];
}

interface ContractMismatch {
  type: MismatchType;
  severity: "error" | "warning";
  endpoint: string;
  method: string;
  message: string;
  backendLocation?: FileLocation;
  frontendLocation?: FileLocation;
}

type MismatchType =
  | "missing_endpoint"
  | "method_mismatch"
  | "path_mismatch"
  | "request_body_mismatch"
  | "response_type_mismatch"
  | "query_param_mismatch"
  | "unused_endpoint";

interface FileLocation {
  filePath: string;
  line: number;
}

interface EndpointContract {
  path: string;
  method: string;
  requestBody?: string;
  responseType?: string;
  queryParams?: string[];
  filePath: string;
  line: number;
}

interface ClientApiCall {
  endpoint: string;
  method: string;
  filePath: string;
  line: number;
  hasBody: boolean;
}

interface ContractSuggestion {
  type: "add_type" | "fix_path" | "add_validation" | "document_api";
  message: string;
  implementation: string;
}

class ApiContractValidationService {
  private static instance: ApiContractValidationService;

  private constructor() {}

  static getInstance(): ApiContractValidationService {
    if (!ApiContractValidationService.instance) {
      ApiContractValidationService.instance = new ApiContractValidationService();
    }
    return ApiContractValidationService.instance;
  }

  async validateContracts(files: FileInfo[]): Promise<ContractValidationResult> {
    logger.info("Validating API contracts", { fileCount: files.length });

    const backendFiles = files.filter(f => 
      f.path.includes("server/") || f.path.includes("api/") || f.path.includes("routes")
    );
    const frontendFiles = files.filter(f => 
      (f.path.includes("client/") || f.path.includes("src/")) && !f.path.includes("server/")
    );

    const endpoints = this.extractEndpoints(backendFiles);
    const clientCalls = this.extractClientCalls(frontendFiles);
    const mismatches = this.findMismatches(endpoints, clientCalls);
    const suggestions = this.generateSuggestions(mismatches, endpoints, clientCalls);

    const isValid = mismatches.filter(m => m.severity === "error").length === 0;

    logger.info("Contract validation complete", {
      isValid,
      endpointsFound: endpoints.length,
      clientCallsFound: clientCalls.length,
      mismatches: mismatches.length,
    });

    return {
      isValid,
      mismatches,
      endpoints,
      clientCalls,
      suggestions,
    };
  }

  private extractEndpoints(files: FileInfo[]): EndpointContract[] {
    const endpoints: EndpointContract[] = [];

    const routePatterns = [
      /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.(get|post|put|patch|delete)/gi,
    ];

    for (const file of files) {
      const lines = file.content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of routePatterns) {
          pattern.lastIndex = 0;
          let match;
          
          while ((match = pattern.exec(line)) !== null) {
            const method = (match[1] || match[2]).toLowerCase();
            const path = match[2] || match[1];
            
            const bodyInfo = this.extractBodyInfo(lines, i);
            const responseInfo = this.extractResponseInfo(lines, i);

            endpoints.push({
              path: this.normalizePath(path),
              method: method.toUpperCase(),
              requestBody: bodyInfo,
              responseType: responseInfo,
              queryParams: this.extractQueryParams(lines, i),
              filePath: file.path,
              line: i + 1,
            });
          }
        }
      }
    }

    return endpoints;
  }

  private extractClientCalls(files: FileInfo[]): ClientApiCall[] {
    const calls: ClientApiCall[] = [];

    const fetchPatterns = [
      /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /fetch\s*\(\s*`([^`]+)`/g,
      /apiRequest\s*\(\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*['"`]([^'"`]+)['"`]/gi,
      /axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /useQuery\s*\(\s*\{[^}]*queryKey\s*:\s*\[['"`]([^'"`]+)['"`]/g,
      /useMutation\s*\(\s*\{[^}]*mutationFn[^}]*fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const file of files) {
      if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx") &&
          !file.path.endsWith(".js") && !file.path.endsWith(".jsx")) {
        continue;
      }

      const lines = file.content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of fetchPatterns) {
          pattern.lastIndex = 0;
          let match;

          while ((match = pattern.exec(line)) !== null) {
            let endpoint: string;
            let method = "GET";
            let hasBody = false;

            if (match[0].includes("apiRequest")) {
              method = match[1].toUpperCase();
              endpoint = match[2];
              hasBody = ["POST", "PUT", "PATCH"].includes(method);
            } else if (match[0].includes("axios")) {
              method = match[1].toUpperCase();
              endpoint = match[2];
              hasBody = ["POST", "PUT", "PATCH"].includes(method);
            } else {
              endpoint = match[1];
              const methodMatch = line.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
              if (methodMatch) {
                method = methodMatch[1].toUpperCase();
              }
              hasBody = line.includes("body:") || lines.slice(i, i + 5).join("\n").includes("body:");
            }

            if (endpoint.startsWith("/api") || endpoint.startsWith("api/")) {
              calls.push({
                endpoint: this.normalizePath(endpoint),
                method,
                filePath: file.path,
                line: i + 1,
                hasBody,
              });
            }
          }
        }
      }
    }

    return calls;
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\$\{[^}]+\}/g, ":param")
      .replace(/\/:\w+/g, "/:param")
      .replace(/\?.*$/, "")
      .replace(/\/+$/, "");
  }

  private extractBodyInfo(lines: string[], startLine: number): string | undefined {
    const context = lines.slice(startLine, Math.min(startLine + 10, lines.length)).join("\n");
    
    const bodyMatch = context.match(/req\.body\s*(?:as\s+(\w+)|:\s*(\w+))?/);
    if (bodyMatch) {
      return bodyMatch[1] || bodyMatch[2] || "unknown";
    }

    const zodMatch = context.match(/\.parse\s*\(\s*req\.body\s*\)/);
    if (zodMatch) {
      const schemaMatch = context.match(/(\w+Schema)\.parse/);
      return schemaMatch ? schemaMatch[1] : "validated";
    }

    return undefined;
  }

  private extractResponseInfo(lines: string[], startLine: number): string | undefined {
    const context = lines.slice(startLine, Math.min(startLine + 20, lines.length)).join("\n");
    
    const jsonMatch = context.match(/res\.json\s*\(([^)]+)\)/);
    if (jsonMatch) {
      const typeMatch = jsonMatch[1].match(/(\w+)\s*:/);
      return typeMatch ? typeMatch[1] : "object";
    }

    return undefined;
  }

  private extractQueryParams(lines: string[], startLine: number): string[] {
    const context = lines.slice(startLine, Math.min(startLine + 10, lines.length)).join("\n");
    const params: string[] = [];

    const queryMatches = Array.from(context.matchAll(/req\.query\.(\w+)/g));
    for (const match of queryMatches) {
      if (!params.includes(match[1])) {
        params.push(match[1]);
      }
    }

    return params;
  }

  private findMismatches(
    endpoints: EndpointContract[],
    clientCalls: ClientApiCall[]
  ): ContractMismatch[] {
    const mismatches: ContractMismatch[] = [];

    for (const call of clientCalls) {
      const matchingEndpoint = this.findMatchingEndpoint(call, endpoints);

      if (!matchingEndpoint) {
        mismatches.push({
          type: "missing_endpoint",
          severity: "error",
          endpoint: call.endpoint,
          method: call.method,
          message: `Client calls ${call.method} ${call.endpoint} but no matching backend endpoint found`,
          frontendLocation: {
            filePath: call.filePath,
            line: call.line,
          },
        });
      } else if (matchingEndpoint.method !== call.method) {
        mismatches.push({
          type: "method_mismatch",
          severity: "error",
          endpoint: call.endpoint,
          method: call.method,
          message: `Method mismatch: client uses ${call.method}, backend expects ${matchingEndpoint.method}`,
          frontendLocation: {
            filePath: call.filePath,
            line: call.line,
          },
          backendLocation: {
            filePath: matchingEndpoint.filePath,
            line: matchingEndpoint.line,
          },
        });
      } else if (call.hasBody && !matchingEndpoint.requestBody && call.method !== "GET") {
        mismatches.push({
          type: "request_body_mismatch",
          severity: "warning",
          endpoint: call.endpoint,
          method: call.method,
          message: "Client sends body but backend doesn't appear to use req.body",
          frontendLocation: {
            filePath: call.filePath,
            line: call.line,
          },
          backendLocation: {
            filePath: matchingEndpoint.filePath,
            line: matchingEndpoint.line,
          },
        });
      }
    }

    for (const endpoint of endpoints) {
      const hasClientCall = clientCalls.some(call => 
        this.pathsMatch(call.endpoint, endpoint.path)
      );

      if (!hasClientCall && endpoint.path.startsWith("/api")) {
        mismatches.push({
          type: "unused_endpoint",
          severity: "warning",
          endpoint: endpoint.path,
          method: endpoint.method,
          message: `Backend endpoint ${endpoint.method} ${endpoint.path} has no corresponding client calls`,
          backendLocation: {
            filePath: endpoint.filePath,
            line: endpoint.line,
          },
        });
      }
    }

    return mismatches;
  }

  private findMatchingEndpoint(
    call: ClientApiCall,
    endpoints: EndpointContract[]
  ): EndpointContract | undefined {
    return endpoints.find(ep => this.pathsMatch(call.endpoint, ep.path));
  }

  private pathsMatch(clientPath: string, serverPath: string): boolean {
    const normalizedClient = this.normalizePath(clientPath);
    const normalizedServer = this.normalizePath(serverPath);

    if (normalizedClient === normalizedServer) return true;

    const clientParts = normalizedClient.split("/");
    const serverParts = normalizedServer.split("/");

    if (clientParts.length !== serverParts.length) return false;

    for (let i = 0; i < clientParts.length; i++) {
      const clientPart = clientParts[i];
      const serverPart = serverParts[i];

      if (clientPart === serverPart) continue;
      if (serverPart.startsWith(":") || clientPart === ":param" || serverPart === ":param") continue;
      return false;
    }

    return true;
  }

  private generateSuggestions(
    mismatches: ContractMismatch[],
    endpoints: EndpointContract[],
    clientCalls: ClientApiCall[]
  ): ContractSuggestion[] {
    const suggestions: ContractSuggestion[] = [];

    const missingEndpoints = mismatches.filter(m => m.type === "missing_endpoint");
    if (missingEndpoints.length > 0) {
      suggestions.push({
        type: "add_type",
        message: "Create missing API endpoints or fix endpoint paths",
        implementation: missingEndpoints.map(m => 
          `// Add: app.${m.method.toLowerCase()}('${m.endpoint}', handler)`
        ).join("\n"),
      });
    }

    const methodMismatches = mismatches.filter(m => m.type === "method_mismatch");
    if (methodMismatches.length > 0) {
      suggestions.push({
        type: "fix_path",
        message: "Fix HTTP method mismatches between client and server",
        implementation: "Ensure client fetch calls use the correct HTTP method matching the backend route",
      });
    }

    if (endpoints.some(e => !e.requestBody) && endpoints.some(e => e.method === "POST" || e.method === "PUT")) {
      suggestions.push({
        type: "add_validation",
        message: "Add request body validation to POST/PUT endpoints",
        implementation: "Use Zod schemas with z.parse(req.body) for type-safe validation",
      });
    }

    if (endpoints.length > 5) {
      suggestions.push({
        type: "document_api",
        message: "Consider adding API documentation",
        implementation: "Generate OpenAPI/Swagger docs from your route definitions",
      });
    }

    return suggestions;
  }
}

export const apiContractValidationService = ApiContractValidationService.getInstance();
