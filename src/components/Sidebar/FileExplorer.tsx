/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-ignore
interface TreeFolder {
  id: string;
  name: string;
  path: string;
}

// @ts-ignore
const setFolders = (callback: any) => {};
// @ts-ignore
const setExpandedFolders = (callback: any) => {};

const handleRemoveFolder = async (folder: TreeFolder) => {
  // Ask for confirmation
  const shouldRemove = await window.confirm(`Remove ${folder.name} from the File Explorer?`);
  if (!shouldRemove) return;

  // Remove the folder from state
  setFolders((prev: any) => prev.filter((f: any) => f.id !== folder.id));
  setExpandedFolders((prev: any) => new Set([...prev].filter((id: any) => id !== folder.id)));

  // Also remove from the global projectDirectories list
  if (window.electronAPI) {
    try {
      // @ts-ignore
      await window.electronAPI.removeProjectDirectory(folder.path);
    } catch (error) {
      console.error('Failed to remove directory from project list:', error);
    }
  }
};
