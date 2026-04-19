import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DashboardProvider } from './contexts/DashboardContext';
import { ToastProvider } from './components/shared/ToastNotification';
import { router } from './router';

/**
 * App - Root application component that establishes the provider hierarchy
 * and renders the router. All global context providers are composed here
 * to ensure they are available throughout the entire component tree.
 *
 * Provider order (outermost to innermost):
 * 1. ToastProvider — toast notifications available everywhere, including auth flows
 * 2. AuthProvider — authentication state and user context
 * 3. DashboardProvider — dashboard data, filters, and data fetching
 * 4. RouterProvider — react-router-dom route rendering
 *
 * @returns {React.ReactNode}
 */
const App = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <DashboardProvider>
          <RouterProvider router={router} />
        </DashboardProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

export { App };
export default App;