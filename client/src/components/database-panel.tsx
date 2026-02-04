import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, Table2, Key, Play, RefreshCw, ChevronLeft, ChevronRight, Search, Columns, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TableInfo {
  table_name: string;
  column_count: number;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  column_name: string;
  foreign_table_name: string | null;
  foreign_column_name: string | null;
}

interface IndexInfo {
  indexname: string;
  indexdef: string;
}

interface TableSchema {
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: IndexInfo[];
}

interface TableDataResponse {
  data: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
}

interface DatabaseStats {
  tables: Array<{
    table_name: string;
    row_count: number;
    dead_rows: number;
    last_vacuum: string | null;
  }>;
  databaseSize: string;
  tableCount: number;
}

export function DatabasePanel() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("tables");
  const [queryText, setQueryText] = useState("SELECT * FROM projects LIMIT 10;");
  const [dataPage, setDataPage] = useState(0);
  const [pageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tables, isLoading: tablesLoading, refetch: refetchTables } = useQuery<{ tables: TableInfo[] }>({
    queryKey: ["/api/database/tables"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DatabaseStats>({
    queryKey: ["/api/database/stats"],
  });

  const { data: tableSchema, isLoading: schemaLoading } = useQuery<TableSchema>({
    queryKey: ["/api/database/tables", selectedTable, "schema"],
    enabled: !!selectedTable,
  });

  const { data: tableData, isLoading: dataLoading, refetch: refetchData } = useQuery<TableDataResponse>({
    queryKey: ["/api/database/tables", selectedTable, "data", { limit: pageSize, offset: dataPage * pageSize }],
    enabled: !!selectedTable && activeTab === "data",
  });

  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest("POST", "/api/database/query", { query });
      return response.json() as Promise<QueryResult>;
    },
  });

  const filteredTables = tables?.tables.filter(t => 
    t.table_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleRunQuery = () => {
    if (queryText.trim()) {
      queryMutation.mutate(queryText);
    }
  };

  const renderDataValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="flex h-full" data-testid="database-panel">
      <div className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">Database Explorer</span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search tables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-table-search"
            />
          </div>
        </div>
        
        <div className="p-2 border-b">
          <div className="text-xs text-muted-foreground mb-1">Database Info</div>
          {statsLoading ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <div className="text-xs">
              <div>{stats?.tableCount} tables</div>
              <div>{stats?.databaseSize}</div>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {tablesLoading ? (
              Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-8 mb-1" />
              ))
            ) : (
              filteredTables.map((table) => (
                <button
                  key={table.table_name}
                  onClick={() => {
                    setSelectedTable(table.table_name);
                    setDataPage(0);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover-elevate ${
                    selectedTable === table.table_name ? "bg-accent" : ""
                  }`}
                  data-testid={`button-table-${table.table_name}`}
                >
                  <Table2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{table.table_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {table.column_count}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => refetchTables()}
            data-testid="button-refresh-tables"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedTable ? (
          <>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{selectedTable}</span>
                {tableData && (
                  <Badge variant="outline">{tableData.total} rows</Badge>
                )}
              </div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="data" data-testid="tab-data">
                    <Table2 className="w-4 h-4 mr-1" />
                    Data
                  </TabsTrigger>
                  <TabsTrigger value="schema" data-testid="tab-schema">
                    <Columns className="w-4 h-4 mr-1" />
                    Schema
                  </TabsTrigger>
                  <TabsTrigger value="info" data-testid="tab-info">
                    <Info className="w-4 h-4 mr-1" />
                    Info
                  </TabsTrigger>
                  <TabsTrigger value="query" data-testid="tab-query">
                    <Play className="w-4 h-4 mr-1" />
                    Query
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 overflow-hidden">
              {activeTab === "data" && (
                <div className="h-full flex flex-col">
                  <ScrollArea className="flex-1">
                    {dataLoading ? (
                      <div className="p-4">
                        <Skeleton className="h-64 w-full" />
                      </div>
                    ) : tableData?.data.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(tableData.data[0] || {}).map((col) => (
                              <TableHead key={col} className="whitespace-nowrap">
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.data.map((row, i) => (
                            <TableRow key={i}>
                              {Object.values(row).map((val, j) => (
                                <TableCell key={j} className="max-w-xs truncate font-mono text-xs">
                                  {renderDataValue(val)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        No data found in this table
                      </div>
                    )}
                  </ScrollArea>

                  {tableData && tableData.total > pageSize && (
                    <div className="p-2 border-t flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {dataPage * pageSize + 1}-{Math.min((dataPage + 1) * pageSize, tableData.total)} of {tableData.total}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDataPage(Math.max(0, dataPage - 1))}
                          disabled={dataPage === 0}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDataPage(dataPage + 1)}
                          disabled={(dataPage + 1) * pageSize >= tableData.total}
                          data-testid="button-next-page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "schema" && (
                <ScrollArea className="h-full p-4">
                  {schemaLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <div className="space-y-6">
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Columns className="w-4 h-4" />
                            Columns ({tableSchema?.columns.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Nullable</TableHead>
                                <TableHead>Default</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tableSchema?.columns.map((col) => (
                                <TableRow key={col.column_name}>
                                  <TableCell className="font-mono text-sm">
                                    {col.column_name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {col.data_type}
                                      {col.character_maximum_length && `(${col.character_maximum_length})`}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={col.is_nullable === "YES" ? "secondary" : "default"}>
                                      {col.is_nullable === "YES" ? "nullable" : "required"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">
                                    {col.column_default || "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Key className="w-4 h-4" />
                            Constraints ({tableSchema?.constraints.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Column</TableHead>
                                <TableHead>References</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tableSchema?.constraints.map((c, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-mono text-sm">
                                    {c.constraint_name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      c.constraint_type === "PRIMARY KEY" ? "default" :
                                      c.constraint_type === "FOREIGN KEY" ? "secondary" : "outline"
                                    }>
                                      {c.constraint_type}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {c.column_name}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">
                                    {c.foreign_table_name ? `${c.foreign_table_name}.${c.foreign_column_name}` : "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">
                            Indexes ({tableSchema?.indexes.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {tableSchema?.indexes.map((idx) => (
                            <div key={idx.indexname} className="mb-2 last:mb-0">
                              <div className="font-mono text-sm">{idx.indexname}</div>
                              <div className="text-xs text-muted-foreground font-mono mt-1">
                                {idx.indexdef}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </ScrollArea>
              )}

              {activeTab === "info" && (
                <ScrollArea className="h-full p-4">
                  {statsLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Table Statistics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const tableStats = stats?.tables.find(t => t.table_name === selectedTable);
                          if (!tableStats) return <div className="text-muted-foreground">No statistics available</div>;
                          return (
                            <dl className="grid grid-cols-2 gap-4">
                              <div>
                                <dt className="text-sm text-muted-foreground">Row Count</dt>
                                <dd className="text-lg font-medium">{tableStats.row_count.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-sm text-muted-foreground">Dead Rows</dt>
                                <dd className="text-lg font-medium">{tableStats.dead_rows.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-sm text-muted-foreground">Last Vacuum</dt>
                                <dd className="text-sm font-medium">
                                  {tableStats.last_vacuum ? new Date(tableStats.last_vacuum).toLocaleString() : "Never"}
                                </dd>
                              </div>
                            </dl>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  )}
                </ScrollArea>
              )}

              {activeTab === "query" && (
                <div className="h-full flex flex-col">
                  <div className="p-4 border-b">
                    <Textarea
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      placeholder="Enter SQL query..."
                      className="font-mono text-sm min-h-[120px] resize-none"
                      data-testid="input-query-tab"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Only SELECT, EXPLAIN, and WITH queries are allowed (max 1000 rows)
                      </div>
                      <Button
                        onClick={handleRunQuery}
                        disabled={queryMutation.isPending}
                        data-testid="button-run-query-tab"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Run Query
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {queryMutation.isPending ? (
                      <div className="p-4">
                        <Skeleton className="h-64 w-full" />
                      </div>
                    ) : queryMutation.error ? (
                      <div className="p-4">
                        <Card className="border-destructive">
                          <CardContent className="pt-4">
                            <div className="text-sm text-destructive">
                              {queryMutation.error instanceof Error ? queryMutation.error.message : "Query failed"}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : queryMutation.data ? (
                      <div className="h-full flex flex-col">
                        <div className="p-2 border-b text-sm text-muted-foreground">
                          {queryMutation.data.rowCount} rows returned in {queryMutation.data.duration}ms
                        </div>
                        <ScrollArea className="flex-1">
                          {queryMutation.data.rows.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {Object.keys(queryMutation.data.rows[0]).map((col) => (
                                    <TableHead key={col} className="whitespace-nowrap">
                                      {col}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {queryMutation.data.rows.map((row, i) => (
                                  <TableRow key={i}>
                                    {Object.values(row).map((val, j) => (
                                      <TableCell key={j} className="max-w-xs truncate font-mono text-xs">
                                        {renderDataValue(val)}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="p-8 text-center text-muted-foreground">
                              Query returned no results
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        Enter a query and click Run to see results
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b">
              <span className="font-medium">Query Console</span>
            </div>
            <div className="p-4 border-b">
              <Textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Enter SQL query..."
                className="font-mono text-sm min-h-[120px] resize-none"
                data-testid="input-query"
              />
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Only SELECT, EXPLAIN, and WITH queries are allowed
                </div>
                <Button
                  onClick={handleRunQuery}
                  disabled={queryMutation.isPending}
                  data-testid="button-run-query"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run Query
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {queryMutation.isPending ? (
                <div className="p-4">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : queryMutation.error ? (
                <div className="p-4">
                  <Card className="border-destructive">
                    <CardContent className="pt-4">
                      <div className="text-sm text-destructive">
                        {queryMutation.error instanceof Error ? queryMutation.error.message : "Query failed"}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : queryMutation.data ? (
                <div className="h-full flex flex-col">
                  <div className="p-2 border-b text-sm text-muted-foreground">
                    {queryMutation.data.rowCount} rows returned in {queryMutation.data.duration}ms
                  </div>
                  <ScrollArea className="flex-1">
                    {queryMutation.data.rows.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(queryMutation.data.rows[0]).map((col) => (
                              <TableHead key={col} className="whitespace-nowrap">
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {queryMutation.data.rows.map((row, i) => (
                            <TableRow key={i}>
                              {Object.values(row).map((val, j) => (
                                <TableCell key={j} className="max-w-xs truncate font-mono text-xs">
                                  {renderDataValue(val)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        Query returned no results
                      </div>
                    )}
                  </ScrollArea>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <div>Select a table to view data or run a query</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
