import React, { useState, useEffect } from 'react';
import { checkFilesystemPermissions } from '../../utils/electronUtils';

interface DirectoryPermission {
  dir: string;
  canRead: boolean;
  canWrite: boolean;
}

interface PermissionsResult {
  home?: DirectoryPermission;
  globalPromptComposer?: DirectoryPermission;
  projectPromptComposer?: DirectoryPermission;
  temp?: DirectoryPermission;
  error?: string;
}

// CSS styles as a regular object
const styles = {
  filesystemDebugger: {
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '16px',
    margin: '16px 0',
    backgroundColor: '#f8f8f8',
    color: '#333',
  },
  heading3: {
    marginTop: 0,
    marginBottom: '16px',
    color: '#444',
  },
  heading4: {
    marginBottom: '8px',
    color: '#555',
  },
  permissionsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  permissionSection: {
    background: 'white',
    padding: '12px',
    borderRadius: '4px',
    border: '1px solid #eaeaea',
  },
  permissionStatus: {
    fontFamily: 'monospace',
    lineHeight: 1.6,
  },
  errorMessage: {
    color: '#d32f2f',
    marginBottom: '16px',
    padding: '8px',
    background: '#ffebee',
    borderRadius: '4px',
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  refreshButtonHover: {
    backgroundColor: '#1976d2',
  },
  refreshButtonDisabled: {
    backgroundColor: '#bdbdbd',
    cursor: 'not-allowed',
  },
};

export const FileSystemDebugger: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<boolean>(false);

  const checkPermissionsHandler = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Checking filesystem permissions...');
      // Use our type-safe helper function
      const result = await checkFilesystemPermissions();
      console.log('Filesystem permission results:', result);

      if (!result) {
        throw new Error('Failed to check filesystem permissions');
      }

      setPermissions(result as PermissionsResult);
    } catch (err) {
      console.error('Error checking permissions:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkPermissionsHandler();
  }, []);

  const renderPermissionStatus = (permission: DirectoryPermission | undefined) => {
    if (!permission) return 'Unknown';

    const read = permission.canRead ? '✅' : '❌';
    const write = permission.canWrite ? '✅' : '❌';

    return (
      <div style={styles.permissionStatus}>
        <div>
          <strong>Path:</strong> {permission.dir}
        </div>
        <div>
          <strong>Read:</strong> {read}
        </div>
        <div>
          <strong>Write:</strong> {write}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.filesystemDebugger}>
      <h3 style={styles.heading3}>Filesystem Permissions</h3>

      {loading && <div>Checking permissions...</div>}

      {error && <div style={styles.errorMessage}>Error: {error}</div>}

      {permissions && !loading && (
        <div style={styles.permissionsContainer}>
          <div style={styles.permissionSection}>
            <h4 style={styles.heading4}>Home Directory</h4>
            {renderPermissionStatus(permissions.home)}
          </div>

          <div style={styles.permissionSection}>
            <h4 style={styles.heading4}>Global .prompt-composer</h4>
            {renderPermissionStatus(permissions.globalPromptComposer)}
          </div>

          <div style={styles.permissionSection}>
            <h4 style={styles.heading4}>Project .prompt-composer</h4>
            {renderPermissionStatus(permissions.projectPromptComposer)}
          </div>

          <div style={styles.permissionSection}>
            <h4 style={styles.heading4}>Temp Directory</h4>
            {renderPermissionStatus(permissions.temp)}
          </div>
        </div>
      )}

      <button
        onClick={checkPermissionsHandler}
        disabled={loading}
        style={{
          ...styles.refreshButton,
          ...(hovered && !loading ? styles.refreshButtonHover : {}),
          ...(loading ? styles.refreshButtonDisabled : {}),
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {loading ? 'Checking...' : 'Refresh Permissions'}
      </button>
    </div>
  );
};

export default FileSystemDebugger;
