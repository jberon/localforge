import { Router } from "express";
import {
  storage,
  LLM_DEFAULTS,
  getActiveLLMClient,
  z,
  SYSTEM_PROMPT,
  REFINEMENT_SYSTEM,
  searchWeb,
  formatSearchResultsForContext,
  shouldUseWebSearch,
  decideWebSearchAction,
  generationRateLimiter,
  asyncHandler,
  llmSettingsSchema,
  chatRequestSchema,
  getModelForPhase,
  validateCodeSyntax,
  extractLLMLimitations,
  attemptCodeFix,
} from "./index";
import { codeQualityPipelineService } from "../../services/code-quality-pipeline.service";
import { iterativeRefinementService } from "../../services/iterative-refinement.service";
import { selfTestingService } from "../../services/self-testing.service";
import { dependencyGraphService } from "../../services/dependency-graph.service";
import { promptDecomposerService } from "../../services/prompt-decomposer.service";
import { projectStateService } from "../../services/project-state.service";
import { initializerService } from "../../services/initializer.service";
import { sequentialBuildService } from "../../services/sequential-build.service";
import { twoPassContextService } from "../../services/two-pass-context.service";
import { hooksService } from "../../services/hooks.service";

const refineRequestSchema = z.object({
  refinement: z.string().min(1),
  settings: llmSettingsSchema,
});

