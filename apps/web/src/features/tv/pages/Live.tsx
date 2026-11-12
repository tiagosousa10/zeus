import { useTV } from "../hooks/state";
import { useLiveLayout } from "../hooks/useLiveLayout";
import { EmptyState, Outline } from "../components/ui";
import { PortalCard, countryStyle } from "../components/PortalCard";
import { PortalNavigation } from "../components/PortalNavigation";
import { LiveChannels } from "../components/LiveChannels";
import { ViewSwitcher } from "../components/ViewSwitcher";
import "../styles/live-layout.css";
export default function Live() {
  const tv = useTV();
  const [layout, setLayout] = useLiveLayout();
  const workspace = layout === "workspace";
  const categories =
    tv.summary?.sections.live?.categories.filter((c) => !c.hidden) || [];
  const category = categories.find((c) => c.id === tv.categoryId);
  const total = tv.summary?.sections.live?.total || 0;
  return (
    <section
      style={countryStyle(category?.country)}
      className={"tv-live" + (workspace ? " tv-live--workspace" : "")}
      data-layout={layout}
    >
      <div className="tv-aurora" />
      {!category && !workspace && (
        <div className="tv-hero">
          <img src="/art/img/zeus-6.webp" alt="" />
          <div>
            <span className="tv-eyebrow">OS TEUS PORTAIS · EM DIRECTO</span>
            <h1>
              O mundo.
              <br />À tua porta.
            </h1>
            <p>
              {total.toLocaleString("pt-PT")} canais · {categories.length}{" "}
              pastas
            </p>
            <button onClick={tv.openFolders}>Gerir pastas</button>
          </div>
        </div>
      )}
      <div
        className={
          "tv-live-heading" +
          (category && !workspace ? " tv-live-heading--category" : "")
        }
      >
        <div className="tv-live-heading-copy">
          {workspace ? (
            <>
              <span className="tv-eyebrow">
                <i className="tv-on-air" /> TV · WORKSPACE
              </span>
              <h1>
                O teu espaço<span className="tv-heading-dot">.</span>
              </h1>
              <p>{categories.length} portais. Um mundo para descobrir.</p>
            </>
          ) : category ? (
            <>
              <button className="tv-back" onClick={() => tv.setCategory()}>
                ← Portais
              </button>
              <h1>{category.name}</h1>
            </>
          ) : (
            <>
              <h2>Escolhe o teu portal</h2>
              <p>As pastas da tua lista, à tua maneira.</p>
            </>
          )}
        </div>
        <div className="tv-live-heading-controls">
          {category && !workspace && <Outline>{category.count}</Outline>}
          <ViewSwitcher value={layout} onChange={setLayout} />
        </div>
      </div>
      <div className={workspace ? "tv-workspace" : "tv-live-content"}>
        {workspace && (
          <PortalNavigation
            key="navigation"
            categories={categories}
            selected={category?.id}
            onSelect={tv.setCategory}
            onManage={tv.openFolders}
          />
        )}
        <div key="content" className="tv-live-results">
          {category ? (
            <LiveChannels
              key={`${tv.listId}:${category.id}`}
              category={category}
              layout={layout}
            />
          ) : workspace && categories.length ? (
            <div className="tv-workspace-welcome">
              <div className="tv-workspace-art">
                <img src="/art/img/zeus-6.webp" alt="" />
                <span className="tv-workspace-orbit" />
              </div>
              <div className="tv-workspace-welcome-copy">
                <span className="tv-eyebrow">
                  A PRÓXIMA HISTÓRIA ESTÁ A UM CLIQUE
                </span>
                <h2>
                  Encontra o teu
                  <br />
                  <em>próximo momento.</em>
                </h2>
                <p>
                  Escolhe um portal e explora os canais, o que está no ar e os
                  teus favoritos, tudo neste espaço.
                </p>
                <button
                  className="tv-primary"
                  onClick={() => tv.setCategory(categories[0].id)}
                >
                  Explorar {categories[0].name}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
                <div className="tv-workspace-stats">
                  <span>
                    <strong>{total.toLocaleString("pt-PT")}</strong> canais
                  </span>
                  <span>
                    <strong>{categories.length}</strong> portais
                  </span>
                  <span className="tv-workspace-live">
                    <i className="tv-on-air" /> Em direto
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className={
                  "tv-portals" + (layout === "list" ? " tv-portals--list" : "")
                }
              >
                {categories.map((portal, index) => (
                  <PortalCard
                    key={portal.id}
                    category={portal}
                    index={index}
                    onSelect={() => tv.setCategory(portal.id)}
                  />
                ))}
              </div>
              {!categories.length && (
                <EmptyState
                  title="Sem pastas visíveis"
                  action={
                    <button onClick={tv.openFolders}>Gerir pastas</button>
                  }
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
