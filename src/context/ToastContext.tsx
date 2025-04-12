/**
 * @file ToastContext.tsx
 * @description
 * Provides a simple context for displaying ephemeral "toast" notifications. This context
 * allows any component or utility (through a callback) to display error or info messages
 * to the user. The toasts automatically dismiss after a few seconds.
 *
 * Key Responsibilities:
 *  - Maintain a list of toasts in React state
 *  - Provide a showToast() function to add a new toast
 *  - Display the toast messages in a floating corner container
 *
 * Usage:
 *   1) Wrap <ToastProvider> around the root of the app (e.g., in App.tsx).
 *   2) Use the `useToast()` hook in components to showToast("Message", "error").
 *   3) Toasts appear for 5 seconds or until the user closes them manually.
 *
 * Implementation Details:
 *  - Toast items are stored in an array { id, message, type }.
 *  - We use a small "ToastContainer" inside the provider to map over them.
 *  - We remove a toast after 5 seconds (configurable) or if the user closes it.
 *
 * Potential Future Enhancements:
 *  - Animations or transitions for toasts
 *  - Additional types (warning, success, etc.)
 *  - More robust styling or theming
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

/**
 * The shape of a toast message.
 */
interface ToastMessage {
  /**
   * Unique identifier for this toast message
   */
  id: string;

  /**
   * The user-facing text of the message
   */
  message: string;

  /**
   * Type of toast, e.g. 'info', 'warning', or 'error'
   */
  type: 'info' | 'warning' | 'error';
}

/**
 * The ToastContext interface exposes a `showToast` function for adding new toasts.
 */
interface ToastContextType {
  /**
   * showToast adds a new toast message to the display
   * @param message the text to display
   * @param type the toast type, defaults to 'info'
   */
  showToast: (message: string, type?: 'info' | 'warning' | 'error') => void;
}

/**
 * Create the actual context with a default stub for showToast.
 */
const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

/**
 * The ToastProvider keeps track of the toasts in state and renders them.
 */
export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  /**
   * showToast - Appends a new toast to the list
   * The toast is automatically removed after 5 seconds
   */
  const showToast = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    const newToast: ToastMessage = {
      id: uuidv4(),
      message,
      type,
    };
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prevToasts => prevToasts.filter(t => t.id !== newToast.id));
    }, 5000);
  }, []);

  /**
   * removeToast - Manually remove a toast by ID
   */
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container (absolute positioned, top-right corner) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded shadow text-white ${
              toast.type === 'error'
                ? 'bg-red-600'
                : toast.type === 'warning'
                  ? 'bg-yellow-600'
                  : 'bg-gray-800'
            }`}
          >
            <div className="flex items-center">
              <span className="flex-1 text-sm whitespace-pre-wrap">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-2 text-white hover:text-gray-300"
                title="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="m18 6-6 6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/**
 * useToast - Hook to access the showToast function
 */
export function useToast(): ToastContextType {
  return useContext(ToastContext);
}
