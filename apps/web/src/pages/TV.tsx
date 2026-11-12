import { Nav } from "../components/ModuleNav";
import type { ReactNode } from "react";
import { TVProvider, useTV } from "./tv/state";
import Live from "./tv/Live";
import Playback from "./tv/Playback";
import Guide from "./tv/Guide";
import Catalog from "./tv/Catalog";
import Details from "./tv/Details";
import Search from "./tv/Search";
import Folders from "./tv/Folders";
import Lists from "./tv/Lists";
import { EmptyState, Skeleton } from "./tv/ui";
import { sectionNames } from "./tv/helpers";
import "./tv/tv.css";
export interface TVModules {
  catalog?: ReactNode;
  detail?: ReactNode;
  playback?: ReactNode;
  guide?: ReactNode;
}
export function TVApp({ modules = {} }: { modules?: TVModules }) {
  const tv = useTV();
  const sections = (["live", "series", "movie"] as const).filter(
    (s) => tv.summary?.sections[s] && (s === "live" || modules.catalog),
  );
  return (
    <div className="tv-app">
      <Nav
        module="tv"
        className="tv-header"
        sections={
          <nav
            className="tv-capsule tv-sections app-header-sections"
            aria-label="Secções da TV"
          >
            {sections.map((s) => (
              <button
                key={s}
                aria-current={tv.section === s ? "page" : undefined}
                onClick={() => tv.setSection(s)}
              >
                {sectionNames[s]}
              </button>
            ))}
          </nav>
        }
      />
      <main className="tv-main">
        <div className="tv-listbar">
          {tv.lists.length > 0 && (
            <label>
              <span className="tv-list-label">Lista IPTV</span>
              <select
                aria-label="Lista IPTV"
                value={tv.listId}
                onChange={(e) => tv.setListId(e.target.value)}
              >
                {tv.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={tv.openLists}>Listas IPTV</button>
          {modules.guide && tv.section === "live" && (
            <div className="tv-toolbar">
              <button
                aria-pressed={!tv.view.guide}
                onClick={() => tv.navigate({ section: "live" })}
              >
                Portais
              </button>
              <button
                aria-pressed={!!tv.view.guide}
                onClick={() => tv.navigate({ section: "live", guide: true })}
              >
                Guia
              </button>
            </div>
          )}
        </div>
        {tv.error && <p role="alert">{tv.error}</p>}
        {tv.loading ? (
          <Skeleton />
        ) : tv.stateError ? (
          <EmptyState title="Não foi possível carregar a tua TV">
            Recarrega a página para tentar de novo.
          </EmptyState>
        ) : !tv.list ? (
          <EmptyState
            title="Abre os teus portais"
            action={
              <button className="tv-primary" onClick={tv.openLists}>
                Adicionar lista IPTV
              </button>
            }
          >
            Liga a tua lista para descobrir os teus canais, filmes e séries.
          </EmptyState>
        ) : tv.summaryQuery.isPending ? (
          <Skeleton />
        ) : tv.summaryQuery.error ? (
          <EmptyState
            title="Não foi possível carregar a lista"
            action={
              <button onClick={() => void tv.summaryQuery.refetch()}>
                Tentar de novo
              </button>
            }
          >
            Verifica a ligação ao fornecedor e tenta novamente.
          </EmptyState>
        ) : tv.view.detailId && modules.detail ? (
          modules.detail
        ) : tv.view.guide && modules.guide ? (
          modules.guide
        ) : tv.section === "live" ? (
          <Live />
        ) : (
          modules.catalog || (
            <EmptyState title="Escolhe uma secção disponível" />
          )
        )}
      </main>
      {tv.target && modules.playback}
      {tv.modal === "search" && <Search />}
      {tv.modal === "folders" && <Folders />}
      {tv.modal === "lists" && <Lists />}
    </div>
  );
}
export default function TV() {
  return (
    <TVProvider>
      <TVApp
        modules={{
          catalog: <Catalog />,
          detail: <Details />,
          playback: <Playback />,
          guide: <Guide />,
        }}
      />
    </TVProvider>
  );
}
