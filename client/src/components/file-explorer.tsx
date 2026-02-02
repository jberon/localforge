import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Search, 
  ChevronRight, 
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  MoreVertical,
  Trash2,
  FileCode,
  FileJson,
  FileText,
  FileCog,
  FileType,
  Pencil,
  Copy,
  Download,
} from "lucide-react";
import type { GeneratedFile } from "@shared/schema";

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
  content?: string;
}

interface FileExplorerProps {
  files: GeneratedFile[];
  selectedFile: GeneratedFile | null;
  onSelectFile: (file: GeneratedFile) => void;
  onCreateFile?: (path: string, content: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  isGenerating?: boolean;
  className?: string;
}

function buildFileTree(files: GeneratedFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let currentLevel = root;
    let currentPath = "";
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      
      let existing = currentLevel.find(n => n.name === part);
      
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
          content: isFile ? file.content : undefined,
        };
        currentLevel.push(existing);
      }
      
      if (!isFile && existing.children) {
        currentLevel = existing.children;
      }
    }
  }
  
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }));
  };
  
  return sortNodes(root);
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const iconClass = "h-4 w-4 flex-shrink-0";
  
  switch (ext) {
    case "ts":
    case "tsx":
      return <FileCode className={`${iconClass} text-blue-400`} />;
    case "js":
    case "jsx":
      return <FileCode className={`${iconClass} text-yellow-400`} />;
    case "json":
      return <FileJson className={`${iconClass} text-orange-400`} />;
    case "md":
      return <FileText className={`${iconClass} text-gray-400`} />;
    case "css":
    case "scss":
      return <FileType className={`${iconClass} text-pink-400`} />;
    case "html":
      return <FileType className={`${iconClass} text-red-400`} />;
    case "yml":
    case "yaml":
    case "env":
      return <FileCog className={`${iconClass} text-purple-400`} />;
    default:
      return <File className={`${iconClass} text-muted-foreground`} />;
  }
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  selectedPath: string | null;
  onSelect: (file: GeneratedFile) => void;
  onDelete?: (path: string) => void;
  searchQuery: string;
}

function TreeNode({ 
  node, 
  depth, 
  expandedFolders, 
  toggleFolder, 
  selectedPath,
  onSelect,
  onDelete,
  searchQuery,
}: TreeNodeProps) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  
  const matchesSearch = searchQuery 
    ? node.name.toLowerCase().includes(searchQuery.toLowerCase())
    : true;
  
  const hasMatchingChildren = useMemo(() => {
    if (!searchQuery || !node.children) return true;
    
    const checkChildren = (children: FileTreeNode[]): boolean => {
      for (const child of children) {
        if (child.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
        if (child.children && checkChildren(child.children)) return true;
      }
      return false;
    };
    
    return checkChildren(node.children);
  }, [node.children, searchQuery]);
  
  if (searchQuery && !matchesSearch && !hasMatchingChildren) {
    return null;
  }
  
  const handleClick = () => {
    if (node.type === "folder") {
      toggleFolder(node.path);
    } else {
      onSelect({ path: node.path, content: node.content || "" });
    }
  };
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(node.path);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 cursor-pointer rounded-sm group hover-elevate ${
          isSelected ? "bg-accent text-accent-foreground" : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        data-testid={`file-tree-item-${node.path.replace(/\//g, '-')}`}
      >
        {node.type === "folder" ? (
          <>
            <span className="w-4 h-4 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className="truncate text-sm flex-1">{node.name}</span>
        
        {node.type === "file" && onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                data-testid={`file-menu-${node.path.replace(/\//g, '-')}`}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      {node.type === "folder" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onDelete={onDelete}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  files,
  selectedFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  isGenerating,
  className = "",
}: FileExplorerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      let path = "";
      for (let i = 0; i < parts.length - 1; i++) {
        path = path ? `${path}/${parts[i]}` : parts[i];
        folders.add(path);
      }
    }
    return folders;
  });
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);
  
  const expandAll = useCallback(() => {
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      let path = "";
      for (let i = 0; i < parts.length - 1; i++) {
        path = path ? `${path}/${parts[i]}` : parts[i];
        folders.add(path);
      }
    }
    setExpandedFolders(folders);
  }, [files]);
  
  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);
  
  const handleCreateFile = () => {
    if (onCreateFile && newFilePath.trim()) {
      onCreateFile(newFilePath.trim(), "");
      setNewFilePath("");
      setShowNewFileDialog(false);
    }
  };
  
  const handleConfirmDelete = () => {
    if (deleteConfirm && onDeleteFile) {
      onDeleteFile(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between gap-2 p-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Files</span>
        <div className="flex items-center gap-1">
          {onCreateFile && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setShowNewFileDialog(true)}
              title="New File"
              data-testid="button-new-file"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                data-testid="button-file-menu"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={expandAll}>
                <ChevronDown className="h-4 w-4 mr-2" />
                Expand All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={collapseAll}>
                <ChevronRight className="h-4 w-4 mr-2" />
                Collapse All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
            data-testid="input-search-files"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="py-1">
          {isGenerating && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-muted-foreground">Generating files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Folder className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No files yet</p>
            </div>
          ) : (
            fileTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                selectedPath={selectedFile?.path || null}
                onSelect={onSelectFile}
                onDelete={onDeleteFile ? (path) => setDeleteConfirm(path) : undefined}
                searchQuery={searchQuery}
              />
            ))
          )}
        </div>
      </ScrollArea>
      
      {files.length > 0 && (
        <div className="p-2 border-t">
          <p className="text-xs text-muted-foreground text-center">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
      
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              Enter the path for the new file (e.g., src/utils/helpers.ts)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="path/to/file.ts"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
              data-testid="input-new-file-path"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={!newFilePath.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
