# Orchestrator Logic (Legacy)

> **Note**: This document has been superseded by [`orchestrator-logic-new.md`](./orchestrator-logic-new.md), which is now the authoritative specification for the AI orchestration system.

## Quick Reference

For the current implementation, see:
- **Authoritative Spec**: [`docs/orchestrator-logic-new.md`](./orchestrator-logic-new.md)
- **Main Orchestrator**: `server/services/orchestrator.ts`
- **Production Orchestrator**: `server/services/productionOrchestrator.ts`
- **Dream Team Service**: `server/services/dreamTeam.ts`

## Key Changes in New Spec

The new orchestrator spec introduces:

1. **Quality Profiles**: `"prototype"`, `"demo"`, `"production"` - controls validation rigor and test requirements
2. **Design & UX Guidance Phase**: Optional Planner phase for UI/UX guidance
3. **Review & Hardening Phase**: Principal Engineer review before completion
4. **Updated Temperatures**: Builder now uses 0.2-0.3 for production-grade consistency
5. **New Event Types**: `review` event with severity counts
6. **Enriched Complete Event**: Now includes `reviewSummary`

## Migration Notes

The orchestrator implementation has been updated to match the new spec. Key changes:

- `OrchestratorPlan` now includes `qualityProfile`, `stackProfile`, and `designNotes`
- `OrchestratorTask` now supports `"review"` task type
- `OrchestratorState` includes `"designing"` and `"reviewing"` phases
- `OrchestratorEvent` includes new `review` event type
- `getModelInstructions()` now supports `"design"` and `"review"` modes
- `detectModelRole()` now recognizes `"r1"` pattern for reasoning models
- `getOptimalTemperature()` returns 0.25-0.35 for builder (down from 0.5-0.6)

Please refer to the new spec for complete documentation.
