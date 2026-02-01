import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Plus, Trash2, Database, GripVertical } from "lucide-react";
import type { DataModel, DataEntity, DataField } from "@shared/schema";
import { FIELD_TYPES } from "./templates";

interface DataModelBuilderProps {
  dataModel: DataModel;
  onChange: (model: DataModel) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

let idCounter = 0;

export function DataModelBuilder({
  dataModel,
  onChange,
  onBack,
  onNext,
  onSkip,
}: DataModelBuilderProps) {
  const generateId = () => `${Date.now()}_${++idCounter}`;

  const addEntity = () => {
    const newEntity: DataEntity = {
      id: generateId(),
      name: "NewEntity",
      fields: [{ id: generateId(), name: "id", type: "text", required: true }],
    };
    onChange({
      ...dataModel,
      entities: [...dataModel.entities, newEntity],
      enableDatabase: true,
    });
  };

  const updateEntity = (entityId: string, updates: Partial<DataEntity>) => {
    onChange({
      ...dataModel,
      entities: dataModel.entities.map((e) =>
        e.id === entityId ? { ...e, ...updates } : e
      ),
    });
  };

  const removeEntity = (entityId: string) => {
    const newEntities = dataModel.entities.filter((e) => e.id !== entityId);
    onChange({
      ...dataModel,
      entities: newEntities,
      enableDatabase: newEntities.length > 0,
    });
  };

  const addField = (entityId: string) => {
    const entity = dataModel.entities.find((e) => e.id === entityId);
    if (!entity) return;
    const newField: DataField = {
      id: generateId(),
      name: "newField",
      type: "text",
      required: false,
    };
    updateEntity(entityId, { fields: [...entity.fields, newField] });
  };

  const updateField = (entityId: string, fieldId: string, updates: Partial<DataField>) => {
    const entity = dataModel.entities.find((e) => e.id === entityId);
    if (!entity) return;
    updateEntity(entityId, {
      fields: entity.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
    });
  };

  const removeField = (entityId: string, fieldId: string) => {
    const entity = dataModel.entities.find((e) => e.id === entityId);
    if (!entity) return;
    updateEntity(entityId, { fields: entity.fields.filter((f) => f.id !== fieldId) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-wizard-back-data">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Data Model</h2>
          <p className="text-sm text-muted-foreground">Define the data structure for your app</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="enable-database"
              checked={dataModel.enableDatabase}
              onCheckedChange={(checked) => onChange({ ...dataModel, enableDatabase: checked })}
              data-testid="switch-enable-database"
            />
            <Label htmlFor="enable-database" className="text-sm">
              Enable Full-Stack with Database
            </Label>
          </div>
        </div>

        {dataModel.enableDatabase && (
          <div className="space-y-4">
            {dataModel.entities.length === 0 ? (
              <Card className="p-6 text-center space-y-3">
                <Database className="h-10 w-10 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-medium">No data entities defined</p>
                  <p className="text-sm text-muted-foreground">Add an entity to define your app's data structure</p>
                </div>
                <Button onClick={addEntity} className="gap-2" data-testid="button-add-first-entity">
                  <Plus className="h-4 w-4" />
                  Add Entity
                </Button>
              </Card>
            ) : (
              <>
                {dataModel.entities.map((entity) => (
                  <Card key={entity.id} className="p-4 space-y-3" data-testid={`card-entity-${entity.id}`}>
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Input
                        value={entity.name}
                        onChange={(e) => updateEntity(entity.id, { name: e.target.value })}
                        className="font-medium text-base"
                        placeholder="Entity name (e.g., Task, User, Product)"
                        data-testid={`input-entity-name-${entity.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEntity(entity.id)}
                        className="text-destructive"
                        data-testid={`button-remove-entity-${entity.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="pl-6 space-y-2">
                      {entity.fields.map((field) => (
                        <div key={field.id} className="flex items-center gap-2" data-testid={`field-row-${field.id}`}>
                          <Input
                            value={field.name}
                            onChange={(e) => updateField(entity.id, field.id, { name: e.target.value })}
                            placeholder="Field name"
                            className="flex-1 text-sm"
                            data-testid={`input-field-name-${field.id}`}
                          />
                          <Select
                            value={field.type}
                            onValueChange={(value) => updateField(entity.id, field.id, { type: value as DataField["type"] })}
                          >
                            <SelectTrigger className="w-32" data-testid={`select-field-type-${field.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((ft) => (
                                <SelectItem key={ft.value} value={ft.value}>
                                  {ft.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Switch
                              id={`required-${field.id}`}
                              checked={field.required}
                              onCheckedChange={(checked) => updateField(entity.id, field.id, { required: checked })}
                              data-testid={`switch-field-required-${field.id}`}
                            />
                            <Label htmlFor={`required-${field.id}`} className="text-xs">Req</Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeField(entity.id, field.id)}
                            className="text-muted-foreground"
                            data-testid={`button-remove-field-${field.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addField(entity.id)}
                        className="gap-1 text-muted-foreground"
                        data-testid={`button-add-field-${entity.id}`}
                      >
                        <Plus className="h-3 w-3" />
                        Add Field
                      </Button>
                    </div>
                  </Card>
                ))}

                <Button variant="outline" onClick={addEntity} className="w-full gap-2" data-testid="button-add-entity">
                  <Plus className="h-4 w-4" />
                  Add Another Entity
                </Button>
              </>
            )}
          </div>
        )}

        {!dataModel.enableDatabase && (
          <Card className="p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground text-center">
              Your app will be frontend-only. Enable the database toggle above to create a full-stack app with data persistence.
            </p>
          </Card>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onSkip} data-testid="button-skip-data-model">
          Skip (Frontend Only)
        </Button>
        <Button onClick={onNext} className="gap-2" data-testid="button-wizard-next-review">
          Review & Generate
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
