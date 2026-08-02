import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import RequireAuth from "@/components/RequireAuth";
import Shell from "@/components/Shell";
import { useTema } from "@/hooks/useTema";
import Login from "@/pages/Login";
import Cadastro from "@/pages/Cadastro";
import Hoje from "@/pages/Hoje";
import Conversas from "@/pages/Conversas";
import Financeiro from "@/pages/Financeiro";
import Agentes from "@/pages/Agentes";
import Clinica from "@/pages/Clinica";
import Integracoes from "@/pages/Integracoes";
import Conta from "@/pages/Conta";

/**
 * Este painel mostra o que acontece FORA dele: paciente responde, comprovante
 * chega, pagamento entra. Os padrões antigos (`staleTime` de 5 min e
 * `refetchOnWindowFocus: false`) tratavam tudo como cadastro — quem assumia uma
 * conversa precisava recarregar a página para ver a resposta do paciente, o que
 * inviabiliza atender por aqui.
 *
 * `refetchOnWindowFocus` é o que mais importa no uso real: a recepção alterna
 * entre o WhatsApp e o painel o tempo todo, e voltar para a aba já deve trazer
 * o estado atual. O `staleTime` curto evita que a volta seja servida do cache.
 * Onde o dado precisa andar SEM ninguém tocar na tela, cada consulta declara o
 * próprio `refetchInterval` (conversas, mensagens, cobranças).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

/**
 * Rotas do Megus.
 *
 * Mudança em relação à versão anterior: **saiu o `RequireOnboarding`**.
 *
 * Aquele portão redirecionava para um wizard obrigatório e criou dois problemas —
 * exigia um `sessionStorage` de escape ("pular") para o usuário não ficar preso,
 * e trancava o produto antes de ele ter mostrado qualquer valor.
 *
 * O novo desenho inverte: `/boas-vindas` é uma porta que o usuário ATRAVESSA (só
 * depois do cadastro, e sempre com saída), e a ativação continua dentro do
 * produto, no cartão da Hoje. Ninguém fica preso, e o painel ensina configurando.
 */
export default function App() {
  useTema(); // aplica data-theme (creme|salvia) no <html> antes de qualquer render

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />

            <Route
              path="/"
              element={
                <RequireAuth>
                  <Shell />
                </RequireAuth>
              }
            >
              <Route index element={<Hoje />} />
              <Route path="conversas" element={<Conversas />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="agentes" element={<Agentes />} />
              <Route path="clinica" element={<Clinica />} />
              <Route path="integracoes" element={<Integracoes />} />
              <Route path="conta" element={<Conta />} />
            </Route>

            {/* Redirects das rotas antigas — há cliente em produção e ela pode ter
               bookmark. Sem isto, `/empresa` cairia no `*` e ia para a home. */}
            <Route path="/empresa" element={<Navigate to="/clinica" replace />} />
            <Route path="/agente" element={<Navigate to="/agentes" replace />} />
            <Route path="/cobrancas" element={<Navigate to="/financeiro" replace />} />
            <Route path="/atendimentos" element={<Navigate to="/conversas" replace />} />
            <Route path="/onboarding" element={<Navigate to="/" replace />} />
            <Route path="/boas-vindas" element={<Navigate to="/" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
