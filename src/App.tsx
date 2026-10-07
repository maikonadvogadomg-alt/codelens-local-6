import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router as WouterRouter, Route, Switch } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';

import Home from '@/pages/home';
import ProjectExplorer from '@/pages/project-explorer';
import Settings from '@/pages/settings';
import PlaygroundPage from '@/pages/playground';
import AssistantPage from '@/pages/assistant';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="codelens-theme">
        <QueryClientProvider client={queryClient}>
          <WouterRouter base={base}>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/projects/:id" component={ProjectExplorer} />
              <Route path="/settings" component={Settings} />
              <Route path="/playground" component={PlaygroundPage} />
              <Route path="/assistant" component={AssistantPage} />
              <Route component={NotFound} />
            </Switch>
          </WouterRouter>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