export function registerChatRoutes(router: Router): void {
  router.post("/:id/chat", generationRateLimiter, asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid chat request", details: parsed.error.errors });
      }
      const { content, settings } = parsed.data;
      const projectId = String(req.params.id);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.updateProject(projectId, {
        generationMetrics: {
          startTime,
          promptLength: content.length,
          status: "streaming",
          retryCount: 0,
        },
      });

      await storage.addMessage(projectId, {
        role: "user",
        content,
      });

      const updatedProject = await storage.getProject(projectId);
      const conversationHistory = updatedProject?.messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })) || [];

      const builderConfig = getModelForPhase(settings, "builder");
      
      const { client: openai, isCloud } = getActiveLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: builderConfig.model,
        temperature: builderConfig.temperature,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
      });

      let webSearchContext = "";
      let webSearchUsed = false;
      let webSearchAction: "search" | "skip" | "ask_permission" = "skip";
      
      try {
        const classificationResult = await shouldUseWebSearch(content, settings);
        console.log(`[webSearch] Classification: ${classificationResult.needsWeb ? "USE_WEB" : "NO_WEB"}`);
        
        const decision = decideWebSearchAction(
          classificationResult.needsWeb,
          settings.webSearchEnabled ?? false,
          !!settings.serperApiKey
        );
        webSearchAction = decision.action;
        console.log(`[webSearch] Decision: ${decision.action} - ${decision.reason}`);
        
        if (decision.action === "search" && settings.serperApiKey) {
          res.write(`data: ${JSON.stringify({ type: "status", message: "Searching the web..." })}\n\n`);
          
          const searchResult = await searchWeb(content, settings.serperApiKey);
          
          if (searchResult.success && searchResult.results.length > 0) {
            webSearchContext = formatSearchResultsForContext(searchResult.results);
            webSearchUsed = true;
            console.log(`[webSearch] Found ${searchResult.results.length} results`);
            res.write(`data: ${JSON.stringify({ type: "status", message: `Found ${searchResult.results.length} web results` })}\n\n`);
          } else if (!searchResult.success) {
            console.log(`[webSearch] Failed: ${searchResult.error}`);
            res.write(`data: ${JSON.stringify({ type: "status", message: "Web search unavailable, using local knowledge" })}\n\n`);
          }
        } else if (decision.action === "ask_permission") {
          res.write(`data: ${JSON.stringify({ 
            type: "web_search_permission", 
            message: "This request may benefit from web search. Would you like to enable it?",
            needsApiKey: !settings.serperApiKey
          })}\n\n`);
        }
      } catch (classifyError: any) {
        console.error(`[webSearch] Classification error: ${classifyError.message}`);
      }

      projectStateService.initializeState(projectId);

      const complexityAnalysis = promptDecomposerService.analyzeComplexity(content);
      let decomposedPrompt: string | null = null;
      let buildPipelineId: string | null = null;
      if (complexityAnalysis.score >= 8) {
        res.write(`data: ${JSON.stringify({
          type: "complexity_analysis",
          score: complexityAnalysis.score,
          featureCount: complexityAnalysis.featureCount,
          categories: complexityAnalysis.categories,
        })}\n\n`);

        const manifest = initializerService.generateManifest(projectId, content);
        res.write(`data: ${JSON.stringify({
          type: "feature_manifest",
          features: manifest.features.map((f: any) => ({ name: f.name, status: f.status })),
          totalFeatures: manifest.features.length,
        })}\n\n`);

        if (!project.generatedCode || project.generatedCode.length < 50) {
          const decomposition = promptDecomposerService.decompose(content);
          if (decomposition.shouldDecompose && decomposition.steps.length > 1) {
            const sequentialPrompts = promptDecomposerService.buildSequentialPrompts(decomposition);
            decomposedPrompt = sequentialPrompts[0];

            const pipeline = sequentialBuildService.createPipeline(
              projectId,
              content,
              decomposition.steps.map(s => s.description)
            );
            buildPipelineId = pipeline.id;

            res.write(`data: ${JSON.stringify({
              type: "decomposition",
              totalSteps: decomposition.steps.length,
              currentStep: 1,
              stepDescription: decomposition.steps[0]?.description || "Foundation",
              remainingSteps: decomposition.steps.slice(1).map(s => s.description),
              pipelineId: pipeline.id,
            })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: "status", message: `Complex prompt detected (${decomposition.steps.length} features). Building foundation first...` })}\n\n`);
          }
        }
      }

      let systemMessage = webSearchUsed && webSearchContext
        ? `${SYSTEM_PROMPT}\n\n${webSearchContext}`
        : SYSTEM_PROMPT;

      let refinementClassification = null;
      const existingCode = project.generatedCode;
      if (existingCode && existingCode.length > 50) {
        refinementClassification = iterativeRefinementService.classifyRefinement(content, existingCode);
        
        if (refinementClassification.suggestedApproach !== 'full-rewrite' && refinementClassification.confidence > 0.3) {
          const refinementPrompt = iterativeRefinementService.buildRefinementPrompt(
            refinementClassification, content, existingCode
          );
          systemMessage = refinementPrompt;

          const generatedFiles = (project as any).generatedFiles;
          if (Array.isArray(generatedFiles) && generatedFiles.length > 1) {
            const files = generatedFiles.map((f: any) => ({ path: f.path || f.filename, content: f.content || "" }));
            const targetElements = refinementClassification.targetElements || [];
            let targetFile = files.find((f: any) =>
              targetElements.some((el: string) => f.path.toLowerCase().includes(el.toLowerCase()))
            )?.path;
            if (!targetFile) {
              const mainFile = files.find((f: any) =>
                f.path.includes("App.") || f.path.includes("index.") || f.path.includes("main.")
              );
              targetFile = mainFile?.path || files[0]?.path || "App.tsx";
            }
            const depContext = dependencyGraphService.buildRefinementContext(
              projectId, targetFile, files, content, 3000
            );
            if (depContext) {
              systemMessage = systemMessage + "\n" + depContext;
              res.write(`data: ${JSON.stringify({ type: "status", message: `Including related files for context (target: ${targetFile})...` })}\n\n`);
            }
          }
          
          res.write(`data: ${JSON.stringify({ type: "status", message: `Applying ${refinementClassification.type} change (${Math.round(refinementClassification.confidence * 100)}% confidence)...` })}\n\n`);
        }
      }

      try {
        const effectiveTemp = refinementClassification?.type === 'style' ? 0.2 : builderConfig.temperature;
        
        const stream = await openai.chat.completions.create({
          model: isCloud ? (builderConfig.model || "gpt-4o-mini") : (builderConfig.model || "local-model"),
          messages: refinementClassification?.suggestedApproach !== 'full-rewrite' && refinementClassification?.confidence && refinementClassification.confidence > 0.3
            ? [
                { role: "system", content: systemMessage },
                { role: "user", content: content },
              ]
            : decomposedPrompt
            ? [
                { role: "system", content: systemMessage },
                { role: "user", content: decomposedPrompt },
              ]
            : [
                { role: "system", content: systemMessage },
                ...conversationHistory,
              ],
          temperature: effectiveTemp,
          max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
          stream: true,
        });

        const chunks: string[] = [];

        for await (const chunk of stream) {
          if (!isClientConnected) break;
          
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            chunks.push(delta);
            res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
          }
        }
        
        const fullContent = chunks.join("");

        let codeFromMarkdown = fullContent
          .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        let { cleanedCode, limitations } = extractLLMLimitations(codeFromMarkdown);

        const endTime = Date.now();

        if (cleanedCode && cleanedCode.length > 50) {
          res.write(`data: ${JSON.stringify({ type: "status", message: "Running quality checks..." })}\n\n`);
          
          const qualityReport = await codeQualityPipelineService.analyzeAndFix(cleanedCode);
          
          if (qualityReport.totalIssuesFixed > 0) {
            cleanedCode = qualityReport.fixedCode;
            res.write(`data: ${JSON.stringify({ type: "status", message: `Auto-fixed ${qualityReport.totalIssuesFixed} issue(s) (quality score: ${qualityReport.overallScore}/100)` })}\n\n`);
          }
          
          if (qualityReport.overallScore < 50) {
            res.write(`data: ${JSON.stringify({ type: "quality_report", report: { score: qualityReport.overallScore, issues: qualityReport.passResults.flatMap(p => p.issuesFound.filter(i => !i.fixed).map(i => i.message)), summary: qualityReport.summary } })}\n\n`);
          }

          const validation = validateCodeSyntax(cleanedCode);
          let retryCount = 0;
          let wasAutoFixed = qualityReport.totalIssuesFixed > 0;
          
          if (!validation.valid && validation.errors.length > 0 && isClientConnected) {
            res.write(`data: ${JSON.stringify({ type: "status", message: "Found remaining issues, attempting LLM-based fix..." })}\n\n`);
            
            const fixResult = await attemptCodeFix(
              cleanedCode, 
              validation.errors, 
              settings, 
              "builder",
              () => isClientConnected
            );
            retryCount = fixResult.retryCount;
            
            if (fixResult.fixed) {
              cleanedCode = fixResult.code;
              wasAutoFixed = true;
              res.write(`data: ${JSON.stringify({ type: "status", message: `Code fixed after ${retryCount} attempt(s)!` })}\n\n`);
            } else {
              res.write(`data: ${JSON.stringify({ 
                type: "validation_errors", 
                errors: validation.errors,
                suggestions: validation.suggestions 
              })}\n\n`);
            }
          }
          
          const finalValidation = validateCodeSyntax(cleanedCode);
          const codeIsValid = finalValidation.valid || wasAutoFixed;
          
          if (codeIsValid || validation.valid) {
            if (refinementClassification && refinementClassification.suggestedApproach !== 'full-rewrite' && existingCode) {
              const refinementResult = iterativeRefinementService.applyRefinement(existingCode, cleanedCode);
              iterativeRefinementService.recordRefinement(projectId, content, refinementClassification, refinementResult.linesModified + refinementResult.linesAdded, true);
              
              res.write(`data: ${JSON.stringify({ type: "refinement_result", changes: { linesModified: refinementResult.linesModified, linesAdded: refinementResult.linesAdded, linesRemoved: refinementResult.linesRemoved, changeCount: refinementResult.changesApplied.length } })}\n\n`);
            }
            
            let responseMessage = "I've generated the app for you. Check the preview panel to see it in action!";
            
            if (wasAutoFixed) {
              responseMessage = "I generated the app and automatically fixed some issues. Check the preview!";
            }
            
            if (limitations.length > 0) {
              responseMessage += "\n\n**Note:** " + limitations.join(" ");
            }
            
            if (!finalValidation.valid && !wasAutoFixed) {
              responseMessage += "\n\n**Warning:** The code may have some issues. " + finalValidation.suggestions.join(" ");
            }

            await storage.addMessage(projectId, {
              role: "assistant",
              content: responseMessage,
            });

            await storage.updateProject(projectId, {
              generatedCode: cleanedCode,
              generationMetrics: {
                startTime,
                endTime: Date.now(),
                durationMs: Date.now() - startTime,
                promptLength: content.length,
                responseLength: fullContent.length,
                status: wasAutoFixed ? "fixed" : "success",
                retryCount,
              },
            });

            try {
              const detectedFeatures = projectStateService.detectFeaturesFromCode(cleanedCode);
              projectStateService.recordGeneration(projectId, content, cleanedCode, detectedFeatures, true);

              initializerService.markFeaturesByCode(projectId, cleanedCode);

              if (buildPipelineId) {
                const nextStep = sequentialBuildService.getNextStep(buildPipelineId);
                if (nextStep) {
                  sequentialBuildService.completeStep(buildPipelineId, nextStep.step.id, {
                    code: cleanedCode,
                    qualityScore: qualityReport.overallScore,
                    healthPassed: true,
                  });
                }
              }
            } catch (stateError: any) {
              console.error(`[projectState] State tracking failed: ${stateError.message}`);
            }

            try {
              const testSuite = selfTestingService.generateTestSuite(projectId, cleanedCode);
              if (testSuite.scenarios.length > 0) {
                res.write(`data: ${JSON.stringify({ type: "test_suite", suiteId: testSuite.id, scenarioCount: testSuite.scenarios.length, coverage: testSuite.coverage })}\n\n`);
              }
            } catch (testError: any) {
              console.error(`[selfTest] Auto-test generation failed: ${testError.message}`);
            }

            try {
              const hookResults = await hooksService.fireHooks(projectId, "post-generation", {
                code: cleanedCode,
                prompt: content,
                qualityScore: qualityReport.overallScore,
              });
              if (hookResults.length > 0) {
                res.write(`data: ${JSON.stringify({ type: "hooks_executed", event: "post-generation", count: hookResults.length })}\n\n`);
              }
            } catch (hookError: any) {
              console.error(`[hooks] Post-generation hooks failed: ${hookError.message}`);
            }
          } else {
            await storage.addMessage(projectId, {
              role: "assistant",
              content: `I couldn't generate a valid app - the code had issues that couldn't be fixed automatically. Please try again with a simpler request.\n\n**Issues found:** ${validation.errors.join(", ")}`,
            });

            await storage.updateProject(projectId, {
              generationMetrics: {
                startTime,
                endTime: Date.now(),
                durationMs: Date.now() - startTime,
                promptLength: content.length,
                responseLength: fullContent.length,
                status: "validation_failed",
                errorMessage: validation.errors.join(", "),
                retryCount,
              },
            });
          }
        } else {
          await storage.addMessage(projectId, {
            role: "assistant",
            content: "I couldn't generate the app. The response was empty or incomplete. Please try again or check that LM Studio is running properly.",
          });

          await storage.updateProject(projectId, {
            generationMetrics: {
              startTime,
              endTime,
              durationMs: endTime - startTime,
              promptLength: content.length,
              responseLength: fullContent.length,
              status: "error",
              errorMessage: "Empty or incomplete response",
              retryCount: 0,
            },
          });
        }

        const finalProject = await storage.getProject(projectId);
        res.write(`data: ${JSON.stringify({ type: "done", project: finalProject })}\n\n`);
        res.end();
      } catch (llmError: any) {
        console.error("LLM Error:", llmError);
        
        const errorEndTime = Date.now();
        
        await storage.addMessage(projectId, {
          role: "assistant",
          content: `I couldn't connect to your local LLM. Make sure LM Studio is running and the local server is started. Error: ${llmError.message}`,
        });
        
        await storage.updateProject(projectId, {
          generationMetrics: {
            startTime,
            endTime: errorEndTime,
            durationMs: errorEndTime - startTime,
            promptLength: content.length,
            status: "error",
            errorMessage: llmError.message,
            retryCount: 0,
          },
        });
        
        const finalProject = await storage.getProject(projectId);
        res.write(`data: ${JSON.stringify({ type: "error", error: llmError.message, project: finalProject })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  }));

  router.post("/:id/refine", generationRateLimiter, asyncHandler(async (req, res) => {
    try {
      const parsed = refineRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { refinement, settings } = parsed.data;
      const projectId = String(req.params.id);

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (!project.generatedCode) {
        return res.status(400).json({ error: "No generated code to refine" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      try {
        const healthCheck = selfTestingService.generateHealthCheck(projectId, project.generatedCode);
        if (healthCheck.isBroken) {
          projectStateService.updateHealth(projectId, { renders: false, errors: healthCheck.issues });
          res.write(`data: ${JSON.stringify({
            type: "health_warning",
            isBroken: true,
            issues: healthCheck.issues,
            message: "Current code has issues that should be fixed before refinement",
          })}\n\n`);
        } else {
          projectStateService.updateHealth(projectId, { renders: true, errors: [] });
        }
      } catch (healthError: any) {
        console.error(`[healthCheck] Pre-refinement check failed: ${healthError.message}`);
      }

      const builderConfig = getModelForPhase(settings, "builder");

      const { client: openai, isCloud } = getActiveLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: builderConfig.model,
        temperature: builderConfig.temperature,
      });

      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
      });

      try {
        let refinementUserContent = `EXISTING CODE:\n\`\`\`jsx\n${project.generatedCode}\n\`\`\`\n\nMODIFICATION REQUEST: ${refinement}`;

        const generatedFiles = (project as any).generatedFiles;
        if (Array.isArray(generatedFiles) && generatedFiles.length > 1) {
          const files = generatedFiles.map((f: any) => ({ path: f.path || f.filename, content: f.content || "" }));
          const mainFile = files.find((f: any) =>
            f.path.includes("App.") || f.path.includes("index.") || f.path.includes("main.")
          );
          const targetFile = mainFile?.path || files[0]?.path || "App.tsx";

          const contextReduction = twoPassContextService.reduceContext(
            projectId, targetFile, refinement,
            files.map((f: any) => ({ path: f.path, content: f.content })),
            3000
          );

          if (contextReduction.reducedFiles.length > 0) {
            const contextBlock = contextReduction.reducedFiles
              .map((rf: any) => `// --- ${rf.path} (relevance: ${rf.relevanceScore}) ---\n${rf.summary || rf.content}`)
              .join("\n\n");
            refinementUserContent = refinementUserContent + "\n\nRELATED FILES CONTEXT:\n" + contextBlock;
            res.write(`data: ${JSON.stringify({ type: "status", message: `Context reduced: ${contextReduction.originalTokens} -> ${contextReduction.reducedTokens} tokens (${contextReduction.reducedFiles.length} files)` })}\n\n`);
          } else {
            const depContext = dependencyGraphService.buildRefinementContext(
              projectId, targetFile, files, refinement, 3000
            );
            if (depContext) {
              refinementUserContent = refinementUserContent + "\n" + depContext;
            }
          }
        }

        const stream = await openai.chat.completions.create({
          model: isCloud ? (builderConfig.model || "gpt-4o-mini") : (builderConfig.model || "local-model"),
          messages: [
            { role: "system", content: REFINEMENT_SYSTEM },
            { role: "user", content: refinementUserContent },
          ],
          temperature: builderConfig.temperature,
          max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
          stream: true,
        });

        const chunks: string[] = [];

        for await (const chunk of stream) {
          if (!isClientConnected) break;
          
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            chunks.push(delta);
            res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
          }
        }
        
        const fullContent = chunks.join("");

        let codeFromMarkdown = fullContent
          .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        let { cleanedCode, limitations } = extractLLMLimitations(codeFromMarkdown);

        await storage.addMessage(projectId, {
          role: "user",
          content: `Refine: ${refinement}`,
        });

        if (cleanedCode && cleanedCode.length > 50) {
          const validation = validateCodeSyntax(cleanedCode);
          let wasAutoFixed = false;
          let retryCount = 0;
          
          if (!validation.valid && validation.errors.length > 0 && isClientConnected) {
            res.write(`data: ${JSON.stringify({ type: "status", message: "Validating refined code..." })}\n\n`);
            
            const fixResult = await attemptCodeFix(
              cleanedCode, 
              validation.errors, 
              settings, 
              "builder",
              () => isClientConnected
            );
            retryCount = fixResult.retryCount;
            
            if (fixResult.fixed) {
              cleanedCode = fixResult.code;
              wasAutoFixed = true;
              res.write(`data: ${JSON.stringify({ type: "status", message: `Code fixed after ${retryCount} attempt(s)!` })}\n\n`);
            }
          }
          
          const finalValidation = validateCodeSyntax(cleanedCode);
          const codeIsValid = finalValidation.valid || wasAutoFixed;
          
          if (codeIsValid || validation.valid) {
            let responseMessage = wasAutoFixed 
              ? `I've updated the app and fixed ${retryCount} issue(s). Check the preview!`
              : "I've updated the app based on your feedback. Check the preview!";
            
            if (limitations.length > 0) {
              responseMessage += "\n\n**Note:** " + limitations.join(" ");
            }
            
            if (!finalValidation.valid && !wasAutoFixed) {
              responseMessage += "\n\n**Warning:** " + finalValidation.suggestions.join(" ");
            }

            await storage.addMessage(projectId, {
              role: "assistant",
              content: responseMessage,
            });

            await storage.updateProject(projectId, {
              generatedCode: cleanedCode,
            });

            try {
              projectStateService.recordRefinement(projectId, refinement, cleanedCode.split("\n").length, [], true);
              initializerService.markFeaturesByCode(projectId, cleanedCode);

              const hookResults = await hooksService.fireHooks(projectId, "post-refinement", {
                code: cleanedCode,
                refinement,
              });
              if (hookResults.length > 0) {
                res.write(`data: ${JSON.stringify({ type: "hooks_executed", event: "post-refinement", count: hookResults.length })}\n\n`);
              }
            } catch (stateError: any) {
              console.error(`[projectState] Refinement state tracking failed: ${stateError.message}`);
            }
          } else {
            await storage.addMessage(projectId, {
              role: "assistant",
              content: `I couldn't safely update the app - the generated code had issues that couldn't be fixed automatically. Your original code is preserved.\n\n**Issues found:** ${validation.errors.join(", ")}`,
            });

            try {
              await hooksService.fireHooks(projectId, "on-error", {
                error: validation.errors.join(", "),
                phase: "refinement",
              });
            } catch (hookError: any) {
              console.error(`[hooks] Error hooks failed: ${hookError.message}`);
            }
          }
        } else {
          await storage.addMessage(projectId, {
            role: "assistant",
            content: "I couldn't refine the app. The response was empty or incomplete. Please try again.",
          });
        }

        const finalProject = await storage.getProject(projectId);
        res.write(`data: ${JSON.stringify({ type: "done", project: finalProject })}\n\n`);
        res.end();
      } catch (llmError: any) {
        console.error("Refinement LLM Error:", llmError);
        await storage.addMessage(projectId, {
          role: "assistant",
          content: `I couldn't refine the app. Error: ${llmError.message}`,
        });
        res.write(`data: ${JSON.stringify({ type: "error", error: llmError.message })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Refinement error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  }));
}
