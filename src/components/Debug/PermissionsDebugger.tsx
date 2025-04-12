/**
 * @file PermissionsDebugger.tsx
 * @description
 * A debug component that checks and displays filesystem permissions.
 * This helps diagnose issues in the production build related to file access.
 */

import React, { useState, useEffect } from 'react';
import { checkPermissions as checkPermissionsUtil } from '../../utils/electronUtils';

interface PermissionResult {
  read: boolean;
  write: boolean;
  path: string;
}

interface PermissionsState {
  home?: PermissionResult;
  promptComposerGlobal?: {
    read: boolean;
    write: boolean;
    exists: boolean;
    path: string;
  };
  temp?: PermissionResult;
  error?: string;
}

const PermissionsDebugger: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [loading, setLoading] = useState(false);

  const checkPermissions = async () => {
    setLoading(true);
    try {
      const result = await checkPermissionsUtil();
      if (!result) {
        throw new Error('Failed to check permissions');
      }
      setPermissions(result as PermissionsState);
    } catch (err) {
      console.error('Failed to check permissions:', err);
      setPermissions({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  return (
    <div className="bg-gray-100 p-4 rounded-lg shadow my-4 text-sm">
      <h3 className="font-semibold text-gray-700 mb-2">Filesystem Permissions</h3>

      {loading && <p className="text-gray-500">Checking permissions...</p>}

      {permissions?.error && (
        <div className="bg-red-100 p-2 rounded text-red-700 mb-2">Error: {permissions.error}</div>
      )}

      {permissions && !loading && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="font-medium">Directory</div>
            <div className="font-medium">Permissions</div>
            <div className="font-medium">Path</div>
          </div>

          {permissions.home && (
            <div className="grid grid-cols-3 gap-2 border-t pt-1">
              <div>Home</div>
              <div>
                <span className={permissions.home.read ? 'text-green-600' : 'text-red-600'}>
                  Read: {permissions.home.read ? '✓' : '✗'}
                </span>
                {' / '}
                <span className={permissions.home.write ? 'text-green-600' : 'text-red-600'}>
                  Write: {permissions.home.write ? '✓' : '✗'}
                </span>
              </div>
              <div className="text-xs truncate" title={permissions.home.path}>
                {permissions.home.path}
              </div>
            </div>
          )}

          {permissions.promptComposerGlobal && (
            <div className="grid grid-cols-3 gap-2 border-t pt-1">
              <div>.prompt-composer</div>
              <div>
                <div>
                  <span
                    className={
                      permissions.promptComposerGlobal.exists ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    Exists: {permissions.promptComposerGlobal.exists ? '✓' : '✗'}
                  </span>
                </div>
                <div>
                  <span
                    className={
                      permissions.promptComposerGlobal.read ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    Read: {permissions.promptComposerGlobal.read ? '✓' : '✗'}
                  </span>
                  {' / '}
                  <span
                    className={
                      permissions.promptComposerGlobal.write ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    Write: {permissions.promptComposerGlobal.write ? '✓' : '✗'}
                  </span>
                </div>
              </div>
              <div className="text-xs truncate" title={permissions.promptComposerGlobal.path}>
                {permissions.promptComposerGlobal.path}
              </div>
            </div>
          )}

          {permissions.temp && (
            <div className="grid grid-cols-3 gap-2 border-t pt-1">
              <div>Temp</div>
              <div>
                <span className={permissions.temp.read ? 'text-green-600' : 'text-red-600'}>
                  Read: {permissions.temp.read ? '✓' : '✗'}
                </span>
                {' / '}
                <span className={permissions.temp.write ? 'text-green-600' : 'text-red-600'}>
                  Write: {permissions.temp.write ? '✓' : '✗'}
                </span>
              </div>
              <div className="text-xs truncate" title={permissions.temp.path}>
                {permissions.temp.path}
              </div>
            </div>
          )}

          <button
            onClick={checkPermissions}
            className="mt-2 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default PermissionsDebugger;
