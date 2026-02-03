import type { DataEntity } from "@shared/schema";
import { toPascalCase, toCamelCase, toKebabCase, pluralize } from "./utils";

export function generateReactComponent(entity: DataEntity): string {
  const pascalName = toPascalCase(entity.name);
  const pluralName = pluralize(pascalName);
  const camelName = toCamelCase(entity.name);
  const pluralCamel = pluralize(camelName);
  const routePath = toKebabCase(pluralize(entity.name));
  
  const editableFields = entity.fields.filter(f => f.name !== 'id');
  
  let component = `import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Edit } from "lucide-react";

interface ${pascalName} {
  id: number;
${entity.fields.filter(f => f.name !== 'id').map(f => `  ${toCamelCase(f.name)}: ${f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string'};`).join('\n')}
  createdAt: string;
  updatedAt: string;
}

export function ${pluralName}Page() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: ${pluralCamel} = [], isLoading } = useQuery<${pascalName}[]>({
    queryKey: ["/api/${routePath}"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<${pascalName}, "id" | "createdAt" | "updatedAt">) => {
      const res = await fetch("/api/${routePath}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/${routePath}"] });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<${pascalName}> }) => {
      const res = await fetch(\`/api/${routePath}/\${id}\`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/${routePath}"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(\`/api/${routePath}/\${id}\`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/${routePath}"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${pluralName}</h1>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add ${pascalName}
        </Button>
      </div>

      {isAdding && (
        <${pascalName}Form
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setIsAdding(false)}
          isLoading={createMutation.isPending}
        />
      )}

      <div className="grid gap-4">
        {${pluralCamel}.map((item) => (
          <Card key={item.id} className="p-4">
            {editingId === item.id ? (
              <${pascalName}Form
                initialData={item}
                onSubmit={(data) => updateMutation.mutate({ id: item.id, data })}
                onCancel={() => setEditingId(null)}
                isLoading={updateMutation.isPending}
              />
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
${editableFields.slice(0, 3).map(f => `                  <p><span className="font-medium">${f.name}:</span> {String(item.${toCamelCase(f.name)})}</p>`).join('\n')}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(item.id)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ${pascalName}Form({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initialData?: ${pascalName};
  onSubmit: (data: Omit<${pascalName}, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
${editableFields.map(f => `  const [${toCamelCase(f.name)}, set${toPascalCase(f.name)}] = useState(initialData?.${toCamelCase(f.name)} ?? ${f.type === 'boolean' ? 'false' : f.type === 'number' ? '0' : '""'});`).join('\n')}

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ${editableFields.map(f => toCamelCase(f.name)).join(', ')} });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
${editableFields.map(f => `      <div className="space-y-2">
        <Label htmlFor="${toCamelCase(f.name)}">${f.name}${f.required ? ' *' : ''}</Label>
        <Input
          id="${toCamelCase(f.name)}"
          ${f.type === 'number' ? 'type="number"' : f.type === 'email' ? 'type="email"' : f.type === 'url' ? 'type="url"' : f.type === 'date' ? 'type="date"' : 'type="text"'}
          value={${f.type === 'boolean' ? `String(${toCamelCase(f.name)})` : toCamelCase(f.name)}}
          onChange={(e) => set${toPascalCase(f.name)}(${f.type === 'number' ? 'Number(e.target.value)' : f.type === 'boolean' ? 'e.target.value === "true"' : 'e.target.value'})}
          ${f.required ? 'required' : ''}
        />
      </div>`).join('\n')}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}
`;

  return component;
}
