import { Router, Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { healthAlertsService } from "../../services/health-alerts.service";

export function registerAlertsRoutes(router: Router): void {
  router.get("/alerts/stream", asyncHandler((req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const healthStatus = healthAlertsService.getHealthStatus();
    res.write(`event: health_status\ndata: ${JSON.stringify(healthStatus)}\n\n`);

    const alertHandler = (alert: any) => {
      res.write(`event: alert\ndata: ${JSON.stringify(alert)}\n\n`);
    };

    const healthHandler = (status: any) => {
      res.write(`event: health_update\ndata: ${JSON.stringify(status)}\n\n`);
    };

    healthAlertsService.on("alert", alertHandler);
    healthAlertsService.on("health_update", healthHandler);

    const keepAlive = setInterval(() => {
      res.write(`:ping\n\n`);
    }, 30000);

    req.on("close", () => {
      clearInterval(keepAlive);
      healthAlertsService.off("alert", alertHandler);
      healthAlertsService.off("health_update", healthHandler);
    });
  }));

  router.get("/alerts", asyncHandler((req, res) => {
    const severity = req.query.severity as string | undefined;
    const acknowledged = req.query.acknowledged === "true" ? true : 
                         req.query.acknowledged === "false" ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const alerts = healthAlertsService.getAlerts({ 
      severity: severity as any, 
      acknowledged, 
      limit 
    });
    res.json(alerts);
  }));

  router.post("/alerts/:id/acknowledge", asyncHandler((req, res) => {
    const id = req.params.id as string;
    const success = healthAlertsService.acknowledgeAlert(id);
    res.json({ success });
  }));

  router.post("/alerts/acknowledge-all", asyncHandler((_req, res) => {
    healthAlertsService.acknowledgeAllAlerts();
    res.json({ success: true });
  }));
}
