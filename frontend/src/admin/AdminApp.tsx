import React from "react";

import App from "../App";
import { fetchAuthMe } from "../product/api/auth";

type AdminGateState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "unauthenticated" }
  | { status: "forbidden"; email: string | null }
  | { status: "error"; message: string };

export function AdminApp() {
  const [gate, setGate] = React.useState<AdminGateState>({ status: "loading" });

  const validate = React.useCallback(async () => {
    setGate({ status: "loading" });

    try {
      const data = await fetchAuthMe();

      if (!data.is_authenticated) {
        setGate({ status: "unauthenticated" });
        return;
      }

      const hasAdminAccess = Boolean(data.access?.admin_access);

      if (!hasAdminAccess) {
        setGate({
          status: "forbidden",
          email: data.user?.email ?? null,
        });
        return;
      }

      setGate({ status: "ready" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao validar acesso administrativo.";
      setGate({ status: "error", message });
    }
  }, []);

  React.useEffect(() => {
    void validate();
  }, [validate]);

  if (gate.status === "ready") {
    return <App />;
  }

  return (
    <div className="container">
      <div className="card">
        <div className="hd">
          <h2>prevIA Admin</h2>
        </div>

        <div className="bd">
          {gate.status === "loading" ? (
            <div>
              <strong>Validando acesso...</strong>
              <p>Checando sessão e permissões do usuário interno.</p>
            </div>
          ) : null}

          {gate.status === "unauthenticated" ? (
            <div>
              <strong>Sessão necessária</strong>
              <p>Faça login no produto com seu usuário interno e volte para o /admin.</p>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <a className="btn primary" href="/app">
                  Ir para /app
                </a>
                <button className="btn ghost" onClick={() => void validate()}>
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : null}

          {gate.status === "forbidden" ? (
            <div>
              <strong>Acesso administrativo negado</strong>
              <p>
                O usuário {gate.email ? <code>{gate.email}</code> : "autenticado"} não possui a
                capability <code>admin.access</code>.
              </p>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <a className="btn primary" href="/app">
                  Voltar ao /app
                </a>
                <button className="btn ghost" onClick={() => void validate()}>
                  Revalidar
                </button>
              </div>
            </div>
          ) : null}

          {gate.status === "error" ? (
            <div>
              <strong>Falha ao validar acesso</strong>
              <p>{gate.message}</p>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn primary" onClick={() => void validate()}>
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}