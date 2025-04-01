const handleRemoveFolder = async (folder: TreeFolder) => {
  // Ask for confirmation
  const shouldRemove = await window.confirm(`Remove ${folder.name} from the File Explorer?`);
  if (!shouldRemove) return;

  // Remove the folder from state
  setFolders(prev => prev.filter(f => f.id !== folder.id));
  setExpandedFolders(prev => new Set([...prev].filter(id => id !== folder.id)));

  // Also remove from the global projectDirectories list
  if (window.electronAPI) {
    try {
      await window.electronAPI.removeProjectDirectory(folder.path);
    } catch (error) {
      console.error('Failed to remove directory from project list:', error);
    }
  }
};
