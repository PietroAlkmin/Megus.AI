import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import RequireAuth from "@/components/RequireAuth";
import RequireOnboarding from "@/components/RequireOnboarding";
import Shell from "@/components/Shell";
import Login from "@/pages/Login";
import Cadastro from "@/pages/Cadastro";
import Home from "@/pages/Home";
import Empresa from "@/pages/Empresa";
import Agente from "@/pages/Agente";
import ConectarWhatsApp from "@/pages/ConectarWhatsApp";
import Onboarding from "@/pages/Onboarding";
import Cobrancas from "@/pages/Cobrancas";
import Atendimentos from "@/pages/Atendimentos";
import Conversas from "@/pages/Conversas";
import Integracoes from "@/pages/Integracoes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min — evita refetch supérfluo ao navegar
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            {/* Onboarding em TELA CHEIA (fora do Shell) — primeiro login */}
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <Onboarding />
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <RequireOnboarding>
                    <Shell />
                  </RequireOnboarding>
                </RequireAuth>
              }
            >
              <Route index element={<Home />} />
              <Route path="empresa" element={<Empresa />} />
              <Route path="atendimentos" element={<Atendimentos />} />
              <Route path="conversas" element={<Conversas />} />
              <Route path="integracoes" element={<Integracoes />} />
              <Route path="cobrancas" element={<Cobrancas />} />
              <Route path="agente" element={<Agente />} />
              <Route path="conectar" element={<ConectarWhatsApp />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}