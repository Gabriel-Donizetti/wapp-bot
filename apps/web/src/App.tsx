import { useState } from "react";
import {
  BookOpen,
  CalendarClock,
  ChevronRight,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import type { Session } from "@wapp/contracts";
import { useAuth } from "./auth/AuthProvider";
import { useResource } from "./lib/use-resource";
import { Loading } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ComposePage } from "./pages/ComposePage";
import { HistoryPage } from "./pages/HistoryPage";
import { UsersPage } from "./pages/UsersPage";
import { AccountPage } from "./pages/AccountPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { OverviewPage } from "./pages/OverviewPage";
const navigation = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "sessions", label: "Sessões", icon: Smartphone },
  { id: "compose", label: "Nova mensagem", icon: Send },
  { id: "schedules", label: "Agendamentos", icon: CalendarClock },
  { id: "messages", label: "Histórico", icon: History },
  { id: "integrations", label: "API & integrações", icon: BookOpen },
];
function Dashboard() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState("overview");
  const [mobile, setMobile] = useState(false);
  const sessions = useResource<{ sessions: Session[] }>("/sessions");
  const navigate = (value: string) => {
    setPage(value);
    setMobile(false);
  };
  const rows = sessions.data?.sessions || [];
  const title =
    navigation.find((item) => item.id === page)?.label ||
    (page === "users" ? "Usuários" : "Minha conta");
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-icon">
            <MessageCircle size={22} />
          </span>
          wapp<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          <span>WORKSPACE</span>
          <strong>
            Central de mensagens
            <ChevronRight size={14} />
          </strong>
        </div>
        <span className="nav-label">PRINCIPAL</span>
        <nav aria-label="Menu principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "sessions" ? (
                <span className="nav-count">{rows.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <span className="nav-label manage">CONFIGURAÇÕES</span>
        <nav aria-label="Configurações">
          {user?.role === "admin" ? (
            <button
              className={page === "users" ? "active" : ""}
              onClick={() => navigate("users")}
            >
              <ShieldCheck size={18} />
              Usuários
            </button>
          ) : null}
          <button
            className={page === "account" ? "active" : ""}
            onClick={() => navigate("account")}
          >
            <Settings2 size={18} />
            Minha conta
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          <span>
            {rows.filter((row) => row.status === "ready").length} sessões
            conectadas
          </span>
        </div>
        <button className="profile" onClick={() => navigate("account")}>
          <span className="avatar">{user?.name.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{user?.name}</strong>
            <small>
              {user?.role === "admin" ? "Administrador" : "Operador"}
            </small>
          </span>
          <ChevronRight size={15} />
        </button>
        <button
          className="logout"
          onClick={() => {
            void logout().catch(() => {});
          }}
        >
          <LogOut size={16} />
          Sair
        </button>
      </aside>
      {mobile ? (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      ) : null}
      <div className="main-area">
        <header className="topbar">
          <div>
            <button
              className="icon-button menu-button"
              aria-label={mobile ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMobile((value) => !value)}
            >
              {mobile ? <X size={19} /> : <Menu size={19} />}
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <span className="environment-label">
            <span />
            Central ativa
          </span>
        </header>
        <main className="content">
          {page === "overview" ? (
            <OverviewPage sessions={rows} onNavigate={navigate} />
          ) : page === "sessions" ? (
            <SessionsPage
              sessions={rows}
              onChange={sessions.refresh}
              error={sessions.error}
            />
          ) : page === "compose" ? (
            <ComposePage sessions={rows} onSent={sessions.refresh} />
          ) : page === "messages" ? (
            <HistoryPage key="messages" kind="messages" />
          ) : page === "schedules" ? (
            <HistoryPage key="schedules" kind="schedules" />
          ) : page === "users" && user?.role === "admin" ? (
            <UsersPage />
          ) : page === "account" ? (
            <AccountPage />
          ) : (
            <IntegrationsPage />
          )}
          <footer className="app-footer">
            <span>Wapp · Conexões organizadas, conversas melhores.</span>
            <span>Open source · v1.0</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export default function App() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  return auth.user ? <Dashboard /> : <LoginPage />;
}
